"""
Base classes and registry for statistical forensic tests.
Contribution C3: Statistical Forensics (Benford, Digit Heaping, Last-Digit Uniformity, Election Bivariate).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


class ForensicResult:
    """Encapsulates the statistical results of a forensic test."""

    def __init__(
        self,
        test_name: str,
        display_name: str,
        statistic: float,
        p_value: Optional[float],
        effect_size: float,
        conformity_level: str,
        observed_frequencies: Dict[str, float],
        expected_frequencies: Dict[str, float],
        digit_labels: List[str],
        note: str,
        flagged_count: int = 0,
        flagged_indices: Optional[List[int]] = None,
        record_scores: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.test_name = test_name
        self.display_name = display_name
        self.statistic = float(statistic) if statistic is not None else 0.0
        self.p_value = float(p_value) if p_value is not None else None
        self.effect_size = float(effect_size) if effect_size is not None else 0.0
        self.conformity_level = conformity_level
        self.observed_frequencies = observed_frequencies
        self.expected_frequencies = expected_frequencies
        self.digit_labels = digit_labels
        self.note = note
        self.flagged_count = int(flagged_count)
        self.flagged_indices = flagged_indices or []
        self.record_scores = record_scores or []
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_name": self.test_name,
            "display_name": self.display_name,
            "statistic": round(self.statistic, 4),
            "p_value": round(self.p_value, 6) if self.p_value is not None else None,
            "effect_size": round(self.effect_size, 4),
            "conformity_level": self.conformity_level,
            "observed_frequencies": {k: round(v, 4) for k, v in self.observed_frequencies.items()},
            "expected_frequencies": {k: round(v, 4) for k, v in self.expected_frequencies.items()},
            "digit_labels": self.digit_labels,
            "note": self.note,
            "flagged_count": self.flagged_count,
            "flagged_indices": self.flagged_indices[:100],  # Return up to 100 sample indices
            "metadata": self.metadata,
        }


class BaseForensicTest(ABC):
    """Abstract base class for forensic tests."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique machine identifier for the test."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable display title."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Technical description of statistical test and expected distribution."""
        pass

    @abstractmethod
    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        """Determines whether the test can be meaningfully executed on the given series."""
        pass

    @abstractmethod
    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        """Executes forensic analysis and returns structured result."""
        pass


class ForensicRegistry:
    """Registry maintaining available statistical forensic tests."""

    _registry: Dict[str, BaseForensicTest] = {}

    @classmethod
    def register(cls, test_class):
        """Decorator to register a forensic test class."""
        instance = test_class()
        cls._registry[instance.name] = instance
        return test_class

    @classmethod
    def get(cls, name: str) -> Optional[BaseForensicTest]:
        return cls._registry.get(name)

    @classmethod
    def list_all(cls) -> Dict[str, BaseForensicTest]:
        return dict(cls._registry)
