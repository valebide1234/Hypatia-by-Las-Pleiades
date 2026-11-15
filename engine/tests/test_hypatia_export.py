"""Rules that turn retrieved values into Hypatia qualities, and the rolling data windows."""
import math

import numpy as np

from analogs import hypatia_export as hx
from analogs.sources import nasa_power


def payload(years, months_in_last, ts=10.0, rain=1.0):
    """Synthetic POWER response: `years` complete years plus a partial one."""
    par = {name: {} for name in nasa_power.PARAMS}
    last = years[-1] + 1
    for y in [*years, last]:
        for m in range(1, 13):
            published = y != last or m <= months_in_last
            for name in par:
                v = {"TS": ts, "PRECTOTCORR": rain, "PS": 90.0}.get(name, 1.0)
                par[name][f"{y}{m:02d}"] = v if published else -999.0
        for name in par:
            par[name][f"{y}13"] = -999.0 if y == last else {"TS": ts, "PRECTOTCORR": rain, "PS": 90.0}.get(name, 1.0)
    return {"header": {"fill_value": -999.0}, "properties": {"parameter": par}, "geometry": {"coordinates": [0, 0, 100.0]}}


def test_strength_thresholds():
    assert hx.strength_of("hyperarid", 9) == "strong"
    assert hx.strength_of("hyperarid", 40) == "moderate"
    assert hx.strength_of("hyperarid", 99) == "partial"
    assert hx.strength_of("hyperarid", 120) is None
    assert hx.strength_of("high_uv", 2.6) == "strong" and hx.strength_of("high_uv", 2.0) is None
    assert hx.strength_of("extreme_cold", float("nan")) is None
    assert hx.fails("hyperarid", 400) and not hx.fails("hyperarid", 120)
    assert hx.fails("high_uv", 0.5) and not hx.fails("high_uv", 1.5)


def test_inferred_qualities_are_never_strong():
    assert hx.strength_of("permafrost_ground_ice", 200.0) == "moderate"
    assert hx.terrain_strength(0.99) == "moderate"
    assert hx.terrain_strength(0.7) == "partial"
    assert hx.terrain_strength(0.5) is None and hx.terrain_strength(float("nan")) is None


def test_an_ice_sheet_is_not_permafrost():
    ice = {"tsurf_mean_K": 230.0, "albedo": 0.8, "precip_mm_yr": 80.0, "tsurf_min_K": 200.0}
    found, _ = hx.assess(ice, "2016–2025")
    assert hx.surface_code(ice) == "ice"
    assert {f["id"]: f["strength"] for f in found} == {"extreme_cold": "strong", "hyperarid": "partial"}
    assert "no dry ground" in next(f["text"] for f in found if f["id"] == "hyperarid")


def test_assess_reports_evidence_failures_and_trends():
    v = {"precip_mm_yr": 30.0, "tsurf_mean_K": 300.0, "pressure_Pa": 99_000.0, "ctx_uv_index": 1.5, "albedo": 0.3}
    found, failed = hx.assess(v, "2016–2025", None, {"precip_mm_yr": 20.0}, {"precip_mm_yr": 60.0})
    assert [f["id"] for f in found] == ["hyperarid"]
    assert found[0]["strength"] == "moderate" and found[0]["trend"] == "stronger"
    assert "30 mm/yr" in found[0]["text"] and "NASA POWER" in found[0]["text"]
    assert {f["id"] for f in failed} == {"extreme_cold", "permafrost_ground_ice", "high_altitude_low_pressure"}


def test_a_quality_met_only_in_the_newest_months_is_partial_and_says_so():
    v = {"precip_mm_yr": 130.0, "tsurf_mean_K": 290.0, "albedo": 0.3}
    found, _ = hx.assess(v, "2016–2025", None, {"precip_mm_yr": 45.0}, {"precip_mm_yr": 160.0})
    assert found == [{**found[0], "id": "hyperarid", "strength": "partial", "trend": "new"}]
    assert "natural variability" in found[0]["text"]


def test_rolling_windows_use_whole_years_of_the_newest_months():
    p = payload(list(range(2016, 2026)), months_in_last=9)
    w = nasa_power.rolling_windows(p, 36, 84)
    assert w["through"] == "2026-09"
    assert w["recent_label"] == "Oct 2023–Sep 2026" and w["earlier_label"] == "Oct 2016–Sep 2023"
    assert math.isclose(w["recent"]["precip_mm_yr"], 365.25) and math.isclose(w["recent"]["tsurf_mean_K"], 283.15)
    assert math.isclose(w["recent"]["pressure_Pa"], 90_000.0)


def test_rolling_windows_withhold_a_variable_with_too_many_missing_months():
    p = payload(list(range(2016, 2026)), months_in_last=9)
    for key in list(p["properties"]["parameter"]["ALLSKY_SFC_UV_INDEX"]):
        if key >= "202501" and not key.endswith("13"):
            p["properties"]["parameter"]["ALLSKY_SFC_UV_INDEX"][key] = -999.0
    w = nasa_power.rolling_windows(p, 36, 84)
    assert np.isnan(w["recent"]["ctx_uv_index"]) and np.isfinite(w["recent"]["tsurf_mean_K"])


def test_complete_years_drop_the_unfinished_year(monkeypatch):
    monkeypatch.setattr(nasa_power, "default_period", lambda: (2016, 2025))
    p = nasa_power.complete_years(payload(list(range(2016, 2026)), months_in_last=9, ts=10.0))
    assert not any(k.startswith("2026") for k in p["properties"]["parameter"]["TS"])
    assert math.isclose(nasa_power.summarize(p)["tsurf_mean_K"], 283.15)


def test_rules_only_name_qualities_that_exist_in_hypatia():
    import json
    qualities = {q["id"] for q in json.loads((hx.HYPATIA_ROOT / "data" / "qualities.json").read_text())["qualities"]}
    for target, ids in hx.MEASURABLE.items():
        assert set(ids) <= qualities, target
    regions = {r["id"] for r in hx.config.regions()}
    assert set(hx.PROGRAM) == regions
