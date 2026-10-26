/**
 * The roadmap without dates: Now / Next / Later in a segmented control over
 * InboxPage rows. A tap opens the item in a sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { NativeButton, NativeSegmentedControl, NativeSheet, NativeSheetScrollView, NativeText } from "@marktiderman/genesis-ui-native/components";
import { InboxPage, type InboxItem, type InboxPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { FeatureHorizon } from "@marktiderman/genesis-features";
import type { ProductSource, RoadmapItem } from "../app";
import { mergeCopy, type ProductCopy, type ProductCopyInput } from "./copy";
import { haptic, type HapticsLike } from "./haptics";

/** Options for {@link useRoadmap}. */
export interface RoadmapOptions {
  source: Pick<ProductSource, "roadmap">;
  /** The tab it opens on. Default `"now"`. */
  initial?: FeatureHorizon;
  haptics?: HapticsLike;
  copy?: ProductCopyInput;
  /** Default `"product-roadmap"`. */
  testID?: string;
}

/** What {@link useRoadmap} returns. */
export interface Roadmap {
  headerTitle: string;
  horizon: FeatureHorizon;
  setHorizon: (horizon: FeatureHorizon) => void;
  /** The open item, or `null`. */
  selected: RoadmapItem | null;
  close: () => void;
  page: Pick<
    InboxPageProps,
    "items" | "loading" | "error" | "refreshing" | "onRefresh" | "emptyTitle" | "emptyBody" | "errorTitle" | "errorBody" | "testID"
  >;
  copy: ProductCopy;
}

export function useRoadmap(options: RoadmapOptions): Roadmap {
  const { source, haptics, testID = "product-roadmap" } = options;
  const copy = useMemo(() => mergeCopy(options.copy), [options.copy]);
  const [horizon, setHorizonState] = useState<FeatureHorizon>(options.initial ?? "now");
  const [all, setAll] = useState<RoadmapItem[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<RoadmapItem | null>(null);
  const alive = useRef(true);
  const latest = useRef(source);
  latest.current = source;

  const load = useCallback(async () => {
    try {
      const items = await latest.current.roadmap();
      if (alive.current) {
        setAll(items);
        setError(false);
      }
    } catch {
      if (alive.current) setError(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const items: InboxItem[] = (all ?? [])
    .filter((item) => item.horizon === horizon)
    .map((item) => ({
      id: item.id,
      title: item.title,
      preview: item.summary,
      meta: item.votes ? copy.ideas.votes(item.votes) : undefined,
      onPress: () => setSelected(item),
      testID: `${testID}-item-${item.id}`,
    }));

  return {
    headerTitle: copy.roadmap.title,
    horizon,
    setHorizon: (next) => {
      if (next === horizon) return;
      haptic(haptics, "select");
      setHorizonState(next);
    },
    selected,
    close: () => setSelected(null),
    copy,
    page: {
      testID,
      items,
      loading: all === null && !error,
      error,
      refreshing,
      onRefresh: async () => {
        setRefreshing(true);
        try {
          await load();
        } finally {
          if (alive.current) setRefreshing(false);
        }
      },
      emptyTitle: copy.roadmap.emptyTitle,
      emptyBody: copy.roadmap.emptyBody,
      errorTitle: copy.roadmap.errorTitle,
      errorBody: copy.roadmap.errorBody,
    },
  };
}

/** One roadmap item in a sheet. */
export interface RoadmapDetailSheetProps {
  item: RoadmapItem;
  onClose: () => void;
  copy: ProductCopy;
  testID?: string;
}

export function RoadmapDetailSheet({ item, onClose, copy, testID = "product-roadmap-detail" }: RoadmapDetailSheetProps) {
  return (
    <NativeSheet open onOpenChange={(open) => (open ? undefined : onClose())} fitContent testID={testID}>
      <NativeSheetScrollView contentContainerStyle={{ gap: 12, padding: 24 }}>
        <NativeText preset="h3" accessibilityRole="header">
          {item.title}
        </NativeText>
        <NativeText preset="label" className="text-muted-foreground">
          {[copy.roadmap[item.horizon], item.votes ? copy.ideas.votes(item.votes) : null].filter(Boolean).join(" · ")}
        </NativeText>
        {item.summary ? <NativeText preset="body-sm">{item.summary}</NativeText> : null}
        <NativeButton variant="outline" onPress={onClose} testID={`${testID}-close`}>
          {copy.roadmap.close}
        </NativeButton>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

/** The roadmap screen: the segmented control above the rows, and the open item's sheet. */
export function RoadmapScreen(props: RoadmapOptions) {
  const roadmap = useRoadmap(props);
  const testID = roadmap.page.testID ?? "product-roadmap";
  const header = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <NativeSegmentedControl<FeatureHorizon>
        testID={`${testID}-horizon`}
        value={roadmap.horizon}
        onChange={roadmap.setHorizon}
        options={(["now", "next", "later"] as const).map((h) => ({ value: h, label: roadmap.copy.roadmap[h] }))}
      />
    </View>
  );
  return (
    <>
      <InboxPage {...roadmap.page} header={header} />
      {roadmap.selected ? <RoadmapDetailSheet item={roadmap.selected} onClose={roadmap.close} copy={roadmap.copy} testID={`${testID}-detail`} /> : null}
    </>
  );
}
