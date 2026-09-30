import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { GitCompare, ShieldCheck, AlertCircle, ArrowRightLeft } from 'lucide-react';

/**
 * StabilityHeatmapChart
 * Visualizes explanation stability and ranking concordance between SHAP and DIFFI
 * metrics: kendall_tau, kendall_p_value, jaccard_stability, top_features_concordance
 * features: array of { feature, shapRank, diffiRank, shapScore, diffiScore }
 */
const StabilityHeatmapChart = ({ stability, topFeatures = [] }) => {
  if (!stability && (!topFeatures || topFeatures.length === 0)) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No explanation stability data available.
      </div>
    );
  }

  const tau = stability?.kendallTau !== undefined
    ? stability.kendallTau
    : (stability?.kendall_tau ?? 0);
  const jaccard = stability?.jaccardStability !== undefined
    ? stability.jaccardStability
    : (stability?.jaccard_stability ?? 0);
  const concordance = stability?.topFeaturesConcordance !== undefined
    ? stability.topFeaturesConcordance
    : (stability?.top_features_concordance ?? 0);
  const pValue = stability?.kendallPValue !== undefined
    ? stability.kendallPValue
    : (stability?.kendall_p_value ?? 1);

  // Build ranked comparison data from topFeatures if available
  const comparisonData = topFeatures.slice(0, 7).map((f, idx) => {
    const shapVal = Math.abs(f.shapValue !== undefined ? f.shapValue : (f.shap_value || 0));
    const diffiVal = f.diffiScore !== undefined ? f.diffiScore : (f.diffi_score || 0);

    return {
      feature: f.feature,
      shapScore: parseFloat(shapVal.toFixed(3)),
      diffiScore: parseFloat((diffiVal * 10).toFixed(3)), // scaled for comparable visualization
      shapRank: idx + 1,
      impactPct: f.contributionPct || f.contribution_pct || 0,
    };
  });

  const getTauInterpretation = (val) => {
    if (val >= 0.7) return { label: 'High Concordance', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' };
    if (val >= 0.4) return { label: 'Moderate Concordance', color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800' };
    if (val >= 0.1) return { label: 'Low Concordance', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' };
    return { label: 'Divergent Rankings', color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800' };
  };

  const tauStatus = getTauInterpretation(tau);

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <GitCompare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Explanation Stability & Concordance (C4)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Agreement between Shapley game-theoretic and Tree isolation depth attributions
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${tauStatus.color}`}>
            {tauStatus.label} (&tau; = {tau.toFixed(2)})
          </span>
        </div>
      </div>

      {/* Metric KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-750">
          <div className="text-[11px] font-medium text-slate-500">Kendall's &tau; Correlation</div>
          <div className="text-lg font-mono font-bold text-slate-900 dark:text-white mt-1">
            {tau.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            p-val: {pValue < 0.001 ? '<0.001' : pValue.toFixed(3)} (rank concordance)
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-750">
          <div className="text-[11px] font-medium text-slate-500">Bootstrap Jaccard Stability</div>
          <div className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {(jaccard * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Top-k stability under peer perturbation
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-750">
          <div className="text-[11px] font-medium text-slate-500">Top-k Set Concordance</div>
          <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {(concordance * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            SHAP vs DIFFI top feature overlap
          </div>
        </div>
      </div>

      {/* Side-by-side SHAP vs DIFFI comparison bar chart */}
      {comparisonData.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            <span>Top Feature Relative Importance (SHAP |val| vs DIFFI Depth &times;10)</span>
            <span className="text-[11px] text-slate-400 flex items-center space-x-1">
              <ArrowRightLeft className="w-3 h-3 text-indigo-500" />
              <span>Multi-method verification</span>
            </span>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonData}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="feature"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700">
                          <p className="font-bold border-b border-slate-700 pb-1 text-indigo-300">
                            {data.feature}
                          </p>
                          <div className="flex justify-between space-x-4">
                            <span className="text-slate-400">SHAP |Value|:</span>
                            <span className="font-mono font-bold text-indigo-400">{data.shapScore}</span>
                          </div>
                          <div className="flex justify-between space-x-4">
                            <span className="text-slate-400">DIFFI Score:</span>
                            <span className="font-mono font-bold text-amber-400">{(data.diffiScore / 10).toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between space-x-4">
                            <span className="text-slate-400">Attribution %:</span>
                            <span className="font-mono text-emerald-400">{data.impactPct.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  formatter={(val) => (val === 'shapScore' ? 'SHAP Absolute Score' : 'DIFFI Depth Score (Scaled)')}
                />
                <Bar dataKey="shapScore" fill="#6366f1" radius={[4, 4, 0, 0]} name="shapScore" />
                <Bar dataKey="diffiScore" fill="#f59e0b" radius={[4, 4, 0, 0]} name="diffiScore" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default StabilityHeatmapChart;
