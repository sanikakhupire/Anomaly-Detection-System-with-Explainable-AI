import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

const BenchmarkBarChart = ({ baselineSummary = {} }) => {
  if (!baselineSummary || Object.keys(baselineSummary).length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-400">
        No benchmark metrics data available.
      </div>
    );
  }

  const chartData = Object.entries(baselineSummary).map(([modelName, metrics]) => {
    const isProposed = modelName.includes('Proposed') || modelName.includes('Ours');
    // Shorten long model names for axis
    let shortName = modelName;
    if (modelName.includes('Proposed')) shortName = 'Proposed (Ours)';
    else if (modelName.includes('Isolation')) shortName = 'IsoForest';
    else if (modelName.includes('Local Outlier')) shortName = 'LOF';
    else if (modelName.includes('Robust Z')) shortName = 'Robust Z';
    else if (modelName.includes('Mahalanobis')) shortName = 'Mahalanobis';
    else if (modelName.includes('One-Class')) shortName = 'OC-SVM';

    return {
      fullName: modelName,
      name: shortName,
      isProposed,
      prAuc: Number((metrics.pr_auc || 0).toFixed(3)),
      rocAuc: Number((metrics.roc_auc || 0).toFixed(3)),
      p10: Number(((metrics['precision@10'] || 0) * 100).toFixed(1)),
      r10: Number(((metrics['recall@10'] || 0) * 100).toFixed(1)),
      f1: Number((metrics.f1 || 0).toFixed(3)),
    };
  });

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 15, right: 15, left: -10, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#64748b' }}
            interval={0}
            angle={-15}
            textAnchor="end"
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-slate-900 text-white p-3 rounded-lg shadow-lg text-xs space-y-1 border border-slate-700">
                    <p className="font-bold text-slate-200">{data.fullName}</p>
                    <div className="flex justify-between space-x-4">
                      <span className="text-blue-400">PR-AUC:</span>
                      <span className="font-mono font-bold">{data.prAuc}</span>
                    </div>
                    <div className="flex justify-between space-x-4">
                      <span className="text-emerald-400">ROC-AUC:</span>
                      <span className="font-mono font-bold">{data.rocAuc}</span>
                    </div>
                    <div className="flex justify-between space-x-4">
                      <span className="text-purple-400">Precision@10:</span>
                      <span className="font-mono">{data.p10}%</span>
                    </div>
                    <div className="flex justify-between space-x-4">
                      <span className="text-amber-400">F1-Score:</span>
                      <span className="font-mono">{data.f1}</span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
          />
          <Bar dataKey="prAuc" name="PR-AUC (Primary)" fill="#3b82f6" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-pr-${index}`}
                fill={entry.isProposed ? '#2563eb' : '#94a3b8'}
              />
            ))}
          </Bar>
          <Bar dataKey="rocAuc" name="ROC-AUC" fill="#10b981" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-roc-${index}`}
                fill={entry.isProposed ? '#059669' : '#cbd5e1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BenchmarkBarChart;
