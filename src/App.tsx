import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { FullPageSpinner } from './components/ui';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CardPage from './pages/CardPage';
import CustomersPage from './pages/CustomersPage';
import ScannerPage from './pages/ScannerPage';
import InstallPage from './pages/InstallPage';
import WebCardPage from './pages/WebCardPage';

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;

  return (
    <Routes>
      {/* Public: what the business' customers see */}
      <Route path="/t/:code" element={<InstallPage />} />
      <Route path="/c/:token" element={<WebCardPage />} />

      {/* Business panel */}
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/registro" element={session ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route element={session ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tarjeta" element={<CardPage />} />
        <Route path="/clientes" element={<CustomersPage />} />
        <Route path="/escanear" element={<ScannerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
