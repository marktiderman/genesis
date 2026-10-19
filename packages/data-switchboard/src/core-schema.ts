// =====================================================================
// The one schema model, from @marktiderman/genesis-core/schema
// (docs/DATA-STUDIO.md decision 11). Every switchboard module reads it
// through this file.
//
// WHY A RELATIVE PATH AND NOT THE PACKAGE NAME. genesis-core is an OPTIONAL
// peer of this package (see index.ts): a switchboard consumer may never
// install it. These imports are type-only, so the JS never touches it, but a
// `from "@marktiderman/genesis-core/schema"` would survive into the published
// .d.ts, and a consumer with `skipLibCheck: false` and no genesis-core would
// fail to compile. tsup leaves package imports external and inlines relative
// ones, so importing the source by path makes the published types carry the
// definitions themselves. They are the same types, not copies: TypeScript
// compares them structurally, so values flow freely between the two.
// `src/__tests__/published-types.test.ts` asserts the built .d.ts keeps no
// reference to genesis-core from the root entry.
// =====================================================================
export type {
  DataRow,
  FieldSchema,
  ResourceContract,
  StorageType,
} from "../../core/src/schema/types";
