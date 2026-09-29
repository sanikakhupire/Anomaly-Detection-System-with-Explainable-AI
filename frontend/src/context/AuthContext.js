import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('ad_auth_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('ad_user_info');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Initialize and verify authentication state on mount
  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      const storedToken = localStorage.getItem('ad_auth_token');
      if (storedToken) {
        try {
          const res = await authService.getMe();
          if (mounted && res.success && res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('ad_user_info', JSON.stringify(res.data.user));
          }
        } catch (err) {
          if (mounted) {
            localStorage.removeItem('ad_auth_token');
            localStorage.removeItem('ad_user_info');
            setToken(null);
            setUser(null);
          }
        }
      }
      if (mounted) setLoading(false);
    };

    initAuth();

    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      mounted = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    if (res.success && res.data) {
      const { user: loggedInUser, token: authToken } = res.data;
      localStorage.setItem('ad_auth_token', authToken);
      localStorage.setItem('ad_user_info', JSON.stringify(loggedInUser));
      setToken(authToken);
      setUser(loggedInUser);
      return loggedInUser;
    }
    throw new Error(res.message || 'Login failed');
  }, []);

  const register = useCallback(async (userData) => {
    const res = await authService.register(userData);
    if (res.success && res.data) {
      const { user: registeredUser, token: authToken } = res.data;
      localStorage.setItem('ad_auth_token', authToken);
      localStorage.setItem('ad_user_info', JSON.stringify(registeredUser));
      setToken(authToken);
      setUser(registeredUser);
      return registeredUser;
    }
    throw new Error(res.message || 'Registration failed');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('ad_auth_token');
      localStorage.removeItem('ad_user_info');
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = {
    user,
    token,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'ADMIN',
    isAnalyst: user?.role === 'ANALYST' || user?.role === 'ADMIN',
    isReviewer: user?.role === 'REVIEWER' || user?.role === 'ADMIN',
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
