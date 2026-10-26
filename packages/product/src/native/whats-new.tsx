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
import { View } from "react-native";
import { NativeButton, NativeSheet, NativeSheetScrollView, NativeText } from "@marktiderman/genesis-ui-native/components";
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
  /** Called with a note's `url` when it has one ("Learn more"). */
  onOpenNote?: (note: WhatsNewNote) => void;
  copy?: ProductCopyInput;
  testID?: string;
}

export function ProductWhatsNewSheet({ notes, dismiss, onOpenNote, copy: input, testID = "product-whats-new" }: ProductWhatsNewSheetProps) {
  const copy = useMemo(() => mergeCopy(input), [input]);
  return (
    <NativeSheet open onOpenChange={(open) => (open ? undefined : dismiss())} testID={testID}>
      <NativeSheetScrollView contentContainerStyle={{ gap: 16, padding: 24 }}>
        <NativeText preset="h3" accessibilityRole="header">
          {copy.whatsNew.title}
        </NativeText>
        {notes.map((note) => (
          <View key={note.id} style={{ gap: 4 }} testID={`${testID}-note-${note.id}`}>
            <NativeText preset="label">{note.title}</NativeText>
            {note.body ? (
              <NativeText preset="body-sm" className="text-muted-foreground">
                {note.body}
              </NativeText>
            ) : null}
            {note.url && onOpenNote ? (
              <NativeButton variant="ghost" size="sm" onPress={() => onOpenNote(note)} testID={`${testID}-open-${note.id}`}>
                {copy.whatsNew.learnMore}
              </NativeButton>
            ) : null}
          </View>
        ))}
        <NativeButton onPress={dismiss} testID={`${testID}-done`}>
          {copy.whatsNew.done}
        </NativeButton>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

export interface ProductWhatsNewProps extends Omit<ProductWhatsNewSheetProps, "notes" | "dismiss"> {
  store: ProductWhatsNewStore;
}

/** Renders the sheet while the store shows notes, and nothing otherwise. */
export function ProductWhatsNew({ store, ...sheet }: ProductWhatsNewProps) {
  const state = useProductWhatsNew(store);
  if (state.status !== "showing") return null;
  return <ProductWhatsNewSheet {...sheet} notes={state.notes} dismiss={store.dismiss} />;
}
