/**
 * The islands loader: the only script a site page loads, and only on a page
 * with a phone menu, a form or a map. Built to a few KB (budget: 5 KB).
 *
 * - The phone menu is a `<details>` disclosure that works without script;
 *   this closes it on Escape (focus back on its button), on a link, and on a
 *   click outside it.
 * - A light form (a plain HTML form, see sections/light-form.tsx) is sent
 *   from here as JSON, `{ form, answers }` with answers keyed by field id,
 *   the shape genesis-forms' `answers()` gives. No React is loaded.
 * - A form that needs the genesis-forms engine loads the form bundle (React
 *   and forms-web) on demand, so pages without one never download it.
 * - A map shows its "Show the map" button, and only a click puts the
 *   provider's frame on the page (nothing loads from the provider before).
 */
declare const __FORM_ISLAND__: string;

const menus = document.querySelectorAll<HTMLDetailsElement>('details[data-gs-island="menu"]');
menus.forEach((menu) => {
  // Tabbing out of the open menu closes it, so it never covers the page behind the focus.
  menu.addEventListener("focusout", (event) => {
    const next = event.relatedTarget as Node | null;
    if (menu.open && next && !menu.contains(next)) menu.open = false;
  });
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

type Answer = string | number | boolean | string[];

/** One field's answer, read inside its own wrapper, by how the light form drew it (`data-gs-kind`); undefined when unanswered. */
function answerOf(field: HTMLElement, name: string, kind: string): Answer | undefined {
  const all = [...field.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(name)}"]`)];
  if (kind === "multi") {
    const values = all.filter((i) => i.checked).map((i) => i.value);
    return values.length ? values : undefined;
  }
  if (kind === "single" || kind === "yes-no") {
    const picked = all.find((i) => (i.type === "radio" ? i.checked : true));
    const value = picked?.value ?? "";
    if (!value) return undefined;
    return kind === "yes-no" ? value === "yes" : value;
  }
  if (kind === "consent") return all[0]?.checked ? true : undefined;
  const value = (all[0]?.value ?? "").trim();
  if (!value) return undefined;
  return kind === "number" ? Number(value) : value;
}

document.querySelectorAll<HTMLFormElement>('form[data-gs-island="light-form"]').forEach((form) => {
  const status = form.querySelector<HTMLElement>("[data-gs-status]");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const say = (text: string) => {
    if (status) status.textContent = text;
  };
  // "At least one" for a required group of checkboxes, which HTML can't say.
  const checkGroups = () => {
    let ok = true;
    form.querySelectorAll<HTMLElement>('[data-gs-kind="multi"][data-gs-required]').forEach((group) => {
      const boxes = [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      const message = boxes.some((b) => b.checked) ? "" : "Choose at least one.";
      boxes[0]?.setCustomValidity(message);
      if (message) ok = false;
    });
    return ok;
  };
  form.addEventListener("change", checkGroups);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!checkGroups() || !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const answers: Record<string, Answer> = {};
    form.querySelectorAll<HTMLElement>("[data-gs-field]").forEach((field) => {
      const id = field.dataset.gsField!;
      const value = answerOf(field, id, field.dataset.gsKind ?? "text");
      if (value !== undefined) answers[id] = value;
    });
    if (button) button.disabled = true;
    say("Sending…");
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ form: form.dataset.gsForm, answers }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(String(res.status));
      const done = document.createElement("p");
      done.setAttribute("role", "status");
      done.tabIndex = -1;
      done.className = "text-lg font-medium";
      done.textContent = form.dataset.gsSent ?? "Thanks.";
      form.replaceWith(done);
      done.focus();
    } catch (err) {
      console.error(`[genesis-sites] the form "${form.dataset.gsForm}" couldn't be sent.`, err);
      say("That didn't send. Check your connection and try again.");
      if (button) {
        button.disabled = false;
        // Focus went to the page while the button was disabled: put it back where the person was.
        button.focus();
      }
    }
  });
});

// Maps: the frame's URL is one the server built for a known provider; anything else stays a link.
const MAP_ORIGINS = ["https://www.openstreetmap.org/", "https://www.google.com/maps"];
document.querySelectorAll<HTMLElement>('[data-gs-island="map"]').forEach((box) => {
  const src = box.dataset.gsMapSrc ?? "";
  const button = box.querySelector<HTMLButtonElement>("[data-gs-map-load]");
  if (!button || !MAP_ORIGINS.some((o) => src.startsWith(o))) return;
  button.hidden = false;
  button.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = src;
    frame.title = box.dataset.gsMapTitle || "Map";
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.className = "absolute inset-0 h-full w-full border-0";
    // The picture and the consent go; the link to the provider's own map stays.
    box.querySelectorAll("[data-gs-map-drop]").forEach((el) => el.remove());
    box.prepend(frame);
    frame.focus();
  });
});

if (document.querySelector('[data-gs-island="form"]')) {
  import(/* @vite-ignore */ new URL(__FORM_ISLAND__, import.meta.url).href).catch((err: unknown) => {
    console.error("[genesis-sites] the form couldn't load.", err);
  });
}
