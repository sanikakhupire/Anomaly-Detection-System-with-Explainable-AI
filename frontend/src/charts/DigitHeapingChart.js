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
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

const DigitHeapingChart = ({ testResult }) => {
  if (!testResult || !testResult.observed_frequencies) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No digit heaping analysis data available.
      </div>
    );
  }

  const {
    display_name = 'Digit Heaping & Rounding Index (Whipple / Myers)',
    statistic,
    p_value,
    effect_size,
    conformity_level,
    observed_frequencies,
    digit_labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    note,
    metadata = {},
  } = testResult;

  const whippleIndex = metadata.whipple_index !== undefined ? metadata.whipple_index : (statistic || 100);
  const myersIndex = metadata.myers_blended_index !== undefined ? metadata.myers_blended_index : 0;

  const chartData = digit_labels.map((d) => {
    const obsPct = (observed_frequencies[d] || 0) * 100;
    const isHeapDigit = d === '0' || d === '5';
    return {
      digit: d,
      observed: parseFloat(obsPct.toFixed(2)),
      isHeapDigit,
    };
  });

  const getWhippleInterpretation = (w) => {
    if (w < 105) return { label: 'Highly Accurate (<105)', color: 'text-emerald-600 dark:text-emerald-400' };
    if (w < 110) return { label: 'Fairly Accurate (105-110)', color: 'text-blue-600 dark:text-blue-400' };
    if (w < 125) return { label: 'Approximate Data (110-125)', color: 'text-amber-600 dark:text-amber-400' };
    if (w < 175) return { label: 'Rough Data (125-175)', color: 'text-orange-600 dark:text-orange-400' };
    return { label: 'Severe Heaping (>175)', color: 'text-rose-600 dark:text-rose-400' };
  };

  const whippleInfo = getWhippleInterpretation(whippleIndex);

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {display_name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Detects systematic rounding and terminal preference for 0 and 5 in numerical declarations
          </p>
        </div>

        <div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
              whippleIndex > 125
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : whippleIndex > 110
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {whippleIndex > 110 ? (
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            )}
            Whipple: {whippleIndex.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Whipple's Index</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {whippleIndex.toFixed(2)}
          </div>
          <div className={`text-[10px] font-medium mt-0.5 ${whippleInfo.color}`}>
            {whippleInfo.label}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Myers' Blended Index</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {myersIndex.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {myersIndex < 10 ? 'Negligible preference' : myersIndex > 20 ? 'Substantial heaping' : 'Moderate heaping'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Heaped Share (0 & 5)</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {(((observed_frequencies['0'] || 0) + (observed_frequencies['5'] || 0)) * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Baseline expectation: 20.0%</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Chi-Square p-value</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${p_value !== null && p_value < 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {p_value !== null ? (p_value < 0.0001 ? '< 0.0001' : p_value.toFixed(4)) : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {p_value !== null && p_value < 0.05 ? 'Statistically significant' : 'Consistent with null'}
          </div>
        </div>
      </div>

      <div className="h-60 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="digit" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">Terminal Digit: {item.digit}</div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Observed:</span>
                        <span className={`font-mono font-bold ${item.isHeapDigit ? 'text-amber-400' : 'text-indigo-400'}`}>
                          {item.observed}%
                        </span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Category:</span>
                        <span className="font-semibold text-slate-300">
                          {item.isHeapDigit ? 'Heaping Focal Digit (0/5)' : 'Intermediate Digit'}
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
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: '10% baseline', position: 'top', fill: '#94a3b8', fontSize: 10 }}
            />
            <Bar dataKey="observed" name="Observed %" radius={[4, 4, 0, 0]} barSize={26}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`heap-cell-${index}`}
                  fill={entry.isHeapDigit ? '#f59e0b' : '#6366f1'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {note && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Demographic Note: </span>
          {note}
        </div>
      )}
    </div>
  );
};

export default DigitHeapingChart;
