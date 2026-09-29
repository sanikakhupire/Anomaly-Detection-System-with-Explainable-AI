"""
Implementation of registered statistical forensic tests.
Contribution C3: Statistical Forensics (Benford First/Second Digit, Last Digit Uniformity,
Digit Heaping Whipple/Myers, Round Number Bias, Election Bivariate Turnout vs Vote-Share).
"""

import math
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from scipy import stats

from app.forensics.base import BaseForensicTest, ForensicResult, ForensicRegistry


def _extract_first_digit(val: float) -> Optional[int]:
    """Extracts first non-zero digit from positive number."""
    if pd.isna(val) or val <= 0:
        return None
    val_str = f"{val:.10e}"
    first_char = val_str[0]
    if first_char.isdigit() and int(first_char) in range(1, 10):
        return int(first_char)
    return None


def _extract_second_digit(val: float) -> Optional[int]:
    """Extracts second significant digit from positive number."""
    if pd.isna(val) or val <= 0:
        return None
    val_str = f"{val:.10e}"
    # Form: "1.2345678901e+02" -> second char after dot is second digit
    parts = val_str.split("e")[0].replace(".", "")
    if len(parts) >= 2 and parts[1].isdigit():
        return int(parts[1])
    return None


def _extract_last_integer_digit(val: float) -> Optional[int]:
    """Extracts terminal integer digit (units place) from a real number."""
    if pd.isna(val):
        return None
    try:
        int_val = int(abs(round(val)))
        return int_val % 10
    except (ValueError, OverflowError):
        return None


@ForensicRegistry.register
class BenfordFirstDigitTest(BaseForensicTest):
    """Evaluates adherence of first significant digits to Benford's Law."""

    @property
    def name(self) -> str:
        return "benford_first_digit"

    @property
    def display_name(self) -> str:
        return "Benford First-Digit Test"

    @property
    def description(self) -> str:
        return "Chi-square goodness-of-fit and Nigrini MAD conformity of leading digits against log10(1 + 1/d)."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        clean = pd.to_numeric(series, errors="coerce").dropna()
        positive = clean[clean > 0]
        # Needs at least 30 observations spanning multiple orders of magnitude
        if len(positive) < 30:
            return False
        order_of_mag = np.log10(positive.max()) - np.log10(positive.min())
        return order_of_mag >= 1.0

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        clean = pd.to_numeric(series, errors="coerce")
        valid_mask = (clean.notna()) & (clean > 0)
        valid_indices = clean[valid_mask].index.tolist()
        valid_values = clean[valid_mask].values

        first_digits = [_extract_first_digit(v) for v in valid_values]
        valid_pairs = [(idx, d) for idx, d in zip(valid_indices, first_digits) if d is not None]

        if len(valid_pairs) < 30:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=[str(d) for d in range(1, 10)],
                note="Insufficient positive data spanning multiple orders of magnitude for Benford analysis.",
            )

        n = len(valid_pairs)
        digits = [p[1] for p in valid_pairs]
        indices = [p[0] for p in valid_pairs]

        # Theoretical probabilities: P(d) = log10(1 + 1/d)
        expected_p = {d: math.log10(1.0 + 1.0 / d) for d in range(1, 10)}
        observed_counts = {d: 0 for d in range(1, 10)}
        for d in digits:
            observed_counts[d] += 1

        observed_p = {d: observed_counts[d] / n for d in range(1, 10)}

        # Chi-square statistic
        chi2_stat = 0.0
        for d in range(1, 10):
            exp_count = expected_p[d] * n
            obs_count = observed_counts[d]
            chi2_stat += ((obs_count - exp_count) ** 2) / exp_count

        df = 8
        p_val = float(stats.chi2.sf(chi2_stat, df))

        # Nigrini's Mean Absolute Deviation (MAD) = sum(|o_d - e_d|) / 9
        mad = sum(abs(observed_p[d] - expected_p[d]) for d in range(1, 10)) / 9.0

        # Cohen's w effect size
        effect_size = math.sqrt(chi2_stat / n)

        # Nigrini conformity tiers for first digit
        if mad <= 0.006:
            conformity = "CLOSE_CONFORMITY"
        elif mad <= 0.012:
            conformity = "ACCEPTABLE_CONFORMITY"
        elif mad <= 0.015:
            conformity = "MARGINALLY_ACCEPTABLE"
        else:
            conformity = "NON_CONFORMITY"

        # Flag records with digits that deviate by > 2.0 standardized residuals
        flagged_indices = []
        record_scores = []
        for idx, d in valid_pairs:
            exp_count = expected_p[d] * n
            obs_count = observed_counts[d]
            std_res = abs(obs_count - exp_count) / math.sqrt(exp_count)
            # Record individual score proportional to Benford surprise: -log10(P(d))
            surprise = -math.log10(expected_p[d])
            record_scores.append(float(surprise))
            if std_res > 2.5 and obs_count > exp_count:
                flagged_indices.append(int(idx))

        note = (
            f"Mean Absolute Deviation is {mad:.4f} ({conformity}). "
            f"Chi-square statistic = {chi2_stat:.2f} (p = {p_val:.4e}). "
            "Statistical indicator of natural scale dispersion; non-conformity indicates unusual distribution structure requiring human review."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=chi2_stat,
            p_value=p_val,
            effect_size=effect_size,
            conformity_level=conformity,
            observed_frequencies={str(k): v for k, v in observed_p.items()},
            expected_frequencies={str(k): v for k, v in expected_p.items()},
            digit_labels=[str(d) for d in range(1, 10)],
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            record_scores=record_scores,
            metadata={"mad": round(mad, 5), "sample_size": n},
        )


@ForensicRegistry.register
class BenfordSecondDigitTest(BaseForensicTest):
    """Evaluates adherence of second significant digits to Benford's Law."""

    @property
    def name(self) -> str:
        return "benford_second_digit"

    @property
    def display_name(self) -> str:
        return "Benford Second-Digit Test"

    @property
    def description(self) -> str:
        return "Tests second significant digits against P(d) = sum_{k=1}^9 log10(1 + 1/(10k + d))."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        clean = pd.to_numeric(series, errors="coerce").dropna()
        positive = clean[clean > 0]
        return len(positive) >= 50

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        clean = pd.to_numeric(series, errors="coerce")
        valid_mask = (clean.notna()) & (clean > 0)
        valid_indices = clean[valid_mask].index.tolist()
        valid_values = clean[valid_mask].values

        second_digits = [_extract_second_digit(v) for v in valid_values]
        valid_pairs = [(idx, d) for idx, d in zip(valid_indices, second_digits) if d is not None]

        if len(valid_pairs) < 50:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=[str(d) for d in range(0, 10)],
                note="Insufficient positive data for second-digit Benford test.",
            )

        n = len(valid_pairs)
        digits = [p[1] for p in valid_pairs]

        # Theoretical probabilities for second digit (0..9)
        expected_p = {}
        for d in range(0, 10):
            prob = sum(math.log10(1.0 + 1.0 / (10 * k + d)) for k in range(1, 10))
            expected_p[d] = prob

        observed_counts = {d: 0 for d in range(0, 10)}
        for d in digits:
            observed_counts[d] += 1

        observed_p = {d: observed_counts[d] / n for d in range(0, 10)}

        chi2_stat = 0.0
        for d in range(0, 10):
            exp_count = expected_p[d] * n
            obs_count = observed_counts[d]
            chi2_stat += ((obs_count - exp_count) ** 2) / exp_count

        df = 9
        p_val = float(stats.chi2.sf(chi2_stat, df))
        mad = sum(abs(observed_p[d] - expected_p[d]) for d in range(0, 10)) / 10.0
        effect_size = math.sqrt(chi2_stat / n)

        # Nigrini second-digit thresholds
        if mad <= 0.008:
            conformity = "CLOSE_CONFORMITY"
        elif mad <= 0.010:
            conformity = "ACCEPTABLE_CONFORMITY"
        elif mad <= 0.012:
            conformity = "MARGINALLY_ACCEPTABLE"
        else:
            conformity = "NON_CONFORMITY"

        flagged_indices = []
        for idx, d in valid_pairs:
            exp_count = expected_p[d] * n
            obs_count = observed_counts[d]
            std_res = abs(obs_count - exp_count) / math.sqrt(exp_count)
            if std_res > 2.5 and obs_count > exp_count:
                flagged_indices.append(int(idx))

        note = (
            f"Second-digit MAD is {mad:.4f} ({conformity}). "
            f"Chi-square = {chi2_stat:.2f} (p = {p_val:.4e}). "
            "Examines internal digit distribution less sensitive to total scale."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=chi2_stat,
            p_value=p_val,
            effect_size=effect_size,
            conformity_level=conformity,
            observed_frequencies={str(k): v for k, v in observed_p.items()},
            expected_frequencies={str(k): v for k, v in expected_p.items()},
            digit_labels=[str(d) for d in range(0, 10)],
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            metadata={"mad": round(mad, 5), "sample_size": n},
        )


@ForensicRegistry.register
class LastDigitUniformityTest(BaseForensicTest):
    """Tests whether terminal digits follow a uniform discrete distribution U(0, 9)."""

    @property
    def name(self) -> str:
        return "last_digit_uniformity"

    @property
    def display_name(self) -> str:
        return "Last-Digit Uniformity Test"

    @property
    def description(self) -> str:
        return "Evaluates whether integer units digits are uniformly distributed with P(d) = 0.10."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        clean = pd.to_numeric(series, errors="coerce").dropna()
        return len(clean) >= 40 and (clean.max() - clean.min()) >= 10

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        clean = pd.to_numeric(series, errors="coerce")
        valid_mask = clean.notna()
        valid_indices = clean[valid_mask].index.tolist()
        valid_values = clean[valid_mask].values

        last_digits = [_extract_last_integer_digit(v) for v in valid_values]
        valid_pairs = [(idx, d) for idx, d in zip(valid_indices, last_digits) if d is not None]

        if len(valid_pairs) < 40:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=[str(d) for d in range(0, 10)],
                note="Insufficient data for last-digit uniformity test.",
            )

        n = len(valid_pairs)
        digits = [p[1] for p in valid_pairs]

        expected_p = {d: 0.10 for d in range(0, 10)}
        observed_counts = {d: 0 for d in range(0, 10)}
        for d in digits:
            observed_counts[d] += 1

        observed_p = {d: observed_counts[d] / n for d in range(0, 10)}

        chi2_stat = 0.0
        for d in range(0, 10):
            exp_count = 0.10 * n
            obs_count = observed_counts[d]
            chi2_stat += ((obs_count - exp_count) ** 2) / exp_count

        df = 9
        p_val = float(stats.chi2.sf(chi2_stat, df))
        max_abs_dev = max(abs(observed_p[d] - 0.10) for d in range(0, 10))
        effect_size = math.sqrt(chi2_stat / n)

        if p_val >= 0.05 and max_abs_dev <= 0.03:
            conformity = "UNIFORM_CONFORMITY"
        elif p_val >= 0.01:
            conformity = "ACCEPTABLE_UNIFORMITY"
        else:
            conformity = "NON_UNIFORM_DEVIATION"

        flagged_indices = []
        for idx, d in valid_pairs:
            # Flag records with overrepresented terminal digits
            if observed_p[d] > 0.18:
                flagged_indices.append(int(idx))

        note = (
            f"Chi-square test of uniformity = {chi2_stat:.2f} (p = {p_val:.4e}). "
            f"Maximum digit deviation from 10% expected is {max_abs_dev * 100:.1f}%. "
            "Unmanipulated granular counts typically display equal terminal digit frequencies."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=chi2_stat,
            p_value=p_val,
            effect_size=effect_size,
            conformity_level=conformity,
            observed_frequencies={str(k): v for k, v in observed_p.items()},
            expected_frequencies={str(k): v for k, v in expected_p.items()},
            digit_labels=[str(d) for d in range(0, 10)],
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            metadata={"max_absolute_deviation": round(max_abs_dev, 4), "sample_size": n},
        )


@ForensicRegistry.register
class DigitHeapingTest(BaseForensicTest):
    """Detects digit heaping on round values (0 and 5) using Whipple and Myers blended indices."""

    @property
    def name(self) -> str:
        return "digit_heaping"

    @property
    def display_name(self) -> str:
        return "Digit Heaping (Whipple & Myers)"

    @property
    def description(self) -> str:
        return "Calculates Whipple's Index on terminal digits (0, 5) and Myers' Blended Index across 0..9."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        clean = pd.to_numeric(series, errors="coerce").dropna()
        return len(clean) >= 50

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        clean = pd.to_numeric(series, errors="coerce")
        valid_mask = clean.notna()
        valid_indices = clean[valid_mask].index.tolist()
        valid_values = clean[valid_mask].values

        last_digits = [_extract_last_integer_digit(v) for v in valid_values]
        valid_pairs = [(idx, d) for idx, d in zip(valid_indices, last_digits) if d is not None]

        if len(valid_pairs) < 50:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=100.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=[str(d) for d in range(0, 10)],
                note="Insufficient data for digit heaping analysis.",
            )

        n = len(valid_pairs)
        digits = [p[1] for p in valid_pairs]

        observed_counts = {d: 0 for d in range(0, 10)}
        for d in digits:
            observed_counts[d] += 1

        observed_p = {d: observed_counts[d] / n for d in range(0, 10)}
        expected_p = {d: 0.10 for d in range(0, 10)}

        # Whipple's Index: W = (sum(digits in {0, 5}) / (0.2 * N)) * 100
        n_0_5 = observed_counts[0] + observed_counts[5]
        whipple_index = (n_0_5 / (0.20 * n)) * 100.0

        # Myers' Summary Index: 0.5 * sum(|observed_% - 10%|)
        myers_index = 0.5 * sum(abs(observed_p[d] * 100.0 - 10.0) for d in range(0, 10))

        # Demographic conformity classifications
        if whipple_index < 105.0:
            conformity = "NO_HEAPING"
        elif whipple_index < 110.0:
            conformity = "FAIRLY_ACCURATE"
        elif whipple_index < 125.0:
            conformity = "APPROXIMATE_HEAPING"
        elif whipple_index < 175.0:
            conformity = "ROUGH_HEAPING"
        else:
            conformity = "VERY_ROUGH_HEAPING"

        flagged_indices = []
        if whipple_index > 125.0:
            for idx, d in valid_pairs:
                if d in (0, 5):
                    flagged_indices.append(int(idx))

        note = (
            f"Whipple's Index = {whipple_index:.1f} ({conformity}). "
            f"Myers' Summary Index = {myers_index:.2f}. "
            "Values near 100 indicate natural recording; elevated indices signify preference for rounded estimates."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=whipple_index,
            p_value=None,
            effect_size=myers_index / 100.0,
            conformity_level=conformity,
            observed_frequencies={str(k): v for k, v in observed_p.items()},
            expected_frequencies={str(k): v for k, v in expected_p.items()},
            digit_labels=[str(d) for d in range(0, 10)],
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            metadata={
                "whipple_index": round(whipple_index, 2),
                "myers_index": round(myers_index, 2),
                "percent_terminal_0_5": round((n_0_5 / n) * 100.0, 2),
            },
        )


@ForensicRegistry.register
class RoundNumberBiasTest(BaseForensicTest):
    """Detects clustering on round multiples of 10, 50, 100, and 1000."""

    @property
    def name(self) -> str:
        return "round_number_bias"

    @property
    def display_name(self) -> str:
        return "Round-Number Bias Test"

    @property
    def description(self) -> str:
        return "Measures exact multi-base rounding frequency (multiples of 10, 50, 100, 1000)."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        clean = pd.to_numeric(series, errors="coerce").dropna()
        return len(clean) >= 30 and clean.max() >= 100

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        clean = pd.to_numeric(series, errors="coerce")
        valid_mask = clean.notna() & (clean > 0)
        valid_indices = clean[valid_mask].index.tolist()
        valid_values = clean[valid_mask].values

        if len(valid_values) < 30:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=["mult_10", "mult_50", "mult_100", "mult_1000"],
                note="Insufficient data for round-number bias test.",
            )

        n = len(valid_values)
        m10 = sum(1 for v in valid_values if abs(v) % 10 == 0)
        m50 = sum(1 for v in valid_values if abs(v) % 50 == 0)
        m100 = sum(1 for v in valid_values if abs(v) % 100 == 0)
        m1000 = sum(1 for v in valid_values if abs(v) % 1000 == 0)

        obs = {
            "mult_10": m10 / n,
            "mult_50": m50 / n,
            "mult_100": m100 / n,
            "mult_1000": m1000 / n,
        }
        # Nominal expected bounds under continuous density:
        exp = {
            "mult_10": 0.10,
            "mult_50": 0.02,
            "mult_100": 0.01,
            "mult_1000": 0.001,
        }

        # Excess ratio on base 100
        ratio_100 = obs["mult_100"] / max(0.01, exp["mult_100"])

        if obs["mult_100"] > 0.20 or obs["mult_50"] > 0.35:
            conformity = "SEVERE_ROUNDING_BIAS"
        elif obs["mult_100"] > 0.08:
            conformity = "MODERATE_ROUNDING_BIAS"
        else:
            conformity = "NORMAL_DISPERSION"

        flagged_indices = []
        for idx, v in zip(valid_indices, valid_values):
            if abs(v) >= 100 and abs(v) % 100 == 0:
                flagged_indices.append(int(idx))

        note = (
            f"Multiples of 100 comprise {obs['mult_100'] * 100:.1f}% of values (expected ~1%). "
            f"Classification: {conformity}. "
            "High concentration indicates estimation or administrative rounding."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=ratio_100,
            p_value=None,
            effect_size=obs["mult_100"],
            conformity_level=conformity,
            observed_frequencies=obs,
            expected_frequencies=exp,
            digit_labels=["mult_10", "mult_50", "mult_100", "mult_1000"],
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            metadata={"ratio_mult_100": round(ratio_100, 2), "sample_size": n},
        )


@ForensicRegistry.register
class ElectionTurnoutVoteShareForensics(BaseForensicTest):
    """Bivariate election forensics test (Klimek et al. ballot stuffing / turnout-skew model)."""

    @property
    def name(self) -> str:
        return "election_turnout_voteshare"

    @property
    def display_name(self) -> str:
        return "Turnout vs. Vote-Share Forensics"

    @property
    def description(self) -> str:
        return "Analyzes bivariate turnout-vote share correlation and detects extreme high-turnout clustering."

    def is_applicable(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> bool:
        if not context or "df" not in context:
            return False
        df = context["df"]
        cols = [c.lower() for c in df.columns]
        has_turnout = any("turnout" in c for c in cols)
        has_votes = any("vote" in c for c in cols)
        return has_turnout and has_votes

    def run(self, series: pd.Series, context: Optional[Dict[str, Any]] = None) -> ForensicResult:
        if not context or "df" not in context:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="NOT_APPLICABLE",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=["low_turnout", "mid_turnout", "high_turnout", "extreme_turnout"],
                note="Context dataframe with turnout and vote share columns required.",
            )

        df = context["df"]
        # Find turnout column
        turnout_col = next((c for c in df.columns if "turnout" in c.lower()), None)
        votes_col = next(
            (c for c in df.columns if "share" in c.lower() or "vote" in c.lower() and c != turnout_col),
            None,
        )

        if not turnout_col or not votes_col:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="NOT_APPLICABLE",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=["low_turnout", "mid_turnout", "high_turnout", "extreme_turnout"],
                note="Could not identify matching turnout and vote share columns.",
            )

        tau = pd.to_numeric(df[turnout_col], errors="coerce")
        nu = pd.to_numeric(df[votes_col], errors="coerce")

        valid = tau.notna() & nu.notna()
        tau_val = tau[valid].values
        nu_val = nu[valid].values
        valid_indices = df[valid].index.tolist()
        n = len(tau_val)

        if n < 20:
            return ForensicResult(
                test_name=self.name,
                display_name=self.display_name,
                statistic=0.0,
                p_value=None,
                effect_size=0.0,
                conformity_level="INSUFFICIENT_DATA",
                observed_frequencies={},
                expected_frequencies={},
                digit_labels=["low_turnout", "mid_turnout", "high_turnout", "extreme_turnout"],
                note="Insufficient paired election records.",
            )

        # Pearson correlation
        corr, p_corr = stats.pearsonr(tau_val, nu_val)

        # Turnout binning frequencies
        b_low = sum(1 for t in tau_val if t < 50) / n
        b_mid = sum(1 for t in tau_val if 50 <= t < 70) / n
        b_high = sum(1 for t in tau_val if 70 <= t < 85) / n
        b_ext = sum(1 for t in tau_val if t >= 85) / n

        obs = {
            "turnout_<50%": round(b_low, 4),
            "turnout_50-70%": round(b_mid, 4),
            "turnout_70-85%": round(b_high, 4),
            "turnout_>=85%": round(b_ext, 4),
        }
        exp = {
            "turnout_<50%": 0.20,
            "turnout_50-70%": 0.50,
            "turnout_70-85%": 0.25,
            "turnout_>=85%": 0.05,
        }

        # Check for ballot stuffing footprint: high turnout AND high vote share
        # i.e., tau >= 85% and nu >= 80%
        extreme_count = 0
        flagged_indices = []
        record_scores = []
        for idx, t, v in zip(valid_indices, tau_val, nu_val):
            # Bivariate distance from joint median
            t_dev = (t - np.median(tau_val)) / (stats.median_abs_deviation(tau_val) + 1e-6)
            v_dev = (v - np.median(nu_val)) / (stats.median_abs_deviation(nu_val) + 1e-6)
            dist = math.sqrt(t_dev**2 + v_dev**2)
            record_scores.append(float(dist))

            if t >= 85.0 and v >= 80.0:
                extreme_count += 1
                flagged_indices.append(int(idx))

        extreme_prop = extreme_count / n

        if extreme_prop > 0.05 or (corr > 0.65 and p_corr < 0.01):
            conformity = "ANOMALOUS_CORRELATION"
        elif corr > 0.40 and p_corr < 0.05:
            conformity = "MODERATE_CORRELATION"
        else:
            conformity = "TYPICAL_ELECTION_PATTERN"

        note = (
            f"Correlation r({turnout_col}, {votes_col}) = {corr:.3f} (p = {p_corr:.4e}). "
            f"Extreme high-turnout/high-vote clusters: {extreme_count} records ({extreme_prop * 100:.1f}%). "
            f"Status: {conformity}. Statistical indicator only; requires human verification."
        )

        return ForensicResult(
            test_name=self.name,
            display_name=self.display_name,
            statistic=corr,
            p_value=float(p_corr),
            effect_size=corr,
            conformity_level=conformity,
            observed_frequencies=obs,
            expected_frequencies=exp,
            digit_labels=list(obs.keys()),
            note=note,
            flagged_count=len(flagged_indices),
            flagged_indices=flagged_indices,
            record_scores=record_scores,
            metadata={
                "correlation": round(corr, 4),
                "turnout_col": turnout_col,
                "votes_col": votes_col,
                "extreme_clusters": extreme_count,
            },
        )
