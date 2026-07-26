/**
 * Latar belakang aplikasi: gradien ASMR, cahaya aurora, objek 3D idle,
 * partikel kilau, dan cincin cahaya berputar.
 *
 * Semuanya dibuat dengan CSS transform 3D asli — tanpa pustaka 3D. WebGL akan
 * menambah ratusan KB dan menyalakan GPU terus-menerus; untuk hiasan latar,
 * biayanya tidak sepadan. Setiap animasi di sini hanya menyentuh `transform`
 * dan `opacity` sehingga diproses GPU dan tidak memaksa browser menghitung
 * ulang tata letak halaman tiap frame.
 *
 * Kelas dengan awalan `ambient-` sengaja dikecualikan dari aturan
 * prefers-reduced-motion (lihat index.css): geraknya sangat lambat dan murni
 * dekoratif, sementara seluruh animasi fungsional tetap mematuhi setelan itu.
 */

const JUMLAH_CINCIN = 9;

/** Posisi kilau ditulis tetap, bukan acak, supaya tidak berubah tiap render. */
const KILAU = [
  { l: '12%', t: '18%', d: '0s',   s: 10 },
  { l: '82%', t: '12%', d: '1.2s', s: 7 },
  { l: '68%', t: '32%', d: '2.4s', s: 12 },
  { l: '22%', t: '62%', d: '0.6s', s: 8 },
  { l: '88%', t: '58%', d: '3.1s', s: 9 },
  { l: '45%', t: '8%',  d: '1.9s', s: 6 },
  { l: '8%',  t: '42%', d: '2.8s', s: 7 },
  { l: '58%', t: '78%', d: '0.9s', s: 10 },
];

/** Partikel debu cahaya yang naik pelan. */
const PARTIKEL = [
  { l: '10%', d: '0s',   dur: '15s', s: 3 },
  { l: '24%', d: '-4s',  dur: '18s', s: 2 },
  { l: '38%', d: '-9s',  dur: '13s', s: 4 },
  { l: '52%', d: '-2s',  dur: '20s', s: 2 },
  { l: '66%', d: '-11s', dur: '16s', s: 3 },
  { l: '78%', d: '-6s',  dur: '14s', s: 2 },
  { l: '92%', d: '-13s', dur: '19s', s: 3 },
];

export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-asmr ambient-bg"
    >
      {/* Cahaya aurora yang menghanyut pelan */}
      <div className="ambient absolute -top-24 -left-20 w-[22rem] h-[22rem] rounded-full bg-brand-500/25 blur-[90px] animate-aurora-drift" />
      <div className="ambient absolute top-1/3 -right-24 w-[24rem] h-[24rem] rounded-full bg-accent-600/25 blur-[100px] animate-aurora-drift" style={{ animationDelay: '-7s' }} />
      <div className="ambient absolute -bottom-28 left-1/4 w-[20rem] h-[20rem] rounded-full bg-brand-700/25 blur-[90px] animate-aurora-drift" style={{ animationDelay: '-14s' }} />

      {/* Cincin cahaya besar yang berputar di belakang objek utama */}
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

      {/* Objek 3D idle: bola rangka berputar sambil melayang */}
      <div
        className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 opacity-90"
        style={{ perspective: '1100px' }}
      >
        <div className="ambient animate-coin-float">
          <div
            className="ambient relative w-[26rem] h-[26rem] animate-coin-spin"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {Array.from({ length: JUMLAH_CINCIN }).map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border"
                style={{
                  transform: `rotateY(${(180 / JUMLAH_CINCIN) * i}deg)`,
                  borderColor:
                    i % 3 === 0
                      ? 'rgba(94, 234, 212, 0.55)'
                      : i % 3 === 1
                        ? 'rgba(192, 132, 252, 0.42)'
                        : 'rgba(255, 255, 255, 0.20)',
                  boxShadow: i % 3 === 0 ? '0 0 30px rgba(45, 212, 191, 0.30)' : undefined,
                }}
              />
            ))}
            <div className="absolute inset-[38%] rounded-full bg-brand-400/25 blur-2xl" />
            <div className="absolute inset-[45%] rounded-full bg-white/70 blur-md" />
          </div>
        </div>
      </div>

      {/* Kilau berkelip — bentuk bintang empat sudut, bukan titik bulat biasa */}
      {KILAU.map((k, i) => (
        <div
          key={`k${i}`}
          className="ambient absolute animate-twinkle"
          style={{
            left: k.l,
            top: k.t,
            width: k.s,
            height: k.s,
            animationDelay: k.d,
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(94,234,212,0.6) 40%, transparent 70%)',
            clipPath: 'polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)',
          }}
        />
      ))}

      {/* Debu cahaya yang melayang naik */}
      {PARTIKEL.map((p, i) => (
        <div
          key={`p${i}`}
          className="ambient absolute bottom-0 rounded-full animate-float-up"
          style={{
            left: p.l,
            width: p.s,
            height: p.s,
            animationDelay: p.d,
            animationDuration: p.dur,
            background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 8px rgba(94,234,212,0.9)',
          }}
        />
      ))}

      {/* Butiran halus: menghilangkan efek "pita" pada gradien besar dan memberi
          kesan bertekstur, bukan warna datar seperti aplikasi murah. */}
      <div
        className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Vignette: menggelapkan tepi supaya teks di atasnya tetap terbaca */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(9,9,11,0.78)_100%)]" />
    </div>
  );
}
