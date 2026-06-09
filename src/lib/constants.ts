export const EVENT_CATEGORIES = [
  { key: 'study',        label: 'categories.study',        color: 'hsl(216, 100%, 45%)', textOnColor: 'white', twClass: 'bg-category-study' },
  { key: 'sports',       label: 'categories.sports',       color: 'hsl(160, 100%, 28%)', textOnColor: 'white', twClass: 'bg-category-sports' },
  { key: 'social',       label: 'categories.social',       color: 'hsl(263, 84%, 48%)',  textOnColor: 'white', twClass: 'bg-category-social' },
  { key: 'shopping',     label: 'categories.shopping',     color: 'hsl(25, 95%, 45%)',   textOnColor: 'white', twClass: 'bg-category-shopping' },
  { key: 'volunteering', label: 'categories.volunteering', color: 'hsl(0, 80%, 45%)',    textOnColor: 'white', twClass: 'bg-category-volunteering' },
  { key: 'other',        label: 'categories.other',        color: 'hsl(220, 9%, 38%)',   textOnColor: 'white', twClass: 'bg-category-other' },
] as const;

export type EventCategory = typeof EVENT_CATEGORIES[number]['key'];

export const INTEREST_OPTIONS = [
  'Music', 'Sports', 'Tech', 'Art', 'Food', 'Gaming', 'Travel', 'Volunteering',
  'Photography', 'Reading', 'Movies', 'Fitness', 'Cooking', 'Dance',
] as const;

export const LANGUAGE_OPTIONS = [
  'Español', 'English', 'Français', 'Deutsch', 'Português', '中文', '日本語', 'Korean',
] as const;

export const RESIDENCE_OPTIONS = [
  { key: 'local', label: 'residence.local' },
  { key: 'foraneo', label: 'residence.foraneo' },
  { key: 'international', label: 'residence.international' },
] as const;

export const BADGE_DEFINITIONS = [
  { type: 'organizer' },
  { type: 'explorer' },
  { type: 'study_buddy' },
  { type: 'team_player' },
  { type: 'streak_7' },
] as const;

export const POINTS = {
  JOIN_EVENT: 10,
  ORGANIZE_EVENT: 25,
  CHECK_IN: 15,
  RATE_EVENT: 5,
} as const;

// Tec de Monterrey Campus Querétaro center coordinates
export const TEC_CENTER = {
  lng: -100.4063,
  lat: 20.6134,
} as const;

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/light-v11';
