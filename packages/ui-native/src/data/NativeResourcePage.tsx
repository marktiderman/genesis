import * as React from "react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResource, type UseResourceOptions } from "@marktiderman/genesis-core/hooks";
import type { BaseRecord } from "@marktiderman/genesis-core";
import { NativeText } from "../components/text";
import {
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "../components/card";
import { NativeButton } from "../components/button";
import { NativeSkeleton } from "../components/skeleton";
import { NativeDataFilters } from "./NativeDataFilters";
import { NativeEmptyState } from "./NativeEmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeCardFieldDef<T> {
  key: Extract<keyof T, string>;
  label?: string;
  render?: (value: unknown, item: T) => ReactNode;
  position?: "title" | "badge" | "subtitle" | "meta";
}

export interface NativeResourcePageProps<T extends BaseRecord = BaseRecord> {
  // Data source
  resource: string;
  resourceOptions?: UseResourceOptions<T>;

  // Page chrome
  title: string;
  subtitle?: string;

  // List rendering
  cardFields?: Array<string | NativeCardFieldDef<T>>;
  renderItem?: (item: T) => ReactNode;

  // Search & filters
  searchFields?: string[];
  searchPlaceholder?: string;
  statusFilter?: string | { field: string; options?: string[] };

  // Detail
  onItemPress?: (item: T) => void;
  titleField?: Extract<keyof T, string>;

  // CRUD — presence of onCreatePress enables the create button
  onCreatePress?: () => void;
  createLabel?: string;

  // Slots
  headerRight?: ReactNode;
  emptyState?: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveField<T>(
  f: string | NativeCardFieldDef<T>,
  index: number
): NativeCardFieldDef<T> {
  if (typeof f === "string") {
    return {
      key: f as Extract<keyof T, string>,
      position: index === 0 ? "title" : "meta",
    };
  }
  return f;
}

function autoDetectFields<T extends BaseRecord>(
  item: T
): Array<NativeCardFieldDef<T>> {
  const keys = Object.keys(item).filter((k) => k !== "id");
  return keys.map((key, i) => ({
    key: key as Extract<keyof T, string>,
    position: i === 0 ? ("title" as const) : ("meta" as const),
  }));
}

// ---------------------------------------------------------------------------
// DefaultCardRenderer
// ---------------------------------------------------------------------------

interface DefaultCardRendererProps<T extends BaseRecord> {
  item: T;
  fields: Array<NativeCardFieldDef<T>>;
  onPress?: (item: T) => void;
}

function DefaultCardRenderer<T extends BaseRecord>({
  item,
  fields,
  onPress,
}: DefaultCardRendererProps<T>) {
  const titleField = fields.find((f) => f.position === "title");
  const badgeField = fields.find((f) => f.position === "badge");
  const subtitleField = fields.find((f) => f.position === "subtitle");
  const metaFields = fields.filter((f) => f.position === "meta");

  const renderValue = (field: NativeCardFieldDef<T>): ReactNode => {
    const value = item[field.key];
    if (field.render) {
      return field.render(value, item);
    }
    if (value === null || value === undefined) return null;
    return String(value);
  };

  const titleContent = titleField ? renderValue(titleField) : null;
  const badgeContent = badgeField ? renderValue(badgeField) : null;
  const subtitleContent = subtitleField ? renderValue(subtitleField) : null;

  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <NativeCard className="mx-4 mb-3">
        <NativeCardHeader className="pb-2">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {titleContent !== null ? (
              <NativeCardTitle className="flex-1 text-base">
                {titleContent}
              </NativeCardTitle>
            ) : null}
            {badgeContent !== null ? (
              <NativeText preset="body-sm" className="text-muted-foreground ml-2">
                {badgeContent}
              </NativeText>
            ) : null}
          </View>
          {subtitleContent !== null ? (
            <NativeText preset="body-sm" className="text-muted-foreground mt-0.5">
              {subtitleContent}
            </NativeText>
          ) : null}
        </NativeCardHeader>
        {metaFields.length > 0 ? (
          <NativeCardContent className="pt-0">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {metaFields.map((field) => {
                const val = renderValue(field);
                if (val === null) return null;
                return (
                  <NativeText key={field.key} preset="caption" className="text-muted-foreground">
                    {field.label ? `${field.label}: ` : ""}
                    {val}
                  </NativeText>
                );
              })}
            </View>
          </NativeCardContent>
        ) : null}
      </NativeCard>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// NativeResourcePage
// ---------------------------------------------------------------------------

function NativeResourcePage<T extends BaseRecord = BaseRecord>({
  resource,
  resourceOptions,
  title,
  subtitle,
  cardFields,
  renderItem,
  searchFields,
  searchPlaceholder,
  statusFilter,
  onItemPress,
  titleField,
  onCreatePress,
  createLabel = "New",
  headerRight,
  emptyState,
}: NativeResourcePageProps<T>) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [search, setSearchLocal] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // Resolve status filter config
  // -------------------------------------------------------------------------

  const statusFilterConfig = useMemo(() => {
    if (!statusFilter) return null;
    if (typeof statusFilter === "string") {
      return { field: statusFilter, options: undefined };
    }
    return { field: statusFilter.field, options: statusFilter.options };
  }, [statusFilter]);

  // -------------------------------------------------------------------------
  // Resource hook — pass searchFields so server-side search works
  // -------------------------------------------------------------------------

  const mergedOptions: UseResourceOptions<T> = useMemo(
    () => ({
      ...resourceOptions,
      searchFields: searchFields ?? resourceOptions?.searchFields,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceOptions, searchFields]
  );

  const { list, setSearch, setFilters } = useResource<T>(resource, mergedOptions);

  // -------------------------------------------------------------------------
  // Sync search state → hook
  // -------------------------------------------------------------------------

  useEffect(() => {
    setSearch(search);
  }, [search, setSearch]);

  // -------------------------------------------------------------------------
  // Sync status filter → hook
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!statusFilterConfig) return;

    if (selectedStatuses.length === 0) {
      setFilters([]);
    } else if (selectedStatuses.length === 1) {
      setFilters([
        {
          field: statusFilterConfig.field,
          operator: "eq" as const,
          value: selectedStatuses[0],
        },
      ]);
    } else {
      setFilters([
        {
          field: statusFilterConfig.field,
          operator: "in" as const,
          value: selectedStatuses,
        },
      ]);
    }
  }, [selectedStatuses, statusFilterConfig, setFilters]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const items: T[] = list.data?.data ?? [];
  const isLoading = list.isLoading;
  const hasError = list.isError;

  // -------------------------------------------------------------------------
  // Resolve card fields
  // -------------------------------------------------------------------------

  const resolvedFields = useMemo<Array<NativeCardFieldDef<T>>>(() => {
    // If titleField provided, inject it as an explicit title override
    if (titleField && cardFields) {
      const resolved = cardFields.map((f, i) => resolveField<T>(f, i));
      // ensure titleField has position=title
      return resolved.map((f) =>
        f.key === titleField ? { ...f, position: "title" as const } : f
      );
    }
    if (cardFields && cardFields.length > 0) {
      return cardFields.map((f, i) => resolveField<T>(f, i));
    }
    // Auto-detect from first item
    if (items.length > 0) {
      const detected = autoDetectFields(items[0]);
      if (titleField) {
        return detected.map((f) =>
          f.key === titleField ? { ...f, position: "title" as const } : f
        );
      }
      return detected;
    }
    return [];
  }, [cardFields, titleField, items]);

  // -------------------------------------------------------------------------
  // Status chip options
  // -------------------------------------------------------------------------

  const statusOptions = useMemo<string[]>(() => {
    if (!statusFilterConfig) return [];
    if (statusFilterConfig.options) return statusFilterConfig.options;
    // Auto-detect from data
    const values = new Set<string>();
    for (const item of items) {
      const v = item[statusFilterConfig.field];
      if (typeof v === "string") values.add(v);
    }
    return Array.from(values).sort();
  }, [statusFilterConfig, items]);

  // -------------------------------------------------------------------------
  // Header right — create button or custom
  // -------------------------------------------------------------------------

  const effectiveHeaderRight = useMemo<ReactNode>(() => {
    if (onCreatePress) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {headerRight}
          <NativeButton size="sm" onPress={onCreatePress}>
            {createLabel}
          </NativeButton>
        </View>
      );
    }
    return headerRight ?? null;
  }, [onCreatePress, createLabel, headerRight]);

  // -------------------------------------------------------------------------
  // Pull-to-refresh
  // -------------------------------------------------------------------------

  const [refreshing, setRefreshing] = useState(false);

  const refetch = list.refetch;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (err) {
      console.error(`[NativeResourcePage] Pull-to-refresh failed:`, err);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // -------------------------------------------------------------------------
  // Filter awareness for empty state
  // -------------------------------------------------------------------------

  const hasActiveFilters = search.length > 0 || selectedStatuses.length > 0;

  const handleClearFilters = useCallback(() => {
    setSearchLocal("");
    setSelectedStatuses([]);
  }, []);

  // -------------------------------------------------------------------------
  // FlatList helpers
  // -------------------------------------------------------------------------

  const keyExtractor = useCallback(
    (item: T) => String(item.id),
    []
  );

  const renderFlatListItem = useCallback(
    ({ item }: { item: T }) => {
      if (renderItem) {
        return <>{renderItem(item)}</>;
      }
      return (
        <DefaultCardRenderer
          item={item}
          fields={resolvedFields}
          onPress={onItemPress}
        />
      );
    },
    [renderItem, resolvedFields, onItemPress]
  );

  // Filters rendered as FlatList header to avoid ScrollView nesting
  const ListHeaderComponent = useMemo(
    () => (
      <View className="px-4 pb-3">
        <NativeDataFilters
          search={search}
          onSearchChange={setSearchLocal}
          searchPlaceholder={searchPlaceholder}
          statusChips={
            statusOptions.length > 0
              ? {
                  options: statusOptions,
                  selected: selectedStatuses,
                  onChange: setSelectedStatuses,
                }
              : undefined
          }
        />
      </View>
    ),
    [search, searchPlaceholder, statusOptions, selectedStatuses]
  );

  const ListEmptyComponent = useMemo(
    () =>
      isLoading ? null : (
        <>
          {emptyState ?? (
            <NativeEmptyState
              hasFilters={hasActiveFilters}
              onClearFilters={hasActiveFilters ? handleClearFilters : undefined}
            />
          )}
        </>
      ),
    [isLoading, emptyState, hasActiveFilters, handleClearFilters]
  );

  // -------------------------------------------------------------------------
  // Render — loading/error use shell-style layout; list uses FlatList directly
  // NOTE: NativeDataPageShell wraps children in ScrollView which conflicts with
  // FlatList — so we replicate the shell's header + SafeAreaView manually.
  // -------------------------------------------------------------------------

  const renderPageContent = () => {
    if (isLoading) {
      return (
        <View className="px-4 pt-4 gap-3">
          <NativeSkeleton className="w-full h-10 rounded-lg" />
          <NativeSkeleton className="w-full h-20 rounded-lg" />
          <NativeSkeleton className="w-full h-20 rounded-lg" />
          <NativeSkeleton className="w-full h-20 rounded-lg" />
        </View>
      );
    }

    if (hasError) {
      return (
        <View className="flex-1 items-center justify-center px-4 py-12 gap-4">
          <NativeText preset="body" className="text-destructive text-center">
            {list.error?.message ?? "Something went wrong."}
          </NativeText>
          <NativeButton variant="outline" size="sm" onPress={() => list.refetch()}>
            Try Again
          </NativeButton>
        </View>
      );
    }

    return (
      <FlatList<T>
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderFlatListItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    );
  };

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
      {/* Page header */}
      <View className="px-4 pt-4 pb-2">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View className="flex-1">
            <NativeText preset="h2">{title}</NativeText>
            {subtitle ? (
              <NativeText
                preset="body-sm"
                className="text-muted-foreground mt-0.5"
              >
                {subtitle}
              </NativeText>
            ) : null}
          </View>
          {effectiveHeaderRight ? (
            <View className="ml-3">{effectiveHeaderRight}</View>
          ) : null}
        </View>
      </View>

      {/* Content */}
      <View className="flex-1">{renderPageContent()}</View>
    </SafeAreaView>
  );
}

export { NativeResourcePage };
