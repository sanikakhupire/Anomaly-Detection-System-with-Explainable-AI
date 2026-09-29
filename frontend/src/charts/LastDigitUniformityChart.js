import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const LastDigitUniformityChart = ({ testResult }) => {
  if (!testResult || !testResult.observed_frequencies) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No last-digit uniformity data available.
      </div>
    );
  }

  const {
    display_name = 'Terminal Digit Uniformity Analysis',
    statistic,
    p_value,
    conformity_level,
    observed_frequencies,
    digit_labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    note,
    metadata = {},
  } = testResult;

  const chartData = digit_labels.map((d) => {
    const obsPct = (observed_frequencies[d] || 0) * 100;
    const dev = obsPct - 10.0;
    return {
      digit: d,
      observed: parseFloat(obsPct.toFixed(2)),
      expected: 10.0,
      deviation: parseFloat(dev.toFixed(2)),
    };
  });

  const isSuspicious = conformity_level === 'NON_CONFORMING' || conformity_level === 'SUSPICIOUS_DEVIATION';

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {display_name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tests terminal digit distribution against continuous data expectation: discrete uniform $U(0, 9)$ (10% each)
          </p>
        </div>

        <div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
              isSuspicious
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {isSuspicious ? (
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            )}
            {conformity_level.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Chi-Square (&chi;&sup2;)</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {(statistic || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">df = 9 (crit 95% = 16.92)</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">p-value</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${p_value !== null && p_value < 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {p_value !== null ? (p_value < 0.0001 ? '< 0.0001' : p_value.toFixed(4)) : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {p_value !== null && p_value < 0.05 ? 'Non-uniform terminal digits' : 'Uniformity maintained'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Max Deviation</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {metadata.max_deviation !== undefined ? `${(metadata.max_deviation * 100).toFixed(2)}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">from 10.0% expected</div>
        </div>
      </div>

      <div className="h-60 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="digit" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" domain={[0, 'dataMax + 5']} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">Terminal Digit: {item.digit}</div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Observed:</span>
                        <span className="font-mono text-indigo-400 font-bold">{item.observed}%</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Expected Uniform:</span>
                        <span className="font-mono text-emerald-400 font-bold">10.0%</span>
                      </div>
                      <div className="flex justify-between space-x-4 border-t border-slate-800 pt-1">
                        <span className="text-slate-400">Deviation:</span>
                        <span className={`font-mono font-bold ${Math.abs(item.deviation) > 3 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {item.deviation > 0 ? `+${item.deviation}%` : `${item.deviation}%`}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine
              y={10.0}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{ value: 'Expected (10%)', position: 'top', fill: '#10b981', fontSize: 10 }}
            />
            <Bar dataKey="observed" name="Observed %" radius={[4, 4, 0, 0]} barSize={26}>
              {chartData.map((entry, index) => {
                const absDev = Math.abs(entry.deviation);
                let color = '#6366f1'; // normal indigo
                if (absDev > 6) color = '#f43f5e'; // strong deviation rose
                else if (absDev > 3) color = '#f59e0b'; // amber
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {note && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Note: </span>
          {note}
        </div>
      )}
    </div>
  );
};

export default LastDigitUniformityChart;
