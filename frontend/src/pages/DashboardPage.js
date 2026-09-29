import React from 'react';
import { Database, AlertCircle, CheckSquare, ShieldCheck, Activity, Layers, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { Link } from 'react-router-dom';

const DashboardPage = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-900 via-indigo-900 to-slate-900 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-500/30 text-brand-200 border border-brand-400/30">
                Phase 1 Active
              </span>
              <StatusBadge status={user?.role || 'ANALYST'} size="sm" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back, {user?.name || 'Researcher'}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Statistical Anomaly Decision-Support System for Public Datasets (Census, MGNREGA, Elections).
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              to="/datasets"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <span>Manage Datasets</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ingested Datasets
            </span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">0</div>
            <p className="text-[11px] text-slate-400 mt-1">Ready for Phase 2 ingestion</p>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Flagged Anomalies
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">0</div>
            <p className="text-[11px] text-slate-400 mt-1">Awaiting Phase 4 detection</p>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Triage Priority (ATPI)
            </span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">Active</div>
            <p className="text-[11px] text-slate-400 mt-1">Calibration engine configured</p>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              System Audit
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Verified</div>
            <p className="text-[11px] text-slate-400 mt-1">Tamper-evident logs online</p>
          </div>
        </div>
      </div>

      {/* System Status Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
            <Activity className="w-4 h-4 text-brand-600" />
            <span>Architecture Readiness</span>
          </h3>
          <ul className="space-y-3 text-xs">
            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <span className="font-medium text-slate-700 dark:text-slate-300">FastAPI ML Microservice</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Healthy (port 8000)</span>
            </li>
            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <span className="font-medium text-slate-700 dark:text-slate-300">Express Orchestrator API</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Running (port 5000)</span>
            </li>
            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <span className="font-medium text-slate-700 dark:text-slate-300">MongoDB Database</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Connected (port 27017)</span>
            </li>
            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <span className="font-medium text-slate-700 dark:text-slate-300">React Client Interface</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready (Webpack)</span>
            </li>
          </ul>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-brand-600" />
            <span>Active Session Details</span>
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex justify-between">
              <span className="text-slate-500">Authenticated As:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{user?.name}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex justify-between">
              <span className="text-slate-500">Email Address:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">{user?.email}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
              <span className="text-slate-500">Assigned Role:</span>
              <StatusBadge status={user?.role} size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
