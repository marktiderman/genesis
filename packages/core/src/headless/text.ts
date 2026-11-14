// Matching typed text against options: a combobox's list, a workspace switcher's search, a picker.
// Every word typed must appear, ignoring case and accents ("cafe" finds "Café"), so the web's
// Combobox and the phone's NativeCombobox find the same options.

/**
 * Text with the accents of Latin letters taken off and in lower case, for comparing what was
 * typed ("Café" is "cafe"). Only marks on a Latin letter go: in other scripts a mark changes the
 * letter (Devanagari's vowel signs, Japanese's dakuten: "ガ" is not "カ"), so it stays.
 */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{Mn}+/gu, (_, base: string) => base)
    .normalize("NFC")
    .toLowerCase();
}

/** Whether every word of `query` appears in one of `texts` (an empty query matches everything). */
export function matchesQuery(texts: string | readonly (string | null | undefined)[], query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText((typeof texts === "string" ? [texts] : texts).filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

/** An option a combobox lists: what it stores, what it shows, and a second line. */
export interface ComboboxOption<T = string> {
  value: T;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
}

/** The options whose label or description matches `query`, in the order given. */
export function filterOptions<O extends { label: string; description?: string | undefined }>(options: readonly O[], query: string): O[] {
  return options.filter((o) => matchesQuery([o.label, o.description], query));
}
