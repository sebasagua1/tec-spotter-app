import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, UserPlus, Users, MessageCircle, Check, X as XIcon, Plus, Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type FriendData = Pick<
  Database['public']['Views']['public_profiles']['Row'],
  'id' | 'name' | 'avatar_url' | 'major'
>;

type PendingRequest = {
  friendshipId: string;
  profile: FriendData;
};

type Group = {
  id: string;
  name: string;
};

type LeaderEntry = {
  id: string | null;
  name: string | null;
  reputation: number;
};

type ActiveTab = 'friends' | 'groups' | 'leaderboard';

export default function Friends() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab: ActiveTab = (location.state as { tab?: ActiveTab } | null)?.tab ?? 'friends';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [searchResults, setSearchResults] = useState<FriendData[]>([]);
  const [loading, setLoading] = useState(true);

  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [leaderOffset, setLeaderOffset] = useState(0);
  const [leaderHasMore, setLeaderHasMore] = useState(true);

  // Friends pagination
  const [friendsPage, setFriendsPage] = useState(0);
  const [friendsHasMore, setFriendsHasMore] = useState(false);
  const [loadingMoreFriends, setLoadingMoreFriends] = useState(false);
  const FRIENDS_PAGE_SIZE = 15;
  const LEADER_PAGE_SIZE = 20;

  const loadFriends = useCallback(async (page: number) => {
    if (!user) return;
    page === 0 ? setLoading(true) : setLoadingMoreFriends(true);
    try {
      const { data: accepted } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (accepted && accepted.length > 0) {
        const friendIds = accepted.map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, name, avatar_url, major')
          .in('id', friendIds)
          .range(page * FRIENDS_PAGE_SIZE, (page + 1) * FRIENDS_PAGE_SIZE - 1);
        if (profiles) {
          page === 0 ? setFriends(profiles) : setFriends((prev) => [...prev, ...profiles]);
          setFriendsHasMore(profiles.length === FRIENDS_PAGE_SIZE);
        }
      } else {
        setFriends([]);
        setFriendsHasMore(false);
      }

      if (page === 0) {
        const { data: pending } = await supabase
          .from('friendships')
          .select('id, requester_id')
          .eq('addressee_id', user.id)
          .eq('status', 'pending');

        if (pending && pending.length > 0) {
          const requesterIds = pending.map((r) => r.requester_id);
          const { data: profiles } = await supabase
            .from('public_profiles')
            .select('id, name, avatar_url, major')
            .in('id', requesterIds);
          if (profiles) {
            setPendingRequests(
              pending.map((r) => ({
                friendshipId: r.id,
                profile: profiles.find((p) => p.id === r.requester_id) ?? {
                  id: r.requester_id,
                  name: null,
                  avatar_url: null,
                  major: null,
                },
              }))
            );
          }
        }
      }
    } finally {
      page === 0 ? setLoading(false) : setLoadingMoreFriends(false);
    }
  }, [user]);

  useEffect(() => {
    loadFriends(0);
    setFriendsPage(0);
  }, [loadFriends]);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    setGroupsLoading(true);
    try {
      const { data } = await supabase
        .from('group_members')
        .select('groups(id, name)')
        .eq('user_id', user.id);
      if (data) {
        setGroups(
          data
            .map((row) => row.groups as Group | null)
            .filter((g): g is Group => g !== null && !g.name.startsWith('__dm_'))
        );
      }
    } finally {
      setGroupsLoading(false);
    }
  }, [user]);

  const fetchLeaderboard = useCallback(async (offset = 0) => {
    setLeaderLoading(true);
    try {
      const { data } = await supabase
        .from('public_profiles')
        .select('id, name, reputation')
        .order('reputation', { ascending: false })
        .range(offset, offset + LEADER_PAGE_SIZE - 1);
      if (data) {
        offset === 0 ? setLeaderboard(data as LeaderEntry[]) : setLeaderboard((prev) => [...prev, ...(data as LeaderEntry[])]);
        setLeaderHasMore(data.length === LEADER_PAGE_SIZE);
        setLeaderOffset(offset + data.length);
      }
    } finally {
      setLeaderLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'groups') fetchGroups();
    if (activeTab === 'leaderboard') { setLeaderOffset(0); fetchLeaderboard(0); }
  }, [activeTab, fetchGroups, fetchLeaderboard]);

  // Find or create a 1-on-1 DM group using a deterministic name so no duplicates are created.
  const handleMessageFriend = useCallback(async (friend: FriendData) => {
    if (!user || !friend.id) return;
    const [a, b] = [user.id, friend.id].sort();
    const dmName = `__dm_${a}_${b}`;

    // Look for an existing DM group by its deterministic name
    const { data: existing } = await supabase
      .from('groups')
      .select('id')
      .eq('name', dmName)
      .maybeSingle();

    if (existing) {
      navigate(`/groups/${existing.id}`);
      return;
    }

    // Create the group and add both members
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: dmName, created_by: user.id })
      .select('id')
      .single();

    if (error || !group) {
      toast({ title: t('common.error'), description: error?.message, variant: 'destructive' });
      return;
    }

    await supabase.from('group_members').insert([
      { group_id: group.id, user_id: user.id },
      { group_id: group.id, user_id: friend.id },
    ]);

    navigate(`/groups/${group.id}`);
  }, [user, navigate, toast, t]);

  const acceptRequest = async (req: PendingRequest) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', req.friendshipId);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== req.friendshipId));
    setFriends((prev) => [...prev, req.profile]);
    toast({ title: t('friends.requestAccepted') });
  };

  const declineRequest = async (req: PendingRequest) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', req.friendshipId);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== req.friendshipId));
    toast({ title: t('friends.requestDeclined') });
  };

  const handleSearch = async () => {
    if (!user || !searchQuery.trim()) return;
    const safeQuery = searchQuery.replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
      .from('public_profiles')
      .select('id, name, avatar_url, major')
      .ilike('name', `%${safeQuery}%`)
      .neq('id', user?.id ?? '')
      .limit(10);
    if (data) setSearchResults(data);
  };

  const sendFriendRequest = async (friendId: string | null) => {
    if (!user || !friendId) return;
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: friendId,
      status: 'pending',
    });
    if (error) {
      if (error.code === '23505') {
        toast({ title: t('friends.alreadySent') });
      } else {
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: t('friends.requestSent') });
    }
  };

  const createGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const { data: group, error } = await supabase
        .from('groups')
        .insert({ name: newGroupName.trim(), created_by: user.id })
        .select('id, name')
        .single();
      if (error || !group) {
        toast({ title: t('common.error'), description: error?.message, variant: 'destructive' });
        return;
      }
      await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id });
      setGroups((prev) => [...prev, group]);
      setNewGroupName('');
      setShowCreateGroup(false);
      toast({ title: t('groups.created') });
    } finally {
      setCreatingGroup(false);
    }
  };

  const rankMedal = (i: number) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `${i + 1}.`;
  };

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 safe-top">
      <Helmet>
        <title>{t('friends.title')} — ConnectTec</title>
        <meta name="description" content={t('friends.metaDesc')} />
        <link rel="canonical" href="/friends" />
        <meta property="og:title" content={`${t('friends.title')} — ConnectTec`} />
        <meta property="og:description" content={t('friends.metaDesc')} />
        <meta property="og:url" content="/friends" />
      </Helmet>
      <h1 className="text-2xl font-extrabold text-foreground mb-4">{t('friends.title')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['friends', 'groups', 'leaderboard'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'relative px-5 py-2 rounded-full text-sm font-semibold transition-all',
              activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {tab === 'friends' && t('friends.tabFriends')}
            {tab === 'groups' && t('friends.tabGroups')}
            {tab === 'leaderboard' && t('friends.tabLeaderboard')}
            {tab === 'friends' && pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-[10px] font-bold flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Friends tab */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('friends.searchPh')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-11 rounded-xl"
              />
            </div>
            <Button onClick={handleSearch} size="icon" aria-label={t('common.search')} className="h-11 w-11 rounded-xl">
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('friends.results')}</h2>
              {searchResults.map((s) => (
                <div key={s.id ?? ''} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                      {s.name?.[0] ?? '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.major}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => sendFriendRequest(s.id ?? '')}
                    aria-label={`${t('friends.tabFriends')}: ${s.name}`}
                    className="p-2 text-primary"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingRequests.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t('friends.requests')} ({pendingRequests.length})
              </h2>
              {pendingRequests.map((req) => (
                <div key={req.friendshipId} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {req.profile.name?.[0] ?? '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{req.profile.name}</p>
                      <p className="text-xs text-muted-foreground">{req.profile.major}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptRequest(req)}
                      aria-label={t('friends.accept')}
                      className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => declineRequest(req)}
                      aria-label={t('friends.decline')}
                      className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t('friends.myFriends')} ({friends.length})
            </h2>
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-soft">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))
            ) : friends.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{t('friends.empty')}</p>
              </div>
            ) : null}
            {!loading &&
              friends.map((f) => (
                <div key={f.id ?? ''} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {f.name?.[0] ?? '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.major}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMessageFriend(f)}
                    aria-label={`Message ${f.name}`}
                    className="p-2 text-primary"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              ))}
            {!loading && friendsHasMore && (
              <button
                onClick={() => { const next = friendsPage + 1; setFriendsPage(next); loadFriends(next); }}
                disabled={loadingMoreFriends}
                className="w-full py-2 text-sm font-semibold text-primary disabled:opacity-50"
              >
                {loadingMoreFriends ? t('common.loading') : t('common.loadMore')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Groups tab */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <Button
            onClick={() => setShowCreateGroup(true)}
            className="w-full h-11 rounded-xl font-semibold"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('groups.new')}
          </Button>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{t('groups.myGroups')}</h2>
            {groupsLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-soft">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))
            ) : groups.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{t('groups.empty')}</p>
              </div>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="w-full flex items-center gap-3 bg-card rounded-xl p-3 shadow-soft text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {g.name[0]}
                  </div>
                  <span className="font-semibold text-sm text-foreground">{g.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Leaderboard tab */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            {t('leaderboard.title')}
          </h2>
          {leaderLoading ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-soft">
                <Skeleton className="w-7 h-5 rounded" />
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('leaderboard.empty')}</p>
            </div>
          ) : (
            leaderboard.map((entry, i) => (
              <div
                key={entry.id ?? i}
                className={cn(
                  'flex items-center gap-3 bg-card rounded-xl p-3 shadow-soft',
                  i < 3 && 'border border-primary/20'
                )}
              >
                <span className="w-7 text-center text-sm font-bold text-muted-foreground shrink-0">
                  {rankMedal(i)}
                </span>
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-slate-100 text-slate-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-primary/10 text-primary'
                  )}
                >
                  {entry.name?.[0] ?? '?'}
                </div>
                <p className="flex-1 font-semibold text-sm text-foreground truncate">{entry.name}</p>
                <span className="text-sm font-bold text-primary shrink-0">
                  {entry.reputation} {t('leaderboard.pts')}
                </span>
              </div>
            ))
          )}
          {!leaderLoading && leaderHasMore && (
            <button
              onClick={() => fetchLeaderboard(leaderOffset)}
              className="w-full py-2 text-sm font-semibold text-primary"
            >
              {t('common.loadMore')}
            </button>
          )}
        </div>
      )}

      {/* Create group dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="max-w-[360px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('groups.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              placeholder={t('groups.namePh')}
              className="h-11 rounded-xl"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreateGroup(false)} className="flex-1 rounded-xl">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={createGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                className="flex-1 rounded-xl"
              >
                {creatingGroup ? t('common.saving') : t('groups.createTitle')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
