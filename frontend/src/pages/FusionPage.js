import React, { useState, useEffect } from 'react';
import {
  GitMerge,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle,
  Shield,
  Layers,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  Edit3,
  Clock,
  Trash2,
  Sliders,
  Check,
  X,
  FileText,
} from 'lucide-react';
import fusionService from '../services/fusionService';
import datasetService from '../services/datasetService';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';

const FusionPage = () => {
  const [datasets, setDatasets] = useState([]);
  const [fusions, setFusions] = useState([]);
  const [selectedFusion, setSelectedFusion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // New Fusion Form State
  const [datasetAId, setDatasetAId] = useState('');
  const [datasetBId, setDatasetBId] = useState('');
  const [keyColumns, setKeyColumns] = useState('');
  const [compareColumns, setCompareColumns] = useState('');
  const [thresholdPct, setThresholdPct] = useState(5);

  // Resolve Modal State
  const [activeConflict, setActiveConflict] = useState(null);
  const [resolutionMethod, setResolutionMethod] = useState('TRUST_WEIGHTED_MEAN');
  const [manualValue, setManualValue] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [dsRes, fusionRes] = await Promise.all([
        datasetService.getDatasets({ limit: 100 }),
        fusionService.getFusions({ limit: 50 }),
      ]);

      if (dsRes.success && dsRes.data?.datasets) {
        setDatasets(dsRes.data.datasets);
        if (dsRes.data.datasets.length >= 2) {
          setDatasetAId(dsRes.data.datasets[0]._id);
          setDatasetBId(dsRes.data.datasets[1]._id);
        }
      }

      if (fusionRes.success && fusionRes.data?.fusions) {
        setFusions(fusionRes.data.fusions);
        if (fusionRes.data.fusions.length > 0) {
          loadFusionDetail(fusionRes.data.fusions[0]._id);
        }
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setError('Failed to load datasets and fusion history');
    } finally {
      setLoading(false);
    }
  };

  const loadFusionDetail = async (id) => {
    try {
      const res = await fusionService.getFusionById(id);
      if (res.success && res.data) {
        setSelectedFusion(res.data.fusion);
      }
    } catch (err) {
      console.error('Failed to load fusion details:', err);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRunFusion = async (e) => {
    e.preventDefault();
    if (!datasetAId || !datasetBId) {
      setError('Please select both primary and secondary datasets for fusion');
      return;
    }
    if (datasetAId === datasetBId) {
      setError('Cannot fuse a dataset with itself. Select two distinct sources.');
      return;
    }

    setRunning(true);
    setError(null);

    const keys = keyColumns
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const compares = compareColumns
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    try {
      const res = await fusionService.runFusion({
        datasetAId,
        datasetBId,
        keyColumns: keys.length > 0 ? keys : null,
        compareColumns: compares.length > 0 ? compares : null,
        discrepancyThresholdPct: Number(thresholdPct),
      });

      if (res.success && res.data) {
        showToast('Fusion conflict analysis completed');
        await loadFusionDetail(res.data.fusionId);
        // Refresh list
        const refreshRes = await fusionService.getFusions({ limit: 50 });
        if (refreshRes.success && refreshRes.data?.fusions) {
          setFusions(refreshRes.data.fusions);
        }
      }
    } catch (err) {
      console.error('Fusion execution error:', err);
      setError(err.response?.data?.message || 'Fusion conflict analysis failed');
    } finally {
      setRunning(false);
    }
  };

  const openResolveModal = (conflict, index) => {
    setActiveConflict({ ...conflict, index });
    setResolutionMethod('TRUST_WEIGHTED_MEAN');
    setManualValue(String(conflict.sourceA?.value ?? ''));
    setResolutionNotes('');
  };

  const handleResolveConflict = async () => {
    if (!selectedFusion || !activeConflict) return;
    setResolving(true);
    try {
      const payload = {
        conflictIndex: activeConflict.index,
        method: resolutionMethod,
        notes: resolutionNotes,
      };

      if (resolutionMethod === 'MANUAL') {
        payload.resolvedValue = isNaN(Number(manualValue)) ? manualValue : Number(manualValue);
      }

      const res = await fusionService.resolveConflict(selectedFusion._id, payload);
      if (res.success && res.data) {
        showToast('Conflict resolved with full provenance audit trail');
        setActiveConflict(null);
        await loadFusionDetail(selectedFusion._id);
      }
    } catch (err) {
      console.error('Conflict resolution error:', err);
      showToast(err.response?.data?.message || 'Resolution failed');
    } finally {
      setResolving(false);
    }
  };

  const handleDeleteFusion = async (id) => {
    if (!window.confirm('Delete this data fusion record?')) return;
    try {
      await fusionService.deleteFusion(id);
      showToast('Fusion record deleted');
      setFusions(fusions.filter((f) => f._id !== id));
      if (selectedFusion?._id === id) {
        setSelectedFusion(null);
      }
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete fusion record');
    }
  };

  // Helper for computing preview resolved value in modal
  const getPreviewResolvedValue = () => {
    if (!activeConflict || !selectedFusion) return '';
    const valA = Number(activeConflict.sourceA?.value);
    const valB = Number(activeConflict.sourceB?.value);
    const trustA = selectedFusion.sourceTrustA?.score || 50;
    const trustB = selectedFusion.sourceTrustB?.score || 50;

    switch (resolutionMethod) {
      case 'PREFER_A':
        return activeConflict.sourceA?.value;
      case 'PREFER_B':
        return activeConflict.sourceB?.value;
      case 'MANUAL':
        return manualValue;
      case 'KEEP_BOTH_FLAGGED':
        return 'Both Retained (Dual Provenance)';
      case 'TRUST_WEIGHTED_MEAN':
      default:
        if (!isNaN(valA) && !isNaN(valB)) {
          const weighted = (valA * trustA + valB * trustB) / (trustA + trustB);
          return parseFloat(weighted.toFixed(2));
        }
        return activeConflict.sourceA?.value;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm shadow-xl flex items-center space-x-2 animate-fade-in border border-slate-700">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Contribution C3 & Data Fusion
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Cross-Source Provenance Harmonization
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Data Fusion & Provenance Reconciliation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Detect cross-source discrepancies between independent datasets, calculate automated Source Trust Scores (Completeness, Consistency, Recency), and reconcile records with cryptographic auditability. Values are never silently overwritten.
          </p>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadInitialData} />}

      {/* Fusion Job Setup Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center space-x-2">
            <GitMerge className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Launch Cross-Source Discrepancy Screening
            </h2>
          </div>
          <span className="text-xs text-slate-400">Deterministic key-based record alignment</span>
        </div>

        <form onSubmit={handleRunFusion} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Source Dataset A (Primary)
            </label>
            <select
              value={datasetAId}
              onChange={(e) => setDatasetAId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {datasets.map((d) => (
                <option key={`a-${d._id}`} value={d._id}>
                  {d.name} ({d.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Source Dataset B (Secondary)
            </label>
            <select
              value={datasetBId}
              onChange={(e) => setDatasetBId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {datasets.map((d) => (
                <option key={`b-${d._id}`} value={d._id}>
                  {d.name} ({d.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Matching Key Columns
            </label>
            <input
              type="text"
              placeholder="e.g. district, block (auto if empty)"
              value={keyColumns}
              onChange={(e) => setKeyColumns(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Discrepancy Threshold (%)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={running || !datasetAId || !datasetBId}
              className="w-full inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 transition-colors"
            >
              {running ? (
                <RotateCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {running ? 'Screening...' : 'Detect Conflicts'}
            </button>
          </div>
        </form>
      </div>

      {/* Main Dual-Panel View: History List and Selected Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Fusion Runs */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Harmonization History ({fusions.length})
          </h3>

          {fusions.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-center text-xs text-slate-400">
              No cross-source fusions executed yet.
            </div>
          ) : (
            <div className="space-y-2">
              {fusions.map((fusion) => {
                const isSelected = selectedFusion?._id === fusion._id;
                return (
                  <div
                    key={fusion._id}
                    onClick={() => loadFusionDetail(fusion._id)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <span>{fusion.datasetA?.name || 'Dataset A'}</span>
                          <span className="text-slate-400">&harr;</span>
                          <span>{fusion.datasetB?.name || 'Dataset B'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {fusion.conflictsCount} discrepancies &bull; {fusion.resolvedCount} resolved
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFusion(fusion._id);
                        }}
                        className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                        title="Delete run"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[10px]">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 font-mono text-slate-600 dark:text-slate-300">
                        Keys: {fusion.keyColumns?.join(', ')}
                      </span>
                      <span className="text-slate-400">
                        {new Date(fusion.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 2 Columns: Selected Fusion Overview & Conflict Triage Table */}
        <div className="lg:col-span-2 space-y-6">
          {selectedFusion ? (
            <div className="space-y-6">
              {/* Source Trust Scores Comparison */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Source Trust Score (STS) Evaluation</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Quantified confidence metric: 45% Completeness + 35% Consistency + 20% Temporal Freshness
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Dataset A Trust */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        Source A: {selectedFusion.datasetA?.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        STS: {selectedFusion.sourceTrustA?.score ?? 50}/100
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Completeness</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustA?.completeness ?? 0}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Consistency</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustA?.consistency ?? 0}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Recency</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustA?.recency ?? 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dataset B Trust */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        Source B: {selectedFusion.datasetB?.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        STS: {selectedFusion.sourceTrustB?.score ?? 50}/100
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Completeness</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustB?.completeness ?? 0}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Consistency</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustB?.consistency ?? 0}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Recency</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedFusion.sourceTrustB?.recency ?? 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conflicts Triage Table */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cross-Source Discrepancies ({selectedFusion.conflicts?.length || 0})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Review identified conflicts and apply cryptographic provenance-backed resolutions
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                    Threshold: &ge; {selectedFusion.discrepancyThresholdPct || 5}%
                  </span>
                </div>

                {(!selectedFusion.conflicts || selectedFusion.conflicts.length === 0) ? (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                    <CheckCircle className="w-6 h-6 mx-auto text-emerald-500 opacity-80" />
                    <div>No discrepancies detected between aligned records at current threshold.</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3">Aligned Entity (Key)</th>
                          <th className="py-2.5 px-3">Column</th>
                          <th className="py-2.5 px-3">Source A Value</th>
                          <th className="py-2.5 px-3">Source B Value</th>
                          <th className="py-2.5 px-3">Delta (%)</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {selectedFusion.conflicts.map((conflict, idx) => {
                          const isResolved = conflict.resolution?.status === 'RESOLVED';
                          const keyText = Object.entries(conflict.keyValues || {})
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ');

                          return (
                            <tr
                              key={`conflict-${idx}`}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                            >
                              <td className="py-3 px-3 font-medium text-slate-900 dark:text-white max-w-[150px] truncate" title={keyText}>
                                {keyText}
                              </td>
                              <td className="py-3 px-3 font-mono text-indigo-600 dark:text-indigo-400">
                                {conflict.column}
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                                {conflict.sourceA?.value ?? 'N/A'}
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                                {conflict.sourceB?.value ?? 'N/A'}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                                {conflict.discrepancyPct ? `${conflict.discrepancyPct.toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                    isResolved
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                  }`}
                                >
                                  {isResolved ? conflict.resolution?.method : 'UNRESOLVED'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => openResolveModal(conflict, idx)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors"
                                >
                                  {isResolved ? 'Re-examine' : 'Resolve'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-center text-xs text-slate-400">
              Select a harmonization run on the left to inspect discrepancies and resolve conflicts.
            </div>
          )}
        </div>
      </div>

      {/* Resolution Modal */}
      {activeConflict && (
        <Modal
          isOpen={!!activeConflict}
          onClose={() => setActiveConflict(null)}
          title="Reconcile Cross-Source Discrepancy"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Entity: {Object.entries(activeConflict.keyValues || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                Disputed Attribute: <code className="font-mono text-indigo-600 dark:text-indigo-400">{activeConflict.column}</code> &bull; Discrepancy: <span className="font-bold text-amber-500">{activeConflict.discrepancyPct?.toFixed(1)}%</span>
              </div>
            </div>

            {/* Source Values Comparison */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  {selectedFusion?.datasetA?.name || 'Source A'} (STS {selectedFusion?.sourceTrustA?.score})
                </div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {String(activeConflict.sourceA?.value ?? 'N/A')}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  {selectedFusion?.datasetB?.name || 'Source B'} (STS {selectedFusion?.sourceTrustB?.score})
                </div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {String(activeConflict.sourceB?.value ?? 'N/A')}
                </div>
              </div>
            </div>

            {/* Resolution Strategy Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Harmonization Method
              </label>
              <select
                value={resolutionMethod}
                onChange={(e) => setResolutionMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="TRUST_WEIGHTED_MEAN">
                  Trust-Weighted Mean (Weights by STS {selectedFusion?.sourceTrustA?.score}:{selectedFusion?.sourceTrustB?.score})
                </option>
                <option value="PREFER_A">
                  Prefer Source A ({selectedFusion?.datasetA?.name})
                </option>
                <option value="PREFER_B">
                  Prefer Source B ({selectedFusion?.datasetB?.name})
                </option>
                <option value="KEEP_BOTH_FLAGGED">
                  Keep Both Flagged (Preserve dual truth for audit)
                </option>
                <option value="MANUAL">
                  Manual Expert Override (Specify value)
                </option>
              </select>
            </div>

            {resolutionMethod === 'MANUAL' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Verified Override Value
                </label>
                <input
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Preview of Resolved Value */}
            <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Preview Resolved Output:</span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                {String(getPreviewResolvedValue())}
              </span>
            </div>

            {/* Provenance Audit Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Audit Justification / Provenance Note
              </label>
              <textarea
                rows={2}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Rationale recorded in immutable tamper-evident audit trail..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveConflict(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveConflict}
                disabled={resolving}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
              >
                {resolving ? 'Recording...' : 'Commit Resolution'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FusionPage;
