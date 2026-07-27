import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './pages/Login';
import Register from './pages/Register';

import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AuroraBackground from './components/AuroraBackground';
import InstallPWA from './components/InstallPWA';
import { AuthProvider } from './lib/AuthProvider';

import Dashboard from './pages/Dashboard';
import Add from './pages/Add';
import Savings from './pages/Savings';
import Debts from './pages/Debts';
import Settings from './pages/Settings';
import FullScreenLoader from './components/FullScreenLoader';

// Halaman admin dimuat hanya saat dibuka. Sebagian besar pengguna bukan admin,
// jadi tidak perlu ikut mengunduh kodenya saat pertama membuka aplikasi.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminStorage = lazy(() => import('./pages/AdminStorage'));

// Halaman fitur lanjutan juga dimuat saat dibuka saja: tidak semua orang
// memakainya tiap hari, dan menahannya di luar bundel awal menjaga waktu
// buka pertama tetap ringan.
const Transfer = lazy(() => import('./pages/Transfer'));
const Receipts = lazy(() => import('./pages/Receipts'));
const Budget = lazy(() => import('./pages/Budget'));
const Recurring = lazy(() => import('./pages/Recurring'));
const Reports = lazy(() => import('./pages/Reports'));
const Preferences = lazy(() => import('./pages/Preferences'));

/** Pembungkus agar tiap halaman malas punya layar tunggu yang konsisten. */
function Malas({ children, label }: { children: React.ReactNode; label: string }) {
  return <Suspense fallback={<FullScreenLoader label={label} />}>{children}</Suspense>;
}

/** Bingkai ponsel untuk halaman masuk/daftar (bisa digulir di layar pendek). */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-y-auto no-scrollbar">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuroraBackground />
      <InstallPWA />

      {/* Wadah lebar-ponsel TIDAK lagi dipasang di sini. Dulu semua rute dijepit
          max-w-md, termasuk panel admin — jadi tabel admin ikut terhimpit selebar
          ponsel walau dibuka di layar laptop. Sekarang tiap layout mengatur
          lebarnya sendiri. */}
      {/* future flags: mengaktifkan perilaku React Router v7 lebih awal sekaligus
          menghilangkan peringatan deprecation di console. */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3500,
              style: {
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(12px)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '1rem',
                fontSize: '0.875rem',
                maxWidth: '90vw',
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<AuthShell><Login /></AuthShell>} />
            <Route path="/register" element={<AuthShell><Register /></AuthShell>} />

            {/* Rute pengguna */}
            <Route element={<ProtectedRoute allowedRole="user"><UserLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/debts" element={<Debts />} />
              <Route path="/add" element={<Add />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/transfer" element={<Malas label="Memuat transfer…"><Transfer /></Malas>} />
              <Route path="/receipts" element={<Malas label="Memuat galeri struk…"><Receipts /></Malas>} />
              <Route path="/budget" element={<Malas label="Memuat anggaran…"><Budget /></Malas>} />
              <Route path="/recurring" element={<Malas label="Memuat transaksi berulang…"><Recurring /></Malas>} />
              <Route path="/reports" element={<Malas label="Memuat laporan…"><Reports /></Malas>} />
              <Route path="/preferences" element={<Malas label="Memuat preferensi…"><Preferences /></Malas>} />
            </Route>

            {/* Rute admin */}
            <Route element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<Malas label="Memuat panel admin…"><AdminDashboard /></Malas>} />
              <Route path="/admin/users" element={<Malas label="Memuat pengguna…"><AdminUsers /></Malas>} />
              <Route path="/admin/storage" element={<Malas label="Memuat penyimpanan…"><AdminStorage /></Malas>} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}
