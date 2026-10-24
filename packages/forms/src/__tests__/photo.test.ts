import { describe, expect, it } from "vitest";
import {
  defineForm,
  f,
  getFieldType,
  isEmptyValue,
  isPhotoRef,
  listFieldTypes,
  normalizeValue,
  parseForm,
  photoFormatList,
  photoLimits,
  photoRefs,
  summarizeValue,
  UPLOAD_FIELD_TYPES,
  validateField,
  type FieldBlock,
  type Json,
} from "../index";
import { validateSubmission } from "../server";
import { coverage } from "../testing";

const field = (props?: Record<string, Json>): FieldBlock => ({
  kind: "field",
  id: "q",
  key: "q",
  type: "photo",
  label: "Add a photo (optional)",
  ...(props ? { props } : {}),
});
const ref = (id: string, over: Record<string, Json> = {}): Json => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg",
  size: 2_000_000,
  ...over,
});
const validate = (value: Json, props?: Record<string, Json>) => getFieldType("photo")!.validate!(value, field(props));

describe("photo field type", () => {
  it("is registered, opt-in for builders, never sensitive or identifying by default", () => {
    expect(listFieldTypes().map((t) => t.type)).toContain("photo");
    expect(UPLOAD_FIELD_TYPES).toEqual(["photo"]);
    const block = f.photo("photo", { label: "Add a photo (optional)" });
    expect(block).toEqual({ kind: "field", id: "photo", key: "photo", type: "photo", label: "Add a photo (optional)" });
    const manifest = getFieldType("photo")!;
    expect(manifest.category).toBe("media");
    expect(manifest.operators).toEqual(["answered", "empty"]);
  });

  it("reads its limits, falling back to the defaults", () => {
    expect(photoLimits(field())).toEqual({
      maxFiles: 3,
      maxSizeMb: 10,
      maxBytes: 10 * 1024 * 1024,
      formats: ["jpeg", "png", "heic", "webp"],
      mimeTypes: ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"],
    });
    expect(photoLimits(field({ maxFiles: 1, maxSizeMb: 2, formats: ["heic", "jpeg"] }))).toMatchObject({
      maxFiles: 1,
      maxBytes: 2 * 1024 * 1024,
      formats: ["jpeg", "heic"],
    });
    expect(photoLimits(field({ maxFiles: 9, maxSizeMb: 0, formats: ["gif"] }))).toMatchObject({ maxFiles: 3, maxSizeMb: 10, formats: ["jpeg", "png", "heic", "webp"] });
    expect(photoFormatList(["jpeg", "png", "webp"])).toBe("JPEG, PNG or WebP");
  });

  it("is empty with no photos", () => {
    expect(isEmptyValue(undefined, field())).toBe(true);
    expect(isEmptyValue([], field())).toBe(true);
    expect(isEmptyValue([ref("a")], field())).toBe(false);
  });

  it("takes references within the field's limits", () => {
    expect(validate([ref("a"), ref("b", { type: "image/heic", name: "IMG_1.HEIC" })])).toBeNull();
    expect(validate([ref("a"), ref("b"), ref("c"), ref("d")])).toBe("Add at most 3 photos.");
    expect(validate([ref("a"), ref("b")], { maxFiles: 1 })).toBe("Add at most 1 photo.");
    expect(validate([ref("a"), ref("a")])).toBe("Each photo can be added once.");
    expect(validate([ref("a", { type: "image/gif" })])).toBe("Use a JPEG, PNG, HEIC or WebP photo.");
    expect(validate([ref("a", { type: "image/png" })], { formats: ["jpeg"] })).toBe("Use a JPEG photo.");
    expect(validate([ref("a", { size: 3 * 1024 * 1024 })], { maxSizeMb: 2 })).toBe("Each photo must be 2 MB or smaller.");
  });

  it("refuses anything that isn't a list of references (bytes included)", () => {
    expect(validate("data:image/jpeg;base64,AAAA")).toBe("Add a photo.");
    expect(validate([{ id: "", name: "a.jpg", type: "image/jpeg", size: 1 }])).toBe("Add a photo.");
    expect(validate([{ id: "a", name: "a.jpg", type: "image/jpeg", size: 0 }])).toBe("Add a photo.");
    expect(validate([{ id: "a", name: "a.jpg", type: "image/jpeg", size: 1.5 }])).toBe("Add a photo.");
    expect(validate([{ id: "x".repeat(201), name: "a.jpg", type: "image/jpeg", size: 1 }])).toBe("Add a photo.");
    expect(isPhotoRef({ id: "a", name: "a.jpg", type: "image/jpeg", size: 1 })).toBe(true);
  });

  it("stores only the reference's four keys and summarizes by name", () => {
    const stored = normalizeValue([ref("a", { data: "AAAA" })], field());
    expect(stored).toEqual([{ id: "a", name: "a.jpg", type: "image/jpeg", size: 2_000_000 }]);
    expect(summarizeValue([ref("a"), ref("b")], field())).toBe("a.jpg, b.jpg");
    expect(photoRefs([ref("a"), "junk", null])).toEqual([{ id: "a", name: "a.jpg", type: "image/jpeg", size: 2_000_000 }]);
  });

  it("is checked by parseForm", () => {
    const form = (props: Record<string, Json>) => ({
      schemaVersion: 1 as const,
      id: "f",
      title: "F",
      blocks: [{ kind: "field", id: "q", key: "q", type: "photo", label: "Photo", props }],
    });
    expect(parseForm(form({ maxFiles: 2, maxSizeMb: 25, formats: ["jpeg", "heic"] })).ok).toBe(true);
    const bad = parseForm(form({ maxFiles: 6, maxSizeMb: 26, formats: [] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(["blocks[0].props.maxFiles", "blocks[0].props.maxSizeMb", "blocks[0].props.formats"]),
      );
    }
    const dupes = parseForm(form({ formats: ["jpeg", "jpeg"] }));
    expect(dupes.ok).toBe(false);
    expect(parseForm(form({ formats: ["gif"] })).ok).toBe(false);
  });

  it("warns when a formula reads photos", () => {
    const result = parseForm({
      schemaVersion: 1,
      id: "f",
      title: "F",
      blocks: [
        { kind: "field", id: "p", key: "p", type: "photo", label: "Photo" },
        { kind: "field", id: "c", key: "c", type: "calculated", label: "C", props: { formula: "p + 1" } },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.message)).toContain('"p" holds photos, not numbers; the formula reads it as blank.');
  });

  it("is validated on the server like any answer", () => {
    const form = defineForm({
      id: "feedback",
      title: "Feedback",
      blocks: [f.shortText("note", { label: "Note" }), f.photo("photo", { label: "Add a photo (optional)", maxFiles: 2 })],
    });
    const ok = validateSubmission(form.definition, { answers: { note: "Broken rower", photo: [ref("a")] } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.submission.answers.photo).toEqual([{ id: "a", name: "a.jpg", type: "image/jpeg", size: 2_000_000 }]);
    const tooMany = validateSubmission(form.definition, { answers: { photo: [ref("a"), ref("b"), ref("c")] } });
    expect(tooMany.ok).toBe(false);
    expect(validateField(field({ maxFiles: 2 }), [ref("a")])).toBeNull();
  });

  it("has a sample coverage can use", () => {
    const form = defineForm({
      id: "cov",
      title: "Cov",
      blocks: [f.photo("photo", { label: "Photo", required: true })],
    });
    const report = coverage(form.definition);
    expect(report.unsampledFields).toEqual([]);
    expect(report.unreachableBlocks).toEqual([]);
  });
});
