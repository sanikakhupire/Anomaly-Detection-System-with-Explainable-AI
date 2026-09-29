import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Layers, Play, Database, CheckCircle, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { featureService } from '../services/featureService';
import { datasetService } from '../services/datasetService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import SchemaMappingModal from '../components/SchemaMappingModal';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCard, SkeletonTable } from '../components/LoadingSkeleton';

const FeaturesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetIdFromUrl = searchParams.get('datasetId');

  const { isAnalyst } = useAuth();
  const toast = useToast();

  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdFromUrl || '');
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const [showMappingModal, setShowMappingModal] = useState(false);

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

  // Load features and dataset details when selectedDatasetId changes
  const fetchFeatures = useCallback(async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    try {
      const [featRes, dsRes] = await Promise.all([
        featureService.getFeatures(selectedDatasetId),
        datasetService.getDatasetById(selectedDatasetId),
      ]);

      if (featRes.success && featRes.data) {
        setFeatures(featRes.data.features || []);
      }
      if (dsRes.success && dsRes.data) {
        setDatasetInfo(dsRes.data.dataset);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to fetch features');
    } finally {
      setLoading(false);
    }
  }, [selectedDatasetId, toast]);

  useEffect(() => {
    fetchFeatures();
    if (selectedDatasetId) {
      setSearchParams({ datasetId: selectedDatasetId });
    }
  }, [selectedDatasetId, fetchFeatures, setSearchParams]);

  const handleRunFeatures = async () => {
    if (!selectedDatasetId) return;

    if (!datasetInfo?.isSchemaConfirmed) {
      setShowMappingModal(true);
      return;
    }

    setRunning(true);
    try {
      const res = await featureService.runFeatures(selectedDatasetId);
      if (res.success && res.data) {
        setFeatures(res.data.features || []);
        toast.success(`Generated ${res.data.generatedCount} domain features successfully.`);
      }
    } catch (err) {
      toast.error(err.message || 'Feature engineering failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Domain Feature Engineering</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {features.length} Features
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Plugin-based statistical feature generation for Census, MGNREGA, and Election public datasets.
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
              onClick={handleRunFeatures}
              disabled={running || !selectedDatasetId}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{running ? 'Extracting...' : 'Run Feature Extraction'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Schema Confirmation Status Banner */}
      {datasetInfo && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            datasetInfo.isSchemaConfirmed
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {datasetInfo.isSchemaConfirmed ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            )}
            <span>
              {datasetInfo.isSchemaConfirmed
                ? 'Semantic schema mapping confirmed. Feature extraction plugins are authorized to execute.'
                : 'Schema mapping is pending confirmation. Feature templates require mapped canonical roles.'}
            </span>
          </div>

          <button
            onClick={() => setShowMappingModal(true)}
            className="px-3 py-1.5 rounded-xl border border-current font-semibold hover:bg-white/40 dark:hover:bg-slate-900/40 transition-colors whitespace-nowrap"
          >
            {datasetInfo.isSchemaConfirmed ? 'Review Schema Mapping' : 'Confirm Schema Mapping Now'}
          </button>
        </div>
      )}

      {/* Features Content */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : features.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No Features Generated Yet"
          description="Feature extraction plugins generate standardized statistical ratios (such as density, sex ratio, wage per day, turnout %) based on your confirmed schema mapping."
          actionLabel={isAnalyst ? 'Run Feature Extraction' : undefined}
          onAction={isAnalyst ? handleRunFeatures : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Feature Name</th>
                  <th className="py-3 px-4">Domain</th>
                  <th className="py-3 px-4">Description & Formula</th>
                  <th className="py-3 px-4">Mean / Median</th>
                  <th className="py-3 px-4">Min — Max</th>
                  <th className="py-3 px-4">Std Dev</th>
                  <th className="py-3 px-4">Non-Null Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {features.map((feat) => (
                  <tr
                    key={feat.name}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {feat.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                        {feat.domain}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {feat.description}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        <code>{feat.formula}</code>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      {feat.mean !== null ? `${feat.mean} / ${feat.median}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      {feat.min !== null ? `${feat.min} — ${feat.max}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      {feat.std !== null ? feat.std : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {feat.nonNullCount?.toLocaleString() || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schema Mapping Modal */}
      {selectedDatasetId && (
        <SchemaMappingModal
          isOpen={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          datasetId={selectedDatasetId}
          onMappingSaved={() => {
            fetchFeatures();
          }}
        />
      )}
    </div>
  );
};

export default FeaturesPage;
