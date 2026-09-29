import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  AlertTriangle,
  Play,
  Database,
  Filter,
  RefreshCw,
  Search,
  Eye,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Activity,
  Layers,
  Sparkles,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { anomalyService } from '../services/anomalyService';
import { datasetService } from '../services/datasetService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonTable, SkeletonCard } from '../components/LoadingSkeleton';
import RunDetectionModal from '../components/RunDetectionModal';
import AnomalyDetailDrawer from '../components/AnomalyDetailDrawer';

const AnomaliesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetIdFromUrl = searchParams.get('datasetId');

  const { isAnalyst } = useAuth();
  const toast = useToast();

  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdFromUrl || '');
  const [selectedDataset, setSelectedDataset] = useState(null);

  // Filter states
  const [detectorFilter, setDetectorFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [onlyAnomalies, setOnlyAnomalies] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Data states
  const [anomalies, setAnomalies] = useState([]);
  const [summary, setSummary] = useState({ totalScanned: 0, anomalyCount: 0, avgScore: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modals & Drawers
  const [showRunModal, setShowRunModal] = useState(false);
  const [inspectedAnomaly, setInspectedAnomaly] = useState(null);

  // 1. Fetch available datasets
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const res = await datasetService.getDatasets({ limit: 50 });
        if (res.success && res.data?.datasets) {
          setDatasets(res.data.datasets);
          if (!selectedDatasetId && res.data.datasets.length > 0) {
            setSelectedDatasetId(res.data.datasets[0]._id);
          }
        }
      } catch (err) {
        console.error('Failed to load datasets:', err);
      }
    };
    fetchDatasets();
  }, [selectedDatasetId]);

  // Keep track of current selected dataset object
  useEffect(() => {
    if (selectedDatasetId && datasets.length > 0) {
      const ds = datasets.find((d) => d._id === selectedDatasetId);
      setSelectedDataset(ds || null);
    }
  }, [selectedDatasetId, datasets]);

  // 2. Fetch anomalies with server-side query
  const fetchAnomalies = useCallback(async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        datasetId: selectedDatasetId,
        page,
        limit,
        onlyAnomalies: onlyAnomalies ? 'true' : 'false',
        sortBy: 'ensembleScore',
        sortOrder: 'desc',
      };

      if (detectorFilter) params.detector = detectorFilter;
      if (flagFilter) params.flag = flagFilter;
      if (statusFilter) params.status = statusFilter;
      if (reviewStatusFilter) params.reviewStatus = reviewStatusFilter;
      if (minScore > 0) params.minScore = minScore;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await anomalyService.getAnomalies(params);
      if (res.success && res.data) {
        setAnomalies(res.data.anomalies || []);
        setPagination(res.data.pagination || { total: 0, totalPages: 1 });
        setSummary(res.data.summary || { totalScanned: 0, anomalyCount: 0, avgScore: 0 });
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve detected anomalies');
    } finally {
      setLoading(false);
    }
  }, [
    selectedDatasetId,
    page,
    limit,
    onlyAnomalies,
    detectorFilter,
    flagFilter,
    statusFilter,
    reviewStatusFilter,
    minScore,
    searchQuery,
  ]);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  const handleDatasetChange = (id) => {
    setSelectedDatasetId(id);
    setPage(1);
    setSearchParams({ datasetId: id });
  };

  const handleResetFilters = () => {
    setDetectorFilter('');
    setFlagFilter('');
    setStatusFilter('');
    setReviewStatusFilter('');
    setMinScore(0);
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Detected Statistical Anomalies
            </h1>
            <StatusBadge status="PHASE 4" label="Consensus Detectors" size="sm" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Server-side paginated statistical outliers across Z-Score, Robust Z with Peer Shrinkage (C2),
            Isolation Forest, and Temporal STL/CUSUM.
          </p>
        </div>

        {/* Dataset Switcher & Run Trigger */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <select
              value={selectedDatasetId}
              onChange={(e) => handleDatasetChange(e.target.value)}
              className="px-3.5 py-2 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.category})
                </option>
              ))}
            </select>
          </div>

          {isAnalyst && (
            <button
              onClick={() => setShowRunModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-2xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Detection</span>
            </button>
          )}

          <button
            onClick={fetchAnomalies}
            title="Refresh anomalies"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Scanned Records */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Scanned Records
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {summary.totalScanned ? summary.totalScanned.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Underlying dataset rows</div>
        </div>

        {/* Flagged Anomalies */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Flagged Anomalies
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {summary.anomalyCount !== undefined ? summary.anomalyCount.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Potential statistical outliers</div>
        </div>

        {/* Anomaly Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Anomaly Rate
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {summary.totalScanned > 0
              ? `${((summary.anomalyCount / summary.totalScanned) * 100).toFixed(2)}%`
              : '0.00%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Proportion of flagged records</div>
        </div>

        {/* Average Consensus Score */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Avg Consensus Score
          </div>
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1">
            {summary.avgScore !== undefined ? `${(summary.avgScore * 100).toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Normalized ensemble metric</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search record index or peer group..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Detector Filter */}
            <select
              value={detectorFilter}
              onChange={(e) => {
                setDetectorFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
            >
              <option value="">All Detectors</option>
              <option value="robust_z">Robust Z (Peer MAD)</option>
              <option value="isolation_forest">Isolation Forest</option>
              <option value="z_score">Standard Z-Score</option>
              <option value="temporal">Temporal (STL / CUSUM)</option>
            </select>

            {/* Flag Filter */}
            <select
              value={flagFilter}
              onChange={(e) => {
                setFlagFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
            >
              <option value="">All Anomaly Flags</option>
              <option value="PEER_GROUP_DEVIATION">Peer Group Deviation</option>
              <option value="GLOBAL_ROBUST_Z_OUTLIER">Global Robust Z Outlier</option>
              <option value="IFOREST_OUTLIER">Isolation Forest Outlier</option>
              <option value="TEMPORAL_SPIKE">Temporal Spike</option>
              <option value="TEMPORAL_CUSUM_DRIFT">CUSUM Mean Shift</option>
            </select>

            {/* Review Status Filter */}
            <select
              value={reviewStatusFilter}
              onChange={(e) => {
                setReviewStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
            >
              <option value="">All Review Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="VALIDATED">Validated (Confirmed)</option>
              <option value="FALSE_POSITIVE">False Positive</option>
              <option value="INCONCLUSIVE">Inconclusive</option>
            </select>

            {/* Investigation Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
            >
              <option value="">All Workflow Statuses</option>
              <option value="NEW">NEW</option>
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="DISMISSED">DISMISSED</option>
            </select>

            {/* Min Score slider */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
              <span className="text-[11px] text-slate-400">Min Score:</span>
              <input
                type="range"
                min="0"
                max="0.9"
                step="0.1"
                value={minScore}
                onChange={(e) => {
                  setMinScore(parseFloat(e.target.value));
                  setPage(1);
                }}
                className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="font-mono text-[11px] font-bold text-brand-600">
                {(minScore * 100).toFixed(0)}%
              </span>
            </div>

            {/* Only Anomalies Toggle */}
            <label className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAnomalies}
                onChange={(e) => {
                  setOnlyAnomalies(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <span>Only Anomalies</span>
            </label>

            {(detectorFilter || flagFilter || statusFilter || reviewStatusFilter || minScore > 0 || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline px-1 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Anomalies Table View */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <ErrorState
          title="Failed to Load Anomalies"
          message={error}
          onRetry={fetchAnomalies}
        />
      ) : anomalies.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No Anomalies Match Query"
          description={
            summary.totalScanned === 0
              ? 'No anomaly detection run has been executed on this dataset yet. Click "Run Detection" to trigger the detector ensemble.'
              : 'No records match the selected filters. Try broadening your filter parameters.'
          }
          actionLabel={isAnalyst && summary.totalScanned === 0 ? 'Run Anomaly Detection' : undefined}
          onAction={isAnalyst && summary.totalScanned === 0 ? () => setShowRunModal(true) : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Record</th>
                  <th className="py-3 px-4">Peer Group</th>
                  <th className="py-3 px-4">Consensus Score</th>
                  <th className="py-3 px-4">Detector Scores</th>
                  <th className="py-3 px-4">Active Flags</th>
                  <th className="py-3 px-4">Workflow Status</th>
                  <th className="py-3 px-4">Review Verdict</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {anomalies.map((item) => {
                  const score = item.ensembleScore ?? 0;
                  const scores = item.detectorScores || {};
                  const flags = item.flags || [];

                  return (
                    <tr
                      key={item._id}
                      onClick={() => setInspectedAnomaly(item)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                    >
                      {/* Record Index */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        #{item.recordIndex}
                      </td>

                      {/* Peer Group */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {item.peerGroup ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                            {item.peerGroup}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Global</span>
                        )}
                      </td>

                      {/* Consensus Score */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                score >= 0.8
                                  ? 'bg-rose-500'
                                  : score >= 0.5
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, score * 100))}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                            {(score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Detector Scores Chips */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          {scores.robust_z !== undefined && (
                            <span
                              title={`Robust Z: ${scores.robust_z.toFixed(2)}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                item.detectorFlags?.robust_z
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              RZ:{scores.robust_z.toFixed(1)}
                            </span>
                          )}
                          {scores.isolation_forest !== undefined && (
                            <span
                              title={`Isolation Forest: ${scores.isolation_forest.toFixed(2)}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                item.detectorFlags?.isolation_forest
                                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              IF:{scores.isolation_forest.toFixed(1)}
                            </span>
                          )}
                          {scores.z_score !== undefined && (
                            <span
                              title={`Standard Z: ${scores.z_score.toFixed(2)}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                item.detectorFlags?.z_score
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Z:{scores.z_score.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Active Flags */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {flags.slice(0, 2).map((fl, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                            >
                              {fl}
                            </span>
                          ))}
                          {flags.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400">
                              +{flags.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={item.status} size="sm" />
                      </td>

                      {/* Review Verdict */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            item.reviewStatus === 'VALIDATED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
                              : item.reviewStatus === 'FALSE_POSITIVE'
                              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200'
                          }`}
                        >
                          {item.reviewStatus}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedAnomaly(item);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-600" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Bar */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing records {(page - 1) * limit + 1} to{' '}
              {Math.min(page * limit, pagination.total)} of {pagination.total.toLocaleString()} total
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Detection Modal */}
      <RunDetectionModal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        dataset={selectedDataset}
        onDetectionComplete={() => {
          fetchAnomalies();
        }}
      />

      {/* Quick-Look Anomaly Drawer */}
      <AnomalyDetailDrawer
        isOpen={Boolean(inspectedAnomaly)}
        onClose={() => setInspectedAnomaly(null)}
        anomaly={inspectedAnomaly}
        onRecordUpdated={(updatedRecord) => {
          setInspectedAnomaly(updatedRecord);
          // Update in table
          setAnomalies((prev) =>
            prev.map((rec) => (rec._id === updatedRecord._id ? updatedRecord : rec))
          );
        }}
      />
    </div>
  );
};

export default AnomaliesPage;
