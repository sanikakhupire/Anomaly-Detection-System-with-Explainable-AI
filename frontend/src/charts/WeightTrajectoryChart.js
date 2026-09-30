import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TrendingUp, GitCommit } from 'lucide-react';

const DETECTOR_COLORS = {
  robust_z: '#6366f1', // Indigo
  isolation_forest: '#a855f7', // Purple
  z_score: '#10b981', // Emerald
  temporal: '#f59e0b', // Amber
};

const DETECTOR_LABELS = {
  robust_z: 'Robust Z (MAD)',
  isolation_forest: 'Isolation Forest',
  z_score: 'Standard Z-score',
  temporal: 'Temporal CUSUM',
};

const WeightTrajectoryChart = ({ history = [] }) => {
  if (!history || history.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No weight evolution history recorded yet. Adaptive weighting begins upon the first human review submission.
      </div>
    );
  }

  // Format data points for Recharts
  const chartData = history.map((entry, idx) => {
    const weights = entry.weights instanceof Map ? Object.fromEntries(entry.weights) : (entry.weights || {});
    return {
      iteration: `t=${entry.iteration !== undefined ? entry.iteration : idx}`,
      step: entry.iteration !== undefined ? entry.iteration : idx,
      reason: entry.reason || 'UPDATE',
      robust_z: weights.robust_z !== undefined ? parseFloat((weights.robust_z * 100).toFixed(1)) : null,
      isolation_forest: weights.isolation_forest !== undefined ? parseFloat((weights.isolation_forest * 100).toFixed(1)) : null,
      z_score: weights.z_score !== undefined ? parseFloat((weights.z_score * 100).toFixed(1)) : null,
      temporal: weights.temporal !== undefined ? parseFloat((weights.temporal * 100).toFixed(1)) : null,
      drift: entry.weightDriftL1 || 0.0,
    };
  });

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Detector Weight Trajectory (Multiplicative Weights Update)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Adaptive weight evolution over human review iterations ({history.length} updates)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1">
            <GitCommit className="w-3.5 h-3.5" />
            <span>Iteration {history[history.length - 1]?.iteration ?? 0}</span>
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="iteration" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis
              domain={[0, 70]}
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              unit="%"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-2 border border-slate-700">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                        <span className="font-bold text-indigo-300">{label}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{data.reason}</span>
                      </div>
                      <div className="space-y-1">
                        {payload.map((p, i) => (
                          <div key={i} className="flex justify-between space-x-4">
                            <span style={{ color: p.color }} className="font-medium">
                              {DETECTOR_LABELS[p.dataKey] || p.dataKey}:
                            </span>
                            <span className="font-mono font-bold">{p.value}%</span>
                          </div>
                        ))}
                      </div>
                      {data.drift > 0 && (
                        <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                          Weight Drift (L1): {data.drift.toFixed(3)}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
              formatter={(val) => DETECTOR_LABELS[val] || val}
            />
            <Line
              type="monotone"
              dataKey="robust_z"
              name="robust_z"
              stroke={DETECTOR_COLORS.robust_z}
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="isolation_forest"
              name="isolation_forest"
              stroke={DETECTOR_COLORS.isolation_forest}
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="z_score"
              name="z_score"
              stroke={DETECTOR_COLORS.z_score}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="temporal"
              name="temporal"
              stroke={DETECTOR_COLORS.temporal}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WeightTrajectoryChart;
