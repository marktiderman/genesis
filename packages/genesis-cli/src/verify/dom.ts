/**
 * The checks that run inside the page. `domChecks` is passed to Playwright's
 * `page.evaluate`, so it must be self-contained: no imports, no closures, no
 * helpers outside its body.
 */

export interface DomCheckOptions {
  /** The viewport is a phone (rule 9 counts floating controls there). */
  phone: boolean;
  /** Touch is on: the 44px hit-area check runs (docs/RESPONSIVE.md rule 3). */
  coarse: boolean;
  /** At most this many focusable elements are focused for the obscured-focus check. */
  maxFocus: number;
}

export interface DomFinding {
  check: "reflow" | "focus-obscured" | "hit-area" | "floating-controls" | "viewport-meta" | "touch-media";
  /** A short CSS path to the element, when there is one. */
  target?: string;
  message: string;
}

export function domChecks(opts: DomCheckOptions): DomFinding[] {
  const findings: DomFinding[] = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const slot = node.getAttribute("data-slot");
      const testId = node.getAttribute("data-testid");
      if (node.id) part += `#${node.id}`;
      else if (testId) part += `[data-testid="${testId}"]`;
      else if (slot) part += `[data-slot="${slot}"]`;
      parts.unshift(part);
      if (node.id || testId) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  };
  const hidden = (el: Element): boolean => {
    if (el.closest("[inert], [aria-hidden='true']")) return true;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return true;
    const rect = el.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0;
  };
  const clipsX = (el: Element): boolean => {
    const x = getComputedStyle(el).overflowX;
    return x === "auto" || x === "scroll" || x === "hidden" || x === "clip";
  };
  const isFixed = (el: Element): boolean => {
    const p = getComputedStyle(el).position;
    return p === "fixed" || p === "sticky";
  };

  // Viewport meta (rules 6 and 7).
  const meta = document.querySelector<HTMLMetaElement>("meta[name='viewport']")?.content ?? "";
  if (!/width\s*=\s*device-width/.test(meta)) findings.push({ check: "viewport-meta", message: `viewport meta lacks width=device-width ("${meta}")` });
  if (!/viewport-fit\s*=\s*cover/.test(meta)) findings.push({ check: "viewport-meta", message: `viewport meta lacks viewport-fit=cover (rule 7; "${meta}")` });
  if (!/interactive-widget\s*=\s*resizes-content/.test(meta))
    findings.push({ check: "viewport-meta", message: `viewport meta lacks interactive-widget=resizes-content (rule 6; "${meta}")` });

  // Touch emulation took effect (an engine that ignores it is reported, not trusted).
  if (opts.coarse && !matchMedia("(pointer: coarse)").matches)
    findings.push({ check: "touch-media", message: "touch is on but (pointer: coarse) doesn't match in this engine" });

  // Reflow (WCAG 1.4.10, rule 2): the page doesn't scroll sideways, and nothing runs past the
  // viewport outside a frame that scrolls or clips it.
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1)
    findings.push({ check: "reflow", message: `the page scrolls sideways: ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport` });
  const offenders: Element[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const rect = el.getBoundingClientRect();
    if (rect.right <= vw + 1 && rect.left >= -1) continue;
    if (hidden(el)) continue;
    if (getComputedStyle(el).position === "fixed" && (rect.left >= vw || rect.right <= 0)) continue; // an off-canvas panel
    let framed = false;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (clipsX(a)) {
        framed = true;
        break;
      }
    }
    if (framed) continue;
    if (offenders.some((o) => o.contains(el))) continue;
    offenders.push(el);
    if (offenders.length >= 5) break;
  }
  for (const el of offenders) {
    const rect = el.getBoundingClientRect();
    findings.push({
      check: "reflow",
      target: describe(el),
      message: `runs past the ${vw}px viewport (${Math.round(rect.left)}..${Math.round(rect.right)}px) outside a scrolling frame`,
    });
  }

  // Focus not obscured (WCAG 2.4.11): each focusable element, once focused, isn't entirely
  // covered by a fixed or sticky element.
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((el) => !hidden(el));
  const before = document.activeElement as HTMLElement | null;
  for (const el of focusables.slice(0, opts.maxFocus)) {
    // Keyboard focus scrolls the element just into view ("nearest"); focus() alone may centre it.
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) continue;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue; // scrolled out of a frame: not this check
    const points: Array<[number, number]> = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 1, r.top + 1],
      [r.right - 1, r.top + 1],
      [r.left + 1, r.bottom - 1],
      [r.right - 1, r.bottom - 1],
    ];
    let coveredBy: Element | null = null;
    let covered = true;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || el.contains(hit) || hit.contains(el)) {
        covered = false;
        break;
      }
      let bar: Element | null = hit;
      while (bar && !isFixed(bar)) bar = bar.parentElement;
      if (!bar || bar.contains(el)) {
        covered = false;
        break;
      }
      coveredBy = bar;
    }
    if (covered && coveredBy)
      findings.push({ check: "focus-obscured", target: describe(el), message: `focused, it is hidden under ${describe(coveredBy)}` });
  }
  before?.focus?.();
  if (!before || before === document.body) (document.activeElement as HTMLElement | null)?.blur?.();
  window.scrollTo(0, 0);

  // 44px hit areas on a coarse pointer (rule 3): the element or its absolutely positioned
  // ::before/::after (genesis-ui's touchTarget) is at least 44px both ways.
  if (opts.coarse) {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, [role='button'], [role='switch'], [role='checkbox'], [role='radio'], [role='tab'], [role='menuitem'], input[type='checkbox'], input[type='radio'], a[href]",
      ),
    ).filter((el) => !hidden(el));
    let reported = 0;
    for (const el of controls) {
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement?.closest("p, li, td, dd")) continue; // a link in text (WCAG's inline exception)
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      for (const pseudo of ["::before", "::after"]) {
        const s = getComputedStyle(el, pseudo);
        if (s.content === "none" || s.position !== "absolute") continue;
        w = Math.max(w, parseFloat(s.width) || 0);
        h = Math.max(h, parseFloat(s.height) || 0);
      }
      if (w >= 44 && h >= 44) continue;
      findings.push({ check: "hit-area", target: describe(el), message: `hit area ${Math.round(w)}×${Math.round(h)}px, under 44×44 on a coarse pointer` });
      if (++reported >= 10) break;
    }
  }

  // At most one floating control on a phone (rule 9): fixed boxes narrower than most of the
  // viewport that hold a control. Bars (a header, the tab bar) span the width and don't count.
  if (opts.phone) {
    const floating = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll("button, a[href], [role='button']"))) {
      if (hidden(el)) continue;
      let box: Element | null = el;
      while (box && getComputedStyle(box).position !== "fixed") box = box.parentElement;
      if (!box) continue;
      if (box.closest("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']")) continue;
      if (box.getBoundingClientRect().width >= vw * 0.6) continue;
      floating.add(box);
    }
    if (floating.size > 1)
      findings.push({
        check: "floating-controls",
        target: Array.from(floating).map(describe).join(", "),
        message: `${floating.size} floating controls on a phone; at most one (rule 9)`,
      });
  }

  return findings;
}
