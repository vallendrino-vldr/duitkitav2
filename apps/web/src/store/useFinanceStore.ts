import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { safeMutate, PROFILE_COLUMNS } from '../lib/db';

export interface Wallet {
  id: string;
  user_id?: string;
  name: string;
  balance: number;
  initial_balance?: number;
}

export interface Transaction {
  id: string;
  user_id?: string;
  wallet_id: string;
  to_wallet_id?: string | null;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category?: string | null;
  title: string;
  receipt_url?: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

interface OfflineAction {
  id: string;
  action: 'add_transaction';
  payload: Transaction;
  timestamp: number;
}

interface FinanceState {
  /** Pemilik cache ini. Dipakai untuk mencegah data user lama bocor ke user baru. */
  ownerId: string | null;

  /** `null` berarti BELUM PERNAH dimuat. Array (termasuk kosong) berarti sudah dimuat. */
  wallets: Wallet[] | null;
  transactions: Transaction[] | null;
  profile: Profile | null;
  offlineQueue: OfflineAction[];

  isLoadingWallets: boolean;
  isLoadingTransactions: boolean;
  lastError: string | null;

  setWallets: (wallets: Wallet[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setProfile: (profile: Profile | null) => void;

  /** Panggil setelah sesi diketahui. Membuang cache bila pemiliknya berbeda. */
  adoptUser: (userId: string | null) => void;
  clearStore: () => void;

  fetchWallets: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  refreshAll: () => Promise<void>;

  enqueueOffline: (transaction: Transaction) => void;
  syncOfflineQueue: () => Promise<void>;
}

type DataKosong = Pick<
  FinanceState,
  'wallets' | 'transactions' | 'profile' | 'offlineQueue'
  | 'isLoadingWallets' | 'isLoadingTransactions' | 'lastError'
>;

const kosong = (): DataKosong => ({
  wallets: null,
  transactions: null,
  profile: null,
  offlineQueue: [],
  isLoadingWallets: false,
  isLoadingTransactions: false,
  lastError: null,
});

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ...kosong(),

      setWallets: (wallets) => set({ wallets }),
      setTransactions: (transactions) => set({ transactions }),
      setProfile: (profile) => set({ profile }),

      adoptUser: (userId) => {
        const { ownerId } = get();
        if (ownerId === userId) return;
        // User berbeda (atau logout): buang cache lama sepenuhnya.
        set({ ownerId: userId, ...kosong() });
      },

      clearStore: () => set({ ownerId: null, ...kosong() }),

      fetchWallets: async () => {
        set({ isLoadingWallets: true });
        try {
          const uid = await currentUserId();
          if (!uid) {
            set({ wallets: [], isLoadingWallets: false });
            return;
          }
          const data = await safeMutate<Wallet[]>(
            supabase
              .from('wallets')
              .select('id, user_id, name, balance, initial_balance')
              .eq('user_id', uid)
              .order('created_at', { ascending: true }),
            'Gagal memuat dompet',
          );
          set({ wallets: data ?? [], lastError: null });
        } catch (e) {
          console.error('[STORE] fetchWallets', e);
          // Selalu berakhir dengan array agar UI tidak pernah menggantung di loading.
          set({ wallets: get().wallets ?? [], lastError: (e as Error).message });
        } finally {
          set({ isLoadingWallets: false });
        }
      },

      fetchTransactions: async () => {
        set({ isLoadingTransactions: true });
        try {
          const uid = await currentUserId();
          if (!uid) {
            set({ transactions: [], isLoadingTransactions: false });
            return;
          }
          const data = await safeMutate<Transaction[]>(
            supabase
              .from('transactions')
              .select('*')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
              .limit(100),
            'Gagal memuat transaksi',
          );
          set({ transactions: data ?? [], lastError: null });
        } catch (e) {
          console.error('[STORE] fetchTransactions', e);
          set({ transactions: get().transactions ?? [], lastError: (e as Error).message });
        } finally {
          set({ isLoadingTransactions: false });
        }
      },

      fetchProfile: async () => {
        try {
          const uid = await currentUserId();
          if (!uid) {
            set({ profile: null });
            return;
          }
          const rows = await safeMutate<Profile[]>(
            // PROFILE_COLUMNS wajib: `select('*')` ditolak database sejak PIN dikunci.
            supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).limit(1),
            'Gagal memuat profil',
          );
          set({ profile: rows?.[0] ?? null });
        } catch (e) {
          console.error('[STORE] fetchProfile', e);
        }
      },

      refreshAll: async () => {
        await Promise.allSettled([
          get().fetchProfile(),
          get().fetchWallets(),
          get().fetchTransactions(),
        ]);
      },

      enqueueOffline: (transaction) => {
        set((state) => ({
          transactions: [transaction, ...(state.transactions ?? [])],
          offlineQueue: [
            ...state.offlineQueue,
            {
              id: transaction.id,
              action: 'add_transaction',
              payload: transaction,
              timestamp: Date.now(),
            },
          ],
        }));
      },

      syncOfflineQueue: async () => {
        const { offlineQueue } = get();
        if (offlineQueue.length === 0) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const tersisa: OfflineAction[] = [];
        for (const item of offlineQueue) {
          try {
            // upsert by id -> aman diulang, tidak menghasilkan duplikat.
            await safeMutate(
              supabase
                .from('transactions')
                .upsert(item.payload, { onConflict: 'id', ignoreDuplicates: true }),
              'Gagal sinkronisasi transaksi',
            );
          } catch (e) {
            console.error('[SYNC] item dipertahankan untuk dicoba lagi:', item.id, e);
            tersisa.push(item);
          }
        }

        // Hanya item yang benar-benar berhasil yang dibuang.
        set({ offlineQueue: tersisa });
        if (tersisa.length === 0) await get().fetchWallets();
      },
    }),
    {
      name: 'duitkita-finance-storage',
      version: 2,
      // Flag loading TIDAK PERNAH dipersist — dulu `isLoadingWallets: true`
      // ikut tersimpan lalu direhidrasi, membuat spinner dasbor macet selamanya.
      partialize: (state) => ({
        ownerId: state.ownerId,
        wallets: state.wallets,
        transactions: state.transactions,
        profile: state.profile,
        offlineQueue: state.offlineQueue,
      }),
      migrate: () => ({ ownerId: null, ...kosong() }) as any,
    },
  ),
);

// Membuang cache begitu sesi berakhir atau berganti user — mencegah state bleed
// tanpa bergantung pada tombol logout di halaman Pengaturan.
supabase.auth.onAuthStateChange((event, session) => {
  const store = useFinanceStore.getState();
  if (event === 'SIGNED_OUT' || !session) {
    store.clearStore();
  } else {
    store.adoptUser(session.user.id);
  }
});
