import React from 'react';
import { CheckSquare } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const ReviewsPage = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Human Review Queue
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Prioritized review workflow ranked by ATPI with adaptive feedback learning for detector weighting.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status="PHASE 9" label="Phase 9 Module" size="sm" />
        </div>
      </div>

      <EmptyState
        icon={CheckSquare}
        title="Review Queue is Clear"
        description="Records requiring human domain review will appear here, ordered by Anomaly Triage Priority Index (ATPI)."
      />
    </div>
  );
};

export default ReviewsPage;
