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
import { Activity, ShieldCheck, Info } from 'lucide-react';

const FaithfulnessCurveChart = ({ faithfulness }) => {
  if (!faithfulness || (!faithfulness.deletionCurve && !faithfulness.deletion_curve)) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No perturbation curve data available.
      </div>
    );
  }

  const delCurve = faithfulness.deletionCurve || faithfulness.deletion_curve || [];
  const insCurve = faithfulness.insertionCurve || faithfulness.insertion_curve || [];
  const delAuc = faithfulness.deletionAuc !== undefined ? faithfulness.deletionAuc : (faithfulness.deletion_auc || 0);
  const insAuc = faithfulness.insertionAuc !== undefined ? faithfulness.insertionAuc : (faithfulness.insertion_auc || 0);
  const comp = faithfulness.comprehensiveness !== undefined ? faithfulness.comprehensiveness : 0;
  const suff = faithfulness.sufficiency !== undefined ? faithfulness.sufficiency : 0;

  const maxSteps = Math.max(delCurve.length, insCurve.length);
  const chartData = [];
  for (let i = 0; i < maxSteps; i++) {
    chartData.push({
      step: `Step ${i}`,
      stepNumber: i,
      deletion: delCurve[i] !== undefined ? parseFloat(delCurve[i].toFixed(3)) : null,
      insertion: insCurve[i] !== undefined ? parseFloat(insCurve[i].toFixed(3)) : null,
    });
  }

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Explanation Faithfulness Curves (Deletion & Insertion)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Perturbation validation: rapid deletion drop indicates high attribution faithfulness
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Deletion AUC: {delAuc.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Deletion AUC</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {delAuc.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Lower = more faithful</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Insertion AUC</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {insAuc.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Higher = more sufficient</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Comprehensiveness</div>
          <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {comp.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Score drop on top-k removal</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sufficiency Error</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {suff.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Residual when top-k active</div>
        </div>
      </div>

      <div className="h-56 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="step" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">{pt.step}</div>
                      {pt.deletion !== null && (
                        <div className="flex justify-between space-x-4">
                          <span className="text-rose-400">Deletion Score:</span>
                          <span className="font-mono font-bold">{pt.deletion}</span>
                        </div>
                      )}
                      {pt.insertion !== null && (
                        <div className="flex justify-between space-x-4">
                          <span className="text-emerald-400">Insertion Score:</span>
                          <span className="font-mono font-bold">{pt.insertion}</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Line
              type="monotone"
              dataKey="deletion"
              name="Deletion Curve (Drop)"
              stroke="#f43f5e"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#f43f5e' }}
            />
            <Line
              type="monotone"
              dataKey="insertion"
              name="Insertion Curve (Gain)"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#10b981' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FaithfulnessCurveChart;
