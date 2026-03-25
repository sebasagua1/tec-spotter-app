import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS, RESIDENCE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const TOTAL_STEPS = 4;

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
      onboarding_completed: true,
    }).eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await fetchProfile();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
        {step === 0 && (
          <div className="space-y-6 flex-1">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground mb-1">Welcome! 👋</h2>
              <p className="text-muted-foreground text-sm">Let's set up your profile</p>
            </div>
            <Input
              placeholder="Your full name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-12 rounded-xl text-base"
            />
            <Input
              placeholder="Major (e.g. ITC, IMT, LAD)"
              value={major}
              onChange={e => setMajor(e.target.value)}
              className="h-12 rounded-xl text-base"
            />
            <Input
              placeholder="Semester (1-12)"
              type="number"
              min="1"
              max="12"
              value={semester}
              onChange={e => setSemester(e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>
        )}

        {step === 1 && (
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
        )}

        {step === 2 && (
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
                    interests.includes(interest)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
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
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            className="h-12 rounded-xl px-6"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            className="flex-1 h-12 rounded-xl font-bold"
            disabled={step === 0 && !name}
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
