/**
 * "What's new" in a sheet, once per app version plus over-the-air update
 * (`createProductWhatsNew` and `whatsNewKey` in the core), with notes fetched
 * from the source when it is due, never bundled.
 *
 * Hung off genesis-native's updates block: turn the block's own sheet off
 * (`createUpdates({ whatsNew: false, … })`) and render this inside
 * `GenesisNativeApp`, keyed by the same modules the block reads:
 *
 *   const whatsNew = createProductWhatsNew({
 *     source, storage: AsyncStorage,
 *     key: whatsNewKey({ application: Application, updates: Updates }),
 *   });
 *   <ProductWhatsNew store={whatsNew} />
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { NativeWhatsNewSheet } from "@marktiderman/genesis-ui-native/components";
import type { ProductWhatsNew as ProductWhatsNewStore, ProductWhatsNewState, WhatsNewNote } from "../app";
import { mergeCopy, type ProductCopyInput } from "./copy";

/** The store's state; loads it once on mount. */
export function useProductWhatsNew(store: ProductWhatsNewStore): ProductWhatsNewState {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => {
    void store.load();
  }, [store]);
  return state;
}

/** The sheet itself. */
export interface ProductWhatsNewSheetProps {
  notes: readonly WhatsNewNote[];
  dismiss: () => void;
  /** "Learn more" on a note with a `url`: the sheet closes (and is remembered), then this opens it. */
  onOpenNote?: (note: WhatsNewNote) => void;
  copy?: ProductCopyInput;
  testID?: string;
}

/**
 * The sheet, in the product's copy: genesis-ui-native's `NativeWhatsNewSheet` with the notes'
 * ids as keys.
 *
 * @deprecated Render `NativeWhatsNewSheet` from `@marktiderman/genesis-ui-native` (the one
 * "what's new" sheet, also behind genesis-native's updates block), mapping each note to
 * `{ key: note.id, title, body, url }`; `ProductWhatsNew` keeps working and renders it.
 */
export function ProductWhatsNewSheet(props: ProductWhatsNewSheetProps) {
  return <WhatsNewSheetForProduct {...props} />;
}

function WhatsNewSheetForProduct({ notes, dismiss, onOpenNote, copy: input, testID = "product-whats-new" }: ProductWhatsNewSheetProps) {
  const copy = useMemo(() => mergeCopy(input), [input]);
  const byKey = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  return (
    <NativeWhatsNewSheet
      notes={notes.map((note) => ({ key: note.id, title: note.title, ...(note.body ? { body: note.body } : {}), ...(note.url ? { url: note.url } : {}) }))}
      dismiss={dismiss}
      {...(onOpenNote ? { onOpenNote: (note: { key: string }) => onOpenNote(byKey.get(note.key)!) } : {})}
      title={copy.whatsNew.title}
      doneLabel={copy.whatsNew.done}
      learnMoreLabel={copy.whatsNew.learnMore}
      testID={testID}
      noteTestID={(key) => `${testID}-note-${key}`}
    />
  );
}

export interface ProductWhatsNewProps extends Omit<ProductWhatsNewSheetProps, "notes" | "dismiss"> {
  store: ProductWhatsNewStore;
}

/** Renders the sheet while the store shows notes, and nothing otherwise. */
export function ProductWhatsNew({ store, ...sheet }: ProductWhatsNewProps) {
  const state = useProductWhatsNew(store);
  if (state.status !== "showing") return null;
  return <WhatsNewSheetForProduct {...sheet} notes={state.notes} dismiss={store.dismiss} />;
}
