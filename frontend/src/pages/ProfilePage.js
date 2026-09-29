import React from 'react';
import { User, Shield, Mail, Calendar, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const ProfilePage = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          User Profile
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Account details and cryptographic session credentials.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs overflow-hidden">
        {/* Profile Card Header */}
        <div className="p-6 bg-gradient-to-r from-brand-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {user?.name || 'Authorized User'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            <div className="mt-2">
              <StatusBadge status={user?.role} size="sm" />
            </div>
          </div>
        </div>

        {/* Profile Details List */}
        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-3 text-xs">
            <Mail className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 w-28">Email Address:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{user?.email}</span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <Shield className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 w-28">Assigned Role:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{user?.role}</span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 w-28">Account ID:</span>
            <span className="font-mono text-slate-600 dark:text-slate-400">{user?._id || user?.id || 'Active'}</span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <Key className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 w-28">Session Token:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Active JWT (HMAC-SHA256)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
