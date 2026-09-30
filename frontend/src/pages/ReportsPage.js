import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  Download,
  Database,
  Link as LinkIcon,
  RefreshCw,
  Copy,
  Check,
  CheckCircle,
  Clock,
  Layers,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Cpu,
  BarChart3,
  Award,
} from 'lucide-react';
import datasetService from '../services/datasetService';
import reportService from '../services/reportService';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';

const ReportsPage = () => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('certificate'); // 'certificate' | 'ledger'
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // Certificate state
  const [certificate, setCertificate] = useState(null);
  const [loadingCert, setLoadingCert] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Ledger state
  const [blocks, setBlocks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [filterAction, setFilterAction] = useState('');

  // Chain verification state
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  // Load datasets on mount
  useEffect(() => {
    loadDatasets();
    runVerification();
  }, []);

  // When dataset changes in certificate tab
  useEffect(() => {
    if (selectedDatasetId) {
      loadCertificate(selectedDatasetId);
    }
  }, [selectedDatasetId]);

  // When ledger tab or pagination changes
  useEffect(() => {
    if (activeTab === 'ledger') {
      loadAuditBlocks(pagination.page);
    }
  }, [activeTab, pagination.page, filterAction]);

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

  const runVerification = async () => {
    setVerifying(true);
    try {
      const res = await reportService.verifyAuditChain();
      if (res.success && res.data) {
        setVerification(res.data);
        if (res.data.isChainValid) {
          toast.success(`Ledger verified: ${res.data.totalBlocks} blocks intact`);
        } else {
          toast.error(`Tampering detected in ${res.data.tamperedBlocks.length} block(s)!`);
        }
      }
    } catch (err) {
      console.error('Chain verification failed:', err);
      toast.error('Cryptographic verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const loadCertificate = async (datasetId) => {
    setLoadingCert(true);
    try {
      const res = await reportService.getDatasetCertificate(datasetId);
      if (res.success && res.data) {
        setCertificate(res.data);
      }
    } catch (err) {
      console.error('Failed to load certificate:', err);
      toast.error('Failed to load dataset compliance certificate');
    } finally {
      setLoadingCert(false);
    }
  };

  const loadAuditBlocks = async (page = 1) => {
    setLoadingBlocks(true);
    try {
      const params = { page, limit: pagination.limit };
      if (filterAction) params.action = filterAction;
      const res = await reportService.getAuditBlocks(params);
      if (res.success && res.data) {
        setBlocks(res.data.blocks || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      console.error('Failed to load audit blocks:', err);
      toast.error('Failed to retrieve audit ledger');
    } finally {
      setLoadingBlocks(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(key);
    toast.info('Hash copied to clipboard');
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleDownloadJson = async () => {
    if (!selectedDatasetId) return;
    setExportingJson(true);
    try {
      await reportService.downloadCertificateJson(selectedDatasetId);
      toast.success('Certificate exported as JSON');
    } catch (err) {
      console.error('Export JSON error:', err);
      toast.error('Failed to export certificate JSON');
    } finally {
      setExportingJson(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!selectedDatasetId) return;
    setExportingCsv(true);
    try {
      await reportService.downloadAnomaliesCsv(selectedDatasetId);
      toast.success('Anomalies exported as CSV');
    } catch (err) {
      console.error('Export CSV error:', err);
      toast.error('Failed to export anomalies CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Audit Trail & Compliance Reports
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              Contribution C8
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tamper-evident SHA-256 hash-chained ledger and decision-support compliance certificates.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={runVerification}
            disabled={verifying}
            className="inline-flex items-center px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${verifying ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            {verifying ? 'Verifying Hashes...' : 'Verify Ledger Integrity'}
          </button>
        </div>
      </div>

      {/* Cryptographic Chain Integrity Banner */}
      {verification && (
        <div
          className={`p-4 rounded-xl border transition-all ${
            verification.isChainValid
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
              : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/50'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div
                className={`p-2 rounded-lg mt-0.5 ${
                  verification.isChainValid
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                }`}
              >
                {verification.isChainValid ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-semibold text-sm ${
                      verification.isChainValid
                        ? 'text-emerald-900 dark:text-emerald-200'
                        : 'text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {verification.isChainValid
                      ? 'Cryptographic Hash-Chain Integrity: 100% Intact'
                      : 'Cryptographic Hash-Chain Tampering Detected!'}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      verification.isChainValid
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                    }`}
                  >
                    {verification.isChainValid ? 'VERIFIED' : 'TAMPERED'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Sequential SHA-256 blocks verified: {verification.verifiedBlocks} / {verification.totalBlocks}.
                  Verified at: {new Date(verification.verifiedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {verification.headHash && (
              <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-500 font-mono">Head:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {verification.headHash.slice(0, 10)}...{verification.headHash.slice(-8)}
                </span>
                <button
                  onClick={() => handleCopy(verification.headHash, 'head')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Copy full SHA-256 head hash"
                >
                  {copiedHash === 'head' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Tamper Warning List if broken */}
          {!verification.isChainValid && verification.tamperedBlocks && verification.tamperedBlocks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-rose-200 dark:border-rose-800/40 space-y-2">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Tampered Blocks Detail:
              </span>
              <div className="space-y-1">
                {verification.tamperedBlocks.map((t, idx) => (
                  <div key={idx} className="text-xs font-mono bg-white dark:bg-slate-900 p-2 rounded border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300">
                    <strong>Block #{t.sequenceNumber}</strong>: {t.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab('certificate')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === 'certificate'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Decision-Support Compliance Certificate</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Hash-Chained Audit Ledger Explorer</span>
        </button>
      </div>

      {/* TAB 1: Compliance Certificate */}
      {activeTab === 'certificate' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center space-x-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Dataset:
              </label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                disabled={loadingDatasets || datasets.length === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {datasets.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({d.category || 'GENERIC'} &bull; {d.dataType || 'REAL'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownloadJson}
                disabled={exportingJson || !certificate}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {exportingJson ? 'Exporting...' : 'Export Certificate (JSON)'}
              </button>

              <button
                onClick={handleDownloadCsv}
                disabled={exportingCsv || !certificate}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {exportingCsv ? 'Exporting...' : 'Export Anomalies (CSV)'}
              </button>
            </div>
          </div>

          {loadingCert ? (
            <LoadingSkeleton count={3} />
          ) : !certificate ? (
            <EmptyState
              icon={FileText}
              title="No Dataset Selected"
              description="Select a dataset above to generate a cryptographically anchored compliance certificate."
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
              {/* Certificate Header Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Award className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Decision-Support Audit Certificate
                    </h2>
                  </div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                    ID: {certificate.certificateId} &bull; Generated: {new Date(certificate.generatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Type: {certificate.dataset.dataType || 'REAL'}
                  </span>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Category: {certificate.dataset.category}
                  </span>
                </div>
              </div>

              {/* Dataset & Cryptographic Anchor Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Dataset Provenance
                  </h3>
                  <div className="text-xs space-y-1">
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Name:</strong> {certificate.dataset.name}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Dimensions:</strong> {certificate.dataset.rowCount?.toLocaleString()} rows &times; {certificate.dataset.columnCount} columns
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Uploaded By:</strong> {certificate.dataset.uploadedBy} on {new Date(certificate.dataset.uploadedAt).toLocaleDateString()}
                    </p>
                    <div className="flex items-center space-x-2 pt-1 font-mono text-slate-600 dark:text-slate-400 break-all">
                      <span>SHA-256:</span>
                      <span className="text-blue-600 dark:text-blue-400">
                        {certificate.dataset.dataHash || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Cryptographic Audit Anchor
                  </h3>
                  <div className="text-xs space-y-1">
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Ledger Status:</strong>{' '}
                      <span className="text-emerald-600 font-semibold">
                        {certificate.cryptographicAuditChain.isChainValid ? '100% Cryptographically Intact' : 'TAMPERED'}
                      </span>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Total Ledger Blocks:</strong> {certificate.cryptographicAuditChain.totalBlocksInLedger}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>Dataset Events Logged:</strong> {certificate.cryptographicAuditChain.datasetEventBlocksCount}
                    </p>
                    <div className="flex items-center space-x-2 pt-1 font-mono text-slate-600 dark:text-slate-400 break-all">
                      <span>Ledger Head:</span>
                      <span className="text-blue-600 dark:text-blue-400">
                        {certificate.cryptographicAuditChain.ledgerHeadHash?.slice(0, 16)}...
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ATPI & Multi-Agent Findings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Triage */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      ATPI Triage Distribution
                    </span>
                    <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-slate-100 dark:bg-slate-800">
                      C7
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                      <span className="text-rose-700 dark:text-rose-300 font-semibold">Critical:</span>{' '}
                      <span className="font-bold">{certificate.calibrationAndTriage.atpiDistribution.critical}</span>
                    </div>
                    <div className="p-2 rounded bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60">
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">High:</span>{' '}
                      <span className="font-bold">{certificate.calibrationAndTriage.atpiDistribution.high}</span>
                    </div>
                    <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
                      <span className="text-amber-700 dark:text-amber-300 font-semibold">Medium:</span>{' '}
                      <span className="font-bold">{certificate.calibrationAndTriage.atpiDistribution.medium}</span>
                    </div>
                    <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                      <span className="text-blue-700 dark:text-blue-300 font-semibold">Low:</span>{' '}
                      <span className="font-bold">{certificate.calibrationAndTriage.atpiDistribution.low}</span>
                    </div>
                  </div>
                </div>

                {/* Multi-Agent Validation */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Multi-Agent Validation
                    </span>
                    <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-slate-100 dark:bg-slate-800">
                      C5
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Evaluated Records:</span>
                      <span className="font-semibold">{certificate.multiAgentValidation.totalEvaluated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rose-600 dark:text-rose-400">Confirmed Anomalies:</span>
                      <span className="font-semibold">{certificate.multiAgentValidation.confirmedAnomalies}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-600 dark:text-amber-400">Data Artifacts:</span>
                      <span className="font-semibold">{certificate.multiAgentValidation.dataQualityArtifacts}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400">Avg Claim Ratio (CVR):</span>
                      <span className="font-semibold font-mono">
                        {(certificate.multiAgentValidation.averageClaimVerificationRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Forensic & Adaptive Weights */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Forensics & Adaptive Weights
                    </span>
                    <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-slate-100 dark:bg-slate-800">
                      C3 &bull; C6
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between items-center">
                      <span>Forensic Conformity:</span>
                      <span className="px-2 py-0.5 font-semibold text-xs rounded bg-slate-100 dark:bg-slate-800">
                        {certificate.forensicConformance.overallConformity}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">Applied Weights (Hedge):</span>
                      <div className="grid grid-cols-2 gap-1 mt-1 font-mono text-[11px]">
                        <div>Robust Z: {((certificate.adaptiveWeightsApplied?.robust_z || 0.4) * 100).toFixed(0)}%</div>
                        <div>IsoForest: {((certificate.adaptiveWeightsApplied?.isolation_forest || 0.35) * 100).toFixed(0)}%</div>
                        <div>Z-Score: {((certificate.adaptiveWeightsApplied?.z_score || 0.15) * 100).toFixed(0)}%</div>
                        <div>Temporal: {((certificate.adaptiveWeightsApplied?.temporal || 0.1) * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hard Rule 2 Formal Compliance Disclaimer */}
              <div className="p-4 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <strong>Mandatory Research Disclaimer:</strong> {certificate.complianceStatement}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Hash-Chained Audit Ledger Explorer */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Ledger Filter / Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Action Filter:
              </span>
              <input
                type="text"
                placeholder="e.g. DATASET_UPLOAD, HUMAN_FEEDBACK..."
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {blocks.length} of {pagination.total} cryptographic blocks
            </div>
          </div>

          {/* Blocks Table */}
          {loadingBlocks ? (
            <LoadingSkeleton count={5} />
          ) : blocks.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No Audit Blocks Found"
              description="No audit events have been committed into the cryptographic hash-chain yet."
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-3 px-4">Block #</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Previous Hash</th>
                      <th className="py-3 px-4">Block Hash (SHA-256)</th>
                      <th className="py-3 px-4 text-center">Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {blocks.map((b) => (
                      <React.Fragment key={b._id}>
                        <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            <span className="inline-flex items-center space-x-1">
                              <span>#{b.sequenceNumber}</span>
                              {b.isGenesis && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded font-sans font-semibold">
                                  GENESIS
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {new Date(b.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-mono">
                              {b.action}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {b.userEmail}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {b.userRole}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <div className="flex items-center space-x-1">
                              <span title={b.previousHash}>
                                {b.previousHash.slice(0, 8)}...{b.previousHash.slice(-6)}
                              </span>
                              <button
                                onClick={() => handleCopy(b.previousHash, `prev-${b._id}`)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                {copiedHash === `prev-${b._id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <div className="flex items-center space-x-1 font-semibold text-blue-600 dark:text-blue-400">
                              <span title={b.currentHash}>
                                {b.currentHash.slice(0, 10)}...{b.currentHash.slice(-6)}
                              </span>
                              <button
                                onClick={() => handleCopy(b.currentHash, `curr-${b._id}`)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                {copiedHash === `curr-${b._id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() =>
                                setExpandedBlockId(expandedBlockId === b._id ? null : b._id)
                              }
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors inline-flex items-center space-x-1"
                            >
                              <span>{expandedBlockId === b._id ? 'Hide' : 'Inspect'}</span>
                              {expandedBlockId === b._id ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Collapsible Payload Inspection */}
                        {expandedBlockId === b._id && (
                          <tr className="bg-slate-50 dark:bg-slate-950/60">
                            <td colSpan={7} className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                                  <span>Block #{b.sequenceNumber} Payload Metadata</span>
                                  <span>Entity: {b.entity} {b.entityId ? `(${b.entityId})` : ''}</span>
                                </div>
                                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-xs font-mono overflow-x-auto max-h-48">
                                  {JSON.stringify(b.metadata || {}, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
                  <span className="text-slate-500">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                      }
                      disabled={pagination.page <= 1}
                      className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50 hover:bg-white dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: Math.min(pagination.totalPages, prev.page + 1),
                        }))
                      }
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50 hover:bg-white dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
