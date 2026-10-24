/**
 * The app's public settings, from `.env` (copy `.env.example`). Expo inlines
 * `EXPO_PUBLIC_*` values at build time, so each one is read by its full name.
 * Only publishable values go here: everything in the bundle can be read off
 * the phone.
 *
 * A missing value doesn't throw here: this module loads before
 * `GenesisNativeApp` exists, and a throw would close a release build with
 * nothing on screen. The first boot step (`app.ts`) throws instead, so the
 * fatal screen names the variable.
 */
const values = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

/** The names of the settings that aren't set. */
export const missingEnv = Object.entries(values)
  .filter(([, value]) => !value)
  .map(([name]) => name);

/** Throws, naming what's missing, when a setting isn't set. The boot runs it first. */
export function assertEnv(): void {
  if (missingEnv.length > 0) {
    throw new Error(`[starter] ${missingEnv.join(" and ")} not set. Copy .env.example to .env, fill it in, and restart Metro.`);
  }
}

export const env = {
  // A placeholder keeps the client constructible until the boot step reports the missing value.
  supabaseUrl: values.EXPO_PUBLIC_SUPABASE_URL || "https://missing-supabase-url.invalid",
  supabasePublishableKey: values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "missing-publishable-key",
};
