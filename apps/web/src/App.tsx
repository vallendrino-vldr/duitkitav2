import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './pages/Login';
import Register from './pages/Register';

import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';

import Dashboard from './pages/Dashboard';
import Add from './pages/Add';
import Savings from './pages/Savings';
import Debts from './pages/Debts';
import AdminDashboard from './pages/AdminDashboard';

// Placeholder Pages
const Settings = () => <div className="p-6 text-white text-2xl font-bold">Settings</div>;

function App() {
  return (
    <BrowserRouter>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }
        }}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* User Routes */}
        <Route element={<ProtectedRoute allowedRole="user"><UserLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/add" element={<Add />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Admin Routes */}
        <Route element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<div className="text-white">Users</div>} />
          <Route path="/admin/storage" element={<div className="text-white">Storage</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
