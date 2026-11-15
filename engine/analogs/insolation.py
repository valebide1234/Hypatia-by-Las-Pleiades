"""Astronomical insolation on a horizontal, airless surface.

Used for the Moon (no atmosphere, so the top-of-atmosphere formula is the surface
value on flat ground) and as an independent check of Earth's top-of-atmosphere
flux reported by NASA POWER.
"""
from __future__ import annotations

import numpy as np


def annual_mean_insolation(lat_deg: float, solar_constant: float, obliquity_deg: float,
                           eccentricity: float, n: int = 3600) -> float:
    """Annual-mean flux (W/m2) on a horizontal surface at `lat_deg`.

    `solar_constant` is the flux at the orbit's semi-major axis. Integrating the
    daily-mean insolation over true anomaly with Kepler's second law
    (dt proportional to r^2 dnu) cancels the 1/r^2 distance factor, leaving

        mean = S0 / (pi * sqrt(1 - e^2)) * < h0 sin(phi) sin(delta) + cos(phi) cos(delta) sin(h0) >

    averaged uniformly over solar longitude, where delta is the solar declination
    and h0 the sunrise hour angle. Topographic shadowing is not considered.
    """
    phi = np.radians(lat_deg)
    eps = np.radians(obliquity_deg)
    ls = np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    delta = np.arcsin(np.sin(eps) * np.sin(ls))
    cos_h0 = np.clip(-np.tan(phi) * np.tan(delta), -1.0, 1.0)   # clip = polar day / polar night
    h0 = np.arccos(cos_h0)
    daily = h0 * np.sin(phi) * np.sin(delta) + np.cos(phi) * np.cos(delta) * np.sin(h0)
    return float(solar_constant / (np.pi * np.sqrt(1 - eccentricity ** 2)) * daily.mean())
