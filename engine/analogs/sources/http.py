"""HTTP access with retries and an on-disk cache that records retrieval time.

The cache is what makes runs reproducible (same inputs until the TTL expires) and
keeps the pipeline polite to public archives. Set ANALOGS_REFRESH=1, or call
`set_refresh(True)`, to ignore the cache and download everything again.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from .. import config
from ..provenance import utc_now

USER_AGENT = "planetary-analogs/0.1 (scientific data pipeline; python-requests)"
_session: requests.Session | None = None
_refresh = os.environ.get("ANALOGS_REFRESH", "") == "1"


class SourceError(RuntimeError):
    """A data source could not deliver what was asked for."""


def set_refresh(flag: bool) -> None:
    global _refresh
    _refresh = bool(flag)


def session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers["User-Agent"] = USER_AGENT
    return _session


def _cache_paths(source: str, key: str) -> tuple[Path, Path]:
    digest = hashlib.sha1(key.encode()).hexdigest()
    folder = config.CACHE_DIR / source
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{digest}.bin", folder / f"{digest}.meta.json"


def _fresh(meta_path: Path, ttl_days: float) -> bool:
    if not meta_path.exists():
        return False
    try:
        meta = json.loads(meta_path.read_text())
        t = datetime.strptime(meta["retrieved_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return False
    return (datetime.now(timezone.utc) - t).total_seconds() < ttl_days * 86400


def fetch(
    url: str,
    *,
    source: str,
    params: dict | None = None,
    headers: dict | None = None,
    timeout: float = 120,
    retries: int = 4,
    ok_statuses: tuple[int, ...] = (200, 206),
) -> tuple[bytes, dict]:
    """GET `url` (cached). Returns (content, meta) where meta has url and retrieved_at."""
    key = json.dumps([url, sorted((params or {}).items()), sorted((headers or {}).items())])
    data_path, meta_path = _cache_paths(source, key)
    ttl = config.CACHE_TTL_DAYS.get(source, 30)
    if not _refresh and data_path.exists() and _fresh(meta_path, ttl):
        meta = json.loads(meta_path.read_text())
        meta["from_cache"] = True
        return data_path.read_bytes(), meta

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = session().get(url, params=params, headers=headers, timeout=timeout)
            if resp.status_code in ok_statuses:
                meta = {
                    "url": resp.url,
                    "retrieved_at": utc_now(),
                    "status": resp.status_code,
                    "last_modified": resp.headers.get("Last-Modified", ""),
                }
                data_path.write_bytes(resp.content)
                meta_path.write_text(json.dumps(meta))
                meta["from_cache"] = False
                return resp.content, meta
            if resp.status_code in (400, 401, 403, 404, 422):
                raise SourceError(f"HTTP {resp.status_code} for {resp.url}: {resp.text[:300]}")
            last_err = SourceError(f"HTTP {resp.status_code} for {resp.url}")
        except requests.RequestException as exc:   # network trouble: retry with backoff
            last_err = exc
        time.sleep(2.0 * (attempt + 1))

    # Network failed: fall back to a stale cached copy rather than losing the value,
    # and say so in the metadata.
    if data_path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta["from_cache"] = True
        meta["stale"] = True
        return data_path.read_bytes(), meta
    raise SourceError(f"could not retrieve {url}: {last_err}")


def fetch_json(url: str, **kwargs) -> tuple[dict, dict]:
    content, meta = fetch(url, **kwargs)
    try:
        return json.loads(content), meta
    except json.JSONDecodeError as exc:
        raise SourceError(f"invalid JSON from {url}: {exc}") from exc


def fetch_range(url: str, start: int, length: int, *, source: str, **kwargs) -> tuple[bytes, dict]:
    """Read `length` bytes from byte offset `start` (HTTP Range request)."""
    headers = {"Range": f"bytes={start}-{start + length - 1}"}
    content, meta = fetch(url, source=source, headers=headers, **kwargs)
    if len(content) != length:
        raise SourceError(f"range read of {url} returned {len(content)} bytes, expected {length}")
    return content, meta


def download_file(url: str, *, source: str, filename: str, timeout: float = 300) -> tuple[Path, dict]:
    """Download a whole file into the cache folder and return its path."""
    folder = config.CACHE_DIR / source
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / filename
    meta_path = folder / f"{filename}.meta.json"
    ttl = config.CACHE_TTL_DAYS.get(source, 30)
    if not _refresh and path.exists() and _fresh(meta_path, ttl):
        return path, json.loads(meta_path.read_text())
    try:
        resp = session().get(url, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        if path.exists() and meta_path.exists():
            meta = json.loads(meta_path.read_text())
            meta["stale"] = True
            return path, meta
        raise SourceError(f"could not download {url}: {exc}") from exc
    path.write_bytes(resp.content)
    meta = {"url": url, "retrieved_at": utc_now(), "last_modified": resp.headers.get("Last-Modified", "")}
    meta_path.write_text(json.dumps(meta))
    return path, meta
