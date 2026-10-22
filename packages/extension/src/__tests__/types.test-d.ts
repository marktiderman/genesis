import { expectTypeOf, test } from "vitest";
import {
  createPrefs,
  createRouter,
  startNativeJob,
  type ContentContext,
  type Prefs,
} from "../index";

test("settings keep their shape", () => {
  const prefs = createPrefs("acme", {
    mode: "panel" as "panel" | "side",
    on: false,
  });
  expectTypeOf(prefs).toEqualTypeOf<
    Prefs<{ mode: "panel" | "side"; on: boolean }>
  >();
  expectTypeOf(prefs.set)
    .parameter(0)
    .toEqualTypeOf<Partial<{ mode: "panel" | "side"; on: boolean }>>();
});

test("content handlers get their tab and frame", () => {
  createRouter({
    content: {
      HIDE: (_m, context) => {
        expectTypeOf(context).toEqualTypeOf<ContentContext>();
        expectTypeOf(context.frameId).toBeNumber();
      },
    },
  });
});

test("native jobs resolve with the helper's last message", () => {
  expectTypeOf(startNativeJob)
    .returns.toHaveProperty("done")
    .resolves.toEqualTypeOf<Record<string, unknown>>();
});
