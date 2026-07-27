import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Plus, Check, X, Briefcase, User, Book, Pencil, Trash2 } from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { supabase } from '../lib/supabase';
import { safeMutate } from '../lib/db';
import toast from 'react-hot-toast';
import Portal from './Portal';

const AVAILABLE_ICONS = [
  { id: 'user', icon: User },
  { id: 'briefcase', icon: Briefcase },
  { id: 'folder', icon: Folder },
  { id: 'book', icon: Book },
];

export default function TabSwitcher() {
  const { tabs, activeTabId, setActiveTabId, fetchTabs } = useFinanceStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('briefcase');

  const [editTabId, setEditTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('briefcase');

  const activeTab = tabs?.find(t => t.id === activeTabId) || tabs?.[0];

  const handleCreateTab = async () => {
    if (!newName.trim()) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not logged in');

      const id = crypto.randomUUID();
      await safeMutate(
        supabase.from('tabs').insert({
          id,
          user_id: userData.user.id,
          name: newName.trim(),
          icon: newIcon,
        }),
        'Gagal membuat tab baru'
      );
      
      toast.success(`Tab "${newName}" berhasil dibuat`);
      setNewName('');
      setIsCreating(false);
      await fetchTabs();
      setActiveTabId(id);
    } catch (error) {
      toast.error('Gagal membuat tab');
    }
  };

  const handleSelectTab = (id: string) => {
    if (editTabId) return; // Prevent selection while editing
    setActiveTabId(id);
    setIsOpen(false);
  };

  const startEdit = (tab: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTabId(tab.id);
    setEditName(tab.name);
    setEditIcon(tab.icon);
    setIsCreating(false);
  };

  const handleUpdateTab = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editName.trim() || !editTabId) return;
    try {
      await safeMutate(
        supabase.from('tabs').update({ name: editName.trim(), icon: editIcon }).eq('id', editTabId),
        'Gagal memperbarui buku keuangan'
      );
      toast.success('Buku keuangan berhasil diperbarui');
      setEditTabId(null);
      await fetchTabs();
    } catch (error) {
      toast.error('Gagal memperbarui buku keuangan');
    }
  };

  const handleDeleteTab = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs && tabs.length <= 1) {
      toast.error('Tidak bisa menghapus buku keuangan terakhir');
      return;
    }
    if (!confirm('Yakin ingin menghapus buku keuangan ini beserta seluruh datanya?')) return;
    try {
      await safeMutate(
        supabase.from('tabs').delete().eq('id', id),
        'Gagal menghapus buku keuangan'
      );
      toast.success('Buku keuangan berhasil dihapus');
      if (editTabId === id) setEditTabId(null);
      await fetchTabs();
    } catch (error) {
      toast.error('Gagal menghapus buku keuangan');
    }
  };

  const ActiveIcon = AVAILABLE_ICONS.find(i => i.id === activeTab?.icon)?.icon || Folder;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-all text-sm font-semibold text-white/90"
      >
        <ActiveIcon size={16} className="text-brand-300" />
        <span className="truncate max-w-[120px]">{activeTab?.name || 'Memuat...'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <Portal>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                onClick={() => setIsOpen(false)}
              />
              
              <motion.div
                initial={{ opacity: 0, y: 100, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 100, scale: 0.95 }}
                className="relative w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl overflow-hidden shadow-2xl pointer-events-auto flex flex-col max-h-[85vh]"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                  <h3 className="font-bold text-lg">Pilih Buku Keuangan</h3>
                  <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="overflow-y-auto thin-scrollbar p-3 space-y-2">
                  {tabs?.map(tab => {
                    const Icon = AVAILABLE_ICONS.find(i => i.id === tab.icon)?.icon || Folder;
                    const isActive = tab.id === activeTabId;
                    
                    return (
                      <div key={tab.id} className="w-full">
                        {editTabId === tab.id ? (
                          <div className="p-4 rounded-2xl bg-black/40 border border-brand-400/30 space-y-3">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                              autoFocus
                            />
                            <div className="flex justify-between items-center px-1">
                              <span className="text-sm font-medium text-white/60">Ikon:</span>
                              <div className="flex gap-1">
                                {AVAILABLE_ICONS.map(i => {
                                  const IconC = i.icon;
                                  return (
                                    <button
                                      key={i.id}
                                      onClick={() => setEditIcon(i.id)}
                                      className={`p-1.5 rounded-lg transition-colors ${editIcon === i.id ? 'bg-brand-500/30 text-brand-300' : 'text-white/50 hover:bg-white/10'}`}
                                    >
                                      <IconC size={16} />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditTabId(null)} className="flex-1 py-2 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 transition-colors">
                                Batal
                              </button>
                              <button onClick={handleUpdateTab} disabled={!editName.trim()} className="flex-1 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-400 text-white transition-colors disabled:opacity-50">
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectTab(tab.id)}
                            className={`group w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
                              isActive 
                                ? 'bg-brand-500/20 border-brand-400/50 text-white' 
                                : 'bg-white/5 border-transparent hover:bg-white/10 text-white/80'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-brand-500/30 text-brand-300' : 'bg-white/10 text-white/70'}`}>
                                <Icon size={20} />
                              </div>
                              <span className="font-semibold text-left">{tab.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                                <span onClick={(e) => startEdit(tab, e)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-brand-300 transition-colors">
                                  <Pencil size={16} />
                                </span>
                                {(tabs && tabs.length > 1) && (
                                  <span onClick={(e) => handleDeleteTab(tab.id, e)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-red-400 transition-colors">
                                    <Trash2 size={16} />
                                  </span>
                                )}
                              </div>
                              {isActive && <Check size={20} className="text-brand-400" />}
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-white/10 bg-black/20">
                  {!isCreating ? (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="w-full py-3.5 rounded-xl border-2 border-dashed border-white/20 text-white/70 hover:border-brand-400/50 hover:text-brand-300 hover:bg-brand-400/10 font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={18} />
                      Buat Buku Baru
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Nama Buku (mis. Usaha Kopi)"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                        autoFocus
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-sm font-medium text-white/60">Ikon:</span>
                        <div className="flex gap-2">
                          {AVAILABLE_ICONS.map(i => {
                            const IconC = i.icon;
                            return (
                              <button
                                key={i.id}
                                onClick={() => setNewIcon(i.id)}
                                className={`p-2 rounded-lg transition-colors ${newIcon === i.id ? 'bg-brand-500/30 text-brand-300' : 'text-white/50 hover:bg-white/10'}`}
                              >
                                <IconC size={18} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsCreating(false)}
                          className="flex-1 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          onClick={handleCreateTab}
                          disabled={!newName.trim()}
                          className="flex-1 py-3 rounded-xl font-bold bg-brand-500 hover:bg-brand-400 text-white transition-colors disabled:opacity-50"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
