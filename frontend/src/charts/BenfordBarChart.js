import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ShieldAlert, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const getConformityBadge = (level) => {
  switch (level) {
    case 'CLOSE_CONFORMITY':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
        icon: CheckCircle,
        label: 'Close Conformity',
      };
    case 'ACCEPTABLE':
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
        icon: CheckCircle,
        label: 'Acceptable Conformity',
      };
    case 'SUSPICIOUS_DEVIATION':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
        icon: AlertTriangle,
        label: 'Suspicious Deviation',
      };
    case 'NON_CONFORMING':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
        icon: ShieldAlert,
        label: 'Statistically Non-Conforming',
      };
    default:
      return {
        bg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
        icon: AlertCircle,
        label: level || 'Inconclusive',
      };
  }
};

const BenfordBarChart = ({ testResult, title = "Benford's Law Digit Analysis" }) => {
  if (!testResult || !testResult.observed_frequencies) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No Benford digit distribution data available.
      </div>
    );
  }

  const {
    display_name,
    statistic,
    p_value,
    effect_size,
    conformity_level,
    observed_frequencies,
    expected_frequencies,
    digit_labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    note,
    metadata = {},
  } = testResult;

  const chartData = digit_labels.map((digit) => {
    const obs = (observed_frequencies[digit] || 0) * 100;
    const exp = (expected_frequencies[digit] || 0) * 100;
    const dev = obs - exp;
    return {
      digit,
      observed: parseFloat(obs.toFixed(2)),
      expected: parseFloat(exp.toFixed(2)),
      deviation: parseFloat(dev.toFixed(2)),
    };
  });

  const badge = getConformityBadge(conformity_level);
  const BadgeIcon = badge.icon;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>{display_name || title}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Logarithmic digit frequency comparison against theoretical distribution $P(d) = \log_{10}(1 + 1/d)$
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${badge.bg}`}
          >
            <BadgeIcon className="w-3.5 h-3.5 mr-1.5" />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Nigrini MAD</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {metadata.nigrini_mad !== undefined ? metadata.nigrini_mad.toFixed(4) : (effect_size || 0).toFixed(4)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {metadata.nigrini_mad < 0.006 ? 'Close conform.' : metadata.nigrini_mad > 0.015 ? 'Non-conforming' : 'Acceptable'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Chi-Square (&chi;&sup2;)</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {(statistic || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            df = {digit_labels.length - 1}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">p-value</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${p_value !== null && p_value < 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {p_value !== null ? (p_value < 0.0001 ? '< 0.0001' : p_value.toFixed(4)) : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {p_value !== null && p_value < 0.05 ? 'Significant deviation' : 'Null not rejected'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Cohen's w Effect</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {(effect_size || 0).toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {effect_size < 0.1 ? 'Negligible' : effect_size < 0.3 ? 'Small effect' : 'Medium/Large'}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="digit" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">Leading Digit: {item.digit}</div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Observed:</span>
                        <span className="font-mono text-indigo-400 font-bold">{item.observed}%</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Benford Expected:</span>
                        <span className="font-mono text-emerald-400 font-bold">{item.expected}%</span>
                      </div>
                      <div className="flex justify-between space-x-4 border-t border-slate-800 pt-1">
                        <span className="text-slate-400">Delta (&Delta;):</span>
                        <span className={`font-mono font-bold ${Math.abs(item.deviation) > 3 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {item.deviation > 0 ? `+${item.deviation}%` : `${item.deviation}%`}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="observed"
              name="Observed Frequency"
              fill="#6366f1"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
            <Line
              type="monotone"
              dataKey="expected"
              name="Expected (Benford's Law)"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#10b981' }}
            />
          </ComposedChart>
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

export default BenfordBarChart;
