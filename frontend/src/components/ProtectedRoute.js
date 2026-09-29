import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { SkeletonCard } from './LoadingSkeleton';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <SkeletonCard rows={4} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          403 - Access Restricted
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">
          Your current role (<strong>{user?.role}</strong>) does not have sufficient clearance to access this module. Contact an administrator if you require access.
        </p>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
