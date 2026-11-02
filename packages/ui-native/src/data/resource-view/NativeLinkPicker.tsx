// A link's picker in NativeResourceView's form sheet (docs/RESOURCE-VIEW.md, "Links in forms"): the
// same rows as the web's RelationField, from core's useLinkOptions: the linked resource through
// the provider, under the linked view's scope and default filter, searched on the server and a
// page at a time. A row shows the chosen row's words; pressing it opens the list in place (no
// second sheet over the form), with a search bar, None for an optional link, and Show more.

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLinkOptions, useRelationLabel, useViewer } from "@marktiderman/genesis-core/hooks";
import { NativeLabel } from "../../components/label";
import { NativeSearchBar } from "../../components/search-bar";
import { NativeText } from "../../components/text";
import { NativeButton } from "../../components/button";
import { isEmptyValue, useNativeResourceViewMessages } from "./display";
import { defaultNativeResourceViewMessages } from "./messages";
import type { NativeFormField } from "./mapping";

/** How long typing settles before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 300;

export interface NativeLinkPickerProps {
  field: NativeFormField;
  value: unknown;
  /** The picked row's key as the row holds it; `null` when None is chosen. */
  onChange: (value: string | number | null) => void;
  /** The form's values, for a picker whose filters follow another field. */
  values: Readonly<Record<string, unknown>>;
  error?: string | undefined;
  testID: string;
}

export function NativeLinkPicker({ field, value, onChange, values, error, testID }: NativeLinkPickerProps) {
  const messages = useNativeResourceViewMessages();
  const words = { ...defaultNativeResourceViewMessages.link!, ...messages.link };
  const link = field.link!;
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // By value: the sheet re-renders on every keystroke.
  const filtersKey = JSON.stringify(link.filters(viewer.scope, values));
  const filters = useMemo(() => JSON.parse(filtersKey) as ReturnType<typeof link.filters>, [filtersKey]);
  const labelField = field.labelField ?? link.labelField;
  const list = useLinkOptions(
    { resource: link.resource, field: link.field, labelField, searchFields: link.searchFields, orderBy: link.orderBy },
    { filters, search, enabled: open, untitled: words.untitled! },
  );

  const loaded = isEmptyValue(value) ? undefined : list.options.find((o) => String(o.value) === String(value));
  const looked = useRelationLabel({ resource: link.resource, field: link.field }, value, {
    ...((list.labelField ?? labelField) ? { labelField: (list.labelField ?? labelField)! } : {}),
    enabled: !isEmptyValue(value) && !loaded,
  });
  const chosen = isEmptyValue(value)
    ? null
    : (loaded?.label ??
      (looked === undefined
        ? undefined
        : (looked ?? field.missingLabel ?? messages.common.hiddenLink ?? defaultNativeResourceViewMessages.common.hiddenLink!)));
  const shown = chosen === undefined ? messages.common.empty : (chosen ?? words.placeholder!);

  const pick = (next: string | number | null) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <View testID={testID} style={{ gap: 6 }}>
      <NativeLabel>{field.label}</NativeLabel>
      <Pressable
        testID={`${testID}-trigger`}
        accessibilityRole="button"
        // The error is read with the field, not only shown under it.
        accessibilityLabel={error ? `${field.label}, ${shown}, ${error}` : `${field.label}, ${shown}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        className="min-h-[44px] flex-row items-center justify-between rounded-md border border-input bg-background px-3"
      >
        <Text className={chosen ? "text-base text-foreground" : "text-base text-muted-foreground"} numberOfLines={1}>
          {shown}
        </Text>
        <Text className="text-muted-foreground" accessible={false}>
          {open ? "▴" : "▾"}
        </Text>
      </Pressable>
      {open ? (
        <View testID={`${testID}-list`} style={{ gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={field.label}>
          {list.searchable ? (
            <NativeSearchBar
              testID={`${testID}-search`}
              value={query}
              onChange={setQuery}
              placeholder={words.search!}
              showCancel={false}
            />
          ) : null}
          {!field.required && query === "" ? (
            <Option
              testID={`${testID}-none`}
              label={words.none!}
              muted
              selected={isEmptyValue(value)}
              onPress={() => pick(null)}
            />
          ) : null}
          {list.isLoading ? (
            <NativeText preset="caption" className="px-3 py-2 text-muted-foreground" testID={`${testID}-loading`}>
              {messages.form.loading}
            </NativeText>
          ) : list.isError ? (
            <NativeText preset="caption" className="px-3 py-2 text-destructive" accessibilityRole="alert">
              {words.loadFailed}
            </NativeText>
          ) : list.options.length === 0 ? (
            <NativeText preset="caption" className="px-3 py-2 text-muted-foreground" testID={`${testID}-empty`}>
              {words.noResults}
            </NativeText>
          ) : (
            list.options.map((option) => (
              <Option
                key={String(option.value)}
                testID={`${testID}-option-${String(option.value)}`}
                label={option.label}
                selected={!isEmptyValue(value) && String(value) === String(option.value)}
                onPress={() => pick(option.value)}
              />
            ))
          )}
          {list.hasMore ? (
            <NativeButton
              variant="ghost"
              size="sm"
              testID={`${testID}-more`}
              disabled={list.isLoadingMore}
              onPress={list.loadMore}
            >
              {list.isLoadingMore ? messages.list.loadingMore : words.loadMore!}
            </NativeButton>
          ) : null}
        </View>
      ) : null}
      {error ? (
        // A live region on Android; the alert role on iOS and the web.
        <View accessibilityLiveRegion="polite">
          <NativeText preset="caption" className="text-destructive" testID={`${testID}-error`} accessibilityRole="alert">
            {error}
          </NativeText>
        </View>
      ) : null}
    </View>
  );
}

function Option({
  label,
  selected,
  muted = false,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  muted?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      // One choice of several: a radio, checked when it's the link's row.
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[44px] flex-row items-center justify-between px-3"
    >
      <Text className={muted ? "text-base text-muted-foreground" : "text-base text-foreground"}>{label}</Text>
      {selected ? (
        <Text className="text-base text-primary" accessible={false}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}
