import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search, UserPlus, Users, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FriendData {
  id: string;
  name: string;
  avatar_url: string | null;
  major: string | null;
}

export default function Friends() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'friends' | 'groups'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [searchResults, setSearchResults] = useState<FriendData[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchFriends = async () => {
      const { data } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (data) {
        const friendIds = data.map((f: any) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );
        if (friendIds.length > 0) {
          const { data: profiles } = await supabase
            .from('public_profiles' as any)
            .select('id, name, avatar_url, major')
            .in('id', friendIds);
          if (profiles) setFriends(profiles as any);
        }
      }
    };
    fetchFriends();
  }, [user]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const safeQuery = searchQuery.replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
      .from('public_profiles' as any)
      .select('id, name, avatar_url, major')
      .ilike('name', `%${safeQuery}%`)
      .neq('id', user?.id ?? '')
      .limit(10);
    if (data) setSearchResults(data as any);
  };

  const sendFriendRequest = async (friendId: string) => {
    if (!user) return;
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: friendId,
      status: 'pending',
    });
    if (error) {
      if ((error as any).code === '23505') {
        toast({ title: 'Ya enviaste solicitud a esta persona' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Request sent! 🤝' });
    }
  };

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 safe-top">
      <Helmet>
        <title>Friends &amp; Groups — ConnectTec</title>
        <meta name="description" content="Encuentra estudiantes del Tec, envía solicitudes de amistad y conecta con tu comunidad de campus en ConnectTec." />
        <link rel="canonical" href="/friends" />
        <meta property="og:title" content="Friends &amp; Groups — ConnectTec" />
        <meta property="og:description" content="Conecta con estudiantes del Tec en ConnectTec." />
        <meta property="og:url" content="/friends" />
      </Helmet>
      <h1 className="text-2xl font-extrabold text-foreground mb-4">Friends &amp; Groups</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['friends', 'groups'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-semibold capitalize transition-all',
              activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'friends' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search students..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-11 rounded-xl"
              />
            </div>
            <Button onClick={handleSearch} size="icon" aria-label="Search students" className="h-11 w-11 rounded-xl">
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Results</h2>
              {searchResults.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
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
                    onClick={() => sendFriendRequest(s.id)}
                    aria-label={`Send friend request to ${s.name}`}
                    className="p-2 text-primary"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Friends list */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              My Friends ({friends.length})
            </h2>
            {friends.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No friends yet. Search and connect!</p>
              </div>
            )}
            {friends.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {f.name?.[0] ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{f.major}</p>
                  </div>
                </div>
                <button aria-label={`Message ${f.name}`} className="p-2 text-muted-foreground">
                  <MessageCircle className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Groups coming soon</p>
        </div>
      )}
    </div>
  );
}
