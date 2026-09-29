import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Database,
  Plus,
  Search,
  Filter,
  RefreshCw,
  LayoutGrid,
  List,
  Trash2,
  ArrowUpRight,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import DatasetCard from '../components/DatasetCard';
import FileUploader from '../components/FileUploader';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCard, SkeletonTable } from '../components/LoadingSkeleton';

const DatasetsPage = () => {
  const { user, isAnalyst } = useAuth();
  const toast = useToast();

  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [dataType, setDataType] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(search.trim() && { search: search.trim() }),
        ...(category !== 'ALL' && { category }),
        ...(status !== 'ALL' && { status }),
        ...(dataType !== 'ALL' && { dataType }),
      };

      const res = await datasetService.getDatasets(params);
      if (res.success && res.data) {
        setDatasets(res.data.datasets || []);
        if (res.data.pagination) {
          setPagination((prev) => ({
            ...prev,
            total: res.data.pagination.total,
            totalPages: res.data.pagination.totalPages,
          }));
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to retrieve datasets');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, category, status, dataType, toast]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // Periodic poll if any dataset is currently 'Processing' or 'Uploaded'
  useEffect(() => {
    const hasActiveJobs = datasets.some(
      (d) => d.status === 'Processing' || d.status === 'Uploaded' || d.status === 'Validating'
    );
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      fetchDatasets();
    }, 4000);

    return () => clearInterval(interval);
  }, [datasets, fetchDatasets]);

  const handleUploadSuccess = (newDataset) => {
    setShowUploadModal(false);
    toast.success(`Dataset '${newDataset.name}' uploaded and profiled successfully.`);
    fetchDatasets();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await datasetService.deleteDataset(deleteTarget.id);
      toast.success(`Dataset '${deleteTarget.name}' deleted.`);
      setDeleteTarget(null);
      fetchDatasets();
    } catch (err) {
      toast.error(err.message || 'Failed to delete dataset');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Datasets & Ingestion</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {pagination.total} Total
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ingest public tabular datasets (Census, MGNREGA, Election) with deterministic data quality profiling.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchDatasets}
            title="Refresh list"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isAnalyst && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Dataset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search datasets by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
          <span className="text-slate-400 flex items-center space-x-1 font-medium text-[11px] uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </span>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Categories</option>
            <option value="Census">Census</option>
            <option value="MGNREGA">MGNREGA</option>
            <option value="Election">Election</option>
            <option value="Other">Other</option>
          </select>

          {/* Data Classification (Rule 4) */}
          <select
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
          >
            <option value="ALL">All Types (Real & Demo)</option>
            <option value="REAL">REAL</option>
            <option value="SYNTHETIC/DEMO">SYNTHETIC / DEMO</option>
            <option value="BENCHMARK">BENCHMARK</option>
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="Ready">Ready</option>
            <option value="Processing">Processing</option>
            <option value="Failed">Failed</option>
          </select>

          {(category !== 'ALL' || status !== 'ALL' || dataType !== 'ALL' || search) && (
            <button
              onClick={() => {
                setCategory('ALL');
                setStatus('ALL');
                setDataType('ALL');
                setSearch('');
              }}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline ml-auto font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content View */}
      {loading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} rows={3} />
            ))}
          </div>
        ) : (
          <SkeletonTable rows={6} cols={6} />
        )
      ) : datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No Datasets Found"
          description={
            search || category !== 'ALL' || status !== 'ALL'
              ? 'No datasets match your active filters. Try adjusting your query.'
              : 'No datasets have been ingested into the system yet.'
          }
          actionLabel={isAnalyst ? 'Upload First Dataset' : undefined}
          onAction={isAnalyst ? () => setShowUploadModal(true) : undefined}
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <DatasetCard
              key={dataset._id}
              dataset={dataset}
              canDelete={isAnalyst}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
            />
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Dataset Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Rows / Cols</th>
                  <th className="py-3 px-4">Quality Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {datasets.map((d) => (
                  <tr
                    key={d._id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white max-w-xs truncate">
                      <Link
                        to={`/datasets/${d._id}`}
                        className="hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {d.name}
                      </Link>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        Hash: {d.dataHash?.substring(0, 12)}...
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {d.category}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={d.dataType} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-200">
                      {d.rowCount ? d.rowCount.toLocaleString() : '—'} / {d.columnCount || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {d.qualityScore !== null && d.qualityScore !== undefined ? (
                        <span
                          className={`font-semibold ${
                            d.qualityScore >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : d.qualityScore >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {d.qualityScore}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={d.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <Link
                        to={`/datasets/${d._id}`}
                        className="inline-flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Inspect
                      </Link>
                      {isAnalyst && (
                        <button
                          onClick={() => setDeleteTarget({ id: d._id, name: d.name })}
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Server-Side Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs pt-3">
          <span className="text-slate-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} datasets)
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setPagination((prev) => ({
                  ...prev,
                  page: Math.min(prev.totalPages, prev.page + 1),
                }))
              }
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Upload Dataset Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Ingest Public Dataset"
        description="Upload Census, MGNREGA, or Election data for chunked profiling and quality report generation."
        maxWidth="lg"
      >
        <FileUploader
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUploadModal(false)}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Dataset Deletion"
        description="Are you sure you want to permanently delete this dataset?"
        maxWidth="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </>
        }
      >
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            You are about to delete <strong>{deleteTarget?.name}</strong>.
          </p>
          <p className="text-slate-400">
            This action removes the file from disk, deletes its Data Quality Report, and purges all related processing jobs. This action will be recorded in the audit trail.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default DatasetsPage;
