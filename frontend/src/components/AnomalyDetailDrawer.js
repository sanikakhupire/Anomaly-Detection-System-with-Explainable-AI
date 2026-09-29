import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Send,
  User,
  Activity,
  Layers,
  Sparkles,
  BarChart2,
  FileText,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { anomalyService } from '../services/anomalyService';
import { useToast } from '../context/ToastContext';

const AnomalyDetailDrawer = ({ isOpen, onClose, anomaly, onRecordUpdated }) => {
  const toast = useToast();
  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(anomaly?.status || 'NEW');
  const [currentReviewStatus, setCurrentReviewStatus] = useState(anomaly?.reviewStatus || 'PENDING');
  const [noteText, setNoteText] = useState('');

  // Update internal states when anomaly prop changes
  React.useEffect(() => {
    if (anomaly) {
      setCurrentStatus(anomaly.status || 'NEW');
      setCurrentReviewStatus(anomaly.reviewStatus || 'PENDING');
      setNoteText('');
    }
  }, [anomaly]);

  if (!isOpen || !anomaly) return null;

  const handleSaveStatus = async () => {
    setUpdating(true);
    try {
      const res = await anomalyService.updateAnomalyStatus(anomaly._id, {
        status: currentStatus,
        reviewStatus: currentReviewStatus,
        note: noteText.trim() ? noteText.trim() : undefined,
      });

      if (res.success) {
        toast.success('Investigation status & feedback updated successfully.');
        setNoteText('');
        if (onRecordUpdated) onRecordUpdated(res.data);
      } else {
        toast.error(res.message || 'Failed to update anomaly status');
      }
    } catch (err) {
      toast.error(err.message || 'Error updating status');
    } finally {
      setUpdating(false);
    }
  };

  const ensembleScore = anomaly.ensembleScore ?? 0;
  const detectorScores = anomaly.detectorScores || {};
  const detectorPValues = anomaly.detectorPValues || {};
  const detectorFlags = anomaly.detectorFlags || {};
  const recordData = anomaly.recordData || {};
  const atpi = anomaly.atpi ?? 0;
  const atpiBreakdown = anomaly.atpiBreakdown || {};
  const priority =
    anomaly.priority ||
    (atpi >= 75 ? 'CRITICAL' : atpi >= 55 ? 'HIGH' : atpi >= 35 ? 'MEDIUM' : 'LOW');
  const combinedP = anomaly.combinedP !== undefined && anomaly.combinedP !== null ? anomaly.combinedP : null;
  const qValue = anomaly.qValue !== undefined && anomaly.qValue !== null ? anomaly.qValue : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Record #{anomaly.recordIndex}
              </span>
              <StatusBadge status={anomaly.dataset?.dataType || 'REAL'} size="sm" />
              <StatusBadge status={anomaly.status} size="sm" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Potential Statistical Anomaly
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dataset: {anomaly.dataset?.name || 'Dataset'} {anomaly.peerGroup ? `• Peer Group: ${anomaly.peerGroup}` : ''}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ATPI Priority & Triage Card (C7) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-600" />
                  <span>Anomaly Triage Priority Index (C7 ATPI)</span>
                </span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                    {atpi.toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ 100</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Triage Priority
                </span>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                    priority === 'CRITICAL'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      : priority === 'HIGH'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : priority === 'MEDIUM'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {priority}
                </span>
              </div>
            </div>

            {/* ATPI Dimension Contribution Bars */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/50">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Index Dimension Breakdown
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Statistical Confidence */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Confidence (1 - q)</span>
                    <span className="font-mono font-bold text-brand-600">
                      {atpiBreakdown.statistical_confidence
                        ? (atpiBreakdown.statistical_confidence * 100).toFixed(0)
                        : (qValue !== null ? ((1 - qValue) * 100).toFixed(0) : '—')}
                      %
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          atpiBreakdown.statistical_confidence
                            ? atpiBreakdown.statistical_confidence * 100
                            : qValue !== null
                            ? (1 - qValue) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Effect Size Score */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Effect Size (MAD)</span>
                    <span className="font-mono font-bold text-purple-600">
                      {atpiBreakdown.effect_size_score
                        ? (atpiBreakdown.effect_size_score * 100).toFixed(0)
                        : (ensembleScore * 100).toFixed(0)}
                      %
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          atpiBreakdown.effect_size_score
                            ? atpiBreakdown.effect_size_score * 100
                            : ensembleScore * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Peer Context Score */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Peer Discrepancy</span>
                    <span className="font-mono font-bold text-amber-600">
                      {anomaly.peerContextFlag ? 'ACTIVE (1.0)' : 'NOMINAL (0.0)'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${anomaly.peerContextFlag ? 'bg-amber-500 w-full' : 'bg-slate-300 w-0'}`}
                    />
                  </div>
                </div>

                {/* Population Impact */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Population Impact</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {atpiBreakdown.population_impact_score
                        ? (atpiBreakdown.population_impact_score * 100).toFixed(0)
                        : '50'}
                      %
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          atpiBreakdown.population_impact_score
                            ? atpiBreakdown.population_impact_score * 100
                            : 50
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Conformal Calibration & Multiple Testing (C1) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Scale className="w-4 h-4 text-brand-600" />
              <span>Conformal Calibration & Multiple Testing (C1 ACAT)</span>
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-750">
                <div className="text-[11px] text-slate-500">ACAT Combined P-Value</div>
                <div className="text-lg font-mono font-bold text-slate-900 dark:text-white mt-1">
                  {combinedP !== null ? (combinedP < 0.001 ? '<0.001' : combinedP.toFixed(4)) : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Heavy-tailed Cauchy fusion</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-750">
                <div className="text-[11px] text-slate-500">FDR Q-Value (BH Step-Up)</div>
                <div className="flex items-center space-x-2 mt-1">
                  <span
                    className={`text-lg font-mono font-bold ${
                      qValue !== null && qValue <= 0.05
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {qValue !== null ? (qValue < 0.001 ? '<0.001' : qValue.toFixed(4)) : '—'}
                  </span>
                  {qValue !== null && qValue <= 0.05 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      FDR &le; 5%
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Multiple hypothesis adjusted</div>
              </div>
            </div>
          </div>

          {/* Peer Context Discrepancy Alert */}
          {anomaly.peerContextFlag && (
            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-300 flex items-start space-x-2.5">
              <ShieldAlert className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Peer Context Discrepancy:</span> This record is statistically
                unusual specifically in the context of its local peer group baseline, demonstrating the value
                of hierarchy-aware Empirical Bayes shrinkage over uniform global thresholds.
              </div>
            </div>
          )}

          {/* Anomaly Tags / Flags */}
          {anomaly.flags && anomaly.flags.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Triggered Anomaly Flags
              </span>
              <div className="flex flex-wrap gap-2">
                {anomaly.flags.map((flag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>{flag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Individual Detector Score Breakdown */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Detector Score & Conformal P-Value Breakdown
            </span>
            <div className="grid grid-cols-2 gap-3">
              {/* Robust Z */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Layers className="w-3.5 h-3.5 text-brand-500" />
                    <span>Robust Z (MAD)</span>
                  </span>
                  <span className={detectorFlags.robust_z ? 'text-rose-500 font-bold' : 'text-slate-400'}>
                    {detectorFlags.robust_z ? 'FLAGGED' : 'NORMAL'}
                  </span>
                </div>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {detectorScores.robust_z !== undefined ? detectorScores.robust_z.toFixed(2) : '—'}
                  </span>
                  {detectorPValues.robust_z !== undefined && (
                    <span className="text-[11px] font-mono text-slate-400">
                      p={detectorPValues.robust_z.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">Threshold: &gt; 3.5 MAD</div>
              </div>

              {/* Isolation Forest */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>Isolation Forest</span>
                  </span>
                  <span className={detectorFlags.isolation_forest ? 'text-rose-500 font-bold' : 'text-slate-400'}>
                    {detectorFlags.isolation_forest ? 'FLAGGED' : 'NORMAL'}
                  </span>
                </div>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {detectorScores.isolation_forest !== undefined
                      ? detectorScores.isolation_forest.toFixed(2)
                      : '—'}
                  </span>
                  {detectorPValues.isolation_forest !== undefined && (
                    <span className="text-[11px] font-mono text-slate-400">
                      p={detectorPValues.isolation_forest.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">Multivariate Tree Path Metric</div>
              </div>

              {/* Standard Z-score */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Standard Z</span>
                  </span>
                  <span className={detectorFlags.z_score ? 'text-rose-500 font-bold' : 'text-slate-400'}>
                    {detectorFlags.z_score ? 'FLAGGED' : 'NORMAL'}
                  </span>
                </div>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {detectorScores.z_score !== undefined ? detectorScores.z_score.toFixed(2) : '—'}
                  </span>
                  {detectorPValues.z_score !== undefined && (
                    <span className="text-[11px] font-mono text-slate-400">
                      p={detectorPValues.z_score.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">Threshold: &gt; 3.0 \sigma</div>
              </div>

              {/* Temporal */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Temporal CUSUM</span>
                  </span>
                  <span className={detectorFlags.temporal ? 'text-rose-500 font-bold' : 'text-slate-400'}>
                    {detectorFlags.temporal ? 'FLAGGED' : 'NORMAL'}
                  </span>
                </div>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {detectorScores.temporal !== undefined ? detectorScores.temporal.toFixed(2) : 'N/A'}
                  </span>
                  {detectorPValues.temporal !== undefined && (
                    <span className="text-[11px] font-mono text-slate-400">
                      p={detectorPValues.temporal.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">STL & Drift Residuals</div>
              </div>
            </div>
          </div>

          {/* Record Attributes Grid */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Raw Record Values
            </span>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {Object.entries(recordData).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50">
                    <dt className="text-slate-400 font-medium truncate" title={key}>
                      {key}
                    </dt>
                    <dd className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={String(val)}>
                      {val !== null && val !== undefined ? String(val) : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Status & Review Verdict Updater */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-600" />
              <span>Human-in-the-Loop Review & Governance</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Investigation Status */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Investigation Status
                </label>
                <select
                  value={currentStatus}
                  onChange={(e) => setCurrentStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                >
                  <option value="NEW">NEW</option>
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="DISMISSED">DISMISSED</option>
                </select>
              </div>

              {/* Review Verdict */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Review Verdict
                </label>
                <select
                  value={currentReviewStatus}
                  onChange={(e) => setCurrentReviewStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="VALIDATED">VALIDATED (Confirmed Anomaly)</option>
                  <option value="FALSE_POSITIVE">FALSE POSITIVE (Explainable Variance)</option>
                  <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                </select>
              </div>
            </div>

            {/* Note input */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Add Reviewer Note / Justification
              </label>
              <textarea
                rows={2}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add contextual observations (e.g. data collection anomaly, seasonal effect, peer group shift)..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveStatus}
                disabled={updating}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-2xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{updating ? 'Saving...' : 'Update Review Verdict'}</span>
              </button>
            </div>

            {/* Existing Notes list */}
            {anomaly.notes && anomaly.notes.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Audit Notes Trail ({anomaly.notes.length})
                </span>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {anomaly.notes.map((n, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-750 text-xs"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {n.user?.name || 'Reviewer'}
                        </span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnomalyDetailDrawer;
