export const EVENT_CATEGORIES = [
  { key: 'study', label: 'Study', emoji: '📚', color: 'hsl(216, 100%, 50%)', twClass: 'bg-category-study' },
  { key: 'sports', label: 'Sports', emoji: '⚽', color: 'hsl(160, 100%, 39%)', twClass: 'bg-category-sports' },
  { key: 'social', label: 'Social', emoji: '🎉', color: 'hsl(263, 84%, 52%)', twClass: 'bg-category-social' },
  { key: 'shopping', label: 'Shopping', emoji: '🛒', color: 'hsl(25, 95%, 53%)', twClass: 'bg-category-shopping' },
  { key: 'volunteering', label: 'Volunteering', emoji: '❤️', color: 'hsl(0, 86%, 60%)', twClass: 'bg-category-volunteering' },
  { key: 'other', label: 'Other', emoji: '⚙️', color: 'hsl(220, 9%, 46%)', twClass: 'bg-category-other' },
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
  { key: 'local', label: 'Local' },
  { key: 'foraneo', label: 'Foráneo' },
  { key: 'international', label: 'Internacional' },
] as const;

export const BADGE_DEFINITIONS = [
  { type: 'organizer', label: 'Organizer', description: 'Created 5+ events', icon: '🎯' },
  { type: 'explorer', label: 'Explorer', description: 'Joined 10+ events', icon: '🧭' },
  { type: 'study_buddy', label: 'Study Buddy', description: 'Attended 5+ study sessions', icon: '📖' },
  { type: 'team_player', label: 'Team Player', description: 'Joined 5+ sports events', icon: '🏆' },
  { type: 'streak_7', label: '7-Day Streak', description: 'Active 7 days in a row', icon: '🔥' },
] as const;

export const POINTS = {
  JOIN_EVENT: 10,
  ORGANIZE_EVENT: 25,
  CHECK_IN: 15,
  RATE_EVENT: 5,
} as const;

// Monterrey Tec campus center coordinates
export const TEC_CENTER = {
  lng: -100.2899,
  lat: 25.6514,
} as const;

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/light-v11';
