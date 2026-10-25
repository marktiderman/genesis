/**
 * The islands loader: the only script a site page loads, and only on a page
 * with a phone menu or a form. Built to a few hundred bytes (budget: 5 KB).
 *
 * - The phone menu is a `<details>` disclosure that works without script;
 *   this closes it on Escape (focus back on its button), on a link, and on a
 *   click outside it.
 * - A form island loads the form bundle (React and forms-web) on demand, so
 *   pages without a form never download it.
 */
declare const __FORM_ISLAND__: string;

const menus = document.querySelectorAll<HTMLDetailsElement>('details[data-gs-island="menu"]');
menus.forEach((menu) => {
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
  });
  menu.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) menu.open = false;
  });
});
if (menus.length) {
  document.addEventListener("click", (event) => {
    menus.forEach((menu) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    });
  });
}

if (document.querySelector('[data-gs-island="form"]')) {
  import(/* @vite-ignore */ new URL(__FORM_ISLAND__, import.meta.url).href).catch((err: unknown) => {
    console.error("[genesis-sites] the form couldn't load.", err);
  });
}
