import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DatasetsPage from './pages/DatasetsPage';
import DatasetDetailPage from './pages/DatasetDetailPage';
import AnomaliesPage from './pages/AnomaliesPage';
import ReviewsPage from './pages/ReviewsPage';
import ModelsPage from './pages/ModelsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import FeaturesPage from './pages/FeaturesPage';
import PeerGroupsPage from './pages/PeerGroupsPage';
import ForensicsPage from './pages/ForensicsPage';
import FusionPage from './pages/FusionPage';
import ExplainabilityPage from './pages/ExplainabilityPage';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Application Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="datasets" element={<DatasetsPage />} />
                <Route path="datasets/:id" element={<DatasetDetailPage />} />
                <Route path="features" element={<FeaturesPage />} />
                <Route path="peer-groups" element={<PeerGroupsPage />} />
                <Route path="forensics" element={<ForensicsPage />} />
                <Route path="fusion" element={<FusionPage />} />
                <Route path="anomalies" element={<AnomaliesPage />} />
                <Route path="explainability" element={<ExplainabilityPage />} />
                <Route path="reviews" element={<ReviewsPage />} />
                <Route path="models" element={<ModelsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
