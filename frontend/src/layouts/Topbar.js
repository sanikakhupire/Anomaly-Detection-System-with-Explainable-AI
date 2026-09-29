import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Sun, Moon, LogOut, User, ShieldCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const routeTitles = {
  '/dashboard': 'Platform Overview',
  '/datasets': 'Datasets & Ingestion',
  '/anomalies': 'Detected Statistical Anomalies',
  '/reviews': 'Human Review Queue',
  '/models': 'Detectors & Calibration Models',
  '/reports': 'Audit Trail & Compliance Reports',
  '/settings': 'System Settings & Access Control',
  '/profile': 'User Profile & Credentials',
};

const Topbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const toast = useToast();

  const currentTitle = routeTitles[location.pathname] || 'Decision Support';

  const handleLogout = async () => {
    try {
      await logout();
      toast.info('You have been logged out safely.');
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700/60 px-6 flex items-center justify-between shadow-2xs z-20">
      {/* Title & Context */}
      <div className="flex items-center space-x-3">
        {/* Mobile branding icon */}
        <div className="md:hidden w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {currentTitle}
          </h2>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Decision-support for statistical anomalies in public data
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center space-x-3">
        {/* Dark/Light Toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Profile Link */}
        <Link
          to="/profile"
          className="flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <User className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
          <span className="hidden sm:inline">{user?.name?.split(' ')[0] || 'Profile'}</span>
        </Link>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title="Sign out of system"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
