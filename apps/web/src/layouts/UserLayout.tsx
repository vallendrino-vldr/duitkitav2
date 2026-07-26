import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

export default function UserLayout() {
  return (
    <div className="min-h-screen relative pb-24">
      <Outlet />
      <BottomNav />
    </div>
  );
}
