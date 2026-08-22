import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type ReportTarget =
  | { kind: 'user'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'message'; id: string };

const REASONS = ['spam', 'harassment', 'inappropriate', 'fake', 'safety', 'other'] as const;

interface Props {
  target: ReportTarget;
  /** Nombre o título de lo reportado, para que el usuario sepa qué está enviando. */
  label?: string | null;
  onClose: () => void;
}

const COLUMN_FOR: Record<ReportTarget['kind'], 'reported_user_id' | 'reported_event_id' | 'reported_message_id'> = {
  user: 'reported_user_id',
  event: 'reported_event_id',
  message: 'reported_message_id',
};

export function ReportDialog({ target, label, onClose }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [reason, setReason] = useState<typeof REASONS[number] | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || !reason || submitting) return;
    setSubmitting(true);

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reason,
      details: details.trim() || null,
      [COLUMN_FOR[target.kind]]: target.id,
    });

    if (error) {
      // 23505 = índice único por (reporter, objetivo): ya lo había reportado.
      const already = error.code === '23505';
      toast({
        title: already ? t('report.alreadyReported') : t('common.error'),
        description: already ? undefined : error.message,
        variant: already ? undefined : 'destructive',
      });
      if (already) onClose();
    } else {
      toast({ title: t('report.sent'), description: t('report.sentDesc') });
      onClose();
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t(`report.title.${target.kind}`)}</DialogTitle>
          <DialogDescription>
            {label ? t('report.aboutLabel', { label }) : t('report.about')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                className={cn(
                  'inline-flex items-center min-h-[44px] px-4 rounded-full text-xs font-semibold transition-colors',
                  reason === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {t(`report.reason.${r}`)}
              </button>
            ))}
          </div>

          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={t('report.detailsPh')}
            className="rounded-xl resize-none"
          />

          <p className="text-xs text-muted-foreground">{t('report.reviewNote')}</p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submit}
              disabled={!reason || submitting}
              variant="destructive"
              className="flex-1 rounded-xl font-bold"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('report.submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
