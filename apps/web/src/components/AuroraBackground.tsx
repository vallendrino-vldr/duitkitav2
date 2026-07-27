import { useKualitasVisual } from '../lib/useKualitasVisual';

/**
 * Latar aplikasi: aurora, objek 3D idle, kilau, dan partikel.
 *
 * KEPUTUSAN PENTING — kenapa radial-gradient, bukan filter blur:
 * Versi sebelumnya memakai tiga lingkaran ber-`filter: blur(90px)` YANG IKUT
 * BERGERAK. Blur sebesar itu harus dihitung ulang GPU setiap frame, dan pada
 * ponsel biayanya jauh melebihi anggaran 16 milidetik per frame — itulah sumber
 * utama rasa patah-patah saat menggulir. Radial-gradient menghasilkan tampilan
 * lembut yang praktis sama, tetapi digambar sekali sebagai tekstur dan setelah
 * itu hanya digeser. Hasilnya mulus tanpa mengurangi kemewahan tampilan.
 *
 * Semua animasi hanya menyentuh transform dan opacity, sehingga ditangani
 * GPU dan tidak pernah memaksa penataan ulang halaman.
 *
 * Kelas `ambient` menandai hiasan yang tetap bergerak walau sistem meminta
 * "kurangi gerak" (lihat index.css) — geraknya lambat dan tidak pernah
 * menuntut perhatian, sementara animasi fungsional tetap patuh.
 */

const KILAU = [
  { l: '12%', t: '18%', d: '0s', s: 10 },
  { l: '82%', t: '12%', d: '1.2s', s: 7 },
  { l: '68%', t: '32%', d: '2.4s', s: 12 },
  { l: '22%', t: '62%', d: '0.6s', s: 8 },
  { l: '88%', t: '58%', d: '3.1s', s: 9 },
  { l: '45%', t: '8%', d: '1.9s', s: 6 },
  { l: '8%', t: '42%', d: '2.8s', s: 7 },
  { l: '58%', t: '78%', d: '0.9s', s: 10 },
];

const PARTIKEL = [
  { l: '10%', d: '0s', dur: '15s', s: 3 },
  { l: '24%', d: '-4s', dur: '18s', s: 2 },
  { l: '38%', d: '-9s', dur: '13s', s: 4 },
  { l: '52%', d: '-2s', dur: '20s', s: 2 },
  { l: '66%', d: '-11s', dur: '16s', s: 3 },
  { l: '78%', d: '-6s', dur: '14s', s: 2 },
  { l: '92%', d: '-13s', dur: '19s', s: 3 },
];

/** Lingkaran cahaya lembut tanpa filter blur — hanya gradien. */
function Aurora({
  kelas, warna, delay,
}: { kelas: string; warna: string; delay?: string }) {
  return (
    <div
      className={`ambient absolute rounded-full animate-aurora-drift ${kelas}`}
      style={{
        background: `radial-gradient(circle at 50% 50%, ${warna} 0%, transparent 68%)`,
        animationDelay: delay,
      }}
    />
  );
}

export default function AuroraBackground() {
  const kualitas = useKualitasVisual();
  const hemat = kualitas === 'hemat';

  const jumlahCincin = hemat ? 5 : 9;
  const kilau = hemat ? KILAU.slice(0, 4) : KILAU;
  const partikel = hemat ? PARTIKEL.slice(0, 3) : PARTIKEL;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-asmr ambient-bg"
    >
      <Aurora kelas="-top-32 -left-28 w-[30rem] h-[30rem]" warna="rgba(20,184,166,0.45)" />
      <Aurora kelas="top-1/4 -right-32 w-[32rem] h-[32rem]" warna="rgba(147,51,234,0.42)" delay="-7s" />
      <Aurora kelas="-bottom-36 left-1/5 w-[28rem] h-[28rem]" warna="rgba(15,118,110,0.42)" delay="-14s" />

      {/* Cincin cahaya berputar. Masking cukup mahal, jadi hanya di perangkat kuat. */}
      {!hemat && (
        <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 w-[34rem] h-[34rem] opacity-40">
          <div
            className="ambient w-full h-full rounded-full animate-ring-sweep"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.35) 60deg, transparent 130deg, rgba(168,85,247,0.28) 220deg, transparent 300deg)',
              maskImage: 'radial-gradient(circle, transparent 56%, black 60%, black 66%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 56%, black 60%, black 66%, transparent 70%)',
            }}
          />
        </div>
      )}

      {/* Objek 3D idle: bola rangka berputar sambil melayang */}
      <div
        className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 opacity-90"
        style={{ perspective: '1100px' }}
      >
        <div className="ambient animate-coin-float">
          <div
            // Di perangkat lemah bolanya TIDAK berputar, hanya melayang.
            // Memutar ruang 3D memaksa GPU menyusun ulang seluruh tumpukan
            // cincin setiap frame, dan itu bagian termahal dari latar ini.
            // Dimatikan PERMANEN (bukan saat disentuh saja) supaya tidak pernah
            // ada peralihan yang terlihat sebagai kedipan — bolanya tetap
            // tampak sama mewahnya karena posisinya tetap miring dan bercahaya.
            className={`ambient relative w-[min(26rem,88vw)] aspect-square ${hemat ? '' : 'animate-coin-spin'}`}
            style={{
              transformStyle: 'preserve-3d',
              transform: hemat ? 'rotateX(18deg) rotateY(28deg)' : undefined,
            }}
          >
            {Array.from({ length: jumlahCincin }).map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border"
                style={{
                  transform: `rotateY(${(180 / jumlahCincin) * i}deg)`,
                  borderColor:
                    i % 3 === 0
                      ? 'rgba(94, 234, 212, 0.55)'
                      : i % 3 === 1
                        ? 'rgba(192, 132, 252, 0.42)'
                        : 'rgba(255, 255, 255, 0.20)',
                  // Bayangan bercahaya per cincin mahal saat berputar di ruang 3D;
                  // di perangkat hemat, warna garis saja sudah cukup meyakinkan.
                  boxShadow: !hemat && i % 3 === 0 ? '0 0 30px rgba(45, 212, 191, 0.30)' : undefined,
                }}
              />
            ))}
            <div
              className="absolute inset-[38%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.55) 0%, transparent 70%)' }}
            />
            <div
              className="absolute inset-[45%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, transparent 72%)' }}
            />
          </div>
        </div>
      </div>

      {kilau.map((k, i) => (
        <div
          key={`k${i}`}
          className="ambient absolute animate-twinkle"
          style={{
            left: k.l, top: k.t, width: k.s, height: k.s, animationDelay: k.d,
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(94,234,212,0.6) 40%, transparent 70%)',
            clipPath: 'polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)',
          }}
        />
      ))}

      {partikel.map((p, i) => (
        <div
          key={`p${i}`}
          className="ambient absolute bottom-0 rounded-full animate-float-up"
          style={{
            left: p.l, width: p.s, height: p.s,
            animationDelay: p.d, animationDuration: p.dur,
            background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 8px rgba(94,234,212,0.9)',
          }}
        />
      ))}

      {/* Butiran halus menghilangkan efek pita pada gradien besar. Mode pencampuran
          warna (mix-blend) memaksa GPU membaca ulang seluruh layar tiap frame,
          jadi di perangkat hemat butirannya ditumpuk biasa dengan opasitas rendah. */}
      <div
        className={`absolute inset-0 ${hemat ? 'opacity-[0.07]' : 'opacity-[0.15] mix-blend-overlay'}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(9,9,11,0.78)_100%)]" />
    </div>
  );
}
