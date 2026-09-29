import React from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

const TurnoutVoteShareScatter = ({ testResult }) => {
  if (!testResult || !testResult.metadata) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No election turnout vs vote-share forensics data available.
      </div>
    );
  }

  const {
    display_name = 'Bivariate Turnout vs. Winner Vote-Share (Klimek Forensics)',
    statistic,
    p_value,
    conformity_level,
    note,
    metadata = {},
  } = testResult;

  const points = metadata.sample_points || [];
  const correlation = metadata.correlation !== undefined ? metadata.correlation : (statistic || 0);
  const extremeCount = metadata.extreme_records_count || 0;

  // Split into normal and suspicious points for coloring
  const normalPoints = points.filter((p) => !p.is_suspicious);
  const suspiciousPoints = points.filter((p) => p.is_suspicious);

  const isAnomalous = conformity_level === 'NON_CONFORMING' || conformity_level === 'SUSPICIOUS_DEVIATION';

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {display_name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Klimek et al. bivariate diagnostic: tests for uncharacteristic clustering in the upper-right quadrant (&tau; &ge; 85%, &nu; &ge; 80%)
          </p>
        </div>

        <div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
              isAnomalous
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {isAnomalous ? (
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            )}
            {conformity_level.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Pearson Correlation (r)</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {correlation.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {correlation > 0.5 ? 'Strong positive coupling' : correlation < 0.2 ? 'Normal independence' : 'Moderate correlation'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Upper-Right Cluster</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${extremeCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {extremeCount} units
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Turnout &ge; 85% & Vote-Share &ge; 80%
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">p-value</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${p_value !== null && p_value < 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {p_value !== null ? (p_value < 0.0001 ? '< 0.0001' : p_value.toFixed(4)) : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {p_value !== null && p_value < 0.05 ? 'Statistically significant' : 'Null not rejected'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sample Units Plotted</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {points.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Polling units / booths</div>
        </div>
      </div>

      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 15, bottom: 15, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              type="number"
              dataKey="turnout"
              name="Turnout"
              unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              label={{ value: 'Turnout %', position: 'bottom', offset: 0, fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              type="number"
              dataKey="vote_share"
              name="Winner Vote-Share"
              unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              label={{ value: 'Winner Vote-Share %', angle: -90, position: 'left', offset: 15, fontSize: 11, fill: '#94a3b8' }}
            />
            <ZAxis range={[25, 25]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1.5 border border-slate-800">
                      <div className="font-semibold text-slate-200">
                        {pt.label || `Booth / Record #${pt.record_id || pt.index || ''}`}
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Turnout:</span>
                        <span className="font-mono text-indigo-400 font-bold">{pt.turnout}%</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-slate-400">Vote-Share:</span>
                        <span className="font-mono text-indigo-400 font-bold">{pt.vote_share}%</span>
                      </div>
                      {pt.is_suspicious && (
                        <div className="text-rose-400 font-semibold border-t border-slate-800 pt-1">
                          &bull; Upper-right quadrant cluster member
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* Upper Right Suspicious Threshold Zone */}
            <ReferenceArea
              x1={85}
              x2={100}
              y1={80}
              y2={100}
              fill="#f43f5e"
              fillOpacity={0.12}
              stroke="#f43f5e"
              strokeDasharray="3 3"
            />
            <ReferenceLine x={85} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.6} />
            <ReferenceLine y={80} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.6} />

            <Scatter name="Normal Units" data={normalPoints} fill="#6366f1" fillOpacity={0.7} />
            <Scatter name="Cluster Outliers" data={suspiciousPoints} fill="#f43f5e" fillOpacity={0.9} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {note && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Statistical Forensics Note: </span>
          {note}
        </div>
      )}
    </div>
  );
};

export default TurnoutVoteShareScatter;
