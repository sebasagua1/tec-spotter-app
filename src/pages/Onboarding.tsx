import { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LANGUAGE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ChipSelector } from '@/components/ui/chip-selector';
import { InterestPicker } from '@/components/ui/interest-picker';
import { OriginPicker } from '@/components/ui/origin-picker';
import { ResidencePicker } from '@/components/ui/residence-picker';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { pageTitle } from '@/lib/brand';

interface Campus {
  id: string;
  name: string;
  email_domain: string | null;
}

export default function Onboarding() {
  const { user, profile, profileLoaded, fetchProfile } = useAuthStore();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [major, setMajor] = useState('');
  const [semester, setSemester] = useState('');
  const [residence, setResidence] = useState('');
  const [origin, setOrigin] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Campus state
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [campusSearch, setCampusSearch] = useState('');
  const [needsCampusSelection, setNeedsCampusSelection] = useState(false);

  // Quién pertenece a qué institución lo decide el SERVIDOR, en el trigger de
  // alta (handle_new_user), comparando el dominio del correo contra
  // institutions.email_domains. Aquí antes se hacía `email.endsWith('@tec.mx')`,
  // que además de dejar fuera a exatec.mx e itesm.mx no verificaba nada: el
  // cliente escribía su propio campus_id y podía poner el que quisiera.
  //
  // Así que esto ya no decide, solo lee lo que el servidor decidió.
  useEffect(() => {
    if (!user || !profileLoaded) return;

    if (profile?.campus_id) {
      setSelectedCampusId(profile.campus_id);
      setNeedsCampusSelection(false);
      return;
    }

    // Sin institución asignada: el correo no coincide con ninguna. Que elija,
    // sabiendo que esa elección queda sin verificar.
    setNeedsCampusSelection(true);
    supabase.from('campuses').select('*').then(({ data }) => {
      if (data) setCampuses(data);
    });
  }, [user, profileLoaded, profile?.campus_id]);

  // Lista explícita de pasos. Antes se hacía con aritmética sobre el índice
  // (`adjustedStep = step + 1`), que ya era difícil de seguir con un paso
  // opcional y se vuelve inmanejable con dos.
  const steps = useMemo(() => {
    const list: string[] = [];
    if (needsCampusSelection) list.push('campus');
    list.push('basics', 'residence');
    if (residence === 'foraneo' || residence === 'international') list.push('origin');
    list.push('interests', 'languages');
    return list;
  }, [needsCampusSelection, residence]);

  const totalSteps = steps.length;
  const current = steps[Math.min(step, totalSteps - 1)];

  // Cambiar de "foráneo" a "local" acorta la lista; sin esto el índice podría
  // quedar apuntando fuera.
  useEffect(() => {
    if (step > totalSteps - 1) setStep(totalSteps - 1);
  }, [step, totalSteps]);

  // Dirección de la animación: hacia dónde va la transición.
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd');
  const goNext = () => { setDirection('fwd'); setStep((v) => v + 1); };
  const goBack = () => { setDirection('back'); setStep((v) => v - 1); };

  // Al cambiar de paso el contenido puede quedar desplazado del anterior.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [step]);

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name,
      major,
      semester: parseInt(semester) || null,
      residence_type: residence,
      // Solo tiene sentido para quien no es local.
      origin: residence === 'local' ? null : origin,
      interests,
      languages,
      campus_id: selectedCampusId,
      onboarding_completed: true,
    }).eq('id', user.id);

    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      await fetchProfile();
    }
    setLoading(false);
  };

  // Steps: campus selection (if needed) → basics → residence → interests → languages
  const getStepContent = () => {
    if (current === 'campus') {
      const filtered = campuses.filter(c =>
        c.name.toLowerCase().includes(campusSearch.toLowerCase())
      );
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">{t('onboarding.campusTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('onboarding.campusSubtitle')}</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('onboarding.campusSearch')}
              value={campusSearch}
              onChange={e => setCampusSearch(e.target.value)}
              className="h-12 rounded-xl text-base pl-10"
            />
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filtered.map(campus => (
              <button
                key={campus.id}
                onClick={() => setSelectedCampusId(campus.id)}
                className={cn(
                  'w-full p-4 rounded-xl text-left font-semibold transition-all border-2',
                  selectedCampusId === campus.id
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {campus.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">{t('onboarding.campusEmpty')}</p>
            )}
          </div>
        </div>
      );
    }

    if (current === 'basics') {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">{t('onboarding.welcomeTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('onboarding.welcomeSubtitle')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onb-name">{t('onboarding.fullName')}</Label>
            <Input id="onb-name" placeholder={t('onboarding.fullNamePh')} value={name} onChange={e => setName(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onb-major">{t('onboarding.major')}</Label>
            <Input id="onb-major" placeholder={t('onboarding.majorPh')} value={major} onChange={e => setMajor(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onb-semester">{t('onboarding.semester')}</Label>
            <Input id="onb-semester" placeholder={t('onboarding.semesterPh')} type="number" min="1" max="12" value={semester} onChange={e => setSemester(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
        </div>
      );
    }

    if (current === 'residence') {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">{t('onboarding.residenceTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('onboarding.residenceSubtitle')}</p>
          </div>
          <ResidencePicker value={residence} onChange={setResidence} />
        </div>
      );
    }

    if (current === 'origin') {
      const mode = residence === 'international' ? 'international' : 'foraneo';
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">
              {t(mode === 'international' ? 'origin.countryTitle' : 'origin.stateTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('origin.subtitle')}</p>
          </div>
          <OriginPicker mode={mode} value={origin} onChange={setOrigin} />
        </div>
      );
    }

    if (current === 'interests') {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">{t('onboarding.interestsTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('onboarding.interestsSubtitle')}</p>
          </div>
          <InterestPicker
            selected={interests}
            onToggle={(item) => toggleItem(interests, item, setInterests)}
          />
        </div>
      );
    }

    if (current === 'languages') {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">{t('onboarding.languagesTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('onboarding.languagesSubtitle')}</p>
          </div>
          <ChipSelector
            options={LANGUAGE_OPTIONS}
            selected={languages}
            onToggle={(item) => toggleItem(languages, item, setLanguages)}
          />
        </div>
      );
    }

    return null;
  };

  const canProceed = () => {
    if (current === 'campus') return !!selectedCampusId;
    if (current === 'basics') return !!name;
    if (current === 'residence') return !!residence;
    if (current === 'origin') return !!origin;
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col px-6 py-8 bg-background relative">
      <div className="absolute top-4 right-4 safe-top">
        {/* Language switcher imported lazily to avoid extra refactor */}
        <LanguageSwitcher />
      </div>
      <Helmet>
        <title>{pageTitle(t('onboarding.complete'))}</title>
        <meta name="description" content={t('onboarding.metaDesc')} />
        <link rel="canonical" href="/" />
      </Helmet>
      <h1 className="sr-only">{t('onboarding.complete')}</h1>
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 rounded-full flex-1 transition-all',
              i <= step ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 flex flex-col overflow-y-auto">
        {/* key={step} fuerza el remontaje para que la animación se dispare en
            cada paso; la dirección decide desde qué lado entra. */}
        <div key={step} className={direction === 'fwd' ? 'animate-step-in-right' : 'animate-step-in-left'}>
          {getStepContent()}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="outline" onClick={goBack} className="h-12 rounded-xl px-6">
            <ChevronLeft className="w-4 h-4 mr-1" /> {t('common.back')}
          </Button>
        )}
        {step < totalSteps - 1 ? (
          <Button
            onClick={goNext}
            className="flex-1 h-12 rounded-xl font-bold"
            disabled={!canProceed()}
          >
            {t('common.next')} <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleComplete}
            className="flex-1 h-12 rounded-xl font-bold"
            disabled={loading}
          >
            {loading ? t('common.saving') : t('onboarding.getStarted')}
          </Button>
        )}
      </div>
    </div>
  );
}
