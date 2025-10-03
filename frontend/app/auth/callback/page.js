"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          router.push('/?error=auth_failed');
          return;
        }

        if (data.session) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
              // Ensure a profile row exists for this user
              await supabase.from('user_profiles').upsert({
                user_id: user.id,
                role: 'free',
                subscription_status: 'inactive',
                preferences: {}
              }, { onConflict: 'user_id' });
            }
          } catch (e) {
            console.error('Profile upsert error:', e);
          }
          // Redirect to home after ensuring profile
          router.push('/');
        } else {
          // No session, redirect to home
          router.push('/');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.push('/?error=auth_failed');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-night flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent  animate-spin mx-auto mb-4"></div>
        <p className="text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
}
