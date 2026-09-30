import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Sliders,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Layers,
  Save,
  Play,
  Info,
  GitCommit,
  Activity,
} from 'lucide-react';
import datasetService from '../services/datasetService';
import modelConfigService from '../services/modelConfigService';
import WeightTrajectoryChart from '../charts/WeightTrajectoryChart';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

const DETECTORS_META = [
  {
    key: 'robust_z',
    name: 'Robust Z-Score (MAD)',
    description: 'Median Absolute Deviation baseline; immune to extreme leverage points.',
    color: 'indigo',
    borderColor: 'border-indigo-500',
    bgBadge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  },
  {
    key: 'isolation_forest',
    name: 'Isolation Forest',
    description: 'Tree isolation path depth for high-dimensional multivariate structures.',
    color: 'purple',
    borderColor: 'border-purple-500',
    bgBadge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  },
  {
    key: 'z_score',
    name: 'Standard Z-Score',
    description: 'Classical parametric Gaussian distance; sensitive to global tail skew.',
    color: 'emerald',
    borderColor: 'border-emerald-500',
    bgBadge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    key: 'temporal',
    name: 'Temporal CUSUM',
    description: 'Cumulative sum and STL drift residuals for seasonal time series.',
    color: 'amber',
    borderColor: 'border-amber-500',
    bgBadge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
];

const ModelsPage = () => {
  const toast = useToast();

  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Slider tuning states
  const [sliderWeights, setSliderWeights] = useState({
    robust_z: 40,
    isolation_forest: 35,
    z_score: 15,
    temporal: 10,
  });
  const [learningRate, setLearningRate] = useState(0.10);
  const [smoothingFactor, setSmoothingFactor] = useState(0.05);
  const [savingWeights, setSavingWeights] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Load datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const res = await datasetService.getDatasets({ limit: 100 });
      if (res.success && res.data && res.data.datasets) {
        setDatasets(res.data.datasets);
        if (res.data.datasets.length > 0 && !selectedDatasetId) {
          setSelectedDatasetId(res.data.datasets[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load datasets:', err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  // Load active weights whenever dataset changes
  useEffect(() => {
    loadWeights(selectedDatasetId);
  }, [selectedDatasetId]);

  const loadWeights = async (datasetId) => {
    setLoadingConfig(true);
    try {
      const res = await modelConfigService.getWeights(datasetId);
      if (res.success && res.data) {
        setConfig(res.data);
        const w = res.data.weights || {};
        setSliderWeights({
          robust_z: Math.round((w.robust_z ?? 0.40) * 100),
          isolation_forest: Math.round((w.isolation_forest ?? 0.35) * 100),
          z_score: Math.round((w.z_score ?? 0.15) * 100),
          temporal: Math.round((w.temporal ?? 0.10) * 100),
        });
        setLearningRate(res.data.learningRate ?? 0.10);
        setSmoothingFactor(res.data.smoothingFactor ?? 0.05);
      }
    } catch (err) {
      console.error('Failed to load weight config:', err);
      toast.error('Failed to load detector weight configuration');
    } finally {
      setLoadingConfig(false);
    }
  };

  // Compute live slider sum
  const currentSliderSum = Object.values(sliderWeights).reduce((a, b) => a + b, 0);

  const handleSliderChange = (key, val) => {
    setSliderWeights((prev) => ({
      ...prev,
      [key]: parseInt(val, 10),
    }));
  };

  const handleAutoNormalize = () => {
    if (currentSliderSum === 0) return;
    const norm = {};
    let running = 0;
    const keys = Object.keys(sliderWeights);

    keys.forEach((k, idx) => {
      if (idx === keys.length - 1) {
        norm[k] = 100 - running;
      } else {
        const share = Math.round((sliderWeights[k] / currentSliderSum) * 100);
        norm[k] = share;
        running += share;
      }
    });

    setSliderWeights(norm);
    toast.success('Weights auto-normalized to sum to exactly 100%');
  };

  const handleSaveWeights = async () => {
    if (currentSliderSum !== 100) {
      toast.error(`Detector weights must sum to exactly 100% (currently ${currentSliderSum}%)`);
      return;
    }

    setSavingWeights(true);
    try {
      const payloadWeights = {
        robust_z: sliderWeights.robust_z / 100.0,
        isolation_forest: sliderWeights.isolation_forest / 100.0,
        z_score: sliderWeights.z_score / 100.0,
        temporal: sliderWeights.temporal / 100.0,
      };

      const res = await modelConfigService.tuneWeights(selectedDatasetId, {
        weights: payloadWeights,
        learningRate,
        smoothingFactor,
      });

      if (res.success) {
        toast.success('Detector weights and online learning parameters saved successfully');
        setConfig(res.data);
      } else {
        toast.error(res.message || 'Failed to save weights');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Error saving weights');
    } finally {
      setSavingWeights(false);
    }
  };

  const handleRecalculateScores = async () => {
    if (!selectedDatasetId) {
      toast.error('Please select a dataset to recalculate anomaly scores');
      return;
    }

    setRecalculating(true);
    try {
      const res = await modelConfigService.recalculateScores(selectedDatasetId);
      if (res.success) {
        toast.success(res.message || 'Anomaly scores recalculated successfully with active weights');
      } else {
        toast.error(res.message || 'Failed to recalculate anomaly scores');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Error recalculating anomaly scores');
    } finally {
      setRecalculating(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset detector weights to default uniform/baseline weights?')) return;
    try {
      const res = await modelConfigService.resetWeights(selectedDatasetId);
      if (res.success) {
        toast.success('Detector weights reset to baseline defaults');
        setConfig(res.data);
        const w = res.data.weights || {};
        setSliderWeights({
          robust_z: Math.round((w.robust_z ?? 0.40) * 100),
          isolation_forest: Math.round((w.isolation_forest ?? 0.35) * 100),
          z_score: Math.round((w.z_score ?? 0.15) * 100),
          temporal: Math.round((w.temporal ?? 0.10) * 100),
        });
      }
    } catch (err) {
      toast.error('Failed to reset weights');
    }
  };

  const activeWeights = config?.weights || {};
  const stats = config?.detectorStats || {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Contribution C6
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Online Exponentiated Gradient • Epsilon-Smoothing • Human-in-the-Loop
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 flex items-center space-x-2.5">
            <Cpu className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Model Configurations & Adaptive Weighting</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Human-in-the-loop adaptive detector weighting dynamically updates model consensus based on analyst feedback.
            Penalizes detectors producing false positives while preserving diversity through regularized &epsilon;-smoothing.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Selector */}
          <div className="min-w-56">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Scope / Dataset
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              disabled={loadingDatasets || recalculating}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="">Global System Default</option>
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.dataType || 'REAL'})
                </option>
              ))}
            </select>
          </div>

          {/* Recalculate Anomaly Scores */}
          <div className="pt-4">
            <button
              onClick={handleRecalculateScores}
              disabled={recalculating || !selectedDatasetId}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
              title="Apply active weights to re-calculate ensemble scores for anomalies"
            >
              {recalculating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{recalculating ? 'Recalculating...' : 'Recalculate Scores'}</span>
            </button>
          </div>

          {/* Reset Defaults */}
          <div className="pt-4">
            <button
              onClick={handleResetDefaults}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Reset detector weights to default baseline"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4 Active Detector Weight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DETECTORS_META.map((meta) => {
          const w = activeWeights[meta.key] !== undefined ? activeWeights[meta.key] : 0.25;
          const detStat = stats[meta.key] || { truePositives: 0, falsePositives: 0, precision: 1.0 };
          const tp = detStat.truePositives || 0;
          const fp = detStat.falsePositives || 0;
          const precision = detStat.precision !== undefined ? detStat.precision : 1.0;

          return (
            <div
              key={meta.key}
              className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${meta.bgBadge}`}>
                    {meta.name}
                  </span>
                  <span className="font-mono text-xl font-extrabold text-slate-900 dark:text-white">
                    {(w * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                  {meta.description}
                </p>
              </div>

              {/* Empirical performance under human feedback */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Review Precision:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {(precision * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Validated (TP): {tp}</span>
                  <span>False Positives (FP): {fp}</span>
                </div>
                {/* Weight bar */}
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full ${
                      meta.color === 'indigo'
                        ? 'bg-indigo-600'
                        : meta.color === 'purple'
                        ? 'bg-purple-600'
                        : meta.color === 'emerald'
                        ? 'bg-emerald-600'
                        : 'bg-amber-600'
                    }`}
                    style={{ width: `${Math.min(100, w * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Configuration Workspace: Sliders + Hyperparameters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Weight Tuning (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Interactive Detector Weight Tuning</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Adjust individual detector influence in the ensemble consensus score S(x)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  currentSliderSum === 100
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300'
                }`}
              >
                Sum: {currentSliderSum}%
              </span>

              {currentSliderSum !== 100 && (
                <button
                  onClick={handleAutoNormalize}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                >
                  Auto-Normalize
                </button>
              )}
            </div>
          </div>

          {/* Sliders List */}
          <div className="space-y-5">
            {DETECTORS_META.map((meta) => {
              const val = sliderWeights[meta.key] || 0;
              return (
                <div key={meta.key} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {meta.name}
                    </span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {val}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="80"
                    value={val}
                    onChange={(e) => handleSliderChange(meta.key, e.target.value)}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700/50">
            <button
              onClick={handleSaveWeights}
              disabled={savingWeights || currentSliderSum !== 100}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingWeights ? 'Saving Weights...' : 'Save & Apply Weights'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Online Learning Hyperparameters (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs p-6 space-y-5">
          <div className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Online Learning Hyperparameters</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Multiplicative Weights (Hedge) update dynamics
            </p>
          </div>

          {/* Learning Rate Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Learning Rate (&eta;)
              </span>
              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                {learningRate.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.50"
              step="0.01"
              value={learningRate}
              onChange={(e) => setLearningRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <p className="text-[11px] text-slate-400">
              Controls weight update velocity upon each human review verdict.
            </p>
          </div>

          {/* Smoothing Floor Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Smoothing Regularization (&epsilon;)
              </span>
              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                {(smoothingFactor * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.20"
              step="0.01"
              value={smoothingFactor}
              onChange={(e) => setSmoothingFactor(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <p className="text-[11px] text-slate-400">
              Guarantees minimal representation floor to preserve ensemble diversity.
            </p>
          </div>

          {/* Cumulative feedback badge */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-750 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Total Feedback Events
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-base">
                {config?.totalFeedbackCount || 0} reviews
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Model Version
              </span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-base">
                v{config?.version || 1}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Weight Evolution Trajectory Chart */}
      <WeightTrajectoryChart history={config?.history || []} />

      {/* Weight History Audit Trail */}
      {config?.history && config.history.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <GitCommit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Weight Update Audit Trail</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {config.history.length} Iterations Recorded
            </span>
          </div>

          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Iteration</th>
                  <th className="py-2.5 px-3">Update Reason</th>
                  <th className="py-2.5 px-3">Robust Z</th>
                  <th className="py-2.5 px-3">Isolation Forest</th>
                  <th className="py-2.5 px-3">Standard Z</th>
                  <th className="py-2.5 px-3">Temporal</th>
                  <th className="py-2.5 px-3">Drift (L1)</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 font-mono">
                {config.history
                  .slice()
                  .reverse()
                  .map((item, idx) => {
                    const w =
                      item.weights instanceof Map
                        ? Object.fromEntries(item.weights)
                        : item.weights || {};
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-750/30">
                        <td className="py-2 px-4 font-bold text-slate-900 dark:text-white">
                          #{item.iteration}
                        </td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-600 dark:text-slate-300">
                          {item.reason}
                        </td>
                        <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">
                          {w.robust_z !== undefined ? `${(w.robust_z * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-3 text-purple-600 dark:text-purple-400">
                          {w.isolation_forest !== undefined
                            ? `${(w.isolation_forest * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400">
                          {w.z_score !== undefined ? `${(w.z_score * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-3 text-amber-600 dark:text-amber-400">
                          {w.temporal !== undefined ? `${(w.temporal * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {item.weightDriftL1 !== undefined
                            ? item.weightDriftL1.toFixed(3)
                            : '0.000'}
                        </td>
                        <td className="py-2 px-4 text-right font-sans text-slate-400 text-[11px]">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelsPage;
