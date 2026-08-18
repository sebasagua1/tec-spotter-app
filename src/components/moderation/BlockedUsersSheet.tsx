import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

interface Blocked {
  id: string;
  name: string | null;
}

/**
 * Lista de personas bloqueadas, con desbloqueo. Vive en Perfil porque
 * la persona bloqueada ya no aparece en ningún otro sitio de la app:
 * sin esta pantalla el bloqueo sería irreversible.
 */
export function BlockedUsersSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // El nombre sale de la copia que se guardó al bloquear: quien está
      // bloqueado ya no aparece en public_profiles, así que no se puede
      // volver a consultar.
      const { data: rows } = await supabase
        .from('blocks')
        .select('blocked_id, blocked_name')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;

      setBlocked((rows ?? []).map((r) => ({ id: r.blocked_id, name: r.blocked_name })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const unblock = async (id: string) => {
    if (!user) return;
    setWorking(id);
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', id);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      setBlocked((prev) => prev.filter((b) => b.id !== id));
      toast({ title: t('moderation.unblocked') });
    }
    setWorking(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border safe-top">
        <h2 className="text-lg font-extrabold text-foreground">{t('moderation.blockedTitle')}</h2>
        <button onClick={onClose} aria-label={t('common.close')} className="p-1 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : blocked.length === 0 ? (
          <div className="text-center py-16">
            <Ban className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{t('moderation.blockedEmpty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">{t('moderation.blockedNote')}</p>
            {blocked.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-card rounded-xl p-3 shadow-soft">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Ban className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">
                    {b.name ?? t('moderation.blockedUserFallback', { id: b.id.slice(0, 8) })}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working === b.id}
                  onClick={() => unblock(b.id)}
                  className="rounded-lg shrink-0"
                >
                  {t('moderation.unblock')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
