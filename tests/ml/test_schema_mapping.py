"""
Tests for Semantic Schema Mapping Heuristics
"""
import sys
from pathlib import Path
import pandas as pd

ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.schema_mapping.infer import infer_schema_mapping


def test_schema_mapping_inference():
    columns = [
        "State_Name",
        "district",
        "block_name",
        "Total_Population",
        "Male_Pop",
        "Female_Pop",
        "Wages_Paid",
        "persondays",
        "Total_Electors",
        "votes_polled",
        "random_unmapped_col"
    ]

    mapping = infer_schema_mapping(columns)

    assert mapping["State_Name"]["canonicalRole"] == "state"
    assert mapping["State_Name"]["confidence"] >= 0.85
    assert mapping["State_Name"]["isHierarchy"] is True

    assert mapping["district"]["canonicalRole"] == "district"
    assert mapping["district"]["isHierarchy"] is True

    assert mapping["block_name"]["canonicalRole"] == "block"

    assert mapping["Total_Population"]["canonicalRole"] == "population_total"
    assert mapping["Male_Pop"]["canonicalRole"] == "population_male"
    assert mapping["Female_Pop"]["canonicalRole"] == "population_female"

    assert mapping["Wages_Paid"]["canonicalRole"] == "wages_total"
    assert mapping["persondays"]["canonicalRole"] == "workdays_total"

    assert mapping["Total_Electors"]["canonicalRole"] == "total_electors"
    assert mapping["votes_polled"]["canonicalRole"] == "votes_polled"

    assert mapping["random_unmapped_col"]["canonicalRole"] == "unmapped"
    assert mapping["random_unmapped_col"]["confidence"] == 0.0
