import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PinLockScreen from './PinLockScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: 'user' | 'admin';
}

export default function ProtectedRoute({ children, allowedRole = 'user' }: ProtectedRouteProps) {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session) {
        // Fetch role from profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        setRole(profile?.role || 'user');
        
        // Only lock if it's a regular user, admin might bypass or have their own logic
        // But for now, require PIN for all returning authenticated users to protect cached data
        setIsLocked(true); 
      } else {
        setIsLocked(false);
      }
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setIsLocked(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole === 'admin' && role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRole === 'user' && role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <PinLockScreen isLocked={isLocked} onUnlock={() => setIsLocked(false)} />
      {!isLocked && children}
    </>
  );
}
