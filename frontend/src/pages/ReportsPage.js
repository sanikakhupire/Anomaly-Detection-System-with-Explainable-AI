import React from 'react';
import { FileText } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const ReportsPage = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Audit Trail & Compliance Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cryptographically hash-chained audit trails (C8) and reproducible IEEE report exports.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status="PHASE 9" label="Phase 9 Module" size="sm" />
        </div>
      </div>

      <EmptyState
        icon={FileText}
        title="No Reports Generated"
        description="Tamper-evident audit verification and PDF/LaTeX reproducibility reports will be available in Phase 9 and Phase 10."
      />
    </div>
  );
};

export default ReportsPage;
