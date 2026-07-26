import { Outlet } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import SideNav from '../components/SideNav';

/**
 * Cangkang aplikasi yang menyesuaikan lebar layar.
 *
 * Ponsel  : satu kolom penuh + dock bawah (jempol menjangkau bawah).
 * Laptop  : navigasi sisi kiri + area isi lebar, dock disembunyikan.
 *
 * Sebelumnya semuanya dipaksa `max-w-md` — di laptop hasilnya kolom sempit
 * selebar ponsel yang mengambang di tengah layar lebar, dengan dock melayang
 * di tengah. Itulah "tampilan aneh" yang terlihat saat dibuka di laptop.
 */
export default function UserLayout() {
  return (
    <div className="flex h-[100dvh] overflow-hidden text-white">
      <SideNav />

      <div className="flex-1 relative flex flex-col min-w-0">
        {/* pb-dock hanya di ponsel; di laptop tidak ada dock yang perlu dihindari. */}
        <div className="flex-1 overflow-y-auto no-scrollbar md:thin-scrollbar pb-dock md:pb-8">
          <Outlet />
        </div>

        {/* Dock hanya muncul di layar kecil. */}
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
