import React from 'react';
import { Cpu } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const ModelsPage = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Model Configurations & Execution History
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage seeded detector hyperparameters (IsolationForest, Robust Z, STL Residuals) and reproducibility hashes.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status="PHASE 4" label="Phase 4 Module" size="sm" />
        </div>
      </div>

      <EmptyState
        icon={Cpu}
        title="No Detector Configurations Active"
        description="Configure modular anomaly detectors, hyperparameter seeds, and execution budgets in Phase 4."
      />
    </div>
  );
};

export default ModelsPage;
