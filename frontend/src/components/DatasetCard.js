import React from 'react';
import { Link } from 'react-router-dom';
import { Database, FileText, Trash2, ArrowUpRight, HardDrive, Hash } from 'lucide-react';
import StatusBadge from './StatusBadge';

const formatBytes = (bytes, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const DatasetCard = ({ dataset, onDelete, canDelete = false }) => {
  const qualityColor =
    dataset.qualityScore >= 80
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
      : dataset.qualityScore >= 60
      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
      : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group">
      <div className="p-5">
        {/* Badges Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {dataset.category}
            </span>
            <StatusBadge status={dataset.dataType} size="sm" />
          </div>
          <StatusBadge status={dataset.status} size="sm" />
        </div>

        {/* Title & Description */}
        <Link
          to={`/datasets/${dataset._id}`}
          className="block group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
        >
          <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1">
            {dataset.name}
          </h3>
        </Link>
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 min-h-[32px]">
          {dataset.description || 'No additional description provided.'}
        </p>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Rows</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {dataset.rowCount?.toLocaleString() || '—'}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Columns</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {dataset.columnCount || '—'}
            </div>
          </div>
          <div className={`p-2 rounded-xl border ${qualityColor}`}>
            <div className="text-[10px] uppercase font-semibold opacity-80">Quality</div>
            <div className="text-sm font-bold">
              {dataset.qualityScore !== null && dataset.qualityScore !== undefined
                ? `${dataset.qualityScore}%`
                : '—'}
            </div>
          </div>
        </div>

        {/* File Metadata */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2">
          <span className="flex items-center space-x-1">
            <HardDrive className="w-3.5 h-3.5" />
            <span>{formatBytes(dataset.fileSize)}</span>
          </span>
          <span className="font-mono text-[10px]" title={dataset.dataHash}>
            Hash: {dataset.dataHash?.substring(0, 8)}...
          </span>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {new Date(dataset.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <div className="flex items-center space-x-2">
          {canDelete && (
            <button
              onClick={() => onDelete(dataset._id, dataset.name)}
              title="Delete dataset"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <Link
            to={`/datasets/${dataset._id}`}
            className="inline-flex items-center space-x-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
          >
            <span>Inspect</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DatasetCard;
