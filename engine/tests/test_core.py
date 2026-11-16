"""Offline tests of the scientific calculations (no network access needed)."""
import numpy as np
import pandas as pd
import pytest

from analogs import config, similarity
from analogs.insolation import annual_mean_insolation
from analogs.sources import dem, diviner, mcd


# ------------------------------------------------------------------ catalogues
def test_catalogues_are_consistent():
    assert config.validate_catalogs() == []


def test_every_objective_has_positive_weights():
    for oid, obj in config.objectives().items():
        w = similarity.category_weights(obj)
        assert abs(sum(w.values()) - 1) < 1e-9, oid


# ------------------------------------------------------------------ insolation
def test_global_mean_insolation_is_a_quarter_of_the_solar_constant():
    lats = np.linspace(-89.95, 89.95, 1800)
    q = np.array([annual_mean_insolation(la, 1361.0, 23.44, 0.0167) for la in lats])
    w = np.cos(np.radians(lats))
    expected = 1361.0 / 4 / np.sqrt(1 - 0.0167 ** 2)
    assert abs((q * w).sum() / w.sum() - expected) / expected < 2e-3


def test_insolation_known_values():
    assert 410 < annual_mean_insolation(0, 1361.0, 23.44, 0.0167) < 425      # Earth equator
    assert 165 < annual_mean_insolation(90, 1361.0, 23.44, 0.0167) < 180     # Earth pole
    # With almost no axial tilt the Moon's poles receive almost nothing on flat ground.
    assert annual_mean_insolation(89.9, 1361.0, 1.54, 0.0167) < 15


# --------------------------------------------------------------------- terrain
def test_slope_of_an_inclined_plane():
    pixel = 463.0
    y, x = np.mgrid[0:60, 0:60]
    z = np.tan(np.radians(10.0)) * x * pixel
    m = dem.terrain_metrics(z, pixel)
    assert m["slope_mean_deg"] == pytest.approx(10.0, abs=1e-6)
    assert m["slope_p95_deg"] == pytest.approx(10.0, abs=1e-6)


def test_flat_terrain_has_no_relief():
    m = dem.terrain_metrics(np.full((40, 40), 1234.0), 463.0)
    assert m["relief_m"] == 0 and m["slope_mean_deg"] == 0 and m["roughness_tri_m"] == 0


def test_terrain_metrics_ignore_missing_pixels():
    z = np.random.default_rng(0).normal(0, 50, (50, 50))
    z[:10, :10] = np.nan
    m = dem.terrain_metrics(z, 463.0)
    assert all(np.isfinite(v) for v in m.values())


def test_copernicus_tiles_cover_window_across_tile_edges():
    urls = dem._copernicus_tiles(-24.08, -69.92, 20_000)
    assert any("S25_00_W070" in u for u in urls) and any("S25_00_W071" in u for u in urls)
    assert len(dem._copernicus_tiles(0.05, 179.95, 20_000)) == 4      # equator and antimeridian


# ---------------------------------------------------------------- data sources
@pytest.mark.parametrize("lat,name,edge", [
    (0.67, "global_cumul_avg_cyl_00n10n_002.tab", 0), (-8.97, "global_cumul_avg_cyl_10s00s_002.tab", -10),
    (26.1, "global_cumul_avg_cyl_20n30n_002.tab", 20), (-89.67, "global_cumul_avg_cyl_90s80s_002.tab", -90),
    (89.9, "global_cumul_avg_cyl_80n90n_002.tab", 80),
])
def test_diviner_band_file(lat, name, edge):
    assert diviner.band_file(lat) == (name, edge)


def test_diviner_summary_interpolates_unobserved_hours():
    lt = np.arange(96) * 0.25 + 0.125
    t = 240 + 150 * np.sin(2 * np.pi * (lt - 6) / 24)
    gappy = t.copy()
    gappy[::3] = np.nan
    s = diviner.summarize(lt, gappy)
    assert s["tsurf_mean_K"] == pytest.approx(240, abs=2)
    with pytest.raises(Exception):
        diviner.summarize(lt, np.where(np.arange(96) < 80, np.nan, t))


def test_mcd_table_parser():
    block = lambda title, v: (
        "#" * 90 + "\n### MCD_v6.2 with climatology average solar scenario.\n"
        "### Latitude -4.59N. Longitude 137.44E. Altitude 10.0 m ALS.\n### " + "-" * 80 + "\n"
        "### Column 1 is Areocentric longitude (degrees)\n### Columns 2+ are " + title + "\n"
        "### Line 1 is Local time (Martian hour)\n" + "#" * 90 + "\n"
        "---- ||    0.00000e+00    1.20000e+01    2.40000e+01\n-----------------\n"
        f"+000 ||    {v}    {v + 50}    {v}\n+180 ||    {v - 5}    {v + 40}    {v - 5}\n+360 ||    {v}    {v + 50}    {v}\n")
    tables, ls, lt, version = mcd.parse_tables(block("Surface temperature (K)", 190.0) + block("Surface pressure (Pa)", 700.0))
    assert version == "MCD_v6.2" and list(ls) == [0, 180, 360] and list(lt) == [0, 12, 24]
    assert tables["Surface temperature (K)"].shape == (3, 3)
    assert tables["Surface pressure (Pa)"][1, 1] == 740.0


# ------------------------------------------------------------------ similarity
PARAMS = config.parameters()["parameters"]


def test_identical_values_score_one_and_similarity_decays_with_distance():
    p = PARAMS["tsurf_mean_K"]
    assert similarity.parameter_similarity(p, 220, 220) == 1
    s = [similarity.parameter_similarity(p, 220 + d, 220) for d in (0, 10, 30, 60, 120)]
    assert all(a > b for a, b in zip(s, s[1:]))
    assert s[2] == pytest.approx(np.exp(-0.5), rel=1e-9)        # one tolerance away


def test_log_parameters_compare_orders_of_magnitude_and_respect_floor():
    p = PARAMS["relief_m"]
    assert similarity.parameter_similarity(p, 100, 1000) == pytest.approx(similarity.parameter_similarity(p, 300, 3000))
    assert similarity.parameter_similarity(p, 0.0, 2.0) == 1.0      # both below the DEM accuracy floor
    assert np.isnan(similarity.parameter_similarity(p, np.nan, 100))


def _site(**kw):
    base = {k: 0.0 for k in config.geology_keys()}
    base.update(tsurf_mean_K=220, precip_mm_yr=0, relief_m=200, slope_mean_deg=1.0)
    base.update(kw)
    return pd.Series(base)


def test_perfect_match_scores_one():
    t = _site(g_basalt=1, g_volcanic=1)
    r = similarity.score_pair(t.copy(), t, "mars")
    assert r["score"] == pytest.approx(1.0)
    assert r["detail"]["contribution"].sum() == pytest.approx(r["score"])


def test_joint_absence_is_not_evidence_of_similarity():
    t = _site(g_basalt=1)
    r = similarity.score_pair(_site(g_basalt=1), t, "mars")
    d = r["detail"].set_index("parameter")
    assert d.loc["g_sulfate", "status"] == "joint_absence"
    assert d.loc["g_basalt", "status"] == "scored"


def test_extra_minerals_on_earth_lower_similarity_to_the_moon():
    moon = _site(g_basalt=1)
    plain = similarity.score_pair(_site(g_basalt=1), moon, "moon")["category_scores"]["geology"]
    clayey = similarity.score_pair(_site(g_basalt=1, g_clay=1, g_sulfate=1), moon, "moon")["category_scores"]["geology"]
    assert clayey < plain


def test_missing_data_lowers_coverage_not_score():
    t = _site(g_basalt=1)
    full = similarity.score_pair(_site(g_basalt=1), t, "mars")
    e = _site(g_basalt=1)
    e["relief_m"] = np.nan
    e["slope_mean_deg"] = np.nan
    part = similarity.score_pair(e, t, "mars")
    assert part["coverage"] < full["coverage"]
    assert part["n_missing"] == full["n_missing"] + 2
    assert part["score"] == pytest.approx(1.0)


def test_wind_is_not_applicable_on_the_moon():
    r = similarity.score_pair(_site(wind_speed_ms=5), _site(), "moon")
    assert r["detail"].set_index("parameter").loc["wind_speed_ms", "status"] == "not_applicable"


def test_objective_weights_change_the_ranking():
    target = _site(g_ground_ice=1, slope_mean_deg=1.0)
    icy_steep = _site(g_ground_ice=1, slope_mean_deg=15.0, relief_m=3000)
    flat_dry = _site(g_ground_ice=0, slope_mean_deg=1.0)
    ice = [similarity.score_pair(s, target, "mars", "water_ice_detection")["score"] for s in (icy_steep, flat_dry)]
    rover = [similarity.score_pair(s, target, "mars", "rover_mobility")["score"] for s in (icy_steep, flat_dry)]
    assert ice[0] > ice[1] and rover[1] > rover[0]


@pytest.mark.parametrize("method", ["euclidean", "mahalanobis", "cosine"])
def test_alternative_metrics_rank_the_closest_site_first(method):
    rng = np.random.default_rng(1)
    keys = ["tsurf_mean_K", "precip_mm_yr", "relief_m", "slope_mean_deg", "albedo", "diurnal_range_K"]
    earth = pd.DataFrame({k: rng.uniform(1, 10, 12) for k in keys}, index=[f"s{i}" for i in range(12)])
    earth["tsurf_mean_K"] += 250
    target = earth.loc["s3"] * 1.01
    out = similarity.alternative_scores(earth, target, "mars", method)
    assert out["score"].idxmax() == "s3"
    assert out["score"].between(0, 1).all()


def test_alternative_metrics_drop_variables_outside_the_earth_range():
    rng = np.random.default_rng(2)
    earth = pd.DataFrame({"tsurf_mean_K": rng.uniform(250, 300, 15), "precip_mm_yr": rng.uniform(5, 800, 15),
                          "slope_mean_deg": rng.uniform(0.5, 8, 15), "pressure_Pa": rng.uniform(6e4, 1e5, 15)},
                         index=[f"s{i}" for i in range(15)])
    target = pd.Series({"tsurf_mean_K": 270.0, "precip_mm_yr": 60.0, "slope_mean_deg": 2.0, "pressure_Pa": 600.0})
    out = similarity.alternative_scores(earth, target, "mars", "euclidean")
    assert out.attrs["out_of_range"] == ["pressure_Pa"]
    assert "pressure_Pa" not in out.attrs["variables"]


# ------------------------------------------------- challenge links and NASA use
def test_every_measured_source_maps_to_a_page_label():
    from analogs import challenge
    assert challenge.page_label("diviner_gcp") == "PDS · LRO Diviner"      # most specific page wins
    assert challenge.page_label("lola_gdr") == "PDS · LRO"
    assert challenge.page_label("tes_timap") == "PDS"
    assert challenge.page_label("nasa_power") == "Earthdata Search"
    assert challenge.page_label("copernicus_dem") == "Copernicus Data Space"
    assert challenge.page_label("mcd").startswith("Mars Climate Database")
    assert challenge.page_label("williams2017") == "Literatura científica"


def test_first_challenge_links_are_all_marked_used_and_have_sources():
    first = [l for l in config.challenge_links() if l["group"] == "primeros"]
    assert len(first) == 5
    for link in first:
        assert link["used"] == "yes" and link["sources"] and link["endpoint"]
        for key in link["sources"]:
            assert key in config.references(), key


def test_every_site_declares_nasa_use_with_a_program_when_used():
    for s in config.sites():
        use = s["nasa_use"]
        assert isinstance(use["used"], bool)
        assert use["program"] and use["by"]
        if use["used"]:
            assert "NASA" in use["program"]


# ------------------------------------------------------------ environment model
def test_environment_model_separates_cold_dry_from_warm_wet(tmp_path, monkeypatch):
    from analogs import ml
    monkeypatch.setattr(ml, "MODEL_PATH", tmp_path / "m.joblib")
    monkeypatch.setattr(ml, "META_PATH", tmp_path / "m.json")
    monkeypatch.setattr(ml, "CELLS_PATH", tmp_path / "cells.csv")
    rng = np.random.default_rng(3)
    def cells(n, t, p, alb):
        return pd.DataFrame({"tsurf_mean_K": rng.normal(t, 3, n), "tsurf_min_K": rng.normal(t - 20, 3, n),
                             "tsurf_max_K": rng.normal(t + 20, 3, n), "diurnal_range_K": rng.normal(15, 2, n),
                             "precip_mm_yr": np.abs(rng.normal(p, p * 0.1, n)), "soil_wetness": rng.uniform(0, 1, n),
                             "albedo": rng.normal(alb, 0.02, n), "insolation_Wm2": rng.normal(200, 20, n),
                             "wind_speed_ms": rng.normal(4, 1, n), "pressure_Pa": rng.normal(95000, 2000, n),
                             "column_water_vapor_kgm2": np.abs(rng.normal(p / 50, 1, n))})
    df = pd.concat([cells(60, 240, 40, 0.7), cells(60, 300, 2000, 0.15)], ignore_index=True)
    df["id"] = [f"c{i}" for i in range(len(df))]
    df["lat"], df["lon"] = 0.0, 0.0
    meta = ml.train(df)
    assert meta["n_cells"] == 120
    cold = ml.classify(df.iloc[0])["cluster"]
    warm = ml.classify(df.iloc[-1])["cluster"]
    assert cold != warm
    assert len(ml.similar_cells(df.iloc[0], 3)) == 3

    # PCA: two components, most of the variance, and a stored position for every cell.
    assert len(meta["pca"]["explained_variance"]) == 2 and sum(meta["pca"]["explained_variance"]) > 0.5
    grid = ml.cells()
    assert len(grid) == 120 and {"pc1", "pc2", "rarity", "environment"} <= set(grid.columns)
    assert grid["rarity"].between(0, 1).all()

    # Isolation Forest: a place unlike anything in the training grid is the most atypical,
    # and one drawn from the middle of a group is not.
    alien = df.iloc[[0]].copy()
    alien[["tsurf_mean_K", "tsurf_min_K", "tsurf_max_K"]] = [60.0, 40.0, 130.0]
    alien["pressure_Pa"] = 1e-9
    d = ml.describe(pd.concat([alien, df.iloc[[5]]]))
    assert d["rarity"].iloc[0] == 1.0 and d["rarity"].iloc[1] < 1.0
    # ...and it lands outside the cloud of training points in the environment space.
    radius = np.hypot(grid["pc1"], grid["pc2"]).max()
    assert np.hypot(d["pc1"].iloc[0], d["pc2"].iloc[0]) > radius


def test_airless_bodies_use_physical_zeros_instead_of_earth_medians():
    from analogs import ml
    row = pd.DataFrame([{f: np.nan for f in ml.FEATURES}])
    earth, moon = ml._matrix(row, "earth"), ml._matrix(row, "moon")
    wind, vapour = ml.FEATURES.index("wind_speed_ms"), ml.FEATURES.index("column_water_vapor_kgm2")
    assert np.isnan(earth[0, wind]) and moon[0, wind] == 0.0 and moon[0, vapour] == 0.0


def test_assistant_tools_have_valid_schemas():
    from analogs import assistant
    names = [t["name"] for t in assistant.TOOLS]
    assert len(names) == len(set(names))
    for t in assistant.TOOLS:
        assert t["description"] and t["input_schema"]["type"] == "object"
        for req in t["input_schema"].get("required", []):
            assert req in t["input_schema"]["properties"]


def test_nearest_place_search_caps_out_of_range_variables_and_keeps_their_direction(tmp_path, monkeypatch):
    from analogs import ml
    for name in ("MODEL_PATH", "META_PATH", "CELLS_PATH"):
        monkeypatch.setattr(ml, name, tmp_path / name.lower())
    rng = np.random.default_rng(4)
    n = 200
    df = pd.DataFrame({"tsurf_mean_K": rng.uniform(230, 305, n), "tsurf_min_K": rng.uniform(200, 290, n),
                       "tsurf_max_K": rng.uniform(260, 330, n), "diurnal_range_K": rng.uniform(4, 30, n),
                       "precip_mm_yr": rng.uniform(5, 2500, n), "soil_wetness": rng.uniform(0, 1, n),
                       "albedo": rng.uniform(0.05, 0.8, n), "insolation_Wm2": rng.uniform(90, 300, n),
                       "wind_speed_ms": rng.uniform(1, 9, n), "pressure_Pa": rng.uniform(60000, 101000, n),
                       "column_water_vapor_kgm2": rng.uniform(0.5, 45, n)})
    df["id"] = [f"c{i}" for i in range(n)]
    df["lat"], df["lon"] = 0.0, 0.0
    meta = ml.train(df)
    assert 0 <= meta["stability"]["kmeans_ari"] <= 1 and meta["stability"]["forest_spearman"] > 0.8

    # A Mars-like target: in range on most variables, far beyond Earth on pressure.
    target = df.iloc[0].copy()
    target["pressure_Pa"] = 600.0
    within, beyond = ml.comparable_variables(target, "mars")
    assert beyond == ["pressure_Pa"] and "tsurf_mean_K" in within
    near = ml.nearest_cells_to(target, "mars", 5)
    assert len(near) == 5 and near["distance"].is_monotonic_increasing
    # Capping keeps the direction: the cells returned sit at lower pressure than the grid as a whole.
    chosen = df.set_index("id").loc[near["id"], "pressure_Pa"].mean()
    assert chosen < df["pressure_Pa"].mean()
    # ...without letting that one variable decide everything: the nearest cell is also close elsewhere.
    d = ml.distance_to(df.set_index("id")[ml.FEATURES], target, "mars")
    assert d.idxmin() == near["id"].iloc[0] and d.min() < d.median()
