/** Row actions and the chat inbox, on their own, for a simulator check. Not for merging. */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Reanimated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { MenuView } from "@expo/ui/community/menu";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RowSwipeAction } from "@marktiderman/genesis-core/conversation";
import { GenesisModulesProvider, type GenesisModules } from "@marktiderman/genesis-ui-native";
import { NativeRowActions } from "@marktiderman/genesis-ui-native/components";
import { lucideIcons } from "@marktiderman/genesis-ui-native/icons/lucide";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import { ChatInboxScreen, ChatNativeProvider, ChatThreadScreen } from "@marktiderman/genesis-chat/native";
import { createMemoryChatClient } from "../../../packages/chat/src/web/memory-client";

// The swipeable, with each row's ref kept by its testID so a button can open it from code.
type SwipeHandle = { openLeft?: () => void; openRight?: () => void; close?: () => void };
const swipeRefs = new Map<string, { current: SwipeHandle | null }>();
const CapturingSwipeable = forwardRef<SwipeHandle, Record<string, unknown>>(function CapturingSwipeable(props, ref) {
  const inner = useRef<SwipeHandle | null>(null);
  useImperativeHandle(ref, () => ({
    openLeft: () => inner.current?.openLeft?.(),
    openRight: () => inner.current?.openRight?.(),
    close: () => inner.current?.close?.(),
  }));
  useEffect(() => {
    if (typeof props.testID === "string") swipeRefs.set(props.testID, inner);
  }, [props.testID]);
  const Swipeable = ReanimatedSwipeable as unknown as ComponentType<Record<string, unknown>>;
  return <Swipeable {...props} ref={inner} />;
});

const modules: GenesisModules = {
  reanimated: Reanimated as unknown as GenesisModules["reanimated"],
  symbol: SymbolView as unknown as GenesisModules["symbol"],
  icons: lucideIcons,
  haptics: Haptics as unknown as GenesisModules["haptics"],
  swipeable: CapturingSwipeable as unknown as GenesisModules["swipeable"],
  menu: MenuView as unknown as GenesisModules["menu"],
};

function Button({ id, label, onPress }: { id: string; label: string; onPress: () => void }) {
  return (
    <Pressable testID={id} accessibilityRole="button" onPress={onPress} style={{ backgroundColor: "#e4e4e7", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, margin: 3 }}>
      <Text style={{ fontSize: 13, color: "#09090b" }}>{label}</Text>
    </Pressable>
  );
}

// ---- Screen A: rows ----

function Row({ id, title, actions, appearance }: { id: string; title: string; actions: RowSwipeAction[]; appearance?: "fill" | "round" }) {
  return (
    <NativeRowActions testID={id} title={title} actions={actions} {...(appearance ? { appearance } : {})}>
      <Pressable testID={`${id}-row`} accessibilityLabel={title} onPress={() => undefined} style={{ backgroundColor: "#ffffff", paddingHorizontal: 16, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: "#e4e4e7" }}>
        <Text style={{ fontSize: 16, color: "#09090b" }}>{title}</Text>
      </Pressable>
    </NativeRowActions>
  );
}

function RowsScreen() {
  const [log, setLog] = useState<string[]>([]);
  const say = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 6));
  const a = (id: string, label: string, extra: Partial<RowSwipeAction>, row: string): RowSwipeAction => ({ id, label, onPress: () => say(`${row}: ${id}`), ...extra });
  const rowA = [
    a("tint", "Tint", { tone: "tint", icon: "check", side: "leading", full: true }, "A"),
    a("green", "Green", { tone: "green", icon: "star", side: "leading" }, "A"),
    a("red", "Delete", { destructive: true, icon: "trash", side: "trailing", full: true, confirms: true }, "A"),
    a("orange", "Orange", { tone: "orange", icon: "flag", side: "trailing" }, "A"),
    a("purple", "Purple", { tone: "purple", icon: "bell-off", side: "trailing" }, "A"),
  ];
  const rowB = [
    a("yellow", "Yellow", { tone: "yellow", icon: "star", side: "leading", full: true }, "B"),
    a("gray", "Gray", { tone: "gray", icon: "archive", side: "leading" }, "B"),
    a("blue", "Blue", { tone: "blue", icon: "mail-open", side: "trailing", full: true }, "B"),
    a("tint2", "Tint", { tone: "tint", icon: "pin", side: "trailing" }, "B"),
    a("menuonly", "Menu only", { icon: "heart", swipe: false }, "B"),
  ];
  const rowC = [
    a("rgreen", "Green", { tone: "green", icon: "check", side: "leading", full: true }, "C"),
    a("ryellow", "Yellow", { tone: "yellow", icon: "star", side: "leading" }, "C"),
    a("rgray", "Gray", { tone: "gray", icon: "archive", side: "trailing" }, "C"),
    a("rred", "Delete", { destructive: true, icon: "trash", side: "trailing", full: true, confirms: true }, "C"),
  ];
  const open = (row: string, side: "left" | "right") => {
    const r = swipeRefs.get(`${row}-swipe`)?.current;
    if (!r) return say(`no ref for ${row}`);
    if (side === "left") r.openLeft?.();
    else r.openRight?.();
  };
  return (
    <ScrollView testID="rows-screen">
      <Row id="rowA" title="Row A: tint, green | delete, orange, purple" actions={rowA} />
      <Row id="rowB" title="Row B: yellow, gray | blue, tint (+menu only)" actions={rowB} />
      <Row id="rowC" title="Row C (round): green, yellow | gray, delete" actions={rowC} appearance="round" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 8 }}>
        <Button id="open-a-left" label="Open A left (ref)" onPress={() => open("rowA", "left")} />
        <Button id="open-a-right" label="Open A right (ref)" onPress={() => open("rowA", "right")} />
        <Button id="open-c-right" label="Open C right (ref)" onPress={() => open("rowC", "right")} />
        <Button id="close-all" label="Close all" onPress={() => swipeRefs.forEach((r) => r.current?.close?.())} />
        <Button id="clear-log" label="Clear log" onPress={() => setLog([])} />
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: "600", color: "#09090b" }}>Log</Text>
        <Text testID="log" style={{ fontSize: 13, color: "#09090b" }}>{log.length ? log.join("\n") : "(empty)"}</Text>
      </View>
    </ScrollView>
  );
}

// ---- Screen B: chat inbox ----

const ME = "00000000-0000-4000-8000-000000000001";
const ADA = "00000000-0000-4000-8000-0000000000a1";
const BEN = "00000000-0000-4000-8000-0000000000b1";
const CY = "00000000-0000-4000-8000-0000000000c1";
const NAMES: Record<string, string> = { [ME]: "Me", [ADA]: "Ada", [BEN]: "Ben", [CY]: "Cy" };
const t = (min: number) => new Date(Date.UTC(2026, 10, 24, 9, min)).toISOString();

function makeClient() {
  return createMemoryChatClient({
    me: ME,
    conversations: [
      {
        id: "c-ada",
        members: [{ userId: ME, lastReadSeq: 1 }, { userId: ADA }],
        messages: [
          { senderId: ADA, body: "Ada old 1", createdAt: t(1) },
          { senderId: ADA, body: "Ada old 2", createdAt: t(2) },
          { senderId: ADA, body: "Ada old 3 (unread)", createdAt: t(3) },
        ],
      },
      {
        id: "c-ben",
        muted: true,
        members: [{ userId: ME, lastReadSeq: 2 }, { userId: BEN }],
        messages: [
          { senderId: BEN, body: "Ben old 1", createdAt: t(4) },
          { senderId: ME, body: "Ben old 2 (mine)", createdAt: t(5) },
        ],
      },
      {
        id: "c-team",
        title: "Team",
        members: [{ userId: ME, lastReadSeq: 2 }, { userId: ADA }, { userId: CY }],
        messages: [
          { senderId: CY, body: "Team old 1", createdAt: t(6) },
          { senderId: ADA, body: "Team old 2", createdAt: t(7) },
        ],
      },
    ],
  });
}

function ChatScreen() {
  const client = useMemo(makeClient, []);
  const queryClient = useMemo(() => new QueryClient(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const incoming = (id: string, from: string, who: string) => {
    client.receive(id, from, `${who} NEW message ${n}`);
    setN((x) => x + 1);
  };
  return (
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME} loadPeople={async (ids) => Object.fromEntries(ids.filter((i) => NAMES[i]).map((i) => [i, { name: NAMES[i]! }]))}>
        <ChatNativeProvider modules={{ haptics: Haptics as never }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
            <Button id="in-ada" label="Incoming to Ada" onPress={() => incoming("c-ada", ADA, "Ada")} />
            <Button id="in-ben" label="Incoming to Ben" onPress={() => incoming("c-ben", BEN, "Ben")} />
            <Button id="in-team" label="Incoming to Team" onPress={() => incoming("c-team", CY, "Cy")} />
            <Button id="open-ada" label="Open Ada" onPress={() => setOpenId("c-ada")} />
            <Button id="open-ben" label="Open Ben" onPress={() => setOpenId("c-ben")} />
            <Button id="open-team" label="Open Team" onPress={() => setOpenId("c-team")} />
            {openId ? <Button id="thread-back" label="< Back to inbox" onPress={() => setOpenId(null)} /> : null}
          </View>
          <View style={{ flex: 1 }}>{openId ? <ChatThreadScreen key={openId} conversationId={openId} /> : <ChatInboxScreen onOpen={setOpenId} />}</View>
        </ChatNativeProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
}

export function VerifyApp() {
  const [tab, setTab] = useState<"rows" | "chat">("rows");
  const screen: ReactNode = tab === "rows" ? <RowsScreen /> : <ChatScreen />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GenesisModulesProvider modules={modules}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f4f5" }} edges={["top", "bottom"]}>
            <View style={{ flexDirection: "row", padding: 4 }}>
              <Button id="tab-rows" label={tab === "rows" ? "[Rows]" : "Rows"} onPress={() => setTab("rows")} />
              <Button id="tab-chat" label={tab === "chat" ? "[Chat inbox]" : "Chat inbox"} onPress={() => setTab("chat")} />
            </View>
            <View style={{ flex: 1 }}>{screen}</View>
          </SafeAreaView>
        </GenesisModulesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
