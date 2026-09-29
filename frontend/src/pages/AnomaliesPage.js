import React from 'react';
import { AlertCircle } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const AnomaliesPage = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Detected Statistical Anomalies
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Server-side paginated anomalies with conformal p-values, ACAT combination, and ATPI triage ranking.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status="PHASE 4" label="Phase 4 & 6 Module" size="sm" />
        </div>
      </div>

      <EmptyState
        icon={AlertCircle}
        title="No Anomalies Flagged Yet"
        description="Run detection jobs on uploaded datasets to identify statistically unusual records with calibrated FDR control."
      />
    </div>
  );
};

export default AnomaliesPage;
