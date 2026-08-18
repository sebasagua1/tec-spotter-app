import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Users, UserPlus, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { rpcMessage } from '@/lib/rpcErrors';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  senderName: string;
}

export default function GroupChat() {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [groupName, setGroupName] = useState('');
  const [isDM, setIsDM] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Members sheet state
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string | null }[]>([]);
  const [friends, setFriends] = useState<{ id: string; name: string | null }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addingMember, setAddingMember] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !user) return;
    supabase.from('groups').select('name').eq('id', groupId).single()
      .then(async ({ data }) => {
        if (!data) return;
        // DM groups use a deterministic internal name — resolve the other person's display name
        if (data.name.startsWith('__dm_')) {
          setIsDM(true);
          const parts = data.name.replace('__dm_', '').split('_');
          const otherId = parts.find((p) => p !== user.id);
          if (otherId) {
            const { data: profile } = await supabase
              .from('public_profiles')
              .select('name')
              .eq('id', otherId)
              .maybeSingle();
            setGroupName(profile?.name ?? t('groups.directMessage'));
          }
        } else {
          setGroupName(data.name);
        }
      });
  }, [groupId, user, t]);

  const enrichMessages = async (
    msgs: { id: string; content: string; created_at: string; sender_id: string }[]
  ): Promise<Message[]> => {
    if (msgs.length === 0) return [];
    const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, name')
      .in('id', senderIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name ?? '?']));
    return msgs.map((m) => ({ ...m, senderName: nameMap[m.sender_id] ?? '?' }));
  };

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, content, created_at, sender_id')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      setMessages(await enrichMessages(data ?? []));
    })();
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const raw = payload.new as { id: string; content: string; created_at: string; sender_id: string };
          const [enriched] = await enrichMessages([raw]);
          // Puede llegar un mensaje que ya pintamos como eco local al enviarlo.
          setMessages((prev) => (prev.some((m) => m.id === raw.id) ? prev : [...prev, enriched]));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const loadMembers = async () => {
    if (!groupId || !user) return;
    setLoadingMembers(true);
    try {
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      const memberIds = memberRows?.map((r) => r.user_id) ?? [];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, name')
        .in('id', memberIds);
      setMembers((profiles ?? []).map((p) => ({ id: p.id ?? '', name: p.name })));

      // Friends not already in the group
      const { data: accepted } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      const friendIds = (accepted ?? [])
        .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id))
        .filter((id) => !memberIds.includes(id));

      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase
          .from('public_profiles')
          .select('id, name')
          .in('id', friendIds);
        setFriends((friendProfiles ?? []).map((p) => ({ id: p.id ?? '', name: p.name })));
      } else {
        setFriends([]);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async (friendId: string) => {
    if (!groupId) return;
    setAddingMember(friendId);
    // add_group_member() valida en el servidor que quien invita ya sea
    // miembro y que la persona invitada sea su amiga aceptada.
    const { error } = await supabase.rpc('add_group_member', {
      _group_id: groupId,
      _user_id: friendId,
    });
    if (error) {
      toast({ title: t('common.error'), description: rpcMessage(error.message, t), variant: 'destructive' });
    } else {
      toast({ title: t('groups.memberAdded') });
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
      const added = friends.find((f) => f.id === friendId);
      if (added) setMembers((prev) => [...prev, added]);
    }
    setAddingMember(null);
  };

  const handleLeaveGroup = async () => {
    if (!groupId || !user) return;
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    navigate('/friends', { state: { tab: 'groups' } });
  };

  const sendMessage = async () => {
    if (!text.trim() || !user || !groupId || sending) return;
    const content = text.trim();
    setSending(true);
    setText('');

    const { data, error } = await supabase
      .from('messages')
      .insert({ group_id: groupId, sender_id: user.id, content })
      .select('id, content, created_at, sender_id')
      .single();

    if (error) {
      // Devolver el texto al input: perderlo en silencio hacía creer que
      // el mensaje se había enviado.
      setText(content);
      toast({ title: t('groups.sendFailed'), description: error.message, variant: 'destructive' });
    } else if (data) {
      // Eco local inmediato; el handler de realtime descarta el duplicado por id.
      const [enriched] = await enrichMessages([data]);
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, enriched]));
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 bg-card border-b border-border shrink-0">
        <button
          onClick={() => navigate('/friends', { state: { tab: 'groups' } })}
          className="p-1 text-muted-foreground"
          aria-label={t('groups.backToGroups')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-foreground truncate flex-1">{groupName}</h1>
        {!isDM && (
          <button
            onClick={() => { loadMembers(); setMembersOpen(true); }}
            className="p-1 text-muted-foreground"
            aria-label={t('groups.membersTitle')}
          >
            <Users className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Members sheet */}
      <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('groups.membersTitle')}</SheetTitle>
          </SheetHeader>

          {loadingMembers ? (
            <p className="text-sm text-muted-foreground mt-4">{t('common.loading')}</p>
          ) : (
            <div className="mt-4 space-y-5">
              {/* Current members */}
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {m.name?.[0] ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-foreground">{m.name}</span>
                    {m.id === user?.id && (
                      <span className="ml-auto text-[10px] text-muted-foreground">{t('groups.you')}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Invite friends */}
              {friends.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('groups.inviteFriends')}
                  </p>
                  {friends.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 py-1">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {f.name?.[0] ?? '?'}
                      </div>
                      <span className="text-sm font-medium text-foreground flex-1">{f.name}</span>
                      <button
                        onClick={() => handleAddMember(f.id)}
                        disabled={addingMember === f.id}
                        className="p-1.5 rounded-full bg-primary/10 text-primary disabled:opacity-50"
                        aria-label={`${t('groups.invite')} ${f.name}`}
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Leave group */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full rounded-xl gap-2">
                    <LogOut className="w-4 h-4" />
                    {t('groups.leave')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('groups.leaveConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('groups.leaveConfirmDesc')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLeaveGroup}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('groups.leave')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">{t('groups.noMessages')}</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}>
              {!isMe && (
                <span className="text-[10px] text-muted-foreground px-1">{msg.senderName}</span>
              )}
              <div className="flex items-center gap-1 max-w-[85%]">
                <div
                  className={cn(
                    'px-3.5 py-2 rounded-2xl text-sm break-words',
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-br-sm order-1'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  )}
                >
                  {msg.content}
                </div>
                {!isMe && (
                  <ModerationMenu
                    target={{ kind: 'message', id: msg.id }}
                    label={msg.senderName}
                    blockUserId={msg.sender_id}
                    onBlocked={() => setMessages((prev) => prev.filter((m) => m.sender_id !== msg.sender_id))}
                    className="p-1 shrink-0"
                  />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground px-1">
                {format(new Date(msg.created_at), 'HH:mm')}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 bg-background border-t border-border shrink-0">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
          }}
          placeholder={t('groups.messagePh')}
          className="h-11 rounded-xl"
        />
        <Button
          onClick={sendMessage}
          disabled={sending || !text.trim()}
          size="icon"
          aria-label={t('groups.send')}
          className="h-11 w-11 rounded-xl shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
