import storyIds from "../data/story-ids.json";

// Storybook host: VITE_STORYBOOK_URL when set, else the site's own storybook/
// under the build's base path (the Pages site serves it there), else the local
// dev server.
export const STORYBOOK_URL: string = (
  import.meta.env.VITE_STORYBOOK_URL ||
  (import.meta.env.PROD
    ? `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/storybook/`
    : "http://localhost:6006/")
).replace(/\/*$/, "/");

const STORY_IDS: Record<string, string> = storyIds;

/**
 * The URL of a component's first story, or undefined when it has none.
 * `names` are tried in order (the slug, then component names); matching
 * ignores case and anything but letters and digits.
 */
export function storyUrl(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    const id = name ? STORY_IDS[name.toLowerCase().replace(/[^a-z0-9]/g, "")] : undefined;
    if (id) return `${STORYBOOK_URL}?path=/story/${id}`;
  }
  return undefined;
}
