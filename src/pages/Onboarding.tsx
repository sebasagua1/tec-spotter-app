import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS, RESIDENCE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';

interface Campus {
  id: string;
  name: string;
  email_domain: string | null;
}

export default function Onboarding() {
  const { user, fetchProfile } = useAuthStore();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [major, setMajor] = useState('');
  const [semester, setSemester] = useState('');
  const [residence, setResidence] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Campus state
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [campusSearch, setCampusSearch] = useState('');
  const [needsCampusSelection, setNeedsCampusSelection] = useState(false);

  // Determine if user needs campus selection (non-tec email)
  useEffect(() => {
    if (!user) return;
    const email = user.email || '';
    const isTecEmail = email.endsWith('@tec.mx');

    if (isTecEmail) {
      // Auto-assign tec campus
      supabase.from('campuses').select('id').eq('email_domain', 'tec.mx').single().then(({ data }) => {
        if (data) setSelectedCampusId(data.id);
      });
      setNeedsCampusSelection(false);
    } else {
      setNeedsCampusSelection(true);
      supabase.from('campuses').select('*').then(({ data }) => {
        if (data) setCampuses(data as Campus[]);
      });
    }
  }, [user]);

  const totalSteps = needsCampusSelection ? 5 : 4;

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
      interests,
      languages,
      campus_id: selectedCampusId,
      onboarding_completed: true,
    }).eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await fetchProfile();
    }
    setLoading(false);
  };

  // Steps: campus selection (if needed) → basics → residence → interests → languages
  const getStepContent = () => {
    const campusStep = needsCampusSelection ? 0 : -1;
    const adjustedStep = needsCampusSelection ? step : step + 1;

    if (adjustedStep === 0 && needsCampusSelection) {
      const filtered = campuses.filter(c =>
        c.name.toLowerCase().includes(campusSearch.toLowerCase())
      );
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">Your Campus 🏫</h2>
            <p className="text-muted-foreground text-sm">Select your university or campus</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search campuses..."
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
              <p className="text-muted-foreground text-sm text-center py-4">No campuses found</p>
            )}
          </div>
        </div>
      );
    }

    if (adjustedStep === 1) {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">Welcome! 👋</h2>
            <p className="text-muted-foreground text-sm">Let's set up your profile</p>
          </div>
          <Input placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} className="h-12 rounded-xl text-base" />
          <Input placeholder="Major (e.g. ITC, IMT, LAD)" value={major} onChange={e => setMajor(e.target.value)} className="h-12 rounded-xl text-base" />
          <Input placeholder="Semester (1-12)" type="number" min="1" max="12" value={semester} onChange={e => setSemester(e.target.value)} className="h-12 rounded-xl text-base" />
        </div>
      );
    }

    if (adjustedStep === 2) {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">Residence</h2>
            <p className="text-muted-foreground text-sm">Where are you from?</p>
          </div>
          <div className="space-y-3">
            {RESIDENCE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setResidence(opt.key)}
                className={cn(
                  'w-full p-4 rounded-xl text-left font-semibold transition-all border-2',
                  residence === opt.key
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (adjustedStep === 3) {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">Interests</h2>
            <p className="text-muted-foreground text-sm">Pick what you're into</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map(interest => (
              <button
                key={interest}
                onClick={() => toggleItem(interests, interest, setInterests)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  interests.includes(interest) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (adjustedStep === 4) {
      return (
        <div className="space-y-6 flex-1">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-1">Languages</h2>
            <p className="text-muted-foreground text-sm">Which languages do you speak?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map(lang => (
              <button
                key={lang}
                onClick={() => toggleItem(languages, lang, setLanguages)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  languages.includes(lang) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const canProceed = () => {
    const adjustedStep = needsCampusSelection ? step : step + 1;
    if (adjustedStep === 0) return !!selectedCampusId;
    if (adjustedStep === 1) return !!name;
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
      <Helmet>
        <title>Complete Your Profile — ConnectTec</title>
        <meta name="description" content="Configura tu perfil de ConnectTec: campus, carrera, intereses e idiomas para empezar a descubrir actividades del Tec." />
        <link rel="canonical" href="/" />
      </Helmet>
      <h1 className="sr-only">Complete Your Profile</h1>
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

      <div className="flex-1 flex flex-col">
        {getStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="h-12 rounded-xl px-6">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}
        {step < totalSteps - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            className="flex-1 h-12 rounded-xl font-bold"
            disabled={!canProceed()}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleComplete}
            className="flex-1 h-12 rounded-xl font-bold"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Get Started 🚀'}
          </Button>
        )}
      </div>
    </div>
  );
}
