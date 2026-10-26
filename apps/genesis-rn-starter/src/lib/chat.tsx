/**
 * Chat (`features.chat`): the chat client on the app's Supabase, the native
 * modules the chat screens use, resumable uploads, unsent messages kept on
 * the phone, and the push glue (the `messages` category's Reply and Mark read).
 * `src/app/(app)/messages/_layout.tsx` mounts `ChatRoot` over the Messages
 * tab; `push.ts` adds the category and the reply handler.
 *
 * Names and avatars: genesis-chat stores user ids only. The starter reads them
 * with `loadChatPeople`, through `public.chat_people` (migration
 * `20261026000000_chat_people.sql`): the `name` and `avatar_url` a login's
 * auth metadata carries, for people who share a conversation with you. An app
 * with its own profiles passes its own `loadPeople` to `ChatRoot` instead.
 *
 * Unsent messages are retried when the app comes back to the front and when
 * the connection comes back (`ChatAutoRetry`, with NetInfo), and forgotten on
 * sign-out with the person's drafts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Audio from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as ExpoCrypto from "expo-crypto";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import * as Notifications from "expo-notifications";
import { useEffect, type ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { createChatClient, type LocalFile, type Outbox, type OutboxStore, type QueuedMessage } from "@marktiderman/genesis-chat";
import { ChatProvider, useChat, type ChatProviderProps } from "@marktiderman/genesis-chat/react";
import {
  ChatAutoRetry,
  ChatNativeProvider,
  clearDrafts,
  createTusUpload,
  handleChatPushResponse,
  registerChatNotificationActions,
  type ChatNativeModules,
} from "@marktiderman/genesis-chat/native";
import { useSession } from "@marktiderman/genesis-native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { env } from "./env";
import { supabase } from "./supabase";

export const chatClient = createChatClient(supabase);

// Genesis describes each module by what it calls, so the packages' own (wider) types are cast once here.
const modules: ChatNativeModules = {
  audio: Audio as unknown as ChatNativeModules["audio"],
  // The library only: the starter asks for no camera permission (add `launchCameraAsync` and a
  // `cameraPermission` sentence in app.config.ts for "Take a photo").
  imagePicker: { launchImageLibraryAsync: ImagePicker.launchImageLibraryAsync } as unknown as ChatNativeModules["imagePicker"],
  haptics: Haptics as unknown as ChatNativeModules["haptics"],
  clipboard: Clipboard as unknown as ChatNativeModules["clipboard"],
  keyboardAvoidingView: starter.features.keyboardScroll ? (KeyboardAvoidingView as unknown as ChatNativeModules["keyboardAvoidingView"]) : undefined,
  drafts: AsyncStorage as unknown as ChatNativeModules["drafts"],
  // Share in the photo viewer, from a copy in the cache. (Save to Photos needs expo-media-library
  // and a photo-library-add permission sentence in app.config.ts: pass it as `mediaLibrary`.)
  sharing: Sharing as unknown as ChatNativeModules["sharing"],
  downloadFile: async (url) => (await File.downloadFileAsync(url, new Directory(Paths.cache), { idempotent: true })).uri,
  netInfo: NetInfo as unknown as ChatNativeModules["netInfo"],
};

const OUTBOX_PREFIX = "genesis-chat:outbox:";

/** Unsent messages wait here between launches (per signed-in person). */
function outboxStore(userId: string): OutboxStore {
  const key = `${OUTBOX_PREFIX}${userId}`;
  return {
    load: async () => {
      try {
        return JSON.parse((await AsyncStorage.getItem(key)) ?? "[]") as QueuedMessage[];
      } catch {
        return [];
      }
    },
    save: async (queue) => {
      await AsyncStorage.setItem(key, JSON.stringify(queue)).catch(() => undefined);
    },
  };
}

const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token;

/** A picked file opened for reading a chunk at a time, so a long video is never read whole into memory. */
function openFile(uri: string) {
  const handle = new File(uri).open(FileMode.ReadOnly);
  return {
    size: handle.size ?? 0,
    read: async (offset: number, length: number) => {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    close: () => handle.close(),
  };
}

/**
 * A file held as bytes (a pasted picture) copied into the cache directory, so an unsent message
 * keeps it across a relaunch. The outbox only calls this for bytes; picked files are already URIs.
 */
async function persistFile(file: LocalFile): Promise<string> {
  const data = file.data;
  const bytes = data instanceof ArrayBuffer ? data : typeof data === "object" && typeof data.arrayBuffer === "function" ? await data.arrayBuffer() : null;
  if (!bytes) throw new Error(`[chat] can't keep ${file.name}: no bytes to write`);
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const out = new File(Paths.cache, `genesis-chat-${ExpoCrypto.randomUUID()}-${safe}`);
  out.create({ overwrite: true });
  await out.write(new Uint8Array(bytes));
  return out.uri;
}

type LoadPeople = NonNullable<ChatProviderProps["loadPeople"]>;

/**
 * Names and avatars from `public.chat_people`: only people who share a conversation with you
 * (and you), only their name and avatar. Someone with no name in their metadata stays unnamed.
 */
export const loadChatPeople: LoadPeople = async (userIds) => {
  // The starter's client has no generated Database types, so rpc() types its arguments as none.
  const { data, error } = await supabase.rpc("chat_people", { p_user_ids: userIds } as never);
  if (error) throw error;
  const out: Awaited<ReturnType<LoadPeople>> = {};
  for (const row of (data ?? []) as { user_id: string; name: string | null; avatar_url: string | null }[]) {
    if (row.name) out[row.user_id] = { name: row.name, avatarUrl: row.avatar_url };
  }
  return out;
};

/** The providers the Messages screens read: the signed-in person's chat, with its uploads and drafts. */
export function ChatRoot({ children, loadPeople = loadChatPeople }: { children: ReactNode; loadPeople?: LoadPeople }) {
  const { userId } = useSession();
  if (!userId) return null;
  return (
    <ChatForUser userId={userId} loadPeople={loadPeople}>
      {children}
    </ChatForUser>
  );
}

const stores = new Map<string, { store: OutboxStore; upload: ReturnType<typeof createTusUpload> }>();
function forUser(userId: string) {
  let s = stores.get(userId);
  if (!s) {
    s = {
      store: outboxStore(userId),
      upload: createTusUpload({ supabaseUrl: env.supabaseUrl, apikey: env.supabasePublishableKey, userId, getAccessToken: accessToken, openFile, newId: ExpoCrypto.randomUUID }),
    };
    stores.set(userId, s);
  }
  return s;
}

function ChatForUser({ userId, loadPeople, children }: { userId: string; loadPeople?: LoadPeople; children: ReactNode }) {
  const { store, upload } = forUser(userId);
  return (
    <ChatProvider client={chatClient} userId={userId} outboxStore={store} upload={upload} newId={ExpoCrypto.randomUUID} persistFile={persistFile} loadPeople={loadPeople}>
      <ShareOutbox userId={userId} />
      <ChatNativeProvider modules={modules} copy={copy.chat}>
        <ChatAutoRetry />
        {children}
      </ChatNativeProvider>
    </ChatProvider>
  );
}

// The outbox the Messages screens are using, per person, so a reply from a notification queues
// in it (and shows in the open thread) instead of writing the saved copy behind its back.
const liveOutboxes = new Map<string, Outbox>();
// Each person's `clearOutbox`, kept past the Messages screens' unmount: signing out unmounts them
// before the signed-in layout sees the sign-out.
const outboxClearers = new Map<string, () => Promise<void>>();
function ShareOutbox({ userId }: { userId: string }) {
  const { outbox, clearOutbox } = useChat();
  useEffect(() => {
    outboxClearers.set(userId, clearOutbox);
  }, [userId, clearOutbox]);
  useEffect(() => {
    liveOutboxes.set(userId, outbox);
    return () => {
      if (liveOutboxes.get(userId) === outbox) liveOutboxes.delete(userId);
    };
  }, [userId, outbox]);
  return null;
}

// Who was signed in last, kept outside React: the layout that sees the sign-out may be a new instance.
let lastChatUser: string | null = null;

/**
 * Forgets a person's unsent messages: through the outbox Messages used (`useChat().clearOutbox()`,
 * which also stops it), or, when Messages wasn't opened since launch, in the saved copy.
 */
export async function clearChatOutbox(userId: string): Promise<void> {
  const clear = outboxClearers.get(userId);
  outboxClearers.delete(userId);
  if (clear) await clear();
  await forUser(userId).store.save([]);
}

/** Everyone else's saved unsent messages, on sign-in: a session that ended while the app was closed. */
async function clearOtherOutboxes(userId: string): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(OUTBOX_PREFIX) && k !== `${OUTBOX_PREFIX}${userId}`);
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

/**
 * Chat drafts and unsent messages never outlive the person who wrote them on this phone: signing
 * out (Settings, account deletion) clears theirs, and signing in clears everyone else's, which covers a session
 * that ended while the app was closed and a switch from one person to another. Mounted once, in
 * the signed-in layout.
 */
export function useClearChatOnSignOut() {
  const { status, userId } = useSession();
  useEffect(() => {
    if (!starter.features.chat) return;
    const onError = (e: unknown) => console.warn("[chat] clearing drafts:", e);
    if (status === "signedIn" && userId) {
      if (lastChatUser !== userId) {
        void clearDrafts(modules.drafts!, { except: userId }, onError);
        void clearOtherOutboxes(userId).catch(onError);
      }
      lastChatUser = userId;
      return;
    }
    if (status !== "signedOut" || !lastChatUser) return;
    const who = lastChatUser;
    lastChatUser = null;
    void clearDrafts(modules.drafts!, who, onError);
    void clearChatOutbox(who).catch(onError);
  }, [status, userId]);
}

/**
 * For createPush's `onResponse`: Reply and Mark read from a message's notification. A reply goes
 * through the outbox: the live one when Messages is open, else one that can't be sent now is kept
 * in the saved outbox, failed, and shows in its thread with Retry.
 */
export function onChatPushResponse(response: Parameters<typeof handleChatPushResponse>[0]) {
  if (!starter.features.chat) return;
  const onError = (e: unknown) => console.warn("[chat] push reply:", e);
  void (async () => {
    const userId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    await handleChatPushResponse(response, {
      client: chatClient,
      notifications: Notifications,
      onError,
      outbox: userId ? () => liveOutboxes.get(userId) : null,
      store: userId ? forUser(userId).store : null,
      userId,
    });
  })().catch(onError);
}

// The Reply and Mark read buttons on a message's notification, registered once at start.
if (starter.features.chat && starter.features.push) {
  void registerChatNotificationActions(Notifications, undefined, (error) => console.warn("[chat] notification actions:", error));
}
