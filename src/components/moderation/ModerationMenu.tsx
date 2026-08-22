import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Flag, Ban } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ReportDialog, type ReportTarget } from './ReportDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  /** Qué se reporta al pulsar "Reportar". */
  target: ReportTarget;
  /** Nombre o título, para los textos de confirmación. */
  label?: string | null;
  /** Persona a bloquear. Si no se pasa, el menú solo ofrece reportar. */
  blockUserId?: string | null;
  /** Se llama tras bloquear, para que la lista de arriba se refresque. */
  onBlocked?: () => void;
  className?: string;
}

/**
 * Menú de moderación (reportar / bloquear) que acompaña a cualquier
 * contenido de otra persona. Apple exige ambas acciones accesibles desde
 * el propio contenido, no escondidas en ajustes (guideline 1.2).
 */
export function ModerationMenu({ target, label, blockUserId, onBlocked, className }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const canBlock = Boolean(blockUserId) && blockUserId !== user?.id;

  const block = async () => {
    if (!user || !blockUserId) return;
    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: user.id, blocked_id: blockUserId, blocked_name: label ?? null });
    if (error && error.code !== '23505') {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('moderation.blocked'), description: t('moderation.blockedDesc') });
    onBlocked?.();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t('moderation.menu')}
            className={cn('w-11 h-11 inline-flex items-center justify-center -m-2 text-muted-foreground hover:text-foreground transition-colors', className)}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <button
            onClick={() => { setOpen(false); setReporting(true); }}
            className="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Flag className="w-4 h-4" />
            {t('moderation.report')}
          </button>
          {canBlock && (
            <button
              onClick={() => { setOpen(false); setConfirmingBlock(true); }}
              className="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Ban className="w-4 h-4" />
              {t('moderation.block')}
            </button>
          )}
        </PopoverContent>
      </Popover>

      {reporting && (
        <ReportDialog target={target} label={label} onClose={() => setReporting(false)} />
      )}

      <AlertDialog open={confirmingBlock} onOpenChange={setConfirmingBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {label ? t('moderation.blockConfirmTitleNamed', { label }) : t('moderation.blockConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('moderation.blockConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={block}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('moderation.block')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
