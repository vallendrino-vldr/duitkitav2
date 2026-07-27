import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { safeMutate } from './db';

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string;
  is_completed: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeReminders, setActiveReminders] = useState<Reminder[]>([]);
  const [daysBefore, setDaysBefore] = useState<number>(3);

  useEffect(() => {
    let dibatalkan = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchReminders = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const user = authData.session?.user;
        if (!user) return;

        const rows = await safeMutate<Reminder[]>(
          supabase
            .from('reminders')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_completed', false)
            .order('due_date', { ascending: true }),
          'Gagal memuat pengingat'
        );

        const prefs = await safeMutate<{ reminder_days_before: number }[]>(
          supabase.from('user_preferences').select('reminder_days_before').eq('user_id', user.id).limit(1),
          'Gagal memuat preferensi'
        );
        if (prefs && prefs[0]) {
          setDaysBefore(prefs[0].reminder_days_before ?? 3);
        }

        if (dibatalkan || !rows) return;
        setReminders(rows);
      } catch (e) {
        console.error('Error fetching reminders:', e);
      }
    };

    fetchReminders();

    // Subscribe to realtime changes
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('reminders_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminders', filter: `user_id=eq.${user.id}` },
          () => {
            fetchReminders();
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      dibatalkan = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Filter reminders based on reminder_days_before and trigger notification
  useEffect(() => {
    const now = new Date();
    
    // Set time to midnight for consistent day calculation
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dueReminders = reminders.filter((r) => {
      if (r.is_completed) return false;
      const dueDate = new Date(r.due_date);
      const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      
      const diffTime = dueDay.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays <= daysBefore;
    });

    setActiveReminders(dueReminders);

    // Trigger browser notification for newly due reminders
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const notifiedIds: string[] = JSON.parse(localStorage.getItem('notified_reminders') || '[]');
        
        dueReminders.forEach((r) => {
          if (!notifiedIds.includes(r.id)) {
            new Notification('DuitKita: Pengingat', {
              body: r.title,
              icon: '/icon-192x192.png'
            });
            notifiedIds.push(r.id);
          }
        });

        localStorage.setItem('notified_reminders', JSON.stringify(notifiedIds));
      }
    }
  }, [reminders, daysBefore]);

  const markCompleted = async (id: string) => {
    try {
      await safeMutate(
        supabase.from('reminders').update({ is_completed: true }).eq('id', id),
        'Gagal menandai selesai'
      );
      // Local state will update via Realtime subscription
    } catch (e) {
      console.error(e);
    }
  };

  const requestPermission = () => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  return { reminders, activeReminders, markCompleted, requestPermission };
}
