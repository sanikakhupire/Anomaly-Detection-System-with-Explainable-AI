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
import { Info } from 'lucide-react';

const PValueHistogram = ({ data, totalRecords, targetFdr = 0.05 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        No p-value calibration histogram available for current dataset.
      </div>
    );
  }

  // Under uniform null hypothesis, each of the 10 bins has ~ totalRecords / 10
  const expectedNullCount = totalRecords ? totalRecords / 10 : 0;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <span>Conformal P-Value Distribution (C1 ACAT Fusion)</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Empirical p-value distribution from split-conformal calibration. Under $H_0$ (normal records),
            frequencies remain flat; a sharp elevation near 0.0 indicates statistically validated anomalies.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800 text-[10px]">
            Target FDR: $\alpha \le {(targetFdr * 100).toFixed(0)}\%$
          </span>
        </div>
      </div>

      <div className="h-48 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="bin" tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="p-2.5 rounded-xl bg-slate-900 text-white text-xs shadow-lg space-y-1">
                      <div className="font-semibold text-slate-300">P-Value Bin: {item.bin}</div>
                      <div className="font-mono text-emerald-400 font-bold">{item.count} records</div>
                      {expectedNullCount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          Expected under null: ~{expectedNullCount.toFixed(1)} records
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            {expectedNullCount > 0 && (
              <ReferenceLine
                y={expectedNullCount}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: 'Null Uniform Reference', fill: '#94a3b8', fontSize: 10, position: 'insideTopRight' }}
              />
            )}
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? '#ef4444' : index === 1 ? '#f59e0b' : '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center space-x-2 text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/60">
        <Info className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>
          Red bar represents the critical rejection region ($p &lt; 0.10$). Records in this bin are passed to the
          Benjamini-Hochberg step-up procedure to calculate individual false discovery q-values.
        </span>
      </div>
    </div>
  );
};

export default PValueHistogram;
