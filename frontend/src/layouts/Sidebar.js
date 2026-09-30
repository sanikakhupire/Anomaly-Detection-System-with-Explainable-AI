import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  AlertCircle,
  CheckSquare,
  Cpu,
  FileText,
  Settings,
  ShieldCheck,
  ChevronRight,
  Layers,
  Users,
  FileSearch,
  GitMerge,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const navigationItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Datasets', path: '/datasets', icon: Database },
  { name: 'Features', path: '/features', icon: Layers },
  { name: 'Peer Groups', path: '/peer-groups', icon: Users },
  { name: 'Forensics (C3)', path: '/forensics', icon: FileSearch },
  { name: 'Data Fusion', path: '/fusion', icon: GitMerge },
  { name: 'Anomalies', path: '/anomalies', icon: AlertCircle },
  { name: 'Explainability (C4)', path: '/explainability', icon: Sparkles },
  { name: 'Review Queue', path: '/reviews', icon: CheckSquare },
  { name: 'Model & Config', path: '/models', icon: Cpu },
  { name: 'Reports & Audits', path: '/reports', icon: FileText },
  { name: 'Experiment Lab (C9)', path: '/lab', icon: FlaskConical },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const Sidebar = () => {
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-800/95 border-r border-slate-200 dark:border-slate-700/60 shadow-xs select-none">
      {/* Platform Branding */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-slate-900 dark:text-white leading-none">
              StatAnomaly
            </h1>
            <span className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold tracking-wider uppercase">
              Decision Support
            </span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Core Modules
        </div>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center space-x-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive
                          ? 'text-brand-600 dark:text-brand-400'
                          : 'text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-brand-500" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Information & Role Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {user?.name || 'Authorized User'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
          <StatusBadge status={user?.role || 'ANALYST'} size="sm" />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
