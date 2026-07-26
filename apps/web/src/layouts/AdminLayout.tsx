import { Outlet } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';

export default function AdminLayout() {
  return (
    // Lebar penuh: panel admin butuh ruang untuk tabel, tidak dijepit lebar ponsel.
    <div className="h-[100dvh] overflow-y-auto thin-scrollbar text-white">
      <AdminSidebar />
      <main className="md:pl-72 pt-20 md:pt-0">
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
