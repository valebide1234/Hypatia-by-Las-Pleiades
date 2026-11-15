"""Every number in the system travels with its provenance.

`kind` distinguishes how a value was obtained, which is what lets the reports
separate measured data from model output and from inferred descriptors:

    measured       satellite or in-situ measurement retrieved from an archive
    reanalysis     observation-constrained reanalysis (MERRA-2 via NASA POWER)
    modeled        climate-model output (Mars Climate Database) or astronomical computation
    derived        computed here from other retrieved variables
    literature     published value typed into a catalogue with its citation
    expert_coded   ordinal descriptor coded from the cited literature
    physical_zero  zero imposed by physics (e.g. rainfall on the Moon)
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

KINDS = ("measured", "reanalysis", "modeled", "derived", "literature", "expert_coded", "physical_zero")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Measurement:
    entity_id: str
    parameter: str
    value: float
    unit: str
    kind: str
    source: str                    # key in data/catalog/references.yaml
    url: str = ""
    retrieved_at: str = field(default_factory=utc_now)
    period: str = ""               # time span the value represents
    note: str = ""

    def __post_init__(self) -> None:
        if self.kind not in KINDS:
            raise ValueError(f"unknown measurement kind: {self.kind}")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Missing:
    """An expected value that could not be obtained, and why."""
    entity_id: str
    parameter: str
    reason: str
    source: str = ""

    def to_dict(self) -> dict:
        return asdict(self)
