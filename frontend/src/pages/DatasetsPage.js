import React from 'react';
import { Database, UploadCloud } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const DatasetsPage = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Dataset Ingestion & Quality Profiling
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload public datasets (Census, MGNREGA, Election) for deterministic profiling and validation.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status="PHASE 2" label="Phase 2 Module" size="sm" />
        </div>
      </div>

      <EmptyState
        icon={Database}
        title="No Datasets Uploaded"
        description="Dataset upload with chunked profiling, SHA-256 data hashing, and quality reporting will be enabled in Phase 2."
        actionLabel="Upload Dataset (Phase 2)"
        onAction={() => alert('Dataset upload and quality profiling will be implemented in Phase 2.')}
      />
    </div>
  );
};

export default DatasetsPage;
