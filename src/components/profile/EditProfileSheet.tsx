import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS, RESIDENCE_OPTIONS } from '@/lib/constants';
import type { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface Props {
  profile: Profile;
  onClose: () => void;
}

export function EditProfileSheet({ profile, onClose }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { fetchProfile } = useAuthStore();

  const [name, setName] = useState(profile.name ?? '');
  const [major, setMajor] = useState(profile.major ?? '');
  const [semester, setSemester] = useState(profile.semester?.toString() ?? '');
  const [residence, setResidence] = useState(profile.residence_type ?? '');
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [languages, setLanguages] = useState<string[]>(profile.languages ?? []);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const toggle = (list: string[], item: string, setter: (v: string[]) => void) =>
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    let avatarUrl = profile.avatar_url ?? null;
    if (avatarFile) {
      setUploadingAvatar(true);
      const ext = avatarFile.name.split('.').pop() ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
      setUploadingAvatar(false);
      if (uploadError) {
        toast({ title: t('common.error'), description: uploadError.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      avatarUrl = urlData.publicUrl;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        major: major.trim() || null,
        semester: parseInt(semester) || null,
        residence_type: residence || null,
        interests,
        languages,
        avatar_url: avatarUrl,
      })
      .eq('id', profile.id);

    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      await fetchProfile();
      toast({ title: t('profile.saved') });
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <h2 className="text-lg font-extrabold text-foreground">{t('profile.edit')}</h2>
        <button onClick={onClose} className="p-1 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center group"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">{name?.[0] ?? '?'}</span>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-semibold text-primary"
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? t('common.saving') : t('profile.changePhoto')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="ep-name">{t('onboarding.fullName')}</Label>
          <Input
            id="ep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.fullNamePh')}
            className="h-12 rounded-xl text-base"
          />
        </div>

        {/* Major */}
        <div className="space-y-2">
          <Label htmlFor="ep-major">{t('onboarding.major')}</Label>
          <Input
            id="ep-major"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder={t('onboarding.majorPh')}
            className="h-12 rounded-xl text-base"
          />
        </div>

        {/* Semester */}
        <div className="space-y-2">
          <Label htmlFor="ep-semester">{t('onboarding.semester')}</Label>
          <Input
            id="ep-semester"
            type="number"
            min="1"
            max="12"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder={t('onboarding.semesterPh')}
            className="h-12 rounded-xl text-base"
          />
        </div>

        {/* Residence */}
        <div className="space-y-3">
          <Label>{t('onboarding.residenceTitle')}</Label>
          <div className="space-y-2" role="group" aria-label={t('onboarding.residenceTitle')}>
            {RESIDENCE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setResidence(opt.key)}
                aria-pressed={residence === opt.key}
                className={cn(
                  'w-full p-4 rounded-xl text-left font-semibold transition-all border-2',
                  residence === opt.key
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {t('residence.' + opt.key)}
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div className="space-y-3">
          <Label>{t('onboarding.interestsTitle')}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('onboarding.interestsTitle')}>
            {INTEREST_OPTIONS.map((interest) => (
              <button
                key={interest}
                onClick={() => toggle(interests, interest, setInterests)}
                aria-pressed={interests.includes(interest)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  interests.includes(interest)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {t('interests.' + interest)}
              </button>
            ))}
          </div>
        </div>

        {/* Languages */}
        <div className="space-y-3">
          <Label>{t('onboarding.languagesTitle')}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('onboarding.languagesTitle')}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang}
                onClick={() => toggle(languages, lang, setLanguages)}
                aria-pressed={languages.includes(lang)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  languages.includes(lang)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-8 pt-3 border-t border-border flex gap-3">
        <Button variant="outline" onClick={onClose} className="h-12 rounded-xl px-6">
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 h-12 rounded-xl font-bold"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.save')}
        </Button>
      </div>
    </div>
  );
}
