import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Play,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  BarChart3,
  Layers,
  Sliders,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { featureService } from '../services/featureService';
import { datasetService } from '../services/datasetService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCard, SkeletonTable } from '../components/LoadingSkeleton';

const PeerGroupsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetIdFromUrl = searchParams.get('datasetId');

  const { isAnalyst } = useAuth();
  const toast = useToast();

  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdFromUrl || '');
  const [peerGroupData, setPeerGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);

  // Shrinkage & Chart controls
  const [selectedFeature, setSelectedFeature] = useState('');
  const [showGlobalBaseline, setShowGlobalBaseline] = useState(true);
  const [showRawMedian, setShowRawMedian] = useState(true);
  const [shrinkageN0, setShrinkageN0] = useState(15);
  const [minGroupSize, setMinGroupSize] = useState(5);

  // Load available datasets
  useEffect(() => {
    const loadDatasets = async () => {
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
    loadDatasets();
  }, [selectedDatasetId]);

  // Load peer groups
  const fetchPeerGroups = useCallback(async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    try {
      const res = await featureService.getPeerGroups(selectedDatasetId);
      if (res.success && res.data) {
        setPeerGroupData(res.data);

        // Select first available feature for chart
        const firstGroup = res.data.peerGroups?.[0];
        if (firstGroup && firstGroup.baselines) {
          const availableFeats = Object.keys(firstGroup.baselines);
          if (availableFeats.length > 0 && !selectedFeature) {
            setSelectedFeature(availableFeats[0]);
          }
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to fetch peer groups');
    } finally {
      setLoading(false);
    }
  }, [selectedDatasetId, selectedFeature, toast]);

  useEffect(() => {
    fetchPeerGroups();
    if (selectedDatasetId) {
      setSearchParams({ datasetId: selectedDatasetId });
    }
  }, [selectedDatasetId, fetchPeerGroups, setSearchParams]);

  const handleBuildPeerGroups = async () => {
    if (!selectedDatasetId) return;
    setBuilding(true);
    try {
      const res = await featureService.buildPeerGroups({
        datasetId: selectedDatasetId,
        shrinkageN0: parseInt(shrinkageN0, 10) || 15,
        minGroupSize: parseInt(minGroupSize, 10) || 5,
      });

      if (res.success && res.data) {
        setPeerGroupData(res.data);
        const firstGroup = res.data.peerGroups?.[0];
        if (firstGroup && firstGroup.baselines) {
          const feats = Object.keys(firstGroup.baselines);
          if (feats.length > 0) setSelectedFeature(feats[0]);
        }
        toast.success(`Generated ${res.data.peerGroups?.length || 0} peer groups with robust shrinkage.`);
      }
    } catch (err) {
      toast.error(err.message || 'Peer group construction failed');
    } finally {
      setBuilding(false);
    }
  };

  const peerGroups = peerGroupData?.peerGroups || [];
  const metadata = peerGroupData?.metadata || {};
  const globalBaselines = peerGroupData?.globalBaselines || {};

  // Available features for baseline chart
  const availableFeatures =
    peerGroups.length > 0 && peerGroups[0].baselines
      ? Object.keys(peerGroups[0].baselines)
      : [];

  // Prepare chart data (top 15 groups for visual clarity)
  const chartData = peerGroups.slice(0, 15).map((pg) => {
    const featStats = pg.baselines?.[selectedFeature] || {};
    return {
      name: pg.groupName.length > 12 ? `${pg.groupName.substring(0, 10)}...` : pg.groupName,
      fullName: pg.groupName,
      sampleCount: pg.sampleCount,
      rawMedian: featStats.rawMedian || 0,
      shrunkMedian: featStats.shrunkMedian || 0,
      refMedian: featStats.refMedian || 0,
      isSmall: pg.isSmallGroup,
    };
  });

  const activeGlobalMedian = globalBaselines[selectedFeature]?.median || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Hierarchy-Aware Peer Groups (C2)</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {peerGroups.length} Groups
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Robust median/MAD baselines with empirical shrinkage toward parent administrative groups.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Dataset Selector */}
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {datasets.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.category})
              </option>
            ))}
          </select>

          {isAnalyst && (
            <button
              onClick={handleBuildPeerGroups}
              disabled={building || !selectedDatasetId}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{building ? 'Forming Groups...' : 'Build Peer Groups'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Methodology Educational Note (C2 Explanation) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-900/90 to-indigo-950 text-white shadow-xs space-y-2">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-brand-300">
          <HelpCircle className="w-4 h-4" />
          <span>Research Contribution C2: Peer Baselines & Empirical Shrinkage</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          National and global averages penalize poorer or distinct geographical zones as false anomalies.
          We compute robust medians and MAD per administrative peer group, regularized via <strong>James-Stein / Empirical Bayes shrinkage</strong>:
          <span className="font-mono text-[11px] block mt-1 text-brand-200">
            M_shrunk = λ * M_local + (1 - λ) * M_parent &nbsp;|&nbsp; λ = n / (n + {shrinkageN0})
          </span>
          Small cohorts shrink toward parent baselines to prevent noise; large cohorts preserve pure local dynamics.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Peer Groups
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {peerGroups.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Group Column: <strong>{metadata.groupColumn || 'Inferred'}</strong>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Small Groups Flagged
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {metadata.smallGroupCount ?? peerGroups.filter((g) => g.isSmallGroup).length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Groups with sample size &lt; {metadata.minGroupSize || 5}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Parent Group Hierarchy
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {metadata.parentColumn || 'Global'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Shrinkage reference level</div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Shrinkage Hyperparameter
          </div>
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-2">
            n₀ = {metadata.shrinkageN0 || shrinkageN0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Weight threshold constant</div>
        </div>
      </div>

      {loading ? (
        <SkeletonCard rows={5} />
      ) : peerGroups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Peer Groups Built Yet"
          description="Form administrative peer groups to calculate robust median/MAD baselines and empirical shrinkage."
          actionLabel={isAnalyst ? 'Build Peer Groups' : undefined}
          onAction={isAnalyst ? handleBuildPeerGroups : undefined}
        />
      ) : (
        <>
          {/* Interactive Global vs Peer Toggle Chart */}
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Global vs. Shrunk Peer Baseline Comparison
                </h3>
              </div>

              {/* Chart Controls */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Feature Selector */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400 font-medium">Metric:</span>
                  <select
                    value={selectedFeature}
                    onChange={(e) => setSelectedFeature(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {availableFeatures.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Toggles */}
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showRawMedian}
                    onChange={(e) => setShowRawMedian(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Show Raw Median</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showGlobalBaseline}
                    onChange={(e) => setShowGlobalBaseline(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Show Global Reference</span>
                </label>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  {showRawMedian && (
                    <Bar
                      dataKey="rawMedian"
                      name="Raw Group Median"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                  <Bar
                    dataKey="shrunkMedian"
                    name="Shrunk Median (C2 Baseline)"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  />
                  {showGlobalBaseline && (
                    <ReferenceLine
                      y={activeGlobalMedian}
                      label={{
                        value: `Global: ${activeGlobalMedian}`,
                        fill: '#10b981',
                        fontSize: 10,
                        position: 'top',
                      }}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-400 text-center">
              Comparing raw sample medians against empirical shrinkage estimates and the global reference line.
            </p>
          </div>

          {/* Peer Groups Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                Peer Group Cohorts & Shrunk Baselines
              </h3>
              <span className="text-xs text-slate-400">
                Sorted by Sample Size (descending)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Group Name</th>
                    <th className="py-3 px-4">Parent Group</th>
                    <th className="py-3 px-4">Sample Size (n)</th>
                    <th className="py-3 px-4">Shrinkage Weight (λ)</th>
                    <th className="py-3 px-4">Cohort Flag</th>
                    {selectedFeature && (
                      <>
                        <th className="py-3 px-4 font-mono">Raw Med ({selectedFeature})</th>
                        <th className="py-3 px-4 font-mono text-brand-600">Shrunk Med</th>
                        <th className="py-3 px-4 font-mono">Shrunk MAD</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {peerGroups.map((pg) => {
                    const stats = pg.baselines?.[selectedFeature] || {};
                    return (
                      <tr
                        key={pg.groupName}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {pg.groupName}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {pg.parentGroup || 'Global'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {pg.sampleCount}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {pg.shrinkageFactor}
                        </td>
                        <td className="py-3 px-4">
                          {pg.isSmallGroup ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Small (n &lt; 5)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle className="w-3 h-3" />
                              <span>Adequate</span>
                            </span>
                          )}
                        </td>
                        {selectedFeature && (
                          <>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {stats.rawMedian ?? '—'}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-brand-600 dark:text-brand-400">
                              {stats.shrunkMedian ?? '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                              {stats.shrunkMad ?? '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PeerGroupsPage;
