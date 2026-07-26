import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';

export default function AdminLayout() {
  return (
    <div className="min-h-screen relative md:pl-72 pt-16 md:pt-0">
      <AdminSidebar />
      <div className="p-4 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
