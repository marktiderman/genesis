/**
 * Chat (`features.chat`): the chat client on the app's Supabase, the native
 * modules the chat screens use, resumable uploads, unsent messages kept on
 * the phone, and the push glue (the `messages` category's Reply and Mark read).
 * `src/app/(app)/messages/_layout.tsx` mounts `ChatRoot` over the Messages
 * tab; `push.ts` adds the category and the reply handler.
 *
 * Names and avatars: genesis-chat stores user ids only. Pass `loadPeople` (a
 * batch read of your profiles: `{ [userId]: { name, avatarUrl } }`) to
 * `ChatRoot` to show who is who; without it a direct conversation shows its
 * title, or "Conversation", and avatars their initials' fallback.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Audio from "expo-audio";
import * as Camera from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as ExpoCrypto from "expo-crypto";
import { File, FileMode, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as Video from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useEffect, type ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { createChatClient, type LocalFile, type Outbox, type OutboxStore, type QueuedMessage } from "@marktiderman/genesis-chat";
import { ChatProvider, useChat, type ChatProviderProps } from "@marktiderman/genesis-chat/react";
import {
  ChatNativeProvider,
  clearDrafts,
  createTusUpload,
  handleChatPushResponse,
  videoUploads,
  registerChatNotificationActions,
  type ChatNativeModules,
} from "@marktiderman/genesis-chat/native";
import { useSession } from "@marktiderman/genesis-native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { chatVideoUpload } from "./chat-video";
import { env } from "./env";
import { supabase } from "./supabase";

export const chatClient = createChatClient(supabase);

// Genesis describes each module by what it calls, so the packages' own (wider) types are cast once here.
const modules: ChatNativeModules = {
  audio: Audio as unknown as ChatNativeModules["audio"],
  // The library only (add `launchCameraAsync` for "Take a photo"; the camera sentence is already in
  // app.config.ts for video messages).
  imagePicker: { launchImageLibraryAsync: ImagePicker.launchImageLibraryAsync } as unknown as ChatNativeModules["imagePicker"],
  haptics: Haptics as unknown as ChatNativeModules["haptics"],
  clipboard: Clipboard as unknown as ChatNativeModules["clipboard"],
  keyboardAvoidingView: starter.features.keyboardScroll ? (KeyboardAvoidingView as unknown as ChatNativeModules["keyboardAvoidingView"]) : undefined,
  drafts: AsyncStorage as unknown as ChatNativeModules["drafts"],
  // Video messages: record in the thread (camera and microphone sentences in app.config.ts), play
  // HLS and files in the bubble; link previews open in an in-app browser.
  camera: Camera as unknown as ChatNativeModules["camera"],
  video: Video as unknown as ChatNativeModules["video"],
  webBrowser: WebBrowser as unknown as ChatNativeModules["webBrowser"],
  openFile: (uri: string) => openFile(uri),
};

// Mux when the app has an upload handler, else storage (src/lib/chat-video.ts).
const videoUpload = chatVideoUpload();

/** Unsent messages wait here between launches (per signed-in person). */
function outboxStore(userId: string): OutboxStore {
  const key = `genesis-chat:outbox:${userId}`;
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

/** The providers the Messages screens read: the signed-in person's chat, with its uploads and drafts. */
export function ChatRoot({ children, loadPeople }: { children: ReactNode; loadPeople?: LoadPeople }) {
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
    <ChatProvider client={chatClient} userId={userId} outboxStore={store} upload={upload} newId={ExpoCrypto.randomUUID} persistFile={persistFile} loadPeople={loadPeople} videoUpload={videoUpload}>
      <ShareOutbox userId={userId} />
      <ChatNativeProvider modules={modules} copy={copy.chat}>
        {children}
      </ChatNativeProvider>
    </ChatProvider>
  );
}

// The outbox the Messages screens are using, per person, so a reply from a notification queues
// in it (and shows in the open thread) instead of writing the saved copy behind its back.
const liveOutboxes = new Map<string, Outbox>();
function ShareOutbox({ userId }: { userId: string }) {
  const { outbox } = useChat();
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
 * Chat drafts never outlive the person who wrote them on this phone: signing out (Settings,
 * account deletion) clears theirs, and signing in clears everyone else's, which covers a session
 * that ended while the app was closed and a switch from one person to another. Mounted once, in
 * the signed-in layout.
 */
export function useClearChatOnSignOut() {
  const { status, userId } = useSession();
  useEffect(() => {
    if (!starter.features.chat) return;
    const onError = (e: unknown) => console.warn("[chat] clearing drafts:", e);
    if (status === "signedIn" && userId) {
      if (lastChatUser !== userId) void clearDrafts(modules.drafts!, { except: userId }, onError);
      lastChatUser = userId;
      return;
    }
    if (status !== "signedOut" || !lastChatUser) return;
    const who = lastChatUser;
    lastChatUser = null;
    void clearDrafts(modules.drafts!, who, onError);
    // Videos still uploading were theirs: they stop, and nothing is sent after sign-out.
    videoUploads.cancelAll();
    // TODO(chat clearOutbox): also empty this person's unsent messages here, through
    // `useChat().clearOutbox()` once genesis-chat ships it (the chat owner's PR); until then they
    // stay under `genesis-chat:outbox:<userId>` and come back if the same person signs in again.
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
