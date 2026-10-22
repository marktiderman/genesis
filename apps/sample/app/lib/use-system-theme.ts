import { useEffect } from "react";

/**
 * Follow the device's light or dark setting. The theme's dark tokens hang off
 * a `.dark` class on <html>, so a respondent's phone in dark mode needs this
 * to get them. Restores the previous class on unmount.
 */
export function useSystemTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      root.classList.toggle("dark", hadDark);
    };
  }, []);
}
