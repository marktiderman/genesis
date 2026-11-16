/**
 * The checks that run inside the page. `domChecks` is passed to Playwright's `page.evaluate`, so it
 * must be self-contained: no imports, no closures, no helpers outside its body. It returns every
 * finding (callers cap what they print, after the allow list), and it leaves the page as it found
 * it: focus, and the scroll position of the window and of every scrolling frame, are restored.
 */

export interface DomCheckOptions {
  /** The viewport is phone-sized (rule 9 counts floating controls there). */
  phone: boolean;
  /** Touch is on: the 44px hit-area check runs (docs/RESPONSIVE.md rule 3). */
  coarse: boolean;
  /** At most this many focusable elements are focused for the obscured-focus check, those in `main` first. */
  maxFocus: number;
  /** Text is zoomed (WCAG 1.4.4): text clipped by an ancestor that hides overflow is a finding. */
  textZoom?: boolean;
}

export interface DomFinding {
  check: "reflow" | "text-clipped" | "focus-obscured" | "hit-area" | "floating-controls" | "viewport-meta" | "touch-media";
  /** `info` findings are reported but never fail a run (the engine's emulation, not the page). */
  level?: "info";
  /** A short CSS path to the element, ending in its accessible name when it has one. */
  target?: string;
  message: string;
}

export async function domChecks(opts: DomCheckOptions): Promise<DomFinding[]> {
  const findings: DomFinding[] = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  const nameOf = (el: Element): string => {
    const label = el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? el.textContent ?? "";
    const text = label.replace(/\s+/g, " ").trim();
    return text.length > 32 ? `${text.slice(0, 31)}…` : text;
  };
  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const slot = node.getAttribute("data-slot");
      const testId = node.getAttribute("data-testid");
      if (node.id && !/^radix-|^_r_|:/.test(node.id)) part += `#${node.id}`;
      else if (testId) part += `[data-testid="${testId}"]`;
      else if (slot) part += `[data-slot="${slot}"]`;
      else if (node.parentElement) {
        const same = Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if ((node.id && !/^radix-|^_r_|:/.test(node.id)) || testId) break;
      node = node.parentElement;
    }
    const name = nameOf(el);
    return name ? `${parts.join(" > ")} "${name}"` : parts.join(" > ");
  };
  /** Not shown: display/visibility/opacity, inert or aria-hidden, zero size, or visually hidden (sr-only). */
  const hidden = (el: Element, allowTiny = false): boolean => {
    if (el.closest("[inert], [aria-hidden='true']")) return true;
    const style = getComputedStyle(el);
    // checkVisibility sees an ancestor's opacity, display and content-visibility too.
    const visible = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
    if (visible === false) return true;
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return true;
    if (allowTiny) return false;
    if (rect.width <= 1 && rect.height <= 1) return true;
    return /rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)/.test(style.clip) || /inset\(50%\)/.test(style.clipPath);
  };
  const overflowX = (el: Element) => getComputedStyle(el).overflowX;
  const scrolls = (el: Element) => ["auto", "scroll"].includes(overflowX(el));
  const clips = (el: Element) => ["hidden", "clip"].includes(overflowX(el));
  const isFixed = (el: Element) => ["fixed", "sticky"].includes(getComputedStyle(el).position);
  const offscreen = (r: DOMRect) => r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh;
  const paints = (el: Element) => {
    const s = getComputedStyle(el);
    return !/rgba\(.*,\s*0\)|transparent/.test(s.backgroundColor) || s.backdropFilter !== "none" || s.backgroundImage !== "none";
  };
  /**
   * Content allowed to scroll sideways inside its own frame (rule 2): grids, tables, code, maps,
   * media, tab and tool strips, or a frame a component marks with `data-scroll-frame`. A frame is
   * never excused for being narrow or for hiding overflow.
   */
  const WIDE_CONTENT =
    "table, pre, code, [role='grid'], [role='table'], [role='treegrid'], [role='tablist'], [role='toolbar'], canvas, svg, iframe, video, img, [data-scroll-frame]";

  // Viewport meta (rules 6 and 7).
  const meta = document.querySelector<HTMLMetaElement>("meta[name='viewport']")?.content ?? "";
  for (const [part, rule] of [
    [/width\s*=\s*device-width/, "width=device-width"],
    [/viewport-fit\s*=\s*cover/, "viewport-fit=cover (rule 7)"],
    [/interactive-widget\s*=\s*resizes-content/, "interactive-widget=resizes-content (rule 6)"],
  ] as const)
    if (!part.test(meta)) findings.push({ check: "viewport-meta", target: 'meta[name="viewport"]', message: `viewport meta lacks ${rule} ("${meta}")` });

  // Touch emulation took effect. If it didn't, the coarse-pointer checks would fail every page for
  // a reason no app can fix, so they are skipped and the engine is reported once.
  let coarse = opts.coarse;
  if (opts.coarse && !(matchMedia("(pointer: coarse)").matches && matchMedia("(hover: none)").matches)) {
    findings.push({
      check: "touch-media",
      level: "info",
      message: `touch is on but (pointer: coarse) is ${matchMedia("(pointer: coarse)").matches} and (hover: none) is ${matchMedia("(hover: none)").matches} in this engine; coarse-pointer checks skipped`,
    });
    coarse = false;
  }

  // Reflow (WCAG 1.4.10, rule 2). The page doesn't scroll sideways, and nothing runs past the
  // viewport, unless it is wide content (a grid, code, a map) inside a frame that scrolls. A frame
  // that scrolls only because it scrolls vertically (AppShell's main) excuses nothing, and content
  // cut off by a clipping ancestor (AppShell's overflow-hidden root) is a finding too.
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1)
    findings.push({ check: "reflow", target: "html", message: `the page scrolls sideways: ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport` });
  // An app shell's own page scroller (genesis-ui AppShell's shell-main and shell-frame) scrolling sideways.
  for (const scroller of Array.from(document.querySelectorAll("[data-slot='shell-main'], [data-slot='shell-frame'], main"))) {
    if (scroller.scrollWidth > scroller.clientWidth + 1 && !hidden(scroller))
      findings.push({ check: "reflow", target: describe(scroller).replace(/ ".*"$/, ""), message: `the page scroller is ${scroller.scrollWidth}px wide in ${scroller.clientWidth}px` });
  }
  const offenders: Array<{ el: Element; how: string }> = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const rect = el.getBoundingClientRect();
    if (rect.right <= vw + 1 && rect.left >= -1) continue;
    if (hidden(el)) continue;
    // A closed off-canvas panel, or anything inside one: a fixed ancestor entirely off screen.
    let parked = false;
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).position !== "fixed") continue;
      const ar = a.getBoundingClientRect();
      if (ar.left >= vw || ar.right <= 0) parked = true;
      break;
    }
    if (parked) continue;
    let frame: Element | null = null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a !== document.body && (scrolls(a) || clips(a))) {
        frame = a;
        break;
      }
    }
    if (frame && scrolls(frame)) {
      const wide = el.closest(WIDE_CONTENT);
      if ((wide && frame.contains(wide)) || frame.matches("[data-scroll-frame]")) continue; // wide content, scrolling in its own frame
    }
    // Clipped inside wide content itself (a table cell that clips at its column's edge): the
    // table's own layout, and the table is checked against its frame.
    // A table cell clipping its own content at the column's edge (genesis-ui clipCells) is the
    // table's layout, when the table itself scrolls in a frame: the cell's text is the table's to
    // show. Nothing else that hides overflow is excused (a tablist or toolbar cutting off its
    // last items fails).
    if (frame && clips(frame) && frame.matches("td, th, [role='cell'], [role='gridcell'], [role='columnheader'], [role='rowheader']")) {
      const table = frame.closest("table, [role='grid'], [role='table'], [role='treegrid']");
      let scroller: Element | null = table?.parentElement ?? null;
      while (scroller && scroller !== document.body && !scrolls(scroller)) scroller = scroller.parentElement;
      if (table && scroller && scroller !== document.body) continue;
    }
    if (offenders.some((o) => o.el.contains(el))) continue;
    for (let i = offenders.length - 1; i >= 0; i--) if (el.contains(offenders[i].el)) offenders.splice(i, 1);
    offenders.push({ el, how: frame && clips(frame) ? `cut off by ${describe(frame)}` : "outside a frame that scrolls it" });
  }
  for (const { el, how } of offenders) {
    const rect = el.getBoundingClientRect();
    findings.push({ check: "reflow", target: describe(el), message: `runs past the ${vw}px viewport (${Math.round(rect.left)}..${Math.round(rect.right)}px), ${how}` });
  }

  // 44px hit areas on a coarse pointer (rule 3): the control, its <label>, or its absolutely
  // positioned ::before/::after (genesis-ui's touchTarget) is at least 44px both ways.
  if (coarse) {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, [role='button'], [role='switch'], [role='checkbox'], [role='radio'], [role='tab'], [role='menuitem'], input[type='checkbox'], input[type='radio'], a[href]",
      ),
    );
    for (const el of controls) {
      if (el.tagName === "INPUT" && (el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)))) {
        const label = (el.closest("label") ?? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) as HTMLElement;
        if (!hidden(label)) {
          const r = label.getBoundingClientRect();
          if (r.width >= 44 && r.height >= 44) continue;
        }
      }
      if (hidden(el)) continue;
      if (el.tagName === "A") {
        // A link in running text is exempt (WCAG 2.5.8's inline exception): its block holds other text.
        const block = el.parentElement;
        const own = (el.textContent ?? "").trim();
        const around = (block?.textContent ?? "").replace(own, "").trim();
        if (getComputedStyle(el).display === "inline" && around.length > 0) continue;
      }
      const r = el.getBoundingClientRect();
      if (offscreen(r)) continue;
      let w = r.width;
      let h = r.height;
      for (const pseudo of ["::before", "::after"]) {
        const s = getComputedStyle(el, pseudo);
        if (s.content === "none" || s.position !== "absolute") continue;
        w = Math.max(w, parseFloat(s.width) || 0);
        h = Math.max(h, parseFloat(s.height) || 0);
      }
      if (w < 44 || h < 44) {
        findings.push({ check: "hit-area", target: describe(el), message: `hit area ${Math.round(w)}×${Math.round(h)}px, under 44×44 on a coarse pointer` });
        continue;
      }
      // The area is 44px on paper; hit-test it: a clipping ancestor or a neighbour on top takes taps.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const stolen = [
        [cx - 21, cy],
        [cx + 21, cy],
        [cx, cy - 21],
        [cx, cy + 21],
      ].filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh).find(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !hit || !(el.contains(hit) || hit === el);
      });
      if (stolen) {
        const hit = document.elementFromPoint(stolen[0], stolen[1]);
        findings.push({
          check: "hit-area",
          target: describe(el),
          message: `44px hit area is cut back: a tap ${Math.round(stolen[0] - cx)},${Math.round(stolen[1] - cy)}px from its centre lands on ${hit ? describe(hit) : "nothing"}`,
        });
      }
    }
  }

  // Text zoom (WCAG 1.4.4): at 200% text, no text is cut off by a box that hides its overflow.
  // An ellipsis or a line clamp is a deliberate truncation and doesn't count.
  if (opts.textZoom) {
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!clips(el) && !["hidden", "clip"].includes(getComputedStyle(el).overflowY)) continue;
      if (hidden(el)) continue;
      const s = getComputedStyle(el);
      const clamp = s.getPropertyValue("-webkit-line-clamp");
      if (s.textOverflow === "ellipsis" || (clamp && clamp !== "none")) continue;
      if (el.closest("[data-scroll-frame], pre, code")) continue;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()) || !!el.querySelector("p, span, label, h1, h2, h3, h4, li, td, button, a");
      if (!hasText) continue;
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
        findings.push({ check: "text-clipped", target: describe(el), message: `at 200% text, ${el.scrollWidth}×${el.scrollHeight}px of content is cut to ${el.clientWidth}×${el.clientHeight}px` });
    }
  }

  // At most one floating control on a phone (rule 9): on-screen fixed boxes narrower than most of
  // the viewport that hold a control. Bars (a header, the tab bar) span the width and don't count,
  // nor does anything in an open dialog, menu or listbox.
  if (opts.phone) {
    const floating = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll("button, a[href], [role='button']"))) {
      if (hidden(el)) continue;
      let box: Element | null = el;
      while (box && getComputedStyle(box).position !== "fixed") box = box.parentElement;
      if (!box) continue;
      if (box.closest("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']")) continue;
      const r = box.getBoundingClientRect();
      if (offscreen(r) || r.width >= vw * 0.6) continue;
      floating.add(box);
    }
    if (floating.size > 1)
      findings.push({
        check: "floating-controls",
        target: Array.from(floating).map(describe).join(", "),
        message: `${floating.size} floating controls on a phone; at most one (rule 9)`,
      });
  }

  // Focus not obscured (WCAG 2.4.11), last because it moves focus and scrolls: each focusable
  // element (those in main first), focused and scrolled into view the way the keyboard does it
  // ("nearest", which honours scroll-padding), isn't entirely covered by a fixed or sticky element.
  const saved = new Map<Element, [number, number]>();
  for (const el of Array.from(document.querySelectorAll("*"))) if (el.scrollTop || el.scrollLeft) saved.set(el, [el.scrollTop, el.scrollLeft]);
  const winScroll: [number, number] = [window.scrollX, window.scrollY];
  const before = document.activeElement as HTMLElement | null;
  const selector =
    "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable]:not([contenteditable='false']), [tabindex]:not([tabindex='-1'])";
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => !hidden(el, true));
  const main = document.querySelector("main");
  const ordered = main ? [...all.filter((el) => main.contains(el)), ...all.filter((el) => !main.contains(el))] : all;
  const bars = Array.from(document.querySelectorAll("*")).filter((el) => isFixed(el) && !hidden(el) && paints(el));
  for (const el of ordered.slice(0, opts.maxFocus)) {
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) continue;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || offscreen(r)) continue; // still visually hidden, or scrolled out of a frame
    const points: Array<[number, number]> = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 1, r.top + 1],
      [r.right - 1, r.top + 1],
      [r.left + 1, r.bottom - 1],
      [r.right - 1, r.bottom - 1],
    ].filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh) as Array<[number, number]>;
    let coveredBy: Element | null = null;
    const covered =
      points.length > 0 &&
      points.every(([x, y]) => {
        // What paints at the point: the hit-tested element, or a painted fixed bar that ignores the pointer.
        const hit = document.elementFromPoint(x, y);
        let bar: Element | null = hit;
        while (bar && !isFixed(bar)) bar = bar.parentElement;
        if (hit && (el.contains(hit) || hit.contains(el))) bar = null;
        if (!bar || bar.contains(el)) {
          bar =
            bars.find((b) => {
              if (b.contains(el) || el.contains(b) || getComputedStyle(b).pointerEvents !== "none") return false;
              const br = b.getBoundingClientRect();
              return x >= br.left && x <= br.right && y >= br.top && y <= br.bottom;
            }) ?? null;
        }
        if (bar) coveredBy = bar;
        return !!bar;
      });
    if (covered && coveredBy) findings.push({ check: "focus-obscured", target: describe(el), message: `focused, it is hidden under ${describe(coveredBy)}` });
    // Close whatever focusing opened (a tooltip, a hover card) before the next element.
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  }
  // Leave the page as it was: focus back, every frame and the window scrolled back.
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (before && before !== document.body) before.focus({ preventScroll: true });
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const [top, left] = saved.get(el) ?? [0, 0];
    if (el.scrollTop !== top) el.scrollTop = top;
    if (el.scrollLeft !== left) el.scrollLeft = left;
  }
  window.scrollTo(winScroll[0], winScroll[1]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  return findings;
}
