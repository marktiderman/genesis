/**
 * Design systems by id: the built-in neutral ones, plus any a host registers
 * (a template library's, or its own private ones).
 */
import { NEUTRAL_DESIGN_SYSTEMS } from "./built-in";
import type { DesignSystem } from "./define";

const builtIns = new Map(NEUTRAL_DESIGN_SYSTEMS.map((d) => [d.id, d]));
const registry = new Map<string, DesignSystem>();

/**
 * Make a design system available by its id, so a brand that names it
 * (`brand.designSystem.id`) resolves to it. Registering an id again with a
 * different definition throws: a changed look is a new version.
 *
 * @stability Beta
 */
export function registerDesignSystem(...systems: DesignSystem[]): void {
  for (const ds of systems) {
    const existing = builtIns.get(ds.id) ?? registry.get(ds.id);
    if (existing && existing !== ds && JSON.stringify(existing) !== JSON.stringify(ds)) {
      throw new Error(`Design system ${ds.id} is already registered with a different definition. A changed look is a new version (${ds.name}@${ds.version + 1}).`);
    }
    if (!builtIns.has(ds.id)) registry.set(ds.id, ds);
  }
}

/** Remove a registered design system (for tests). Built-in ones stay. */
export function unregisterDesignSystem(id: string): void {
  registry.delete(id);
}

/** A design system by id (`crisp@1`): a built-in one or a registered one. */
export function getDesignSystem(id: string): DesignSystem | undefined {
  return builtIns.get(id) ?? registry.get(id);
}

/** Every design system available: the built-in ones, then the registered ones. */
export function listDesignSystems(): DesignSystem[] {
  return [...builtIns.values(), ...registry.values()];
}
