import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  FileCheck,
  Sparkles,
  Send,
  RefreshCw,
  Info,
  Scale,
  Activity,
  Layers,
  FileText,
  UserCheck,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import validationService from '../services/validationService';
import { useToast } from '../context/ToastContext';

const ValidationDrawer = ({ isOpen, onClose, anomaly, onRecordUpdated }) => {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Review submission state
  const [reviewVerdict, setReviewVerdict] = useState(anomaly?.reviewStatus || 'PENDING');
  const [investigationStatus, setInvestigationStatus] = useState(anomaly?.status || 'NEW');
  const [noteText, setNoteText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (isOpen && anomaly?._id) {
      setReviewVerdict(anomaly.reviewStatus || 'PENDING');
      setInvestigationStatus(anomaly.status || 'NEW');
      setNoteText('');
      loadValidationReport(anomaly._id);
    } else {
      setReport(null);
      setError(null);
    }
  }, [isOpen, anomaly?._id]);

  const loadValidationReport = async (anomalyId, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = force
        ? await validationService.validateAnomaly(anomalyId, true)
        : await validationService.getValidationReport(anomalyId);

      if (res.success && res.data) {
        setReport(res.data);
      } else {
        setError(res.message || 'Unable to retrieve validation report');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error executing multi-agent validation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!anomaly?._id) return;
    if (reviewVerdict === 'PENDING') {
      toast.error('Please select an active review verdict (Validated, False Positive, or Inconclusive)');
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await validationService.submitReview(anomaly._id, {
        reviewStatus: reviewVerdict,
        status: investigationStatus,
        note: noteText.trim() ? noteText.trim() : undefined,
      });

      if (res.success) {
        toast.success('Human review verdict and audit note recorded successfully.');
        setNoteText('');
        if (onRecordUpdated) {
          onRecordUpdated(res.data.anomaly);
        }
      } else {
        toast.error(res.message || 'Failed to submit human review');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Error recording human review');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (!isOpen || !anomaly) return null;

  const atpi = anomaly.atpi ?? 0;
  const priority =
    anomaly.priority ||
    (atpi >= 75 ? 'CRITICAL' : atpi >= 55 ? 'HIGH' : atpi >= 35 ? 'MEDIUM' : 'LOW');

  const getVerdictStyle = (verdict) => {
    switch (verdict) {
      case 'CONFIRMED_ANOMALY':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-800';
      case 'DATA_QUALITY_ARTIFACT':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border-amber-300 dark:border-amber-800';
      case 'BENIGN_EXTREME_VARIATION':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200 border-blue-300 dark:border-blue-800';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700';
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'ESCALATE_FOR_AUDIT':
        return { label: 'Escalate for Field Audit', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200' };
      case 'REQUEST_DATA_CORRECTION':
        return { label: 'Request Data Correction', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200' };
      case 'MARK_FALSE_POSITIVE':
        return { label: 'Mark as False Positive', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200' };
      default:
        return { label: 'Accept as Statistical Outlier', color: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Record #{anomaly.recordIndex}
              </span>
              <StatusBadge status={anomaly.dataset?.dataType || 'REAL'} size="sm" />
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  priority === 'CRITICAL'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                    : priority === 'HIGH'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
                }`}
              >
                ATPI: {atpi.toFixed(1)} • {priority}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Multi-Agent Validation & Claim Verification (C5)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dataset: {anomaly.dataset?.name || 'Dataset'} {anomaly.peerGroup ? `• Peer: ${anomaly.peerGroup}` : ''}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadValidationReport(anomaly._id, true)}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Re-run Multi-Agent Validation"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="p-12 text-center space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Executing Multi-Agent Validation...
              </h3>
              <p className="text-xs text-slate-500">
                Evaluating statistical power, domain constraints, digit forensics, and grounded claims
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-2">
              <div className="flex items-center space-x-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Multi-Agent Validation Error</span>
              </div>
              <p>{error}</p>
              <button
                onClick={() => loadValidationReport(anomaly._id, true)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                Retry Validation
              </button>
            </div>
          )}

          {!loading && !error && report && (
            <>
              {/* Arbiter Verdict & Action Banner */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Multi-Agent Consensus Verdict
                    </span>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${getVerdictStyle(
                        report.verdict
                      )}`}
                    >
                      {report.verdict.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-right">
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Consensus Confidence
                      </span>
                      <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                        {(report.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Claim Verification (CVR)
                      </span>
                      <span className="font-mono text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {(report.claimVerificationRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recommended Action */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Recommended Governance Action:</span>
                  {(() => {
                    const act = getActionBadge(report.recommendedAction);
                    return (
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${act.color}`}>
                        {act.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Plain-Language Non-Accusatory Summary (Hard Rule 2) */}
                {report.summary && (
                  <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-xs text-indigo-950 dark:text-indigo-300 leading-relaxed">
                    <div className="flex items-center space-x-1.5 font-bold mb-1 text-indigo-900 dark:text-indigo-200">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Validation Synthesis:</span>
                    </div>
                    <p>{report.summary}</p>
                  </div>
                )}
              </div>

              {/* Multi-Agent Assessments Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Specialized Agent Evaluations (3 Agents)</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {report.agentAssessments.map((agent, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-slate-900 dark:text-white truncate" title={agent.agentName}>
                            {agent.agentName.replace('Agent', '')}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              agent.supportsAnomaly
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {agent.supportsAnomaly ? 'SUPPORTS' : 'NOMINAL'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {agent.perspective}
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                        {agent.findings.slice(0, 2).map((f, fi) => (
                          <div key={fi} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start space-x-1">
                            <span className="text-indigo-500">•</span>
                            <span className="line-clamp-2">{f}</span>
                          </div>
                        ))}
                        <div className="text-[10px] text-slate-400 pt-1 flex justify-between">
                          <span>Confidence:</span>
                          <span className="font-mono font-bold">{(agent.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grounded Claim Verifier Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Grounded Claim Verification ({report.claims.length} Claims)</span>
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    CVR: {(report.claimVerificationRatio * 100).toFixed(0)}% Verified
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Claim ID</th>
                        <th className="py-2.5 px-3 font-semibold">Factual Statement</th>
                        <th className="py-2.5 px-3 font-semibold">Ground Source</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Verification Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                      {report.claims.map((claim) => (
                        <tr key={claim.claimId} className="hover:bg-slate-50/50 dark:hover:bg-slate-750/30">
                          <td className="py-2 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                            {claim.claimId}
                          </td>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-200 leading-snug">
                            {claim.claimText}
                          </td>
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {claim.citationSource}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                claim.status === 'VERIFIED'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : claim.status === 'CONTRADICTED'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {claim.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Human-in-the-Loop Review Verdict Submission */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <UserCheck className="w-4 h-4 text-brand-600" />
                  <span>Human-in-the-Loop Governance Decision</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Review Verdict
                    </label>
                    <select
                      value={reviewVerdict}
                      onChange={(e) => setReviewVerdict(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="PENDING">PENDING (Awaiting Review)</option>
                      <option value="VALIDATED">VALIDATED (Confirmed Real Anomaly)</option>
                      <option value="FALSE_POSITIVE">FALSE POSITIVE (Explainable Variance)</option>
                      <option value="INCONCLUSIVE">INCONCLUSIVE (Requires Field Investigation)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Investigation Status
                    </label>
                    <select
                      value={investigationStatus}
                      onChange={(e) => setInvestigationStatus(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="NEW">NEW</option>
                      <option value="INVESTIGATING">INVESTIGATING</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="DISMISSED">DISMISSED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Reviewer Audit Notes / Justification
                  </label>
                  <textarea
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Enter audit rationale (e.g. cross-verified against district report, data entry typo confirmed)..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white resize-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={submittingReview}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingReview ? 'Recording...' : 'Submit Human Verdict'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationDrawer;
