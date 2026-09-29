"""
Detector Registry for modular anomaly detector registration and factory instantiation.
"""

from typing import Dict, Type, Any, List
from app.anomaly_detection.base import BaseDetector


class DetectorRegistry:
    _registry: Dict[str, Type[BaseDetector]] = {}

    @classmethod
    def register(cls, name: str):
        """Decorator to register a detector class under a given key."""
        def decorator(subclass: Type[BaseDetector]):
            cls._registry[name] = subclass
            return subclass
        return decorator

    @classmethod
    def get(cls, name: str, **kwargs) -> BaseDetector:
        """Instantiate a detector from the registry."""
        if name not in cls._registry:
            raise ValueError(
                f"Detector '{name}' is not registered. Available detectors: {list(cls._registry.keys())}"
            )
        detector_cls = cls._registry[name]
        return detector_cls(**kwargs)

    @classmethod
    def list_available(cls) -> List[Dict[str, Any]]:
        """List metadata for all registered detectors."""
        items = []
        for name, d_cls in cls._registry.items():
            doc = (d_cls.__doc__ or "").strip().split("\n")[0]
            items.append({
                "name": name,
                "description": doc,
                "class_name": d_cls.__name__
            })
        return items
