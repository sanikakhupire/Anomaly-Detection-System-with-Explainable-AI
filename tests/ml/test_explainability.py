"""
Tests for Explainability & Faithfulness (Contribution C4).
Verifies SHAP attributions, DIFFI feature importance, counterfactual validity,
faithfulness sanity checks (deletion AUC drops faster for faithful attributions than random),
and stability reproducibility.
"""

import pytest
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from app.explainability.diffi import DIFFIExplainer
from app.explainability.shap_explainer import ShapExplainer
from app.explainability.counterfactual import CounterfactualGenerator
from app.explainability.evaluator import FaithfulnessEvaluator
from app.explainability.service import ExplainabilityService


@pytest.fixture
def sample_isolation_forest_and_data():
    """Generates synthetic background data with an injected outlier."""
    np.random.seed(42)
    n_samples = 200
    features = ["wage", "workdays", "expenditure", "attendance_rate"]

    # Normal multivariate data
    X_normal = np.column_stack([
        np.random.normal(150, 20, n_samples),
        np.random.normal(30, 5, n_samples),
        np.random.normal(5000, 500, n_samples),
        np.random.uniform(0.8, 1.0, n_samples),
    ])
    df = pd.DataFrame(X_normal, columns=features)

    # Train Isolation Forest
    model = IsolationForest(n_estimators=50, random_state=42)
    model.fit(X_normal)

    # An injected anomalous instance with extreme wage and expenditure
    anomalous_record = {
        "wage": 850.0,            # +35 MADs above normal
        "workdays": 32.0,         # Normal
        "expenditure": 45000.0,   # +80 MADs above normal
        "attendance_rate": 0.90,  # Normal
    }

    return model, df, features, anomalous_record


def test_diffi_explainer(sample_isolation_forest_and_data):
    """Verifies DIFFI produces normalized positive attributions summing to 1.0."""
    model, df, features, anomalous_record = sample_isolation_forest_and_data
    explainer = DIFFIExplainer(model=model, feature_names=features)

    x = np.array([anomalous_record[f] for f in features])
    scores = explainer.explain_instance(x)

    assert len(scores) == len(features)
    assert np.isclose(sum(scores.values()), 1.0, atol=1e-4)

    # The anomalous features (wage and expenditure) must receive higher importance than attendance_rate
    assert scores["wage"] > scores["attendance_rate"]
    assert scores["expenditure"] > scores["attendance_rate"]


def test_shap_explainer_and_perturbation(sample_isolation_forest_and_data):
    """Verifies SHAP explainer and perturbation baseline highlight dominant anomalous features."""
    model, df, features, anomalous_record = sample_isolation_forest_and_data
    shap_explainer = ShapExplainer(
        model=model,
        feature_names=features,
        background_data=df.values,
        random_state=42,
    )

    x = np.array([anomalous_record[f] for f in features])
    baseline = df.median(axis=0).values

    shap_scores = shap_explainer.explain_instance(x=x, baseline=baseline)

    # Wage and expenditure must have high positive SHAP values (pushing into anomaly territory)
    assert shap_scores["wage"] > 0
    assert shap_scores["expenditure"] > 0
    assert shap_scores["wage"] > shap_scores["attendance_rate"]

    # Perturbation baseline test
    score_func = lambda z: float(-model.decision_function(z.reshape(1, -1))[0])
    perturbation = shap_explainer.compute_perturbation_baseline(x=x, score_func=score_func, baseline=baseline)

    assert perturbation["wage"] > 0
    assert perturbation["expenditure"] > 0


def test_counterfactual_generator(sample_isolation_forest_and_data):
    """Verifies counterfactual generator calculates minimal plausible adjustments towards peer normal."""
    model, df, features, anomalous_record = sample_isolation_forest_and_data
    empirical_bounds = {f: (float(df[f].min()), float(df[f].max() * 2)) for f in features}

    peer_baselines = {}
    for f in features:
        med = float(df[f].median())
        mad = float(np.median(np.abs(df[f] - med))) or 1.0
        peer_baselines[f] = {
            "median": med,
            "mad": mad,
            "q25": float(df[f].quantile(0.25)),
            "q75": float(df[f].quantile(0.75)),
        }

    cf_gen = CounterfactualGenerator(feature_names=features, empirical_bounds=empirical_bounds)
    cfs = cf_gen.generate_counterfactuals(
        record=anomalous_record,
        peer_baselines=peer_baselines,
        top_features=["wage", "expenditure"],
        max_features=2,
    )

    assert len(cfs) == 2
    wage_cf = next(c for c in cfs if c.feature == "wage")
    assert wage_cf.direction == "DECREASE"
    assert wage_cf.counterfactual_value < wage_cf.original_value
    assert wage_cf.counterfactual_value <= peer_baselines["wage"]["q75"] + 1e-3
    assert wage_cf.plausibility is True


def test_faithfulness_sanity_check(sample_isolation_forest_and_data):
    """
    Sanity test required by research spec:
    Deleting faithful features in order of SHAP attribution must cause anomaly scores
    to drop significantly faster (lower Deletion AUC) than deleting features in random order!
    """
    model, df, features, anomalous_record = sample_isolation_forest_and_data
    evaluator = FaithfulnessEvaluator(random_state=42)

    x = np.array([anomalous_record[f] for f in features])
    baseline = df.median(axis=0).values
    score_func = lambda z: float(-model.decision_function(z.reshape(1, -1))[0])

    # Faithful attributions (wage and expenditure highest)
    faithful_attributions = {"wage": 1.0, "expenditure": 0.9, "workdays": 0.1, "attendance_rate": 0.05}
    # Inverted / worst-case attributions
    random_or_inverted_attributions = {"attendance_rate": 1.0, "workdays": 0.9, "expenditure": 0.1, "wage": 0.05}

    metrics_faithful = evaluator.evaluate_instance_faithfulness(
        x=x,
        feature_names=features,
        attributions=faithful_attributions,
        score_func=score_func,
        baseline=baseline,
    )

    metrics_inverted = evaluator.evaluate_instance_faithfulness(
        x=x,
        feature_names=features,
        attributions=random_or_inverted_attributions,
        score_func=score_func,
        baseline=baseline,
    )

    # Deletion AUC of faithful explanation must be lower (score drops faster)
    assert metrics_faithful.deletion_auc < metrics_inverted.deletion_auc
    # Comprehensiveness (score drop after top-k removal) must be higher for faithful explanation
    assert metrics_faithful.comprehensiveness > metrics_inverted.comprehensiveness


def test_stability_kendall_tau():
    """Verifies Kendall's tau rank correlation evaluator."""
    evaluator = FaithfulnessEvaluator()

    # Perfectly concordant rankings
    shap_scores = {"f1": 0.9, "f2": 0.7, "f3": 0.3}
    diffi_scores = {"f1": 0.5, "f2": 0.3, "f3": 0.2}
    metrics = evaluator.evaluate_stability(shap_scores, diffi_scores)
    assert np.isclose(metrics.kendall_tau, 1.0, atol=1e-3)
    assert metrics.jaccard_stability >= 0.8


def test_explainability_service_end_to_end(sample_isolation_forest_and_data):
    """Verifies the complete lazy explanation service and caching."""
    model, df, features, anomalous_record = sample_isolation_forest_and_data
    service = ExplainabilityService(random_state=42)

    res = service.explain_record(
        record_index=99,
        record_data=anomalous_record,
        feature_cols=features,
        background_df=df,
        model=model,
        data_hash="test_data_hash_123",
        config_hash="test_config_hash_abc",
        top_k=3,
    )

    assert res.record_index == 99
    assert len(res.top_features) == 3
    assert len(res.counterfactuals) >= 1
    assert "fraud" not in res.plain_language_summary.lower()
    assert res.stability_score >= 0.0 and res.stability_score <= 1.0

    # Test cache retrieval
    cached_res = service.explain_record(
        record_index=99,
        record_data=anomalous_record,
        feature_cols=features,
        background_df=df,
        model=model,
        data_hash="test_data_hash_123",
        config_hash="test_config_hash_abc",
    )
    assert cached_res.record_index == 99
    assert cached_res.top_features[0]["feature"] == res.top_features[0]["feature"]
