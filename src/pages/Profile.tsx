import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Settings, LogOut, Award, TrendingUp, Calendar, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function Profile() {
  const { profile, signOut, fetchProfile } = useAuthStore();
  const [stats, setStats] = useState({ attended: 0, created: 0 });
  const [badges, setBadges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!profile) return;
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { count: created } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', profile.id);

        const { count: attended } = await supabase
          .from('event_participants')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('checked_in', true);

        setStats({ created: created ?? 0, attended: attended ?? 0 });

        const { data: badgeData } = await supabase
          .from('badges')
          .select('badge_type')
          .eq('user_id', profile.id);
        if (badgeData) setBadges(badgeData.map((b: any) => b.badge_type));
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [profile]);

  if (!profile) {
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 safe-top space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const reputationPercent = Math.min((profile.reputation / 1000) * 100, 100);

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 safe-top">
      <Helmet>
        <title>Profile — ConnectTec</title>
        <meta name="description" content="Tu perfil de ConnectTec: reputación, puntos, insignias y estadísticas de tu actividad en el campus." />
        <link rel="canonical" href="/profile" />
        <meta property="og:title" content="Profile — ConnectTec" />
        <meta property="og:description" content="Tu perfil, reputación e insignias en ConnectTec." />
        <meta property="og:url" content="/profile" />
      </Helmet>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">Profile</h1>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button aria-label="Sign out" className="p-2 text-muted-foreground">
              <LogOut className="w-5 h-5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
              <AlertDialogDescription>
                Tendrás que iniciar sesión de nuevo para volver a entrar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={signOut}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cerrar sesión
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Profile card */}
      <div className="bg-card rounded-2xl p-5 shadow-soft mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
            {profile.name?.[0] ?? '?'}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold text-foreground">{profile.name ?? 'Student'}</h2>
            <p className="text-sm text-muted-foreground">{profile.major ?? 'No major set'}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {profile.residence_type ?? ''} · Semester {profile.semester ?? '—'}
            </p>
          </div>
        </div>

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {profile.interests.map((i: string) => (
              <span key={i} className="px-2.5 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                {i}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Attended', value: stats.attended, icon: Calendar },
          { label: 'Created', value: stats.created, icon: Star },
          { label: 'Points', value: profile.points, icon: TrendingUp },
        ].map(stat => (
          <div key={stat.label} className="bg-card rounded-2xl p-4 shadow-soft text-center">
            <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-extrabold text-foreground">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Reputation ring */}
      <div className="bg-card rounded-2xl p-5 shadow-soft mb-5">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          Reputation
        </h3>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeDasharray={`${reputationPercent}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-foreground">
              {Math.round(profile.reputation)}
            </span>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {profile.reputation < 250 ? 'Newcomer' :
               profile.reputation < 500 ? 'Regular' :
               profile.reputation < 750 ? 'Active' : 'Legend'}
            </p>
            <p className="text-xs text-muted-foreground">{Math.round(1000 - profile.reputation)} pts to next level</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="bg-card rounded-2xl p-5 shadow-soft">
        <h3 className="text-sm font-bold text-foreground mb-3">Badges</h3>
        <div className="grid grid-cols-3 gap-3">
          {BADGE_DEFINITIONS.map(badge => {
            const earned = badges.includes(badge.type);
            return (
              <div
                key={badge.type}
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-xl text-center transition-all',
                  earned ? 'bg-primary/5' : 'bg-muted/50 opacity-40'
                )}
              >
                <span className="text-2xl">{badge.icon}</span>
                <span className="text-[10px] font-bold text-foreground">{badge.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
