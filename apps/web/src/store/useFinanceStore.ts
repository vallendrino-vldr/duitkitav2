import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Wallet {
  id: string;
  name: string;
  balance: number;
}

interface Transaction {
  id: string;
  wallet_id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category?: string;
  title: string;
  receipt_url?: string;
  created_at: string;
}

interface OfflineAction {
  id: string;
  action: 'add_transaction' | 'update_wallet' | 'add_debt';
  payload: any;
  timestamp: number;
}

interface FinanceState {
  wallets: Wallet[];
  transactions: Transaction[];
  offlineQueue: OfflineAction[];
  setWallets: (wallets: Wallet[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  addTransactionOffline: (transaction: Transaction) => void;
  syncOfflineQueue: () => Promise<void>;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      wallets: [],
      transactions: [],
      offlineQueue: [],
      
      setWallets: (wallets) => set({ wallets }),
      
      setTransactions: (transactions) => set({ transactions }),
      
      addTransactionOffline: (transaction) => {
        set((state) => ({
          // Optimistically add to UI state
          transactions: [transaction, ...state.transactions],
          // Add to offline sync queue
          offlineQueue: [
            ...state.offlineQueue,
            {
              id: crypto.randomUUID(),
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
        
        console.log('Syncing offline queue...', offlineQueue);
        
        // Skeleton logic for synchronization
        try {
          // Iterate over offline queue and push to backend
          for (const item of offlineQueue) {
            // await api.post('/sync', item.payload);
            console.log(`Synced item: ${item.action}`);
          }
          
          // Clear queue after successful sync
          set({ offlineQueue: [] });
          console.log('Offline queue synced successfully.');
        } catch (error) {
          console.error('Failed to sync offline queue', error);
          // Keep items in queue to try again later
        }
      },
    }),
    {
      name: 'duitkita-finance-storage', // key in localStorage
    }
  )
);
