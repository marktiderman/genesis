/**
 * The app's public settings, from `.env` (copy `.env.example`). Expo inlines
 * `EXPO_PUBLIC_*` values at build time, so each one is read by its full name.
 * Only publishable values go here: everything in the bundle can be read off
 * the phone.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[starter] ${name} is not set. Copy .env.example to .env, fill it in, and restart Metro.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
};
