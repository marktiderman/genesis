import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseForm, listFieldTypes, type FormDefinition, type FieldBlock, type LogicRule } from "@marktiderman/genesis-forms";
import { coverage } from "@marktiderman/genesis-forms/testing";
import * as ops from "../ops";
import { starterRule } from "../logic";
import { ALL_TEMPLATES } from "./fixtures";

const TYPES = listFieldTypes().map((t) => t.type);
const WORDS = ["How was it", "", "  ", "Rating!", "q", "1st", "Éclair", "option 1", "Option 2", "name"];

type Op = (d: FormDefinition) => FormDefinition;
const pick = <T,>(xs: readonly T[], n: number): T | undefined => (xs.length ? xs[n % xs.length] : undefined);
const fieldsOf = (d: FormDefinition) => d.blocks.filter((b): b is FieldBlock => b.kind === "field");
const steps = (d: FormDefinition) => d.blocks.filter((b) => b.kind !== "page-break");

/** Ops only through what the UI offers. */
const opArb: fc.Arbitrary<{ name: string; f: Op }> = fc
  .tuple(fc.integer({ min: 0, max: 25 }), fc.nat(1000), fc.nat(1000), fc.constantFrom(...WORDS), fc.boolean())
  .map(([k, a, b, w, flag]) => {
    const f: Op = (d) => {
      const blk = pick(d.blocks, a);
      const fld = pick(fieldsOf(d), a);
      const rule = pick(d.logic ?? [], a);
      switch (k) {
        case 0: return ops.insertBlock(d, ops.createField(d, { type: pick(TYPES, b)! }), b % (d.blocks.length + 1));
        case 1: return ops.insertBlock(d, ops.createContent(flag ? "heading" : "text"), b % (d.blocks.length + 1));
        case 2: return ops.insertBlock(d, ops.createPageBreak(), b % (d.blocks.length + 1));
        case 3: return blk ? ops.moveBlock(d, blk.id, b % d.blocks.length) : d;
        case 4: return blk ? ops.duplicateBlock(d, blk.id) : d;
        case 5: return blk ? ops.removeBlock(d, blk.id) : d;
        case 6: return fld ? ops.updateBlock(d, fld.id, { key: w }) : d;
        case 7: return fld ? ops.updateBlock(d, fld.id, { type: pick(TYPES, b)! }) : d;
        case 8: {
          // label with a recall token to an earlier field or hidden input
          if (!fld) return d;
          const other = pick(fieldsOf(d), b);
          const h = pick(d.hidden ?? [], b);
          const tok = flag && other ? `{{field:${other.key}|x}}` : h ? `{{hidden:${h.name}}}` : "";
          return ops.updateBlock(d, fld.id, { label: `${w} ${tok}` });
        }
        case 9: {
          if (!fld || !["single-choice", "multi-choice"].includes(fld.type)) return d;
          const cur = (fld.props?.options as { value: string; label: string }[]) ?? [];
          const next = flag ? cur.filter((_, i) => i !== b % Math.max(1, cur.length)) : [...cur, { label: w }];
          return ops.setOptions(d, fld.id, next.length ? next : [{ label: w }]);
        }
        case 10: {
          const r = starterRule(d, flag ? "jump" : pick(["show", "hide"] as const, b)!);
          return r ? ops.addRule(d, r) : d;
        }
        case 11: return rule ? ops.removeRule(d, rule.id) : d;
        case 12: return rule ? ops.moveRule(d, rule.id, b) : d;
        case 13: {
          // RuleEditor: change from/target/to among the offered options
          if (!rule) return d;
          const st = steps(d);
          if (rule.effect === "jump") {
            if (flag) return ops.updateRule(d, rule.id, { ...rule, from: pick(st, b)!.id });
            const fromIdx = st.findIndex((x) => x.id === rule.from);
            const opts: Extract<LogicRule, { effect: "jump" }>["to"][] = [...st.slice(fromIdx + 1).map((x) => x.id), ...(d.endings ?? []).map((e) => ({ ending: e.id }))];
            return ops.updateRule(d, rule.id, { ...rule, to: pick(opts, b)! });
          }
          return ops.updateRule(d, rule.id, { ...rule, target: pick(st, b)!.id });
        }
        case 14: {
          // setEffect
          if (!rule) return d;
          const st = steps(d);
          if (flag && rule.effect !== "jump") {
            const from = st.find((x) => x.kind === "field")?.id ?? st[0]?.id ?? "";
            return ops.updateRule(d, rule.id, { id: rule.id, effect: "jump", when: rule.when, from, to: { ending: d.endings?.[0]?.id ?? "default" } });
          }
          if (!flag && rule.effect === "jump") {
            return ops.updateRule(d, rule.id, { id: rule.id, effect: "show", when: rule.when, target: st.at(-1)?.id ?? "" });
          }
          return d;
        }
        case 15: return ops.addEnding(d, w || "Thanks!");
        case 16: { const e = pick(d.endings ?? [], b); return e ? ops.removeEnding(d, e.id) : d; }
        case 17: return ops.addHidden(d, { name: w || "input", type: pick(["string", "number", "boolean"] as const, b)! });
        case 18: { const h = pick(d.hidden ?? [], b); return h ? ops.updateHidden(d, h.name, { name: w }) : d; }
        case 19: { const h = pick(d.hidden ?? [], b); return h ? ops.removeHidden(d, h.name) : d; }
        case 20: return ops.updateSettings(d, { anonymous: flag });
        case 21: return fld ? ops.updateBlock(d, fld.id, { required: flag, description: w }) : d;
        case 22: {
          // clause editor: switch a rule to read a hidden input
          const h = pick(d.hidden ?? [], b);
          if (!rule || !h) return d;
          return ops.updateRule(d, rule.id, { ...rule, when: { op: "eq", left: { hidden: h.name }, right: { value: "" } } });
        }
        case 23: {
          // retype a hidden input
          const h = pick(d.hidden ?? [], b);
          return h ? ops.updateHidden(d, h.name, { type: pick(["string", "number", "boolean"] as const, a)!, identifying: flag }) : d;
        }
        case 24: {
          // switch between single and multiple choice
          if (!fld || !["single-choice", "multi-choice"].includes(fld.type)) return d;
          return ops.updateBlock(d, fld.id, { type: fld.type === "single-choice" ? "multi-choice" : "single-choice" });
        }
        case 25: {
          // an "is one of" rule on a single-choice field, then maybe drop one of its options
          const sc = fieldsOf(d).find((f) => f.type === "single-choice");
          const target = sc && d.blocks.slice(d.blocks.indexOf(sc) + 1).find((x) => x.kind !== "page-break");
          if (!sc || !target) return d;
          const values = ((sc.props?.options as { value: string }[]) ?? []).map((o) => o.value);
          return ops.addRule(d, { id: ops.newId("rule"), effect: "show", target: target.id, when: { op: "in", left: { field: sc.id }, right: { value: values.slice(0, 1 + (b % 2)) } } });
        }
      }
      return d;
    };
    return { name: `${k}:${a}:${b}:${JSON.stringify(w)}:${flag}`, f };
  });

// A modest run count keeps CI fast; raise `numRuns` locally to hunt for more.
describe("fuzz ops", () => {
  it("every UI-reachable edit sequence keeps a definition that parses", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_TEMPLATES), fc.array(opArb, { maxLength: 40 }), (t, seq) => {
        let d = t.create();
        expect(parseForm(d).ok).toBe(true);
        const trail: string[] = [];
        for (const op of seq) {
          d = op.f(d);
          trail.push(op.name);
          const r = parseForm(d);
          if (!r.ok) throw new Error(`${t.id} after ${trail.join(" | ")}\n${JSON.stringify(r.issues)}\n${JSON.stringify(d, null, 1)}`);
          coverage(d, { maxStates: 200 });
          // No-op edits hand back the same object, so they add no undo step.
          expect(ops.updateSettings(d, {})).toBe(d);
          expect(ops.updateForm(d, { title: d.title })).toBe(d);
          const first = d.blocks[0];
          if (first) expect(ops.moveBlock(d, first.id, 0)).toBe(d);
        }
      }),
      { numRuns: 150 },
    );
  }, 60000);
});
