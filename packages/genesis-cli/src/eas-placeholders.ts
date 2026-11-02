/**
 * The `REPLACE_WITH_…` placeholders the EAS templates ship, and exactly what
 * replaces each. `genesis init --template native` lists the ones left in the
 * new app; the doctor's `eas-placeholder` rule says the same thing. No imports:
 * the doctor and init both read it.
 */
export const EAS_PLACEHOLDERS: Readonly<Record<string, string>> = {
  REPLACE_WITH_APP_STORE_CONNECT_APP_ID:
    "the app's Apple ID from App Store Connect (create the app there, then App Information → General Information → Apple ID, a number)",
  REPLACE_WITH_APPLE_TEAM_ID: "your Apple Developer Team ID (developer.apple.com → Account → Membership details, 10 characters)",
  REPLACE_WITH_PATH_TO_GOOGLE_SERVICE_ACCOUNT_JSON:
    "the path to your Google Play service account key, a JSON file kept out of git (Play Console → Setup → API access); or delete submit.production.android until you ship to Google Play",
  REPLACE_WITH_APP_FOLDER: "the app's code folder (src, or apps/<name> in a monorepo)",
};

/** The JSON key a placeholder is the value of on one line (`"ascAppId": "REPLACE_WITH_…"`), or null. */
export function placeholderKey(line: string, placeholder: string): string | null {
  return new RegExp(`"([A-Za-z0-9_]+)"\\s*:\\s*"${placeholder}"`).exec(line)?.[1] ?? null;
}

/** What to do about one placeholder, as one sentence: where it is and what replaces it. */
export function placeholderStep(file: string, line: string, placeholder: string): string {
  const key = placeholderKey(line, placeholder);
  const what = EAS_PLACEHOLDERS[placeholder];
  const where = key ? `${file} ${key}` : file;
  return what ? `${where}: replace ${placeholder} with ${what}.` : `${where}: replace ${placeholder} (see docs/NATIVE-RELEASE.md in the Genesis repository).`;
}

/** Every placeholder in a file's text, with its 1-based line (YAML comment lines skipped). */
export function findPlaceholders(file: string, text: string): { line: number; text: string; placeholder: string }[] {
  const out: { line: number; text: string; placeholder: string }[] = [];
  text.split("\n").forEach((line, i) => {
    if (!file.endsWith(".json") && /^\s*#/.test(line)) return;
    for (const m of line.matchAll(/\bREPLACE_WITH_[A-Z0-9_]+/g)) out.push({ line: i + 1, text: line, placeholder: m[0] });
  });
  return out;
}
