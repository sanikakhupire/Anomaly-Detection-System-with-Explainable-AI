"""
LaTeX Table Exporters for Publication-Ready Research Papers (Contribution C9).
Generates IEEE Transactions style tables for benchmark comparisons, ablations, and significance.
"""

from typing import Dict, Any, List


def generate_benchmark_latex(
    dataset_name: str,
    results_by_model: Dict[str, Dict[str, float]],
    caption: str = None,
    label: str = "tab:benchmark_comparison",
) -> str:
    """
    Generates an IEEE formatted LaTeX table comparing the proposed model against baselines.
    """
    if caption is None:
        caption = f"Performance benchmark comparison on {dataset_name} public dataset. Top performances are bolded."

    latex = [
        r"\begin{table*}[t]",
        r"\centering",
        f"\\caption{{{caption}}}",
        f"\\label{{{label}}}",
        r"\renewcommand{\arraystretch}{1.2}",
        r"\begin{tabular}{lcccccc}",
        r"\hline",
        r"\textbf{Model / Detector} & \textbf{PR-AUC} $\uparrow$ & \textbf{ROC-AUC} $\uparrow$ & \textbf{P@10} $\uparrow$ & \textbf{R@10} $\uparrow$ & \textbf{F1-Score} $\uparrow$ & \textbf{Brier Loss} $\downarrow$ \\",
        r"\hline",
    ]

    # Find maximums for bolding
    best_pr = max((res.get("pr_auc", 0.0) for res in results_by_model.values()), default=0.0)
    best_roc = max((res.get("roc_auc", 0.0) for res in results_by_model.values()), default=0.0)
    best_p10 = max((res.get("precision@10", 0.0) for res in results_by_model.values()), default=0.0)
    best_r10 = max((res.get("recall@10", 0.0) for res in results_by_model.values()), default=0.0)
    best_f1 = max((res.get("f1", 0.0) for res in results_by_model.values()), default=0.0)
    best_brier = min((res.get("brier_score", 1.0) for res in results_by_model.values()), default=1.0)

    for model_name, metrics in results_by_model.items():
        pr = metrics.get("pr_auc", 0.0)
        roc = metrics.get("roc_auc", 0.0)
        p10 = metrics.get("precision@10", 0.0)
        r10 = metrics.get("recall@10", 0.0)
        f1 = metrics.get("f1", 0.0)
        brier = metrics.get("brier_score", 0.0)

        pr_str = f"\\textbf{{{pr:.3f}}}" if abs(pr - best_pr) < 1e-4 else f"{pr:.3f}"
        roc_str = f"\\textbf{{{roc:.3f}}}" if abs(roc - best_roc) < 1e-4 else f"{roc:.3f}"
        p10_str = f"\\textbf{{{p10:.3f}}}" if abs(p10 - best_p10) < 1e-4 else f"{p10:.3f}"
        r10_str = f"\\textbf{{{r10:.3f}}}" if abs(r10 - best_r10) < 1e-4 else f"{r10:.3f}"
        f1_str = f"\\textbf{{{f1:.3f}}}" if abs(f1 - best_f1) < 1e-4 else f"{f1:.3f}"
        brier_str = f"\\textbf{{{brier:.3f}}}" if abs(brier - best_brier) < 1e-4 else f"{brier:.3f}"

        display_name = model_name
        if "Proposed" in model_name or "Full" in model_name:
            display_name = f"\\textbf{{{model_name} (Ours)}}"

        row = f"{display_name} & {pr_str} & {roc_str} & {p10_str} & {r10_str} & {f1_str} & {brier_str} \\\\"
        latex.append(row)

    latex.extend([
        r"\hline",
        r"\end{tabular}",
        r"\end{table*}",
    ])

    return "\n".join(latex)


def generate_ablation_latex(
    ablation_results: List[Dict[str, Any]],
    caption: str = "Ablation analysis demonstrating incremental utility of proposed research contributions.",
    label: str = "tab:ablation_study",
) -> str:
    """
    Generates an IEEE formatted LaTeX table reporting ablation degradation.
    """
    latex = [
        r"\begin{table}[t]",
        r"\centering",
        f"\\caption{{{caption}}}",
        f"\\label{{{label}}}",
        r"\renewcommand{\arraystretch}{1.2}",
        r"\begin{tabular}{lccc}",
        r"\hline",
        r"\textbf{System Variant / Ablation} & \textbf{PR-AUC} & \textbf{ROC-AUC} & \textbf{$\Delta$ PR-AUC} \\",
        r"\hline",
    ]

    base_pr = None
    for item in ablation_results:
        variant = item.get("variant", "Variant")
        pr = item.get("pr_auc", 0.0)
        roc = item.get("roc_auc", 0.0)

        if base_pr is None:
            base_pr = pr
            delta_str = "Ref"
            row = f"\\textbf{{{variant}}} & \\textbf{{{pr:.3f}}} & \\textbf{{{roc:.3f}}} & {delta_str} \\\\"
        else:
            delta = pr - base_pr
            delta_str = f"{delta:+.3f}"
            row = f"{variant} & {pr:.3f} & {roc:.3f} & {delta_str} \\\\"

        latex.append(row)

    latex.extend([
        r"\hline",
        r"\end{tabular}",
        r"\end{table}",
    ])

    return "\n".join(latex)


def generate_significance_latex(
    significance_results: List[Dict[str, Any]],
    caption: str = "Pairwise statistical significance tests (Paired t-test and Wilcoxon Signed-Rank).",
    label: str = "tab:significance_tests",
) -> str:
    """
    Generates an IEEE formatted LaTeX table reporting p-values and effect sizes.
    """
    latex = [
        r"\begin{table}[t]",
        r"\centering",
        f"\\caption{{{caption}}}",
        f"\\label{{{label}}}",
        r"\renewcommand{\arraystretch}{1.2}",
        r"\begin{tabular}{lcccc}",
        r"\hline",
        r"\textbf{Comparison (Ours vs)} & \textbf{Mean Diff} & \textbf{Cohen's $d$} & \textbf{t-test $p$} & \textbf{Wilcoxon $p$} \\",
        r"\hline",
    ]

    for item in significance_results:
        baseline = item.get("baseline_name", "Baseline")
        diff = item.get("mean_difference", 0.0)
        d = item.get("cohen_d", 0.0)
        t_p = item.get("paired_t_test", {}).get("p_value", 1.0)
        w_p = item.get("wilcoxon_test", {}).get("p_value", 1.0)

        t_p_str = f"{t_p:.4f}" if t_p >= 0.0001 else "< 0.0001"
        w_p_str = f"{w_p:.4f}" if w_p >= 0.0001 else "< 0.0001"

        row = f"{baseline} & {diff:+.3f} & {d:.2f} & {t_p_str} & {w_p_str} \\\\"
        latex.append(row)

    latex.extend([
        r"\hline",
        r"\multicolumn{5}{l}{\footnotesize $^{*}p<0.05, ^{**}p<0.01, ^{***}p<0.001$} \\",
        r"\end{tabular}",
        r"\end{table}",
    ])

    return "\n".join(latex)
