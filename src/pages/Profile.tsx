import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { LogOut, Award, TrendingUp, Calendar, Star, Pencil, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { BADGE_ICONS } from '@/lib/categoryIcons';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
  const { t } = useTranslation();
  const [stats, setStats] = useState({ attended: 0, created: 0 });
  const [badges, setBadges] = useState<string[]>([]);
  const [pointsHistory, setPointsHistory] = useState<{ id: string; points: number; reason: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

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
        if (badgeData) setBadges(badgeData.map((b) => b.badge_type));

        const { data: historyData } = await supabase
          .from('point_events')
          .select('id, points, reason, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (historyData) setPointsHistory(historyData);
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
  const rankKey =
    profile.reputation < 250 ? 'newcomer' :
    profile.reputation < 500 ? 'regular' :
    profile.reputation < 750 ? 'active' : 'legend';

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 safe-top">
      <Helmet>
        <title>{t('profile.title')} — ConnectTec</title>
        <meta name="description" content={t('profile.metaDesc')} />
        <link rel="canonical" href="/profile" />
        <meta property="og:title" content={`${t('profile.title')} — ConnectTec`} />
        <meta property="og:description" content={t('profile.metaDesc')} />
        <meta property="og:url" content="/profile" />
      </Helmet>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">{t('profile.title')}</h1>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button aria-label={t('profile.signOut')} className="p-2 text-muted-foreground">
                <LogOut className="w-5 h-5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('profile.signOutConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('profile.signOutConfirmDesc')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={signOut}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('profile.signOut')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-card rounded-2xl p-5 shadow-soft mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name ?? ''} className="w-full h-full object-cover" />
            ) : (
              profile.name?.[0] ?? '?'
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold text-foreground">{profile.name ?? t('profile.student')}</h2>
            <p className="text-sm text-muted-foreground">{profile.major ?? t('profile.noMajor')}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {profile.residence_type ?? ''} · {t('profile.semester')} {profile.semester ?? '—'}
            </p>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            aria-label={t('profile.edit')}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {profile.interests.map((i: string) => (
              <span key={i} className="px-2.5 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                {t('interests.' + i)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { key: 'attended', value: stats.attended, icon: Calendar },
          { key: 'created', value: stats.created, icon: Star },
          { key: 'points', value: profile.points, icon: TrendingUp },
        ].map(stat => (
          <div key={stat.key} className="bg-card rounded-2xl p-4 shadow-soft text-center">
            <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-extrabold text-foreground">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">{t(`profile.${stat.key}`)}</p>
          </div>
        ))}
      </div>

      {/* Reputation ring */}
      <div className="bg-card rounded-2xl p-5 shadow-soft mb-5">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          {t('profile.reputation')}
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
            <p className="text-sm text-muted-foreground">{t(`profile.rank.${rankKey}`)}</p>
            <p className="text-xs text-muted-foreground">{Math.round(1000 - profile.reputation)} {t('profile.ptsToNext')}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="bg-card rounded-2xl p-5 shadow-soft">
        <h3 className="text-sm font-bold text-foreground mb-3">{t('profile.badges')}</h3>
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
                {(() => { const Icon = BADGE_ICONS[badge.type]; return <Icon className="w-7 h-7" />; })()}
                <span className="text-[10px] font-bold text-foreground">{t('badges.' + badge.type)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Points history */}
      <div className="bg-card rounded-2xl p-5 shadow-soft mt-5">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          {t('pointsHistory.title')}
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-1">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-10" />
              </div>
            ))}
          </div>
        ) : pointsHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pointsHistory.empty')}</p>
        ) : (
          <div className="space-y-2">
            {pointsHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{t(`pointsHistory.${entry.reason}`)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(entry.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">+{entry.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {editOpen && (
        <EditProfileSheet profile={profile} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
