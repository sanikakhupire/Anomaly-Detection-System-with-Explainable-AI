import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { datasetService } from '../services/datasetService';

const FileUploader = ({ onSuccess, onCancel }) => {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Census');
  const [dataType, setDataType] = useState('REAL');
  const [description, setDescription] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeJob, setActiveJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    if (!allowed.includes(ext)) {
      setErrorMessage(`Unsupported format '${ext}'. Please select a CSV or Excel (.xlsx, .xls) file.`);
      return;
    }

    if (selectedFile.size === 0) {
      setErrorMessage('The selected file is empty (0 bytes).');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage('The file exceeds the maximum allowed size of 50 MB.');
      return;
    }

    setFile(selectedFile);
    setErrorMessage('');
    if (!name) {
      setName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const startJobPolling = (jobId, createdDataset) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await datasetService.getJobStatus(jobId);
        if (res.success && res.data?.job) {
          const job = res.data.job;
          setJobStatus(job);

          if (job.status === 'COMPLETED') {
            clearInterval(pollTimerRef.current);
            setTimeout(() => {
              if (onSuccess) onSuccess(createdDataset, job);
            }, 1000);
          } else if (job.status === 'FAILED') {
            clearInterval(pollTimerRef.current);
            setErrorMessage(job.error?.message || 'Profiling job failed in ML engine.');
            setUploading(false);
          }
        }
      } catch (err) {
        console.error('Job polling error:', err);
      }
    }, 1500);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage('Please select a dataset file to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    formData.append('dataType', dataType);
    formData.append('description', description);

    try {
      const res = await datasetService.uploadDataset(formData, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentCompleted);
      });

      if (res.success && res.data) {
        const { dataset, job } = res.data;
        setActiveJob(job);
        setJobStatus(job);
        startJobPolling(job._id, dataset);
      }
    } catch (err) {
      setUploading(false);
      setErrorMessage(err.message || 'File upload failed');
    }
  };

  return (
    <div className="space-y-5">
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start space-x-2.5 text-xs text-rose-800 dark:text-rose-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Progress Screen During Profiling */}
      {uploading && (
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-4 text-center">
          <div className="flex justify-center">
            {jobStatus?.status === 'COMPLETED' ? (
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 flex items-center justify-center animate-spin">
                <Loader2 className="w-7 h-7" />
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {jobStatus?.status === 'COMPLETED'
                ? 'Dataset Profiling Completed!'
                : uploadProgress < 100
                ? 'Uploading File to Secure Storage...'
                : 'Profiling Dataset Schema & Quality Metrics...'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {jobStatus?.step || `${uploadProgress}% uploaded to server.`}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-brand-600 h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${
                  uploadProgress < 100
                    ? uploadProgress * 0.4
                    : jobStatus
                    ? jobStatus.progress
                    : 50
                }%`,
              }}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Streaming in memory-friendly chunks. SHA-256 integrity hash is being verified.
          </p>
        </div>
      )}

      {/* Upload Form */}
      {!uploading && (
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {/* File Dropzone */}
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Click to browse or drag and drop dataset file
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supported formats: <strong>CSV, XLSX, XLS</strong> (Max size: 50 MB)
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs">
                    {file.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for analysis
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Dataset Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Census 2021 District Demographics"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
              >
                <option value="Census">Census (Demographic & Population)</option>
                <option value="MGNREGA">MGNREGA (Wages, Attendance, Workdays)</option>
                <option value="Election">Election (Turnout, Votes, Margins)</option>
                <option value="Other">Other Public Dataset</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Classification (Hard Rule 4) *
              </label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
              >
                <option value="REAL">REAL (Observed Public Record)</option>
                <option value="SYNTHETIC/DEMO">SYNTHETIC/DEMO (Generated with ground truth)</option>
                <option value="BENCHMARK">BENCHMARK (Standard labeled evaluation dataset)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of source, period, or jurisdiction"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!file}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              Upload & Generate Quality Report
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FileUploader;
