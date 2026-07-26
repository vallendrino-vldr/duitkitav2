import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

interface OpsiLive {
  /** Selang muat-ulang berkala, milidetik. 0 = mati. */
  intervalMs?: number;
  /** Tabel yang dipantau lewat Realtime; perubahan memicu muat ulang. */
  tables?: string[];
  /** Kunci unik kanal realtime. */
  channel?: string;
}

/**
 * Data yang selalu segar: gabungan Realtime (reaktif) + polling (jaring pengaman).
 *
 * Realtime saja tidak cukup untuk monitor penyimpanan — ukuran file hidup di
 * Storage, bukan di tabel database, jadi tidak ada event yang bisa didengarkan.
 * Realtime saja juga rapuh kalau koneksi WebSocket putus diam-diam.
 */
export function useLiveData<T>(
  fetcher: () => Promise<T>,
  { intervalMs = 0, tables = [], channel = 'live' }: OpsiLive = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetcher disimpan di ref supaya efek di bawah tidak ikut dijalankan ulang
  // setiap render hanya karena fungsinya dibuat baru.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const aktifRef = useRef(true);

  const refresh = useCallback(async (diam = false) => {
    if (!diam) setLoading(true);
    try {
      const hasil = await fetcherRef.current();
      if (!aktifRef.current) return;
      setData(hasil);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (!aktifRef.current) return;
      console.error('[LIVE] gagal memuat', e);
      setError(e?.response?.data?.error || e?.message || 'Gagal memuat data');
    } finally {
      if (aktifRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aktifRef.current = true;
    void refresh();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        // Jangan boros memanggil server saat tab tidak dilihat.
        if (typeof document !== 'undefined' && document.hidden) return;
        void refresh(true);
      }, intervalMs);
    }

    let ch: ReturnType<typeof supabase.channel> | undefined;
    if (tables.length > 0) {
      ch = supabase.channel(channel);
      for (const table of tables) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          void refresh(true);
        });
      }
      ch.subscribe();
    }

    return () => {
      aktifRef.current = false;
      if (timer) clearInterval(timer);
      if (ch) void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, channel, tables.join(','), refresh]);

  return { data, loading, error, refresh, lastUpdated };
}
