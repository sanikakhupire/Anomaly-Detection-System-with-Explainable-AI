import React, { useState } from 'react';
import {
  Play,
  ShieldAlert,
  Sliders,
  CheckCircle,
  HelpCircle,
  Activity,
  Layers,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import Modal from './Modal';
import { anomalyService } from '../services/anomalyService';
import { useToast } from '../context/ToastContext';

const detectorOptions = [
  {
    id: 'robust_z',
    name: 'Robust Z-Score (C2 Peer Baselines)',
    description: 'Median & MAD deviation scaled with Empirical Bayes shrinkage toward parent hierarchy.',
    icon: Layers,
    defaultChecked: true,
  },
  {
    id: 'isolation_forest',
    name: 'Isolation Forest (Multivariate)',
    description: 'Non-parametric ensemble trees isolating abnormal feature combinations in partition leaves.',
    icon: Sparkles,
    defaultChecked: true,
  },
  {
    id: 'z_score',
    name: 'Standard Z-Score (Global / Peer)',
    description: 'Parametric mean and standard deviation deviation metric for Gaussian distributions.',
    icon: Activity,
    defaultChecked: true,
  },
  {
    id: 'temporal',
    name: 'Temporal Analysis (STL & CUSUM)',
    description: 'Extracts time-series residuals and cumulative sum drift when a timestamp column is present.',
    icon: Clock,
    defaultChecked: true,
  },
];

const RunDetectionModal = ({ isOpen, onClose, dataset, onDetectionComplete }) => {
  const toast = useToast();
  const [selectedDetectors, setSelectedDetectors] = useState(['robust_z', 'isolation_forest', 'z_score', 'temporal']);
  const [contamination, setContamination] = useState(0.05);
  const [randomState, setRandomState] = useState(42);
  const [loading, setLoading] = useState(false);

  const toggleDetector = (id) => {
    setSelectedDetectors((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRunDetection = async () => {
    if (!dataset?._id) return;
    if (selectedDetectors.length === 0) {
      toast.warning('Please select at least one detector to run.');
      return;
    }

    setLoading(true);
    try {
      const res = await anomalyService.detectAnomalies({
        datasetId: dataset._id,
        detectors: selectedDetectors,
        contamination: parseFloat(contamination),
        randomState: parseInt(randomState, 10),
      });

      if (res.success) {
        toast.success(res.message || 'Detection job completed successfully.');
        if (onDetectionComplete) onDetectionComplete(res.data);
        onClose();
      } else {
        toast.error(res.message || 'Anomaly detection failed.');
      }
    } catch (err) {
      toast.error(err.message || 'Error occurred while running anomaly detection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configure & Execute Anomaly Detection"
      subtitle={`Run statistical and machine-learning detectors on ${dataset?.name || 'selected dataset'}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Notice on Reproducibility & Terminology */}
        <div className="p-3.5 rounded-xl bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200/70 dark:border-brand-800/60 text-xs text-brand-900 dark:text-brand-300 flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Decision-Support Governance:</span> Results indicate
            statistically unusual patterns requiring human review—not accusations of fraud.
            All runs are seeded with a deterministic state for IEEE paper reproducibility.
          </div>
        </div>

        {/* Detector Checkbox Grid */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Detector Ensemble Selection
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {detectorOptions.map((opt) => {
              const Icon = opt.icon;
              const isChecked = selectedDetectors.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  onClick={() => toggleDetector(opt.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isChecked
                      ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 text-brand-950 dark:text-brand-100 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 font-semibold text-xs text-slate-900 dark:text-white">
                      <Icon className={`w-4 h-4 ${isChecked ? 'text-brand-600' : 'text-slate-400'}`} />
                      <span>{opt.name}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hyperparameter Controls */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand-600" />
              <span>Reproducibility Hyperparameters</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contamination Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Contamination Ratio ($\nu$)</span>
                <span className="font-mono text-brand-600 font-bold">{contamination}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.20"
                step="0.01"
                value={contamination}
                onChange={(e) => setContamination(e.target.value)}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="text-[10px] text-slate-400">Expected outlier proportion in Isolation Forest</span>
            </div>

            {/* Random State Seed */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Random Seed</span>
                <span className="font-mono text-slate-500">{randomState}</span>
              </div>
              <input
                type="number"
                value={randomState}
                onChange={(e) => setRandomState(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
              <span className="text-[10px] text-slate-400">Guarantees deterministic experiment replication</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRunDetection}
            disabled={loading || selectedDetectors.length === 0}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Analyzing Dataset...' : 'Execute Detectors'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RunDetectionModal;
