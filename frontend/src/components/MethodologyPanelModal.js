import React from 'react';
import { BookOpen, ShieldCheck, CheckCircle2, Layers, Sparkles, Scale, Info } from 'lucide-react';
import Modal from './Modal';

const MethodologyPanelModal = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Calibration & Triage Methodology (Contributions C1, C7)"
      subtitle="Theoretical foundations, mathematical formulations, and reproducibility guarantees"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6 text-xs text-slate-600 dark:text-slate-300">
        {/* Notice on Decision Support */}
        <div className="p-3.5 rounded-xl bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200/70 dark:border-brand-800/60 text-brand-900 dark:text-brand-300 flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Statistical Rigor & Human Oversight:</span> The platform uses
            rigorous conformal p-values and multiple-hypothesis testing corrections (FDR) to avoid
            arbitrary score thresholding. Flagged records indicate statistically unusual patterns requiring
            human analyst review.
          </div>
        </div>

        {/* 1. Conformal Prediction Calibration */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-sm">
            <Scale className="w-4 h-4 text-brand-600" />
            <span>1. Split-Conformal Empirical Calibration</span>
          </div>
          <p className="leading-relaxed">
            Raw anomaly scores from heterogeneous algorithms (Z-score, Isolation Forest, CUSUM) inhabit non-comparable scales.
            We calibrate each detector against an empirical reference set {'{s_1, ..., s_m}'} with contamination trimming (&nu;<sub>trim</sub> = 2%).
            The valid frequentist p-value for candidate record x with score s(x) is:
          </p>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 font-mono text-[11px] text-brand-700 dark:text-brand-300 border border-slate-200 dark:border-slate-800 text-center">
            {'p_k(x) = [ 1 + \u2211_{j=1}^m \u00CD(s_{k,j}^{cal} \u2265 s_k(x)) ] / ( m + 1 )'}
          </div>
          <p className="text-[11px] text-slate-500">
            Property: Under the exchangeable null hypothesis H<sub>0</sub>, p<sub>k</sub>(x) &sim; Uniform(0, 1).
          </p>
        </div>

        {/* 2. ACAT Combination */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-sm">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>2. Aggregated Cauchy Association Test (ACAT Fusion)</span>
          </div>
          <p className="leading-relaxed">
            Classical Fisher or Stouffer combination tests assume statistical independence between detectors.
            In public datasets, anomaly detectors are strongly correlated. ACAT maps p-values into Cauchy random variables:
          </p>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 font-mono text-[11px] text-purple-700 dark:text-purple-300 border border-slate-200 dark:border-slate-800 text-center">
            {'T_ACAT = \u2211_{k=1}^K w_k \u00B7 tan( (0.5 - p_k) \u00B7 \u03C0 ),   p_combined = 0.5 - arctan(T_ACAT) / \u03C0'}
          </div>
          <p className="text-[11px] text-slate-500">
            Advantage: Heavy Cauchy tails guarantee asymptotic exactness under arbitrary detector correlation structures.
          </p>
        </div>

        {/* 3. Benjamini-Hochberg FDR Control */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>3. Multiple Hypothesis Testing & FDR Control (BH / BY)</span>
          </div>
          <p className="leading-relaxed">
            Testing thousands of public records simultaneously introduces severe false-alarm inflation.
            The Benjamini-Hochberg (BH) step-up procedure sorts combined p-values and computes false discovery q-values:
          </p>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-800 text-center">
            {'q_{(i)} = min_{j \u2265 i} [ (N / j) \u00B7 p_{(j)} ] \u2264 \u03B1'}
          </div>
          <p className="text-[11px] text-slate-500">
            Guarantee: The expected proportion of false discoveries is bounded strictly at or below target FDR &alpha; (e.g. 5%).
          </p>
        </div>

        {/* 4. ATPI Priority Index */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-sm">
            <Layers className="w-4 h-4 text-amber-600" />
            <span>4. Anomaly Triage Priority Index (ATPI - Contribution C7)</span>
          </div>
          <p className="leading-relaxed">
            Anomalies are ranked for human review queue dispatching using a transparent multidimensional priority index in [0, 100]:
          </p>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 font-mono text-[10px] text-amber-700 dark:text-amber-300 border border-slate-200 dark:border-slate-800 text-center">
            {'ATPI = 100 \u00B7 [ 0.35(1 - q) + 0.25\u00B7S_eff + 0.15\u00B7\u00CD_peer + 0.15\u00B7S_pop + 0.05\u00B7S_stab + 0.05\u00B7S_evid ]'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-center font-bold">
              CRITICAL: &ge; 75
            </div>
            <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-center font-bold">
              HIGH: 55 – 74
            </div>
            <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-center font-bold">
              MEDIUM: 35 – 54
            </div>
            <div className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-center font-bold">
              LOW: &lt; 35
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Close Methodology Panel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MethodologyPanelModal;
