import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Copy,
  Check,
  RefreshCw,
  HardDrive,
  User,
  ShieldCheck,
  Layers,
  Activity,
  Users,
  AlertCircle,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { SkeletonCard, SkeletonTable } from '../components/LoadingSkeleton';
import ErrorState from '../components/ErrorState';
import SchemaMappingModal from '../components/SchemaMappingModal';

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const DatasetDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('schema'); // 'schema' | 'log' | 'jobs'
  const [copiedHash, setCopiedHash] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);

  const fetchDatasetDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await datasetService.getDatasetById(id);
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve dataset details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDatasetDetails();
  }, [fetchDatasetDetails]);

  // Poll if dataset is in processing state
  useEffect(() => {
    if (data?.dataset?.status === 'Processing' || data?.dataset?.status === 'Uploaded') {
      const timer = setInterval(() => {
        fetchDatasetDetails();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [data?.dataset?.status, fetchDatasetDetails]);

  const copyHashToClipboard = () => {
    if (data?.dataset?.dataHash) {
      navigator.clipboard.writeText(data.dataset.dataHash);
      setCopiedHash(true);
      toast.info('SHA-256 data hash copied to clipboard');
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <SkeletonCard rows={2} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={2} />
          ))}
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  if (error || !data?.dataset) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ErrorState
          title="Dataset Not Found"
          message={error || 'Could not load details for this dataset.'}
          onRetry={fetchDatasetDetails}
        />
      </div>
    );
  }

  const { dataset, qualityReport, recentJobs } = data;

  const qualityScore = qualityReport?.overallQualityScore ?? dataset.qualityScore ?? 0;
  const qualityColor =
    qualityScore >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : qualityScore >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Phase 3 Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to="/datasets"
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Datasets</span>
        </Link>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Schema Mapping Confirmation Button */}
          <button
            onClick={() => setShowMappingModal(true)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              dataset.isSchemaConfirmed
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
            }`}
          >
            {dataset.isSchemaConfirmed ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span>{dataset.isSchemaConfirmed ? 'Schema Confirmed' : 'Confirm Schema'}</span>
          </button>

          {/* Features Button */}
          <Link
            to={`/features?datasetId=${id}`}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span>Engineered Features</span>
          </Link>

          {/* Peer Groups Button */}
          <Link
            to={`/peer-groups?datasetId=${id}`}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-2xs"
          >
            <Users className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span>Peer Groups (C2)</span>
          </Link>

          {/* Detected Anomalies Button */}
          <Link
            to={`/anomalies?datasetId=${id}`}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-2xs"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Detected Anomalies</span>
          </Link>

          <button
            onClick={fetchDatasetDetails}
            title="Refresh dataset metadata"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dataset Header Card */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                {dataset.category}
              </span>
              <StatusBadge status={dataset.dataType} size="sm" />
              <StatusBadge status={dataset.status} size="sm" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {dataset.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              {dataset.description || 'No extended description recorded.'}
            </p>
          </div>

          {/* SHA-256 Reproducibility Hash */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 max-w-md">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                <span>SHA-256 Data Hash</span>
              </span>
              <button
                onClick={copyHashToClipboard}
                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline flex items-center space-x-1 font-medium"
              >
                {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHash ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all">
              {dataset.dataHash}
            </div>
          </div>
        </div>

        {/* Metadata Strip */}
        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500">
          <span className="flex items-center space-x-1.5">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <span>File: <strong>{dataset.originalFileName}</strong> ({formatBytes(dataset.fileSize)})</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <User className="w-4 h-4 text-slate-400" />
            <span>Uploaded by: <strong>{dataset.uploadedBy?.name || 'Authorized Analyst'}</strong></span>
          </span>
          <span className="flex items-center space-x-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Ingested on: <strong>{new Date(dataset.createdAt).toLocaleString()}</strong></span>
          </span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Records */}
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Records (Rows)
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {qualityReport?.rowCount?.toLocaleString() ?? dataset.rowCount?.toLocaleString() ?? '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Chunk-streamed from file</div>
        </div>

        {/* Total Features */}
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Columns (Features)
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {qualityReport?.columnCount ?? dataset.columnCount ?? '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Schema parsed without errors</div>
        </div>

        {/* Quality Score */}
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Data Quality Score
          </div>
          <div className={`text-2xl font-bold mt-2 ${qualityColor}`}>
            {qualityReport ? `${qualityScore}/100` : 'Computing...'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Deterministic composite score</div>
        </div>

        {/* Duplicate Rows */}
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Duplicate Records
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {qualityReport
              ? `${qualityReport.duplicateRowPercentage}%`
              : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {qualityReport ? `${qualityReport.duplicateRowCount} duplicate rows` : 'Analyzing'}
          </div>
        </div>
      </div>

      {/* Detected Issues Banner */}
      {qualityReport?.issues?.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Detected Quality Considerations ({qualityReport.issues.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {qualityReport.issues.map((issue, idx) => (
              <div
                key={idx}
                className="text-xs p-2 rounded-xl bg-white/70 dark:bg-slate-800/60 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300"
              >
                <span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 mr-1.5">
                  {issue.severity}
                </span>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs Control */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold space-x-6">
        <button
          onClick={() => setActiveTab('schema')}
          className={`pb-3 transition-colors relative flex items-center space-x-1.5 ${
            activeTab === 'schema'
              ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Column Schema & Statistics ({qualityReport?.columns?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('log')}
          className={`pb-3 transition-colors relative flex items-center space-x-1.5 ${
            activeTab === 'log'
              ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Transformation & Integrity Log</span>
        </button>

        <button
          onClick={() => setActiveTab('jobs')}
          className={`pb-3 transition-colors relative flex items-center space-x-1.5 ${
            activeTab === 'jobs'
              ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Processing History ({recentJobs?.length || 0})</span>
        </button>
      </div>

      {/* Tab 1: Column Schema Table */}
      {activeTab === 'schema' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Column Name</th>
                  <th className="py-3 px-4">Inferred Type</th>
                  <th className="py-3 px-4">Missing Values</th>
                  <th className="py-3 px-4">Unique Cardinality</th>
                  <th className="py-3 px-4">Mean / Median</th>
                  <th className="py-3 px-4">Min — Max</th>
                  <th className="py-3 px-4">Sample Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {qualityReport?.columns?.map((col) => (
                  <tr
                    key={col.name}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      {col.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {col.dtype}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={
                          col.missingPercentage > 20
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {col.missingCount} ({col.missingPercentage}%)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {col.uniqueCount?.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                      {col.mean !== null && col.mean !== undefined
                        ? `${col.mean} / ${col.median}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                      {col.min !== null && col.min !== undefined
                        ? `${col.min} — ${col.max}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px] max-w-xs truncate">
                      {col.sampleValues && col.sampleValues.length > 0
                        ? col.sampleValues.slice(0, 3).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Transformation & Integrity Log */}
      {activeTab === 'log' && (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Deterministic Profiling Audit Record</span>
          </div>
          <p className="text-xs text-slate-500">
            In accordance with project rules, datasets are analyzed deterministically. No imputation, synthetic backfilling, or silent changes are applied to raw records.
          </p>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs space-y-2 overflow-x-auto">
            {qualityReport?.transformationLog?.map((entry, idx) => (
              <div key={idx} className="flex items-start space-x-2">
                <span
                  className={
                    entry.level === 'SUCCESS'
                      ? 'text-emerald-400 font-bold'
                      : entry.level === 'WARNING'
                      ? 'text-amber-400 font-bold'
                      : 'text-brand-400'
                  }
                >
                  [{entry.level}]
                </span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Processing Job History */}
      {activeTab === 'jobs' && (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            Job Orchestration Execution Trail
          </h3>

          <div className="space-y-3">
            {recentJobs?.map((job) => (
              <div
                key={job._id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white">{job.type}</span>
                    <StatusBadge status={job.status} size="sm" />
                  </div>
                  <p className="text-slate-500 mt-1">{job.step}</p>
                </div>
                <div className="text-right text-slate-400">
                  <div>Progress: {job.progress}%</div>
                  <div className="text-[11px]">
                    {new Date(job.createdAt).toLocaleTimeString()} • {new Date(job.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schema Mapping Modal */}
      <SchemaMappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        datasetId={id}
        onMappingSaved={() => fetchDatasetDetails()}
      />
    </div>
  );
};

export default DatasetDetailPage;
