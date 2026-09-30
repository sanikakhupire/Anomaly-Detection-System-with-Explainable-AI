"""
Explainability Service orchestrator (Contribution C4).
Handles lazy computation, caching by data/config hash, plain-language formatting,
and stability score coupling for ATPI refinement.
"""

from typing import Dict, List, Optional, Tuple, Any
import hashlib
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from app.explainability.base import ExplanationResult, FaithfulnessMetrics, StabilityMetrics
from app.explainability.diffi import DIFFIExplainer
from app.explainability.shap_explainer import ShapExplainer
from app.explainability.counterfactual import CounterfactualGenerator
from app.explainability.evaluator import FaithfulnessEvaluator


class ExplainabilityService:
    """
    Orchestrates local and global explanation generation, counterfactual synthesis,
    and faithfulness validation with memory-efficient LRU/hash caching.
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.evaluator = FaithfulnessEvaluator(random_state=random_state)
        # Cache keyed by: hash(data_hash + config_hash + str(record_index))
        self._cache: Dict[str, Dict[str, Any]] = {}

    def _get_cache_key(self, data_hash: str, config_hash: str, record_index: int) -> str:
        raw = f"{data_hash}_{config_hash}_{record_index}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def explain_record(
        self,
        record_index: int,
        record_data: Dict[str, Any],
        feature_cols: List[str],
        background_df: pd.DataFrame,
        model: Optional[IsolationForest] = None,
        peer_baselines: Optional[Dict[str, Dict[str, float]]] = None,
        data_hash: str = "default_data",
        config_hash: str = "default_config",
        top_k: int = 4,
    ) -> ExplanationResult:
        """
        Generates full lazy explanation result for a single record.
        """
        cache_key = self._get_cache_key(data_hash, config_hash, record_index)
        if cache_key in self._cache:
            cached_data = self._cache[cache_key]
            return self._deserialize_cached(cached_data)

        # Extract numeric vector for record
        x_vals = []
        for col in feature_cols:
            val = record_data.get(col, 0.0)
            try:
                x_vals.append(float(val) if val is not None else 0.0)
            except (ValueError, TypeError):
                x_vals.append(0.0)
        x_arr = np.array(x_vals, dtype=np.float64)

        # Compute empirical bounds and baseline medians from background data
        bg_numeric = background_df[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
        empirical_bounds = {
            col: (float(bg_numeric[col].min()), float(bg_numeric[col].max()))
            for col in feature_cols
        }
        baseline_vector = bg_numeric.median(axis=0).values

        # If peer baselines provided, use peer median as reference
        if peer_baselines is None:
            peer_baselines = {}
            for col in feature_cols:
                med = float(bg_numeric[col].median())
                q25 = float(bg_numeric[col].quantile(0.25))
                q75 = float(bg_numeric[col].quantile(0.75))
                mad = float(np.median(np.abs(bg_numeric[col] - med))) or 1.0
                peer_baselines[col] = {"median": med, "mad": mad, "q25": q25, "q75": q75}

        # 1. Isolation Forest / Model initialization if not provided
        if model is None or not hasattr(model, "estimators_"):
            model = IsolationForest(
                n_estimators=50,
                contamination=0.05,
                random_state=self.random_state,
            )
            model.fit(bg_numeric.values)

        # 2. Compute DIFFI Attributions
        diffi_explainer = DIFFIExplainer(model=model, feature_names=feature_cols)
        diffi_scores = diffi_explainer.explain_instance(x_arr)

        # 3. Compute SHAP Attributions & Perturbation Baseline
        shap_explainer = ShapExplainer(
            model=model,
            feature_names=feature_cols,
            background_data=bg_numeric.values,
            random_state=self.random_state,
        )
        shap_values = shap_explainer.explain_instance(
            x=x_arr,
            baseline=baseline_vector,
        )

        score_func = lambda z: float(-model.decision_function(z.reshape(1, -1))[0])
        perturbation_scores = shap_explainer.compute_perturbation_baseline(
            x=x_arr,
            score_func=score_func,
            baseline=baseline_vector,
        )

        # 4. Synthesize Top Features Breakdown
        # Rank by absolute SHAP contribution
        ranked_features = sorted(
            feature_cols,
            key=lambda f: abs(shap_values.get(f, 0.0)) + 0.5 * diffi_scores.get(f, 0.0),
            reverse=True,
        )

        total_abs_shap = sum(abs(shap_values.get(f, 0.0)) for f in feature_cols) or 1.0
        top_feature_list = []
        for feat in ranked_features[:top_k]:
            act_val = float(record_data.get(feat, 0.0))
            exp_val = peer_baselines.get(feat, {}).get("median", act_val)
            s_val = shap_values.get(feat, 0.0)
            d_val = diffi_scores.get(feat, 0.0)
            p_val = perturbation_scores.get(feat, 0.0)
            dir_str = "ANOMALOUS_ELEVATION" if act_val > exp_val else "UNUSUAL_DEFICIT" if act_val < exp_val else "NEUTRAL"
            contrib_pct = float(abs(s_val) / total_abs_shap * 100)

            top_feature_list.append({
                "feature": feat,
                "actual_value": round(act_val, 4),
                "expected_value": round(exp_val, 4),
                "direction": dir_str,
                "shap_value": round(s_val, 4),
                "diffi_score": round(d_val, 4),
                "perturbation_score": round(p_val, 4),
                "contribution_pct": round(contrib_pct, 1),
            })

        # 5. Generate Minimal Plausible Counterfactuals
        cf_generator = CounterfactualGenerator(
            feature_names=feature_cols,
            empirical_bounds=empirical_bounds,
        )
        counterfactuals = cf_generator.generate_counterfactuals(
            record={c: float(record_data.get(c, 0.0)) for c in feature_cols},
            peer_baselines=peer_baselines,
            top_features=ranked_features,
            max_features=3,
        )

        # 6. Evaluate Faithfulness & Stability
        faithfulness = self.evaluator.evaluate_instance_faithfulness(
            x=x_arr,
            feature_names=feature_cols,
            attributions=shap_values,
            score_func=score_func,
            baseline=baseline_vector,
        )

        stability = self.evaluator.evaluate_stability(
            shap_scores=shap_values,
            diffi_scores=diffi_scores,
            top_k=top_k,
        )

        # Composite stability score for ATPI refinement (average of Jaccard stability and normalized tau)
        tau_norm = float(np.clip((stability.kendall_tau + 1.0) / 2.0, 0.0, 1.0))
        stability_score = float(0.60 * stability.jaccard_stability + 0.40 * tau_norm)

        # 7. Plain-Language Summary (Strictly avoiding the word 'fraud')
        top_name = top_feature_list[0]["feature"] if top_feature_list else "values"
        top_act = top_feature_list[0]["actual_value"] if top_feature_list else 0
        top_exp = top_feature_list[0]["expected_value"] if top_feature_list else 0
        top_dir = "higher than" if top_act > top_exp else "lower than"

        summary = (
            f"Statistically unusual pattern driven primarily by '{top_name}' "
            f"({top_act} vs peer-group median {top_exp}, {top_dir} expected baseline). "
            f"Multivariate isolation analysis confirms {top_feature_list[0]['contribution_pct']}% "
            f"attribution weight. Deletion faithfulness: AUC={faithfulness.deletion_auc:.2f}, "
            f"rank stability={stability_score:.2f}. Human reviewer domain triage recommended."
        )

        result = ExplanationResult(
            record_index=record_index,
            top_features=top_feature_list,
            shap_values=shap_values,
            diffi_scores=diffi_scores,
            perturbation_scores=perturbation_scores,
            plain_language_summary=summary,
            counterfactuals=counterfactuals,
            faithfulness=faithfulness,
            stability=stability,
            stability_score=stability_score,
            metadata={
                "data_hash": data_hash,
                "config_hash": config_hash,
                "feature_count": len(feature_cols),
            },
        )

        # Cache result
        self._cache[cache_key] = result.to_dict()
        return result

    def _deserialize_cached(self, data: Dict[str, Any]) -> ExplanationResult:
        """Restores ExplanationResult from cached dictionary."""
        from app.explainability.base import CounterfactualResult, FaithfulnessMetrics, StabilityMetrics
        
        cfs = [
            CounterfactualResult(
                feature=c["feature"],
                original_value=c["original_value"],
                counterfactual_value=c["counterfactual_value"],
                delta=c["delta"],
                peer_median=c["peer_median"],
                peer_iqr=tuple(c["peer_iqr"]),
                direction=c["direction"],
                plausibility=c["plausibility"],
            )
            for c in data.get("counterfactuals", [])
        ]

        faith = FaithfulnessMetrics(
            deletion_auc=data["faithfulness"]["deletion_auc"],
            insertion_auc=data["faithfulness"]["insertion_auc"],
            comprehensiveness=data["faithfulness"]["comprehensiveness"],
            sufficiency=data["faithfulness"]["sufficiency"],
            deletion_curve=data["faithfulness"].get("deletion_curve", []),
            insertion_curve=data["faithfulness"].get("insertion_curve", []),
        )

        stab = StabilityMetrics(
            jaccard_stability=data["stability"]["jaccard_stability"],
            kendall_tau=data["stability"]["kendall_tau"],
            top_k_features=data["stability"].get("top_k_features", []),
            explanation_coverage=data["stability"].get("explanation_coverage", 1.0),
        )

        return ExplanationResult(
            record_index=data["record_index"],
            top_features=data["top_features"],
            shap_values=data["shap_values"],
            diffi_scores=data["diffi_scores"],
            perturbation_scores=data["perturbation_scores"],
            plain_language_summary=data["plain_language_summary"],
            counterfactuals=cfs,
            faithfulness=faith,
            stability=stab,
            stability_score=data["stability_score"],
            metadata=data.get("metadata", {}),
        )
