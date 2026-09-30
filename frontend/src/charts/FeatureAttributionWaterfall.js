import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, HelpCircle, Layers } from 'lucide-react';

const FeatureAttributionWaterfall = ({ topFeatures = [], title = 'Feature Attribution (SHAP & DIFFI)' }) => {
  if (!topFeatures || topFeatures.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No feature attribution breakdown available for this record.
      </div>
    );
  }

  const chartData = topFeatures.map((f) => {
    const shapVal = f.shapValue !== undefined ? f.shapValue : (f.shap_value || 0);
    const diffiVal = f.diffiScore !== undefined ? f.diffiScore : (f.diffi_score || 0);
    const actVal = f.actualValue !== undefined ? f.actualValue : (f.actual_value || 0);
    const expVal = f.expectedValue !== undefined ? f.expectedValue : (f.expected_value || 0);
    const delta = actVal - expVal;

    return {
      feature: f.feature,
      shap: parseFloat(shapVal.toFixed(4)),
      diffi: parseFloat((diffiVal * 100).toFixed(1)),
      actual: actVal,
      expected: expVal,
      delta: parseFloat(delta.toFixed(2)),
      direction: f.direction || (actVal > expVal ? 'ANOMALOUS_ELEVATION' : 'UNUSUAL_DEFICIT'),
      pct: f.contributionPct !== undefined ? f.contributionPct : (f.contribution_pct || 0),
    };
  });

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Marginal Shapley attribution ($\phi_i$) and depth-based isolation weights relative to peer group median
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold">
            &bull; Positive: Anomaly Driver
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold">
            &bull; Negative: Normalizing
          </span>
        </div>
      </div>

      <div className="h-64 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis
              type="category"
              dataKey="feature"
              tick={{ fontSize: 11, fontWeight: 500 }}
              stroke="#94a3b8"
              width={100}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">{item.feature}</div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Actual Value:</span>
                        <span className="font-mono text-indigo-400 font-bold">{item.actual}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Peer Baseline:</span>
                        <span className="font-mono text-slate-300">{item.expected}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Attribution Weight:</span>
                        <span className="font-mono font-bold text-amber-400">{item.pct}%</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">DIFFI Importance:</span>
                        <span className="font-mono text-emerald-400">{item.diffi}%</span>
                      </div>
                      <div className="flex justify-between space-x-4 border-t border-slate-800 pt-1 text-[10px]">
                        <span className="text-slate-400">Direction:</span>
                        <span className="font-semibold text-rose-400">{item.direction.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Bar dataKey="shap" name="SHAP Attribution" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.shap >= 0 ? '#f43f5e' : '#10b981'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Feature comparison cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {chartData.map((item, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {item.feature}
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                {item.pct}% impact
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
              <div>
                <span className="text-slate-400 block text-[10px]">Actual</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {item.actual}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Peer Median</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {item.expected}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center space-x-1 pt-0.5">
              {item.delta > 0 ? (
                <TrendingUp className="w-3 h-3 text-rose-500 inline mr-0.5" />
              ) : (
                <TrendingDown className="w-3 h-3 text-blue-500 inline mr-0.5" />
              )}
              <span>
                {item.delta > 0 ? `+${item.delta}` : item.delta} from baseline
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeatureAttributionWaterfall;
