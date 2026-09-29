import React, { useState } from 'react';
import { Settings, Shield, Key, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const SettingsPage = () => {
  const { user } = useAuth();
  const [testResults, setTestResults] = useState({});
  const [loadingEndpoint, setLoadingEndpoint] = useState(null);

  const testEndpoint = async (roleType, serviceFn) => {
    setLoadingEndpoint(roleType);
    try {
      const res = await serviceFn();
      setTestResults((prev) => ({
        ...prev,
        [roleType]: {
          status: 200,
          success: true,
          message: res.message || 'Access Granted',
          data: res.data,
        },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [roleType]: {
          status: 403,
          success: false,
          message: err.message || '403 Forbidden',
          error: err.error,
        },
      }));
    } finally {
      setLoadingEndpoint(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          System Settings & RBAC Verification
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Role-Based Access Control (RBAC) diagnostics and live permission testing.
        </p>
      </div>

      {/* Current User Role Summary */}
      <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Active Session Privileges
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Logged in as <strong>{user?.name}</strong> ({user?.email})
              </p>
            </div>
          </div>
          <StatusBadge status={user?.role} size="md" />
        </div>
      </div>

      {/* Interactive RBAC Verification Tester */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Key className="w-4 h-4 text-brand-600" />
            <span>Live RBAC Endpoint Verification</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Test how the backend Express role authorization middleware responds to your current JWT token.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Admin Test */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ADMIN Only
                </span>
                <StatusBadge status="ADMIN" size="sm" />
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Target: <code>/api/auth/admin-only</code>
              </p>
            </div>
            <button
              onClick={() => testEndpoint('ADMIN', authService.checkAdminAccess)}
              disabled={loadingEndpoint === 'ADMIN'}
              className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {loadingEndpoint === 'ADMIN' ? 'Testing...' : 'Test Admin Route'}
            </button>
          </div>

          {/* Analyst Test */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ANALYST & ADMIN
                </span>
                <StatusBadge status="ANALYST" size="sm" />
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Target: <code>/api/auth/analyst-only</code>
              </p>
            </div>
            <button
              onClick={() => testEndpoint('ANALYST', authService.checkAnalystAccess)}
              disabled={loadingEndpoint === 'ANALYST'}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {loadingEndpoint === 'ANALYST' ? 'Testing...' : 'Test Analyst Route'}
            </button>
          </div>

          {/* Reviewer Test */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  REVIEWER & ADMIN
                </span>
                <StatusBadge status="REVIEWER" size="sm" />
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Target: <code>/api/auth/reviewer-only</code>
              </p>
            </div>
            <button
              onClick={() => testEndpoint('REVIEWER', authService.checkReviewerAccess)}
              disabled={loadingEndpoint === 'REVIEWER'}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {loadingEndpoint === 'REVIEWER' ? 'Testing...' : 'Test Reviewer Route'}
            </button>
          </div>
        </div>

        {/* Results Stream */}
        {Object.keys(testResults).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Live Probe Responses:
            </h4>
            {Object.entries(testResults).map(([key, res]) => (
              <div
                key={key}
                className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                  res.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                {res.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold">
                    {key} Probe: HTTP {res.status} ({res.success ? 'Allowed' : 'Denied'})
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5">{res.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
