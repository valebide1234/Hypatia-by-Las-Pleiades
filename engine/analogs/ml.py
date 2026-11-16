"""Machine-learning models trained on NASA data.

Three unsupervised models are fitted on the global grid of land cells characterised
with NASA POWER (MERRA-2 / CERES) variables. None of them needs labels, which matters
because there are far too few catalogued analogue sites to train a supervised model.

    k-means            groups the grid into environment types and classifies any place
    PCA                projects every place onto the two directions that explain most of
                       the variation between Earth environments (the "environment space")
    Isolation Forest   scores how atypical a place is compared with the rest of the planet
    nearest neighbours finds the grid cells closest to a place or to a lunar/Martian region

Training also measures how stable the results are when the models are refitted with
different random seeds, so the dashboard can say how far they can be trusted.

They are small statistical models fitted on this project's own NASA-derived table. The
conversational assistant is a separate thing (see assistant.py).

What they do not do: decide what is a good analogue. An atypical place can be atypical
for being extremely wet as well as for being extremely dry and cold; the similarity
engine, not these models, compares a place with a lunar or Martian region.
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from scipy.stats import spearmanr
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from . import config
from .provenance import utc_now

FEATURES = ["tsurf_mean_K", "tsurf_min_K", "tsurf_max_K", "diurnal_range_K", "precip_mm_yr", "soil_wetness",
            "albedo", "insolation_Wm2", "wind_speed_ms", "pressure_Pa", "column_water_vapor_kgm2"]
LOG_FEATURES = {"precip_mm_yr", "column_water_vapor_kgm2"}
# On an airless body these are zero by physics, not unknown.
AIRLESS_ZERO = ("wind_speed_ms", "column_water_vapor_kgm2")
N_CLUSTERS = 8
MAX_ABS_Z = 3.0          # beyond this a lunar/Martian value is outside what any Earth cell spans
MODEL_PATH = config.PROCESSED_DIR / "environment_model.joblib"
META_PATH = config.PROCESSED_DIR / "environment_model.json"
CELLS_PATH = config.PROCESSED_DIR / "environment_cells.csv"


def _matrix(df: pd.DataFrame, body: str = "earth") -> np.ndarray:
    x = df.reindex(columns=FEATURES).astype(float).copy()
    if body == "moon":
        for c in AIRLESS_ZERO:
            x[c] = x[c].fillna(0.0)
    for c in LOG_FEATURES:
        x[c] = np.log10(1.0 + x[c].clip(lower=0))
    return x.to_numpy()


def _name(centre: pd.Series) -> str:
    """Readable label for a cluster from its centroid (temperature, moisture, snow cover, altitude)."""
    t, p, alb, wet = centre["tsurf_mean_K"], centre["precip_mm_yr"], centre["albedo"], centre["soil_wetness"]
    temp = "polar" if t < 258 else "frío" if t < 278 else "templado" if t < 293 else "cálido"
    if p < 100:
        moisture = "hiperárido"
    elif p < 300:
        moisture = "árido"
    elif p < 500 or (p < 700 and wet < 0.5):     # modest rain, or moderate rain on dry soils
        moisture = "semiárido"
    elif p < 1500:
        moisture = "húmedo"
    else:
        moisture = "muy húmedo"
    extra = ", cubierto de nieve o hielo" if alb > 0.5 else ""
    high = ", de gran altitud" if centre["pressure_Pa"] < 80_000 and alb <= 0.5 else ""
    return f"{temp} {moisture}{extra}{high}"


def train(cells: pd.DataFrame) -> dict:
    """Fit the three models on the discovery grid and save them. Returns the metadata."""
    data = cells.dropna(subset=["tsurf_mean_K", "precip_mm_yr"]).reset_index(drop=True)
    x = _matrix(data)
    pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                     ("kmeans", KMeans(n_clusters=N_CLUSTERS, n_init=20, random_state=0))])
    labels = pipe.fit_predict(x)
    z = pipe[:-1].transform(x)
    centres = pd.DataFrame(pipe["scale"].inverse_transform(pipe["kmeans"].cluster_centers_), columns=FEATURES)
    for c in LOG_FEATURES:
        centres[c] = 10 ** centres[c] - 1
    names = [_name(centres.loc[i]) for i in range(N_CLUSTERS)]
    base, seen = list(names), {}
    for i, n in enumerate(base):               # disambiguate clusters that share a label
        if base.count(n) > 1:
            seen[n] = seen.get(n, 0) + 1
            names[i] = f"{n} (variante {seen[n]})"

    pca = PCA(n_components=2, random_state=0).fit(z)
    pcs = pca.transform(z)
    forest = IsolationForest(n_estimators=300, random_state=0).fit(z)
    scores = forest.score_samples(z)            # lower = more atypical
    sorted_scores = np.sort(scores)
    rarity = np.searchsorted(sorted_scores, scores, side="left")
    rarity = 1.0 - rarity / len(scores)        # share of the planet's land cells that are more ordinary

    # Stability: refit with other random seeds and compare with the models that are kept.
    ari = [adjusted_rand_score(labels, KMeans(n_clusters=N_CLUSTERS, n_init=20, random_state=seed).fit_predict(z))
           for seed in (1, 2, 3, 4, 5)]
    rho = [spearmanr(scores, IsolationForest(n_estimators=300, random_state=seed).fit(z).score_samples(z)).statistic
           for seed in (1, 2, 3)]

    nn = NearestNeighbors(n_neighbors=6).fit(z)
    joblib.dump({"pipeline": pipe, "neighbors": nn, "pca": pca, "forest": forest, "sorted_scores": sorted_scores,
                 "cell_z": z,
                 "cell_ids": data["id"].tolist(), "cell_lat": data["lat"].tolist(), "cell_lon": data["lon"].tolist(),
                 "cell_cluster": labels.tolist(), "names": names}, MODEL_PATH)
    pd.DataFrame({"id": data["id"], "lat": data["lat"], "lon": data["lon"], "cluster": labels,
                  "environment": [names[i] for i in labels], "rarity": rarity.round(4),
                  "pc1": pcs[:, 0].round(4), "pc2": pcs[:, 1].round(4)}).to_csv(CELLS_PATH, index=False)

    def top_loadings(component: np.ndarray, k: int = 3) -> list[dict]:
        order = np.argsort(-np.abs(component))[:k]
        return [{"feature": FEATURES[i], "loading": round(float(component[i]), 3)} for i in order]

    meta = {"trained_at": utc_now(), "n_cells": int(len(data)), "features": FEATURES, "n_clusters": N_CLUSTERS,
            "algorithm": "k-means sobre variables estandarizadas (scikit-learn)",
            "training_data": "Grilla global de celdas en tierra firme con variables de NASA POWER (MERRA-2, CERES)",
            "silhouette": round(float(silhouette_score(z, labels)), 3),
            "pca": {"explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
                    "loadings": [top_loadings(c) for c in pca.components_]},
            "isolation_forest": {"trees": 300},
            "stability": {"kmeans_ari": round(float(np.mean(ari)), 3), "kmeans_ari_min": round(float(np.min(ari)), 3),
                          "forest_spearman": round(float(np.mean(rho)), 3), "seeds": 5},
            "clusters": [{"id": i, "name": names[i], "cells": int((labels == i).sum()),
                          "pc1": round(float(pcs[labels == i, 0].mean()), 3), "pc2": round(float(pcs[labels == i, 1].mean()), 3),
                          "rarity": round(float(rarity[labels == i].mean()), 3),
                          **{k: round(float(centres.loc[i, k]), 2) for k in ("tsurf_mean_K", "precip_mm_yr", "albedo")}}
                         for i in range(N_CLUSTERS)]}
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return meta


def available() -> bool:
    return MODEL_PATH.exists()


def metadata() -> dict:
    return json.loads(META_PATH.read_text()) if META_PATH.exists() else {}


def cells() -> pd.DataFrame:
    """Grid cells with their environment type, rarity and position in the environment space."""
    return pd.read_csv(CELLS_PATH) if CELLS_PATH.exists() else pd.DataFrame()


def _load() -> dict:
    return joblib.load(MODEL_PATH)


def describe(features: pd.DataFrame, body: str = "earth") -> pd.DataFrame:
    """Environment type, rarity and environment-space coordinates for each row of `features`.

    `imputed` counts the variables that were missing and had to be filled with the Earth
    median, so a caller can flag positions that rest partly on a guess.
    """
    m = _load()
    x = _matrix(features, body)
    z = m["pipeline"][:-1].transform(x)
    cluster = m["pipeline"]["kmeans"].predict(z)
    pcs = m["pca"].transform(z)
    scores = m["forest"].score_samples(z)
    rarity = 1.0 - np.searchsorted(m["sorted_scores"], scores, side="left") / len(m["sorted_scores"])
    return pd.DataFrame({"cluster": cluster, "environment": [m["names"][i] for i in cluster], "rarity": rarity,
                         "pc1": pcs[:, 0], "pc2": pcs[:, 1], "imputed": np.isnan(x).sum(axis=1)}, index=features.index)


def classify(features: pd.Series) -> dict:
    """Environment type of a place from its retrieved NASA variables."""
    d = describe(pd.DataFrame([features])).iloc[0]
    return {"cluster": int(d["cluster"]), "name": d["environment"], "rarity": float(d["rarity"]),
            "variables_available": int(len(FEATURES) - d["imputed"])}


def similar_cells(features: pd.Series, k: int = 5) -> list[dict]:
    """Grid cells whose NASA-derived environment is closest to the given place."""
    m = _load()
    z = m["pipeline"][:-1].transform(_matrix(pd.DataFrame([features])))
    dist, idx = m["neighbors"].kneighbors(z, n_neighbors=min(k + 1, len(m["cell_ids"])))
    out = []
    for d, i in zip(dist[0], idx[0]):
        if d < 1e-9:            # the place itself, when it is one of the grid cells
            continue
        out.append({"lat": m["cell_lat"][i], "lon": m["cell_lon"][i], "distance": round(float(d), 2),
                    "environment": m["names"][m["cell_cluster"][i]]})
    return out[:k]


def _target(features: pd.Series, body: str, model: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Standardised vector of a place, capped to Earth's range, plus what was missing and what was capped.

    On several variables a lunar or Martian region lies far beyond anything on Earth (Martian
    pressure, the lunar day-night range, zero rainfall). Used as they are, those variables would
    swamp every other one; dropped, the search would forget that the region is, say, extremely
    dry. So each is capped at MAX_ABS_Z standard deviations: the region counts as "at the
    extreme of what exists on Earth" in that variable, and the cells nearest that extreme are
    the closest ones. Variables the place does not have are left out.
    """
    x = _matrix(pd.DataFrame([features]), body)
    missing = np.isnan(x[0])
    z = model["pipeline"][:-1].transform(x)[0]
    capped = ~missing & (np.abs(z) > MAX_ABS_Z)
    return np.clip(z, -MAX_ABS_Z, MAX_ABS_Z), missing, capped


def comparable_variables(features: pd.Series, body: str) -> tuple[list[str], list[str]]:
    """(variables within Earth's range, variables beyond it) for a place or region."""
    _z, missing, capped = _target(features, body, _load())
    return ([f for f, miss, c in zip(FEATURES, missing, capped) if not miss and not c],
            [f for f, c in zip(FEATURES, capped) if c])


def nearest_cells_to(features: pd.Series, body: str = "earth", k: int = 12) -> pd.DataFrame:
    """Grid cells closest to a place or to a lunar/Martian region (see `_target` for the capping)."""
    m = _load()
    z, missing, _capped = _target(features, body, m)
    grid = cells()
    ok = ~missing
    if ok.sum() < 3 or grid.empty:
        return pd.DataFrame()
    dist = np.sqrt(((m["cell_z"][:, ok] - z[ok]) ** 2).mean(axis=1))
    return grid.assign(distance=dist).sort_values("distance").head(k).reset_index(drop=True)


def distance_to(features: pd.DataFrame, target: pd.Series, body: str) -> pd.Series:
    """Distance of each Earth place to a target, with the same capping as `nearest_cells_to`."""
    m = _load()
    z, missing, _capped = _target(target, body, m)
    ok = ~missing
    if ok.sum() < 3:
        return pd.Series(np.nan, index=features.index)
    ze = m["pipeline"][:-1].transform(_matrix(features))
    return pd.Series(np.sqrt(((ze[:, ok] - z[ok]) ** 2).mean(axis=1)), index=features.index)
