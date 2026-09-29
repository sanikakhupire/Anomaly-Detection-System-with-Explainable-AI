import React from 'react';

export const SkeletonText = ({ className = 'w-full h-4' }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700/60 rounded ${className}`} />
);

export const SkeletonCard = ({ rows = 3 }) => (
  <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm animate-pulse space-y-4">
    <div className="flex items-center justify-between">
      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-16" />
    </div>
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-slate-200 dark:bg-slate-700/50 rounded w-full" />
      ))}
    </div>
    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 pt-2" />
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex space-x-4">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1" />
      ))}
    </div>
    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-4 flex space-x-4 animate-pulse">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className={`h-4 bg-slate-200 dark:bg-slate-700/50 rounded ${
                c === 0 ? 'w-1/4' : 'flex-1'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonStats = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div
        key={i}
        className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm animate-pulse space-y-3"
      >
        <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700/50 rounded w-1/3" />
      </div>
    ))}
  </div>
);

export default SkeletonCard;
