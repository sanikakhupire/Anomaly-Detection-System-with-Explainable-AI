import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  CheckCircle,
  AlertTriangle,
  Layers,
  FileCode,
  BarChart3,
  Award,
  Hash,
  ShieldCheck,
  Clock,
  Sparkles,
  TrendingDown,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import experimentService from '../services/experimentService';
import BenchmarkBarChart from '../charts/BenchmarkBarChart';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';

const LabPage = () => {
  const toast = useToast();

  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [currentRun, setCurrentRun] = useState(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New experiment modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formDomain, setFormDomain] = useState('MGNREGA');
  const [formRecords, setFormRecords] = useState(300);
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formSeed, setFormSeed] = useState(42);
  const [formRepetitions, setFormRepetitions] = useState(5);

  // LaTeX copy state
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [activeTab, setActiveTab] = useState('benchmark'); // 'benchmark' | 'ablations' | 'significance' | 'latex'

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadRunDetail(selectedRunId);
    }
  }, [selectedRunId]);

  const loadRuns = async () => {
    setLoadingRuns(true);
    try {
      const res = await experimentService.getRuns({ limit: 50 });
      if (res.success && res.data && res.data.runs) {
        setRuns(res.data.runs);
        if (res.data.runs.length > 0 && !selectedRunId) {
          setSelectedRunId(res.data.runs[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
      toast.error('Failed to load experiment runs');
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadRunDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const res = await experimentService.getRunById(id);
      if (res.success && res.data) {
        setCurrentRun(res.data);
      }
    } catch (err) {
      console.error('Failed to load run detail:', err);
      toast.error('Failed to load experiment details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLaunchExperiment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: `${formDomain} Benchmark (Seed ${formSeed})`,
        domain: formDomain,
        nRecords: Number(formRecords),
        severity: formSeverity,
        seed: Number(formSeed),
        nRepetitions: Number(formRepetitions),
      };

      const res = await experimentService.createRun(payload);
      if (res.success && res.data) {
        toast.success('Benchmark experiment launched!');
        setShowModal(false);
        // Refresh runs and select the new one
        await loadRuns();
        setSelectedRunId(res.data._id);
      }
    } catch (err) {
      console.error('Failed to launch experiment:', err);
      toast.error(err.message || 'Failed to start benchmark experiment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLatex = () => {
    if (!currentRun || !currentRun.latexTables) return;
    const combined = [
      currentRun.latexTables.benchmarkTable,
      '\n\n',
      currentRun.latexTables.ablationTable,
      '\n\n',
      currentRun.latexTables.significanceTable,
    ].join('');

    navigator.clipboard.writeText(combined);
    setCopiedLatex(true);
    toast.success('IEEE LaTeX tables copied to clipboard');
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  const handleDownloadLatex = async () => {
    if (!currentRun) return;
    try {
      await experimentService.downloadLatex(currentRun._id, currentRun.name);
      toast.success('LaTeX file downloaded');
    } catch (err) {
      console.error('Failed to download LaTeX:', err);
      toast.error('Failed to download LaTeX file');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Experiment Lab & Publication Benchmarks
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
              Contribution C9
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Reproducible benchmark comparisons, multi-seed ablation studies, Wilcoxon significance testing, and LaTeX table export.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              loadRuns();
              if (selectedRunId) loadRunDetail(selectedRunId);
            }}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Refresh Runs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
            Launch Benchmark Run
          </button>
        </div>
      </div>

      {/* Main Experiment Container */}
      {loadingRuns ? (
        <LoadingSkeleton count={4} />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No Benchmark Experiments Run"
          description="Launch your first calibrated benchmark experiment to evaluate the proposed framework against classical baselines with publication-ready LaTeX tables."
        />
      ) : (
        <div className="space-y-6">
          {/* Top Control Bar: Select Run */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center space-x-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Experiment Run:
              </label>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {runs.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} &bull; {r.domain} &bull; Seed {r.seed} &bull; {r.status}
                  </option>
                ))}
              </select>
            </div>

            {currentRun && (
              <div className="flex items-center space-x-3 text-xs">
                <StatusBadge
                  status={currentRun.status}
                  label={currentRun.status}
                  size="sm"
                />
                <span className="text-slate-500 font-mono">
                  {new Date(currentRun.createdAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {loadingDetail || !currentRun ? (
            <LoadingSkeleton count={3} />
          ) : (
            <div className="space-y-6">
              {/* Provenance & Reproducibility Ribbon (Hard Rule 7) */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300">
                    <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>
                      <strong>Seed:</strong> {currentRun.seed}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300">
                    <RotateCcw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong>Repetitions:</strong> {currentRun.nRepetitions} folds
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300">
                    <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>
                      <strong>Runtime:</strong> {currentRun.executionTimeMs}ms
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 font-mono text-[11px] text-slate-500">
                  {currentRun.dataHash && (
                    <span title={currentRun.dataHash}>
                      Data Hash: {currentRun.dataHash.slice(0, 8)}...
                    </span>
                  )}
                  {currentRun.configHash && (
                    <span title={currentRun.configHash}>
                      Config: {currentRun.configHash.slice(0, 8)}...
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-sans font-semibold">
                    {currentRun.modelVersion}
                  </span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
                <button
                  onClick={() => setActiveTab('benchmark')}
                  className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === 'benchmark'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Benchmark vs Baselines</span>
                </button>

                <button
                  onClick={() => setActiveTab('ablations')}
                  className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === 'ablations'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Ablation Studies</span>
                </button>

                <button
                  onClick={() => setActiveTab('significance')}
                  className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === 'significance'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Statistical Significance</span>
                </button>

                <button
                  onClick={() => setActiveTab('latex')}
                  className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === 'latex'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>IEEE LaTeX Exporter</span>
                </button>
              </div>

              {/* TAB 1: Benchmark vs Baselines */}
              {activeTab === 'benchmark' && (
                <div className="space-y-6">
                  {/* Visual Chart Card */}
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          PR-AUC and ROC-AUC Detection Performance
                        </h2>
                        <p className="text-xs text-slate-500">
                          Primary metric: Precision-Recall Area Under Curve (PR-AUC) under severe class imbalance.
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                        {currentRun.domain} Dataset
                      </span>
                    </div>

                    <BenchmarkBarChart baselineSummary={currentRun.baselineSummary} />
                  </div>

                  {/* Benchmark Metrics Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
                      Empirical Performance Metrics across Folds
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-3 px-4">Model / Framework</th>
                            <th className="py-3 px-4 font-bold text-blue-600">PR-AUC &uarr;</th>
                            <th className="py-3 px-4">ROC-AUC &uarr;</th>
                            <th className="py-3 px-4">Precision@10</th>
                            <th className="py-3 px-4">Recall@10</th>
                            <th className="py-3 px-4">F1-Score</th>
                            <th className="py-3 px-4">Brier Loss &darr;</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {Object.entries(currentRun.baselineSummary || {}).map(([model, m]) => {
                            const isProposed = model.includes('Proposed') || model.includes('Ours');
                            return (
                              <tr
                                key={model}
                                className={
                                  isProposed
                                    ? 'bg-blue-50/60 dark:bg-blue-950/30 font-semibold'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                }
                              >
                                <td className="py-3 px-4">
                                  {isProposed ? (
                                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                                      {model}
                                    </span>
                                  ) : (
                                    model
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-blue-700 dark:text-blue-300">
                                  {(m.pr_auc || 0).toFixed(3)}
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {(m.roc_auc || 0).toFixed(3)}
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {((m['precision@10'] || 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {((m['recall@10'] || 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {(m.f1 || 0).toFixed(3)}
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {(m.brier_score || 0).toFixed(3)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Ablation Studies */}
              {activeTab === 'ablations' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
                      Systematic Ablation Analysis (Proving Marginal Contribution)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-3 px-4">System Variant</th>
                            <th className="py-3 px-4 font-bold">PR-AUC</th>
                            <th className="py-3 px-4">ROC-AUC</th>
                            <th className="py-3 px-4 font-bold text-rose-600">&Delta; PR-AUC</th>
                            <th className="py-3 px-4">Impact Rationale</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {(currentRun.ablationSummary || []).map((item, idx) => {
                            const isFull = idx === 0;
                            const fullPr = currentRun.ablationSummary[0]?.pr_auc || 0;
                            const delta = isFull ? 0 : (item.pr_auc - fullPr);
                            return (
                              <tr
                                key={item.variant}
                                className={
                                  isFull
                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                }
                              >
                                <td className="py-3 px-4 font-medium">
                                  {item.variant}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold">
                                  {(item.pr_auc || 0).toFixed(3)}
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {(item.roc_auc || 0).toFixed(3)}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold">
                                  {isFull ? (
                                    <span className="text-emerald-600">Reference (0.000)</span>
                                  ) : (
                                    <span className="text-rose-600">{delta.toFixed(3)}</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-slate-500 text-[11px]">
                                  {isFull
                                    ? 'Full framework: C1 + C2 + C6 + C7 integrated.'
                                    : item.variant.includes('Conformal')
                                    ? 'Loss of valid p-values increases false discovery.'
                                    : item.variant.includes('Local')
                                    ? 'Global thresholds fail on micro-cohort variations.'
                                    : item.variant.includes('Uniform')
                                    ? 'Static weights do not adapt to detector precision.'
                                    : 'Raw score sorting neglects population scale and effect size.'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Statistical Significance */}
              {activeTab === 'significance' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
                      Pairwise Statistical Hypothesis Testing (Paired t-test &amp; Wilcoxon)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-3 px-4">Comparison (Proposed vs)</th>
                            <th className="py-3 px-4">Mean Difference</th>
                            <th className="py-3 px-4 font-bold">Cohen's d (Effect Size)</th>
                            <th className="py-3 px-4">Paired t-test (p-value)</th>
                            <th className="py-3 px-4">Wilcoxon Test (p-value)</th>
                            <th className="py-3 px-4 text-center">Significance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {(currentRun.significanceTests || []).map((sig) => (
                            <tr key={sig.baseline_name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                vs {sig.baseline_name}
                              </td>
                              <td className="py-3 px-4 font-mono text-emerald-600 font-bold">
                                +{(sig.mean_difference || 0).toFixed(3)}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-blue-600">
                                {(sig.cohen_d || 0).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {sig.paired_t_test?.p_value < 0.001
                                  ? '< 0.001'
                                  : (sig.paired_t_test?.p_value || 0).toFixed(4)}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {sig.wilcoxon_test?.p_value < 0.001
                                  ? '< 0.001'
                                  : (sig.wilcoxon_test?.p_value || 0).toFixed(4)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                                  {sig.significance_level}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: IEEE LaTeX Exporter */}
              {activeTab === 'latex' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Publication-Ready IEEE LaTeX Tables
                      </h3>
                      <p className="text-xs text-slate-500">
                        Formatted for two-column IEEE Transactions / Conference paper templates.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleCopyLatex}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        {copiedLatex ? (
                          <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {copiedLatex ? 'Copied!' : 'Copy LaTeX'}
                      </button>

                      <button
                        onClick={handleDownloadLatex}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Download .tex
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto max-h-[500px] border border-slate-800 space-y-6">
                    <div>
                      <div className="text-slate-400 pb-1 border-b border-slate-800 mb-2 font-bold">
                        % Table 1: Benchmark Comparison vs Classical Baselines
                      </div>
                      <pre className="whitespace-pre-wrap">
                        {currentRun.latexTables?.benchmarkTable || '% No benchmark table'}
                      </pre>
                    </div>

                    <div>
                      <div className="text-slate-400 pb-1 border-b border-slate-800 mb-2 font-bold">
                        % Table 2: Ablation Studies Demonstrating Modular Research Contributions
                      </div>
                      <pre className="whitespace-pre-wrap">
                        {currentRun.latexTables?.ablationTable || '% No ablation table'}
                      </pre>
                    </div>

                    <div>
                      <div className="text-slate-400 pb-1 border-b border-slate-800 mb-2 font-bold">
                        % Table 3: Pairwise Statistical Significance Hypotheses
                      </div>
                      <pre className="whitespace-pre-wrap">
                        {currentRun.latexTables?.significanceTable || '% No significance table'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Experiment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <FlaskConical className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Configure Benchmark Experiment Run
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleLaunchExperiment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Domain:
                </label>
                <select
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="MGNREGA">MGNREGA (Rural Wage &amp; Employment)</option>
                  <option value="Census">Census (Demographic &amp; Literacy Hierarchy)</option>
                  <option value="Election">Election (Polling Turnout &amp; Vote Shares)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Records Count:
                  </label>
                  <select
                    value={formRecords}
                    onChange={(e) => setFormRecords(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value={150}>150 records (Fast)</option>
                    <option value={300}>300 records (Standard)</option>
                    <option value={500}>500 records (Comprehensive)</option>
                    <option value={1000}>1000 records (Deep)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Anomaly Severity:
                  </label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="low">Low (Subtle Perturbations)</option>
                    <option value="medium">Medium (Calibrated Outliers)</option>
                    <option value="high">High (Distinct Spikes)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Random Seed (Hard Rule 7):
                  </label>
                  <input
                    type="number"
                    value={formSeed}
                    onChange={(e) => setFormSeed(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Repetitions (Folds):
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={formRepetitions}
                    onChange={(e) => setFormRepetitions(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900/50 text-blue-900 dark:text-blue-200 text-[11px] leading-relaxed">
                <strong>Paper Experiment Guarantee:</strong> Every run is strictly seeded, hashes input dataframes, and automatically creates an entry into the SHA-256 cryptographic audit ledger (C8).
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-50 inline-flex items-center"
                >
                  {submitting ? 'Initializing...' : 'Run Benchmark'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabPage;
