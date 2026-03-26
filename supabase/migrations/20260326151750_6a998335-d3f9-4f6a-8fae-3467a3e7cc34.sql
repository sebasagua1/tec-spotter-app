-- Create campuses table
CREATE TABLE public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email_domain text UNIQUE,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view campuses" ON public.campuses
  FOR SELECT TO authenticated USING (true);

-- Seed Tec de Monterrey
INSERT INTO public.campuses (name, email_domain, lat, lng)
VALUES ('Tec de Monterrey', 'tec.mx', 25.6514, -100.2899);

-- Add campus_id to profiles
ALTER TABLE public.profiles ADD COLUMN campus_id uuid REFERENCES public.campuses(id);