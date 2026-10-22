import { chrome } from "./chrome";

/**
 * Keyboard shortcuts as people read them: on a Mac, in the Mac's own names
 * (⌥ Option, ⇧ Shift, ⌘ Command, ⌃ Control), since "Alt" means nothing on
 * a Mac keyboard. Chrome reports a Mac shortcut either as symbols ("⌥⇧S")
 * or as names ("Alt+Shift+S"); both come out the same.
 */

const MAC_NAMES: Record<string, string> = {
  Alt: "⌥ Option",
  Option: "⌥ Option",
  Shift: "⇧ Shift",
  Command: "⌘ Command",
  Ctrl: "⌘ Command",
  MacCtrl: "⌃ Control",
  "⌥": "⌥ Option",
  "⇧": "⇧ Shift",
  "⌘": "⌘ Command",
  "⌃": "⌃ Control",
};

export function isMac(
  platform = globalThis.navigator?.platform || "",
): boolean {
  return /mac/i.test(platform);
}

/** The keys of a shortcut, each a label, e.g. ["⌥ Option", "⇧ Shift", "S"]. */
export function shortcutKeys(shortcut: string, mac = isMac()): string[] {
  if (!shortcut) return [];
  const parts = shortcut.includes("+") ? shortcut.split("+") : [...shortcut];
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (mac ? MAC_NAMES[part] || part : part));
}

/** The shortcut Chrome has for a command now (people can change it), as keys. */
export async function commandKeys(
  name = "_execute_action",
  mac = isMac(),
): Promise<string[]> {
  const commands =
    (await chrome()
      .commands?.getAll()
      .catch(() => [])) || [];
  return shortcutKeys(
    commands.find((c) => c.name === name)?.shortcut || "",
    mac,
  );
}
