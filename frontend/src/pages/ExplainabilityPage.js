import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Layers,
  Activity,
  GitCompare,
  Target,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  FileText,
  ShieldCheck,
  Search,
} from 'lucide-react';
import datasetService from '../services/datasetService';
import anomalyService from '../services/anomalyService';
import explainabilityService from '../services/explainabilityService';
import FeatureAttributionWaterfall from '../charts/FeatureAttributionWaterfall';
import FaithfulnessCurveChart from '../charts/FaithfulnessCurveChart';
import StabilityHeatmapChart from '../charts/StabilityHeatmapChart';
import CounterfactualCard from '../components/CounterfactualCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';

const ExplainabilityPage = () => {
  const toast = useToast();

  // Datasets state
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // Dataset-wide metrics state (ExplanationMetric model)
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Anomalies list for selected dataset
  const [anomalies, setAnomalies] = useState([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState('');

  // Selected anomaly explanation state
  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState(null);

  // Batch action state
  const [batchRunning, setBatchRunning] = useState(false);

  // 1. Fetch available datasets
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
      toast.error('Failed to load datasets');
    } finally {
      setLoadingDatasets(false);
    }
  };

  // 2. When selected dataset changes, load anomalies & aggregate metrics
  useEffect(() => {
    if (selectedDatasetId) {
      loadDatasetData(selectedDatasetId);
    }
  }, [selectedDatasetId]);

  const loadDatasetData = useCallback(async (datasetId) => {
    loadMetrics(datasetId);
    loadAnomalies(datasetId);
  }, []);

  const loadMetrics = async (datasetId) => {
    setLoadingMetrics(true);
    try {
      const res = await explainabilityService.getMetrics(datasetId);
      if (res.success) {
        setMetrics(res.data);
      } else {
        setMetrics(null);
      }
    } catch (err) {
      console.error('Failed to fetch dataset metrics:', err);
      setMetrics(null);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const loadAnomalies = async (datasetId) => {
    setLoadingAnomalies(true);
    try {
      const res = await anomalyService.getAnomalies({
        datasetId,
        limit: 25,
        sort: '-atpi', // Sort by ATPI priority
      });
      if (res.success && res.data && res.data.anomalies) {
        setAnomalies(res.data.anomalies);
        if (res.data.anomalies.length > 0) {
          setSelectedAnomalyId(res.data.anomalies[0]._id);
        } else {
          setSelectedAnomalyId('');
          setExplanation(null);
        }
      } else {
        setAnomalies([]);
        setSelectedAnomalyId('');
        setExplanation(null);
      }
    } catch (err) {
      console.error('Failed to load anomalies:', err);
      toast.error('Failed to load dataset anomalies');
      setAnomalies([]);
    } finally {
      setLoadingAnomalies(false);
    }
  };

  // 3. When selected anomaly changes, load its explanation
  useEffect(() => {
    if (selectedAnomalyId) {
      loadExplanation(selectedAnomalyId);
    } else {
      setExplanation(null);
    }
  }, [selectedAnomalyId]);

  const loadExplanation = async (anomalyId) => {
    setLoadingExplanation(true);
    setExplanationError(null);
    try {
      const res = await explainabilityService.getExplanation(anomalyId);
      if (res.success && res.data) {
        setExplanation(res.data);
      } else {
        setExplanationError(res.message || 'Unable to retrieve explanation');
        setExplanation(null);
      }
    } catch (err) {
      setExplanationError(err.response?.data?.message || err.message || 'Failed to compute explanation');
      setExplanation(null);
    } finally {
      setLoadingExplanation(false);
    }
  };

  // 4. Batch explain trigger
  const handleBatchExplain = async () => {
    if (!selectedDatasetId) return;
    setBatchRunning(true);
    try {
      const res = await explainabilityService.generateBatchExplanations(selectedDatasetId, 10);
      if (res.success) {
        toast.success(
          `Batch explanations completed: ${res.data.successCount} computed, ${res.data.failedCount} skipped.`
        );
        // Reload anomalies and metrics
        loadDatasetData(selectedDatasetId);
        if (selectedAnomalyId) {
          loadExplanation(selectedAnomalyId);
        }
      } else {
        toast.error(res.message || 'Failed to run batch explainability');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Error executing batch explanation');
    } finally {
      setBatchRunning(false);
    }
  };

  const selectedAnomaly = anomalies.find((a) => a._id === selectedAnomalyId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-200">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Contribution C4
            </span>
            <span className="text-xs text-slate-400 font-mono">SHAP • DIFFI • Faithfulness • Counterfactuals</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 flex items-center space-x-2.5">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Explainability & Attribution Lab</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Dual game-theoretic (TreeExplainer SHAP) and isolation path depth (DIFFI) attributions,
            deletion/insertion perturbation faithfulness verification, and minimal plausible counterfactuals.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Dropdown */}
          <div className="min-w-56">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Select Dataset
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              disabled={loadingDatasets || batchRunning}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.dataType || 'REAL'})
                </option>
              ))}
            </select>
          </div>

          {/* Batch Generate Button */}
          <div className="pt-4">
            <button
              onClick={handleBatchExplain}
              disabled={batchRunning || !selectedDatasetId || anomalies.length === 0}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
            >
              {batchRunning ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{batchRunning ? 'Generating...' : 'Batch Explain Top 10'}</span>
            </button>
          </div>

          {/* Refresh Button */}
          <div className="pt-4">
            <button
              onClick={() => selectedDatasetId && loadDatasetData(selectedDatasetId)}
              disabled={loadingAnomalies || loadingMetrics}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Refresh dataset explainability data"
            >
              <RefreshCw
                className={`w-4 h-4 ${loadingAnomalies || loadingMetrics ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Dataset-Wide Benchmark & Faithfulness Summary Cards */}
      {metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Deletion AUC */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">Mean Deletion AUC</div>
            <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {metrics.meanDeletionAuc !== undefined ? metrics.meanDeletionAuc.toFixed(3) : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lower = faster feature drop</div>
          </div>

          {/* Insertion AUC */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">Mean Insertion AUC</div>
            <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-1">
              {metrics.meanInsertionAuc !== undefined ? metrics.meanInsertionAuc.toFixed(3) : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Higher = rapid recovery</div>
          </div>

          {/* Comprehensiveness */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">Comprehensiveness</div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {metrics.meanComprehensiveness !== undefined
                ? metrics.meanComprehensiveness.toFixed(3)
                : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Attribution drop magnitude</div>
          </div>

          {/* Sufficiency */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">Sufficiency</div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {metrics.meanSufficiency !== undefined ? metrics.meanSufficiency.toFixed(3) : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Minimal retaining set gap</div>
          </div>

          {/* Kendall's Tau Concordance */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">SHAP-DIFFI &tau; Concordance</div>
            <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {metrics.meanKendallTau !== undefined ? metrics.meanKendallTau.toFixed(3) : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Rank correlation</div>
          </div>

          {/* Bootstrap Stability */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-400">Jaccard Stability</div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
              {metrics.meanJaccardStability !== undefined
                ? `${(metrics.meanJaccardStability * 100).toFixed(0)}%`
                : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Top-k feature resilience</div>
          </div>
        </div>
      ) : null}

      {/* Main Workspace: Left Anomalies List + Right Explanation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Anomaly Records List (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs flex flex-col max-h-[820px]">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Detected Anomalies</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sorted by Anomaly Triage Priority Index (C7)
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {anomalies.length} Records
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingAnomalies ? (
              <div className="p-4 space-y-2">
                <LoadingSkeleton count={5} height="h-14" />
              </div>
            ) : anomalies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No anomaly records detected for this dataset yet. Run the anomaly detector in the Anomalies tab first.
              </div>
            ) : (
              anomalies.map((a) => {
                const isSelected = a._id === selectedAnomalyId;
                const atpi = a.atpi ?? 0;
                const priority =
                  a.priority ||
                  (atpi >= 75 ? 'CRITICAL' : atpi >= 55 ? 'HIGH' : atpi >= 35 ? 'MEDIUM' : 'LOW');

                return (
                  <button
                    key={a._id}
                    onClick={() => setSelectedAnomalyId(a._id)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                          Record #{a.recordIndex}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                              : priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                          }`}
                        >
                          {priority}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-2">
                        <span>ATPI: <strong className="font-mono text-slate-800 dark:text-slate-200">{atpi.toFixed(1)}</strong></span>
                        {a.peerGroup && <span>• Peer: {a.peerGroup}</span>}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 text-slate-400">
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${isSelected ? 'text-indigo-600 translate-x-0.5' : ''}`}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Record Explanation Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {!selectedAnomalyId ? (
            <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 text-slate-400">
              <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                No Record Selected
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Select an anomaly record from the left panel to inspect its feature attribution and counterfactuals.
              </p>
            </div>
          ) : loadingExplanation ? (
            <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Generating Shapley Attributions & Counterfactuals...
              </h3>
              <p className="text-xs text-slate-500">
                Executing TreeExplainer SHAP, DIFFI depth isolation, and perturbation validation curves.
              </p>
            </div>
          ) : explanationError ? (
            <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-3">
              <div className="flex items-center space-x-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>Failed to compute explanation for Record #{selectedAnomaly?.recordIndex}</span>
              </div>
              <p>{explanationError}</p>
              <button
                onClick={() => loadExplanation(selectedAnomalyId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition"
              >
                Retry Computation
              </button>
            </div>
          ) : explanation ? (
            <div className="space-y-6">
              {/* Record Summary Banner */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      Record #{selectedAnomaly?.recordIndex}
                    </span>
                    <StatusBadge status={selectedAnomaly?.dataset?.dataType || 'REAL'} size="sm" />
                    <span className="text-xs text-slate-400 font-mono">
                      ATPI: {(selectedAnomaly?.atpi || 0).toFixed(1)}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    Statistical Anomaly Explanation & Remediation
                  </h2>
                </div>

                <button
                  onClick={() => loadExplanation(selectedAnomalyId)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recompute</span>
                </button>
              </div>

              {/* Non-Accusatory Plain-Language Summary Box (Hard Rule 2) */}
              {explanation.summary && (
                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
                      Plain-Language Statistical Assessment (Governance Compliant)
                    </h3>
                  </div>
                  <p className="text-xs text-indigo-950 dark:text-indigo-300 leading-relaxed font-sans">
                    {explanation.summary}
                  </p>
                  <div className="pt-1 text-[11px] text-slate-500 flex items-center space-x-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Algorithmic Governance: Discrepancy denotes statistical departure from the empirical peer baseline, not fraud or culpability.
                    </span>
                  </div>
                </div>
              )}

              {/* Feature Attribution Waterfall */}
              <FeatureAttributionWaterfall
                topFeatures={explanation.topFeatures || []}
                title="Top Feature Attributions (SHAP TreeExplainer & DIFFI Depth)"
              />

              {/* Counterfactual Adjustments */}
              <CounterfactualCard counterfactual={explanation.counterfactual} />

              {/* Faithfulness Perturbation Curves */}
              <FaithfulnessCurveChart faithfulness={explanation.faithfulness} />

              {/* Explanation Stability & Concordance */}
              <StabilityHeatmapChart
                stability={explanation.stability}
                topFeatures={explanation.topFeatures || []}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ExplainabilityPage;
