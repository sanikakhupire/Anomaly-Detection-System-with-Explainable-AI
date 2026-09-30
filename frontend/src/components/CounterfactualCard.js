import React from 'react';
import { Target, ArrowRight, TrendingDown, TrendingUp, CheckCircle, Sparkles } from 'lucide-react';

const CounterfactualCard = ({ counterfactual }) => {
  if (!counterfactual || (!counterfactual.adjustments && !counterfactual.adjustedFeaturesCount)) {
    return (
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No counterfactual adjustments calculated for this record.
      </div>
    );
  }

  const adjustments = counterfactual.adjustments || [];
  const origScore = counterfactual.originalScore !== undefined ? counterfactual.originalScore : 0;
  const cfScore = counterfactual.counterfactualScore !== undefined ? counterfactual.counterfactualScore : 0;
  const reduction = counterfactual.scoreReduction !== undefined ? counterfactual.scoreReduction : 0;
  const isNormal = counterfactual.isCounterfactualNormal ?? (cfScore < 0.5);

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Minimal Plausible Counterfactual Adjustment (C4)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Smallest realistic change to shift record into local peer interquartile range [Q25, Q75]
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isNormal && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Attains Normal Baseline</span>
            </span>
          )}
        </div>
      </div>

      {/* Summary Score Transformation */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-750 flex items-center justify-between">
        <div className="flex items-center space-x-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Current Score</span>
            <span className="font-mono text-base font-bold text-rose-600 dark:text-rose-400">
              {origScore.toFixed(3)}
            </span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-400" />

          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Counterfactual</span>
            <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
              {cfScore.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Anomaly Reduction</span>
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
            -{(reduction * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Plain Language Summary */}
      {counterfactual.summary && (
        <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-300">
          <span className="font-semibold block mb-0.5 text-indigo-950 dark:text-indigo-200 flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Remediation Rationale:</span>
          </span>
          <p className="leading-relaxed">{counterfactual.summary}</p>
        </div>
      )}

      {/* Adjustments Table */}
      {adjustments.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Required Feature Adjustments ({adjustments.length})
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Feature</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Current Value</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Target Range / Value</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Direction</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Peer Baseline Median</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 font-mono">
                {adjustments.map((adj, idx) => {
                  const curr = adj.currentValue !== undefined ? adj.currentValue : (adj.current_value || 0);
                  const tgt = adj.targetValue !== undefined ? adj.targetValue : (adj.target_value || 0);
                  const med = adj.peerMedian !== undefined ? adj.peerMedian : (adj.peer_median || 0);
                  const q25 = adj.peerQ25 !== undefined ? adj.peerQ25 : (adj.peer_q25 || 0);
                  const q75 = adj.peerQ75 !== undefined ? adj.peerQ75 : (adj.peer_q75 || 0);
                  const dir = adj.direction || (curr > tgt ? 'DECREASE' : 'INCREASE');

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="py-2 px-3 font-sans font-medium text-slate-900 dark:text-white">
                        {adj.feature}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400 font-bold">
                        {curr.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                        {tgt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="text-[10px] text-slate-400 block font-normal font-sans">
                          [{q25.toFixed(1)}, {q75.toFixed(1)}]
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-sans font-semibold ${
                            dir === 'DECREASE'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {dir === 'DECREASE' ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : (
                            <TrendingUp className="w-3 h-3" />
                          )}
                          <span>{dir}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 dark:text-slate-400">
                        {med.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CounterfactualCard;
