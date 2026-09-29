import React, { useState, useEffect } from 'react';
import {
  FileSearch,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  Info,
  Layers,
  BarChart2,
  TrendingUp,
  FileText,
} from 'lucide-react';
import forensicService from '../services/forensicService';
import datasetService from '../services/datasetService';
import BenfordBarChart from '../charts/BenfordBarChart';
import LastDigitUniformityChart from '../charts/LastDigitUniformityChart';
import DigitHeapingChart from '../charts/DigitHeapingChart';
import TurnoutVoteShareScatter from '../charts/TurnoutVoteShareScatter';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const ForensicsPage = () => {
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [reports, setReports] = useState([]);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Fetch all ready datasets
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
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
    }
  };

  // When selectedDatasetId changes, load existing reports
  useEffect(() => {
    if (selectedDatasetId) {
      loadForensicReports(selectedDatasetId);
    }
  }, [selectedDatasetId]);

  const loadForensicReports = async (datasetId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await forensicService.getReportsByDataset(datasetId);
      if (res.success && res.data) {
        setReports(res.data.reports || []);
        setActiveColumnIndex(0);
      }
    } catch (err) {
      console.error('Failed to fetch forensic reports:', err);
      setError(err.response?.data?.message || 'Failed to load forensic reports');
    } finally {
      setLoading(false);
    }
  };

  const handleRunForensics = async () => {
    if (!selectedDatasetId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await forensicService.runForensics({ datasetId: selectedDatasetId });
      if (res.success && res.data) {
        setReports(res.data.reports || []);
        setActiveColumnIndex(0);
        showToast('Forensic analysis completed successfully');
      }
    } catch (err) {
      console.error('Forensics execution error:', err);
      setError(err.response?.data?.message || 'Forensics execution failed');
    } finally {
      setRunning(false);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const currentReport = reports && reports.length > 0 ? reports[activeColumnIndex] : null;

  const getConformityColor = (level) => {
    switch (level) {
      case 'CLOSE_CONFORMITY':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'ACCEPTABLE':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'SUSPICIOUS_DEVIATION':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'NON_CONFORMING':
        return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
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
              Contribution C3
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Unsupervised Statistical Forensics
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Statistical Forensics Lab
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Audit leading/terminal digit anomalies, demographic heaping (Whipple & Myers indices), round-number biases, and bivariate election turnout distortions. Conformalized forensic p-values integrate seamlessly into the Calibrated Consensus Anomaly Score (CCAS).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <div className="min-w-[220px]">
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.category || 'General'})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunForensics}
            disabled={running || !selectedDatasetId}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 transition-colors"
          >
            {running ? (
              <RotateCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {running ? 'Running Tests...' : 'Run Forensic Battery'}
          </button>
        </div>
      </div>

      {/* Methodology & Ethics Note */}
      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed space-y-1">
        <div className="flex items-center space-x-2 font-semibold">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>Scientific & Ethical Compliance Principle:</span>
        </div>
        <p className="pl-6 text-slate-600 dark:text-slate-300">
          Statistical non-conformity flags unusual digit distributions and reporting friction; they do <strong>not</strong> constitute proof of fraud or illicit activity. All outputs are decision-support indicators requiring domain specialist human review.
        </p>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingSkeleton count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadForensicReports(selectedDatasetId)} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="No Forensic Reports Found"
          description="Click 'Run Forensic Battery' above to execute Benford's Law, digit heaping, last-digit uniformity, and round number tests across the numeric columns of this dataset."
          actionText="Execute Forensic Battery"
          onAction={handleRunForensics}
        />
      ) : (
        <div className="space-y-6">
          {/* Column selector tabs */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pr-2">
              Analyzed Columns:
            </span>
            {reports.map((report, idx) => (
              <button
                key={report._id || idx}
                onClick={() => setActiveColumnIndex(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeColumnIndex === idx
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{report.column}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    report.overallConformity === 'NON_CONFORMING'
                      ? 'bg-rose-500'
                      : report.overallConformity === 'SUSPICIOUS_DEVIATION'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Active Column Report */}
          {currentReport && (
            <div className="space-y-6">
              {/* Summary Banner for Current Column */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      Field: <code className="font-mono text-indigo-600 dark:text-indigo-400">{currentReport.column}</code>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${getConformityColor(
                        currentReport.overallConformity
                      )}`}
                    >
                      {currentReport.overallConformity.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sample size: <span className="font-semibold text-slate-700 dark:text-slate-200">{currentReport.analyzedRecords}</span> records analyzed &bull; Non-conforming tests: <span className="font-semibold text-rose-600 dark:text-rose-400">{currentReport.nonConformityCount || 0}</span>
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Signal Coupling</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {currentReport.recordPValues?.length ? 'P-Values Generated (CCAS Ready)' : 'Standard Diagnostic'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Forensic Visualizations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Benford First Digit */}
                {currentReport.tests?.benford_first_digit && (
                  <BenfordBarChart
                    testResult={currentReport.tests.benford_first_digit}
                    title="Benford's Law (1st Leading Digit)"
                  />
                )}

                {/* 2. Benford Second Digit */}
                {currentReport.tests?.benford_second_digit && (
                  <BenfordBarChart
                    testResult={currentReport.tests.benford_second_digit}
                    title="Benford's Law (2nd Leading Digit)"
                  />
                )}

                {/* 3. Last Digit Uniformity */}
                {currentReport.tests?.last_digit_uniformity && (
                  <LastDigitUniformityChart
                    testResult={currentReport.tests.last_digit_uniformity}
                  />
                )}

                {/* 4. Digit Heaping (Whipple & Myers) */}
                {currentReport.tests?.digit_heaping && (
                  <DigitHeapingChart
                    testResult={currentReport.tests.digit_heaping}
                  />
                )}

                {/* 5. Round Number Bias */}
                {currentReport.tests?.round_number_bias && (
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Round-Number Bias Diagnostic
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Ratio of records exact-matching powers of 10 vs expected continuous density
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${getConformityColor(
                          currentReport.tests.round_number_bias.conformity_level
                        )}`}
                      >
                        {currentReport.tests.round_number_bias.conformity_level.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(
                        currentReport.tests.round_number_bias.metadata?.round_ratios || {}
                      ).map(([base, ratio]) => (
                        <div
                          key={base}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                        >
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Multiple of {base}
                          </div>
                          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                            {(ratio * 100).toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {ratio > 0.15 ? 'Heavily Rounded' : 'Normal variation'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Interpretation: </span>
                      {currentReport.tests.round_number_bias.note}
                    </div>
                  </div>
                )}

                {/* 6. Election Turnout vs Vote-Share Forensics (if present) */}
                {currentReport.tests?.election_turnout_vote_share && (
                  <div className="lg:col-span-2">
                    <TurnoutVoteShareScatter
                      testResult={currentReport.tests.election_turnout_vote_share}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ForensicsPage;
