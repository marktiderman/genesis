// Code-first form layout (DATA-STUDIO.md P2, "conditional fields and
// sections, declared in code config first").

/** How one resource's record form is laid out. */
export interface StudioFormConfig {
  /** Fields grouped under headings, in order. Fields in no section follow, under "Other". */
  sections?: { title: string; fields: string[] }[];
  /**
   * Show a field only when this returns true for the form's current values,
   * e.g. `{ cancel_reason: (v) => v.status === "cancelled" }`. A hidden field
   * is left out of the save.
   */
  visibleWhen?: Record<string, (values: Record<string, unknown>) => boolean>;
}

export interface FormSection<F> {
  title: string | null;
  fields: F[];
}

/** Split fields into the configured sections, keeping each field once. */
export function sectionFields<F extends { name: string }>(fields: readonly F[], config: StudioFormConfig | undefined): FormSection<F>[] {
  if (!config?.sections?.length) return [{ title: null, fields: [...fields] }];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const used = new Set<string>();
  const out: FormSection<F>[] = [];
  for (const section of config.sections) {
    const list = section.fields.map((n) => byName.get(n)).filter((f): f is F => Boolean(f) && !used.has(f!.name));
    list.forEach((f) => used.add(f.name));
    if (list.length) out.push({ title: section.title, fields: list });
  }
  const rest = fields.filter((f) => !used.has(f.name));
  if (rest.length) out.push({ title: "Other", fields: rest });
  return out;
}
