/**
 * Chat (`features.chat`): the chat client on the app's Supabase, the native
 * modules the chat screens use, resumable uploads, unsent messages kept on
 * the phone, and the push glue (the `messages` category's Reply and Mark read).
 * `src/app/(app)/messages/_layout.tsx` mounts `ChatRoot` over the Messages
 * tab; `push.ts` adds the category and the reply handler.
 *
 * Names and avatars: genesis-chat stores user ids only. Pass `getPerson` (from
 * your profiles) to `ChatRoot` to show who is who; without it a direct
 * conversation shows its title, or "Conversation".
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Audio from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as ExpoCrypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import type { ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { createChatClient, type OutboxStore, type QueuedMessage } from "@marktiderman/genesis-chat";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import {
  ChatNativeProvider,
  createTusUpload,
  handleChatPushResponse,
  registerChatNotificationActions,
  type ChatNativeModules,
  type ChatPerson,
} from "@marktiderman/genesis-chat/native";
import { useSession } from "@marktiderman/genesis-native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { env } from "./env";
import { supabase } from "./supabase";

// genesis-chat makes each message's client id with `crypto.randomUUID`, which Hermes may not have:
// expo-crypto's stands in (after supabase.ts, which installs `crypto.getRandomValues`).
const webCrypto = ((globalThis as { crypto?: Partial<Crypto> }).crypto ??= {}) as Partial<Crypto>;
if (typeof webCrypto.randomUUID !== "function") webCrypto.randomUUID = ExpoCrypto.randomUUID as Crypto["randomUUID"];

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
};

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

/** The providers the Messages screens read: the signed-in person's chat, with its uploads and drafts. */
export function ChatRoot({ children, getPerson }: { children: ReactNode; getPerson?: (userId: string) => ChatPerson | undefined }) {
  const { userId } = useSession();
  if (!userId) return null;
  return <ChatForUser userId={userId} getPerson={getPerson}>{children}</ChatForUser>;
}

const stores = new Map<string, { store: OutboxStore; upload: ReturnType<typeof createTusUpload> }>();
function forUser(userId: string) {
  let s = stores.get(userId);
  if (!s) {
    s = {
      store: outboxStore(userId),
      upload: createTusUpload({ supabaseUrl: env.supabaseUrl, apikey: env.supabasePublishableKey, userId, getAccessToken: accessToken, newId: ExpoCrypto.randomUUID }),
    };
    stores.set(userId, s);
  }
  return s;
}

function ChatForUser({ userId, getPerson, children }: { userId: string; getPerson?: (userId: string) => ChatPerson | undefined; children: ReactNode }) {
  const { store, upload } = forUser(userId);
  return (
    <ChatProvider client={chatClient} userId={userId} outboxStore={store} upload={upload}>
      <ChatNativeProvider modules={modules} copy={copy.chat} getPerson={getPerson}>
        {children}
      </ChatNativeProvider>
    </ChatProvider>
  );
}

/** For createPush's `onResponse`: Reply and Mark read from a message's notification. */
export function onChatPushResponse(response: Parameters<typeof handleChatPushResponse>[0]) {
  if (!starter.features.chat) return;
  void handleChatPushResponse(response, { client: chatClient, notifications: Notifications, onError: (e) => console.warn("[chat] push reply:", e) });
}

// The Reply and Mark read buttons on a message's notification, registered once at start.
if (starter.features.chat && starter.features.push) {
  void registerChatNotificationActions(Notifications, undefined, (error) => console.warn("[chat] notification actions:", error));
}
