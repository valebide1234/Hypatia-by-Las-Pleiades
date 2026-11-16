"""Multi-criteria similarity between an Earth site and one lunar or Martian region.

Primary method ("tolerance"): each parameter gets its own similarity in [0, 1]
from a physically chosen tolerance, parameters are averaged inside their
category, and categories are combined with the weights of a scientific
objective. The score is absolute: it does not depend on which other sites are
in the candidate set.

Alternative methods (Euclidean, Mahalanobis, cosine) work on variables
standardised against the Earth candidate population. They are relative to that
population and are offered as a cross-check, not as a replacement.

A high score means "close on the variables that were compared, within the
stated tolerances". It never means the two environments are identical: gravity,
radiation and atmospheric pressure are outside the score by construction.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf

from . import config

METHODS = ("tolerance", "euclidean", "mahalanobis", "cosine")
# Confidence = data coverage x mean data quality. "Alta" needs nearly complete data that is
# mostly measured on both sides; pairs resting on reanalysis, model output and
# literature-coded descriptors land in "Media"; discovery cells without geology in "Baja".
CONFIDENCE_LABELS = ((0.80, "Alta"), (0.60, "Media"), (0.0, "Baja"))


# ------------------------------------------------------------------ transforms
def transform(x: float, how: str, floor: float = 1e-12) -> float:
    if x is None or not np.isfinite(x):
        return float("nan")
    if how == "identity":
        return float(x)
    if how == "log10":
        return float(np.log10(max(x, floor)))
    if how == "log1p10":
        return float(np.log10(1.0 + max(x, 0.0)))
    raise ValueError(f"unknown transform {how}")


def parameter_similarity(pcfg: dict, earth_value: float, target_value: float) -> float:
    """Similarity in [0, 1] for one parameter; NaN if either value is missing."""
    if not (np.isfinite(earth_value) and np.isfinite(target_value)):
        return float("nan")
    if pcfg["mode"] == "ordinal":
        return float(1.0 - abs(earth_value - target_value))
    fl = pcfg.get("floor", 1e-12)
    d = abs(transform(earth_value, pcfg["transform"], fl) - transform(target_value, pcfg["transform"], fl)) / pcfg["scale"]
    return float(np.exp(-0.5 * d * d))


# --------------------------------------------------------------------- weights
def parameter_weights(objective: dict, body: str, overrides: dict | None = None) -> dict[str, float]:
    """Relative weight of each parameter inside its own category.

    weight = objective multiplier (default 1) x comparability for the target body.
    Parameters that do not apply to the body get no entry.
    """
    params = config.parameters()["parameters"]
    mult = dict(objective.get("parameter_multipliers", {}))
    mult.update((overrides or {}).get("parameter_multipliers", {}))
    out = {}
    for name, p in params.items():
        if body not in p.get("applies_to", config.BODIES):
            continue
        comp = p.get("comparability", {}).get(body, 1.0)
        out[name] = float(mult.get(name, 1.0)) * float(comp)
    return out


def category_weights(objective: dict, overrides: dict | None = None) -> dict[str, float]:
    w = dict(objective["category_weights"])
    w.update((overrides or {}).get("category_weights", {}))
    total = sum(max(v, 0.0) for v in w.values())
    if total <= 0:
        raise ValueError("all category weights are zero")
    return {k: max(v, 0.0) / total for k, v in w.items()}


# ------------------------------------------------------------------ pair score
def score_pair(earth: pd.Series, target: pd.Series, body: str, objective_id: str = "balanced",
               overrides: dict | None = None, earth_kinds: pd.Series | None = None,
               target_kinds: pd.Series | None = None) -> dict:
    """Score one Earth site against one reference region with full per-parameter detail."""
    params = config.parameters()["parameters"]
    quality = config.parameters()["data_quality"]
    objective = config.objectives()[objective_id]
    pw = parameter_weights(objective, body, overrides)
    cw = category_weights(objective, overrides)

    rows = []
    for name, p in params.items():
        row = {"parameter": name, "label": p["label"], "category": p["category"], "mode": p["mode"],
               "unit": p.get("unit", "0/0.5/1"), "earth_value": earth.get(name, np.nan),
               "target_value": target.get(name, np.nan), "similarity": np.nan, "weight_in_category": 0.0,
               "earth_kind": (earth_kinds.get(name) if earth_kinds is not None else None),
               "target_kind": (target_kinds.get(name) if target_kinds is not None else None)}
        if name not in pw:
            row["status"] = "not_applicable"
        elif pw[name] <= 0:
            row["status"] = "excluded_by_objective"
        elif not np.isfinite(row["earth_value"]):
            row["status"] = "missing_earth"
            row["weight_in_category"] = pw[name]
        elif not np.isfinite(row["target_value"]):
            row["status"] = "missing_target"
            row["weight_in_category"] = pw[name]
        elif p["mode"] == "ordinal" and row["earth_value"] == 0 and row["target_value"] == 0:
            row["status"] = "joint_absence"       # informative data, but not evidence of similarity
            row["weight_in_category"] = pw[name]
        else:
            row["status"] = "scored"
            row["weight_in_category"] = pw[name]
            row["similarity"] = parameter_similarity(p, row["earth_value"], row["target_value"])
        rows.append(row)
    detail = pd.DataFrame(rows)

    cat_scores, cat_cover, cat_quality = {}, {}, {}
    for cat in cw:
        d = detail[detail["category"] == cat]
        scored = d[d["status"] == "scored"]
        applicable = d[d["status"].isin(["scored", "missing_earth", "missing_target", "joint_absence"])]
        have = d[d["status"].isin(["scored", "joint_absence"])]
        w_app = applicable["weight_in_category"].sum()
        cat_cover[cat] = float(have["weight_in_category"].sum() / w_app) if w_app > 0 else np.nan
        if len(scored) and scored["weight_in_category"].sum() > 0:
            w = scored["weight_in_category"]
            cat_scores[cat] = float((scored["similarity"] * w).sum() / w.sum())
            q = [min(quality.get(a or "measured", 0.6), quality.get(b or "measured", 0.6))
                 for a, b in zip(scored["earth_kind"], scored["target_kind"])]
            cat_quality[cat] = float((np.array(q) * w).sum() / w.sum())
        else:
            cat_scores[cat] = np.nan
            cat_quality[cat] = np.nan

    used = {c: w for c, w in cw.items() if w > 0 and np.isfinite(cat_scores[c])}
    wsum = sum(used.values())
    overall = sum(cat_scores[c] * w for c, w in used.items()) / wsum if wsum > 0 else np.nan
    # Coverage: share of the objective's weight for which data exist on both sides.
    positive = {c: w for c, w in cw.items() if w > 0}
    coverage = sum((cat_cover[c] if np.isfinite(cat_cover[c]) else 0.0) * (w if c in used else 0.0)
                   for c, w in positive.items()) / sum(positive.values())
    data_quality = sum(cat_quality[c] * w for c, w in used.items()) / wsum if wsum > 0 else np.nan
    confidence = coverage * data_quality if np.isfinite(data_quality) else 0.0
    label = next(lbl for thr, lbl in CONFIDENCE_LABELS if confidence >= thr)

    # Contribution of each scored parameter to the overall score (sums to `overall`).
    detail["contribution"] = 0.0
    for c, w in used.items():
        m = (detail["category"] == c) & (detail["status"] == "scored")
        ws = detail.loc[m, "weight_in_category"]
        detail.loc[m, "contribution"] = detail.loc[m, "similarity"] * ws / ws.sum() * w / wsum
        detail.loc[m, "effective_weight"] = ws / ws.sum() * w / wsum
    return {
        "score": float(overall) if np.isfinite(overall) else np.nan,
        "category_scores": cat_scores, "category_coverage": cat_cover,
        "coverage": float(coverage), "data_quality": float(data_quality) if np.isfinite(data_quality) else np.nan,
        "confidence": float(confidence), "confidence_label": label,
        "n_scored": int((detail["status"] == "scored").sum()),
        "n_missing": int(detail["status"].isin(["missing_earth", "missing_target"]).sum()),
        "detail": detail,
    }


def explain(result: dict, top: int = 5) -> dict[str, list[dict]]:
    """Which parameters drive the similarity and which differ most (weighted)."""
    d = result["detail"]
    scored = d[d["status"] == "scored"].copy()
    if scored.empty:
        return {"drivers": [], "differences": [], "missing": []}
    scored["loss"] = scored["effective_weight"] * (1 - scored["similarity"])
    cols = ["parameter", "label", "category", "earth_value", "target_value", "unit", "similarity", "effective_weight"]
    drivers = scored[scored["similarity"] >= 0.6].sort_values("contribution", ascending=False).head(top)
    diffs = scored[scored["similarity"] < 0.6].sort_values("loss", ascending=False).head(top)
    miss = d[d["status"].isin(["missing_earth", "missing_target"])][["parameter", "label", "status"]]
    return {"drivers": drivers[cols].to_dict("records"), "differences": diffs[cols].to_dict("records"),
            "missing": miss.to_dict("records")}


# --------------------------------------------------------- alternative metrics
MAX_ABS_Z = 3.0     # beyond this the target is outside what any Earth site spans


def _matrix(earth: pd.DataFrame, target: pd.Series, body: str, objective_id: str, overrides: dict | None):
    """Transformed, Earth-standardised matrices and per-variable weights.

    Variables on which the target lies more than MAX_ABS_Z standard deviations from the
    Earth population (surface pressure, lunar temperature range...) are left out: no site
    can match them, so in a standardised distance they would only reward whichever site is
    most extreme and swamp every variable that does discriminate. They are returned so the
    caller can report them.
    """
    params = config.parameters()["parameters"]
    objective = config.objectives()[objective_id]
    pw = parameter_weights(objective, body, overrides)
    cw = category_weights(objective, overrides)
    names, weights = [], []
    for name, w in pw.items():
        if w <= 0 or cw.get(params[name]["category"], 0) <= 0 or name not in earth.columns:
            continue
        if not np.isfinite(target.get(name, np.nan)):
            continue
        names.append(name)
        weights.append(w)
    if not names:
        return None
    # Spread the category weight over the variables of that category.
    cats = [params[n]["category"] for n in names]
    totals = {c: sum(w for w, cc in zip(weights, cats) if cc == c) for c in set(cats)}
    weights = np.array([w / totals[c] * cw[c] for w, c in zip(weights, cats)])
    how = [(params[n].get("transform", "identity"), params[n].get("floor", 1e-12)) for n in names]
    xe = np.array([[transform(v, h, fl) for v, (h, fl) in zip(row, how)] for row in earth[names].to_numpy(dtype=float)])
    xt = np.array([transform(target[n], h, fl) for n, (h, fl) in zip(names, how)])
    mu, sd = np.nanmean(xe, axis=0), np.nanstd(xe, axis=0)
    varying = sd > 1e-12                               # constant columns carry no information
    with np.errstate(divide="ignore", invalid="ignore"):
        zt_all = (xt - mu) / sd
    in_range = varying & (np.abs(zt_all) <= MAX_ABS_Z)
    out_of_range = [n for n, v, k in zip(names, varying, in_range) if v and not k]
    if not in_range.any():
        return None
    keep = in_range
    return ((xe[:, keep] - mu[keep]) / sd[keep], zt_all[keep],
            weights[keep] / weights[keep].sum(), [n for n, k in zip(names, keep) if k], out_of_range)


def alternative_scores(earth: pd.DataFrame, target: pd.Series, body: str, method: str,
                       objective_id: str = "balanced", overrides: dict | None = None) -> pd.DataFrame:
    """Distance-based similarity of every Earth row to one target.

    euclidean    weighted RMS difference of z-scores over the variables both have
    mahalanobis  accounts for correlation between variables (Ledoit-Wolf shrinkage covariance
                 of the Earth population); uses only variables complete for every site
    cosine       similarity of the *pattern* of deviations from the Earth mean; ignores magnitude
    Returns columns: distance, score (in [0, 1]), n_variables. `.attrs` lists the variables
    used and those excluded because the target is outside the range of Earth conditions.
    """
    if method not in ("euclidean", "mahalanobis", "cosine"):
        raise ValueError(f"unknown method {method}")
    m = _matrix(earth, target, body, objective_id, overrides)
    out = pd.DataFrame(index=earth.index, columns=["distance", "score", "n_variables"], dtype=float)
    if m is None:
        return out
    ze, zt, w, names, out_of_range = m
    out.attrs["variables"] = names
    out.attrs["out_of_range"] = out_of_range
    if method == "mahalanobis":
        complete = np.isfinite(ze).all(axis=0)
        ze, zt, w = ze[:, complete], zt[complete], w[complete]
        if ze.shape[1] < 2 or ze.shape[0] < 3:
            return out
        precision = LedoitWolf().fit(ze).precision_
        diff = ze - zt
        d = np.sqrt(np.einsum("ij,jk,ik->i", diff, precision, diff) / ze.shape[1])
        out["distance"], out["score"], out["n_variables"] = d, 1.0 / (1.0 + d), ze.shape[1]
        return out
    for i, idx in enumerate(earth.index):
        ok = np.isfinite(ze[i])
        if ok.sum() < 2:
            continue
        a, b, ww = ze[i, ok], zt[ok], w[ok] / w[ok].sum()
        if method == "euclidean":
            d = float(np.sqrt((ww * (a - b) ** 2).sum()))
            out.loc[idx] = [d, 1.0 / (1.0 + d), ok.sum()]
        else:
            na, nb = np.sqrt((ww * a * a).sum()), np.sqrt((ww * b * b).sum())
            cos = float((ww * a * b).sum() / (na * nb)) if na > 0 and nb > 0 else np.nan
            out.loc[idx] = [1.0 - cos, (1.0 + cos) / 2.0, ok.sum()]
    return out


# ---------------------------------------------------------------------- ranking
def rank_all(features: pd.DataFrame, kinds: pd.DataFrame, entities: pd.DataFrame,
             objective_id: str = "balanced", overrides: dict | None = None,
             earth_ids: list[str] | None = None, region_ids: list[str] | None = None) -> pd.DataFrame:
    """Score every Earth entity against every reference region (tolerance method)."""
    ent = entities.set_index("id")
    earth_ids = earth_ids or [i for i in ent.index[ent["body"] == "earth"] if i in features.index]
    region_ids = region_ids or [i for i in ent.index[ent["body"] != "earth"] if i in features.index]
    cats = list(config.parameters()["categories"])
    rows = []
    for rid in region_ids:
        body = ent.loc[rid, "body"]
        for eid in earth_ids:
            r = score_pair(features.loc[eid], features.loc[rid], body, objective_id, overrides,
                           kinds.loc[eid] if eid in kinds.index else None,
                           kinds.loc[rid] if rid in kinds.index else None)
            rows.append({"site_id": eid, "region_id": rid, "body": body, "objective": objective_id,
                         "score": r["score"], "confidence": r["confidence"], "confidence_label": r["confidence_label"],
                         "coverage": r["coverage"], "data_quality": r["data_quality"],
                         "n_scored": r["n_scored"], "n_missing": r["n_missing"],
                         **{f"score_{c}": r["category_scores"].get(c, np.nan) for c in cats}})
    df = pd.DataFrame(rows)
    if not df.empty:
        df["rank_in_region"] = df.groupby("region_id")["score"].rank(ascending=False, method="min")
    return df
