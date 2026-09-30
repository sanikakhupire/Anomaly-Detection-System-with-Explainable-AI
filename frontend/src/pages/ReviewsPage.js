import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Play,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  FileCheck,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Info,
} from 'lucide-react';
import datasetService from '../services/datasetService';
import validationService from '../services/validationService';
import ValidationDrawer from '../components/ValidationDrawer';
import StatusBadge from '../components/StatusBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

const ReviewsPage = () => {
  const toast = useToast();

  // Datasets state
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // Queue state
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 15;

  // Filter states
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedReviewStatus, setSelectedReviewStatus] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState('');

  // Selected anomaly for detail inspection
  const [inspectingAnomaly, setInspectingAnomaly] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Batch action state
  const [batchValidating, setBatchValidating] = useState(false);

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
      toast.error('Failed to load datasets');
    } finally {
      setLoadingDatasets(false);
    }
  };

  // Load queue whenever filters, pagination, or dataset changes
  useEffect(() => {
    loadQueue();
  }, [selectedDatasetId, selectedPriority, selectedReviewStatus, selectedVerdict, currentPage]);

  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const params = {
        page: currentPage,
        limit,
        sortBy: 'atpi',
        sortOrder: 'desc',
      };
      if (selectedDatasetId) params.datasetId = selectedDatasetId;
      if (selectedPriority) params.priority = selectedPriority;
      if (selectedReviewStatus) params.reviewStatus = selectedReviewStatus;
      if (selectedVerdict) params.verdict = selectedVerdict;

      const res = await validationService.getReviewQueue(params);
      if (res.success && res.data) {
        setQueue(res.data.anomalies || []);
        setTotalRecords(res.data.pagination?.total || 0);
        setTotalPages(res.data.pagination?.pages || 1);
      } else {
        setQueue([]);
        setTotalRecords(0);
      }
    } catch (err) {
      console.error('Failed to load review queue:', err);
      toast.error('Error fetching review queue');
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  // Batch validation trigger
  const handleBatchValidate = async () => {
    if (!selectedDatasetId) return;
    setBatchValidating(true);
    try {
      const res = await validationService.batchValidate(selectedDatasetId, 10);
      if (res.success) {
        toast.success(
          `Batch multi-agent validation completed: ${res.data.successCount} validated, ${res.data.failedCount} failed.`
        );
        loadQueue();
      } else {
        toast.error(res.message || 'Batch validation failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Batch validation error');
    } finally {
      setBatchValidating(false);
    }
  };

  const handleOpenDrawer = (anomaly) => {
    setInspectingAnomaly(anomaly);
    setDrawerOpen(true);
  };

  const handleRecordUpdated = (updatedRecord) => {
    setQueue((prev) =>
      prev.map((item) => (item._id === updatedRecord._id ? { ...item, ...updatedRecord } : item))
    );
    if (inspectingAnomaly && inspectingAnomaly._id === updatedRecord._id) {
      setInspectingAnomaly((prev) => ({ ...prev, ...updatedRecord }));
    }
  };

  // Compute metrics from current queue slice
  const criticalCount = queue.filter((a) => (a.atpi || 0) >= 75).length;
  const pendingCount = queue.filter((a) => a.reviewStatus === 'PENDING').length;
  const confirmedCount = queue.filter((a) => a.validationVerdict === 'CONFIRMED_ANOMALY').length;
  const artifactCount = queue.filter((a) => a.validationVerdict === 'DATA_QUALITY_ARTIFACT').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-200">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Contribution C5
            </span>
            <span className="text-xs text-slate-400 font-mono">Grounded Multi-Agent Verification & Claim Verifier</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 flex items-center space-x-2.5">
            <CheckSquare className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Human Review Queue & Validation</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Prioritized human triage workflow ranked by Anomaly Triage Priority Index (C7 ATPI).
            Grounded multi-agent cross-examination verifies statistical power, physical invariants, and digit forensics.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Dropdown */}
          <div className="min-w-56">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Filter by Dataset
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => {
                setSelectedDatasetId(e.target.value);
                setCurrentPage(1);
              }}
              disabled={loadingDatasets || batchValidating}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="">All Datasets</option>
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.dataType || 'REAL'})
                </option>
              ))}
            </select>
          </div>

          {/* Batch Validate Button */}
          <div className="pt-4">
            <button
              onClick={handleBatchValidate}
              disabled={batchValidating || !selectedDatasetId || queue.length === 0}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
            >
              {batchValidating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{batchValidating ? 'Validating...' : 'Validate Top 10'}</span>
            </button>
          </div>

          {/* Refresh Button */}
          <div className="pt-4">
            <button
              onClick={loadQueue}
              disabled={loadingQueue}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Refresh Review Queue"
            >
              <RefreshCw className={`w-4 h-4 ${loadingQueue ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total in Queue */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total In Queue
          </span>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {totalRecords}
          </div>
          <span className="text-[10px] text-slate-400">Prioritized by ATPI</span>
        </div>

        {/* Pending Human Reviews */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Pending Review
          </span>
          <div className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">
            {pendingCount}
          </div>
          <span className="text-[10px] text-slate-400">Awaiting human analyst decision</span>
        </div>

        {/* Multi-Agent Confirmed Anomalies */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Confirmed Anomalies (C5)
          </span>
          <div className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400">
            {confirmedCount}
          </div>
          <span className="text-[10px] text-slate-400">Multi-agent verified departure</span>
        </div>

        {/* Data Quality Artifacts */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Data Quality Artifacts
          </span>
          <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
            {artifactCount}
          </div>
          <span className="text-[10px] text-slate-400">Impossible domain invariant flags</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => {
              setSelectedPriority(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
          >
            <option value="">All Triage Priorities</option>
            <option value="CRITICAL">Critical (ATPI &ge; 75)</option>
            <option value="HIGH">High (ATPI 55-74)</option>
            <option value="MEDIUM">Medium (ATPI 35-54)</option>
            <option value="LOW">Low (ATPI &lt; 35)</option>
          </select>

          {/* Review Status Filter */}
          <select
            value={selectedReviewStatus}
            onChange={(e) => {
              setSelectedReviewStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
          >
            <option value="">All Review Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="VALIDATED">Validated (Confirmed)</option>
            <option value="FALSE_POSITIVE">False Positive</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>

          {/* Multi-Agent Verdict Filter */}
          <select
            value={selectedVerdict}
            onChange={(e) => {
              setSelectedVerdict(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
          >
            <option value="">All Agent Verdicts</option>
            <option value="CONFIRMED_ANOMALY">Confirmed Anomaly</option>
            <option value="DATA_QUALITY_ARTIFACT">Data Quality Artifact</option>
            <option value="BENIGN_EXTREME_VARIATION">Benign Extreme Variation</option>
            <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Showing {queue.length} of {totalRecords} records
        </div>
      </div>

      {/* Main Review Queue Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
        {loadingQueue ? (
          <div className="p-6 space-y-3">
            <LoadingSkeleton count={6} height="h-12" />
          </div>
        ) : queue.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={CheckSquare}
              title="No records matching filter criteria"
              description="All anomalous records in this queue view have been reviewed or no anomalies match the selected filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Record</th>
                  <th className="py-3.5 px-3">ATPI Priority</th>
                  <th className="py-3.5 px-3">FDR Q-Value</th>
                  <th className="py-3.5 px-3">Multi-Agent Verdict (C5)</th>
                  <th className="py-3.5 px-3">Claim Ratio (CVR)</th>
                  <th className="py-3.5 px-3">Review Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                {queue.map((anomaly) => {
                  const atpi = anomaly.atpi ?? 0;
                  const priority =
                    anomaly.priority ||
                    (atpi >= 75 ? 'CRITICAL' : atpi >= 55 ? 'HIGH' : atpi >= 35 ? 'MEDIUM' : 'LOW');
                  const qVal = anomaly.qValue !== undefined && anomaly.qValue !== null ? anomaly.qValue : null;
                  const cvr = anomaly.claimVerificationRatio;
                  const verdict = anomaly.validationVerdict;

                  return (
                    <tr
                      key={anomaly._id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-750/30 transition-colors"
                    >
                      {/* Record info */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          #{anomaly.recordIndex}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {anomaly.dataset?.name || 'Dataset'} {anomaly.peerGroup ? `• ${anomaly.peerGroup}` : ''}
                        </div>
                      </td>

                      {/* ATPI & Priority */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {atpi.toFixed(1)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
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
                      </td>

                      {/* FDR Q-Value */}
                      <td className="py-3 px-3 font-mono">
                        {qVal !== null ? (
                          <span className={qVal <= 0.05 ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                            {qVal < 0.001 ? '<0.001' : qVal.toFixed(4)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Multi-Agent Verdict */}
                      <td className="py-3 px-3">
                        {verdict ? (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              verdict === 'CONFIRMED_ANOMALY'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                : verdict === 'DATA_QUALITY_ARTIFACT'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                            }`}
                          >
                            {verdict.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending Validation</span>
                        )}
                      </td>

                      {/* Claim Verification Ratio (CVR) */}
                      <td className="py-3 px-3 font-mono">
                        {cvr !== null && cvr !== undefined ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {(cvr * 100).toFixed(0)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Review Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            anomaly.reviewStatus === 'VALIDATED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : anomaly.reviewStatus === 'FALSE_POSITIVE'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                          }`}
                        >
                          {anomaly.reviewStatus || 'PENDING'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenDrawer(anomaly)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white transition shadow-2xs"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Inspect & Review</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Validation Detail & Human Review Drawer */}
      <ValidationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anomaly={inspectingAnomaly}
        onRecordUpdated={handleRecordUpdated}
      />
    </div>
  );
};

export default ReviewsPage;
