/**
 * Hosted video messages for chat (`ChatProvider videoUpload`). Set
 * `EXPO_PUBLIC_CHAT_VIDEO_UPLOAD_URL` to your server's `createVideoUploadHandler` (from
 * `@marktiderman/genesis-chat/server`, with your Mux keys): each recording then goes to Mux
 * and streams back as HLS. Unset, videos go to Supabase Storage as files, like a picked video.
 *
 * `EXPO_PUBLIC_CHAT_VIDEO_UPLOAD_URL=fake-storage` (development builds only) tries the hosted
 * path against a local stack without Mux: the "upload URL" is a Storage signed upload URL in the
 * sender's own folder, and the message carries a made-up Mux upload id, so it stays
 * "Processing" (no webhook ever marks it ready). It takes the whole file in one PUT and can't
 * resume. It exists to try the recorder, the upload progress and the send; never ship it.
 */
import * as ExpoCrypto from "expo-crypto";
import type { ChatVideoUpload } from "@marktiderman/genesis-chat/react";
import { env } from "./env";
import { supabase } from "./supabase";

declare const __DEV__: boolean;

/** The app's upload handler: POST `{ conversationId }` with the person's token. */
function handlerVideoUpload(url: string): ChatVideoUpload {
  return {
    async create(conversationId) {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Sign in to send a video");
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId }) });
      if (!res.ok) throw new Error(`The video couldn't start uploading (${res.status})`);
      const body = (await res.json()) as { url?: unknown; providerId?: unknown; provider?: unknown };
      if (typeof body.url !== "string" || typeof body.providerId !== "string" || body.provider !== "mux") throw new Error("The video upload server answered something else");
      return { url: body.url, providerId: body.providerId, provider: "mux" };
    },
  };
}

/** Development only: a Storage signed upload URL standing in for a Mux direct upload. */
const fakeStorageVideoUpload: ChatVideoUpload = {
  async create(conversationId) {
    const userId = (await supabase.auth.getSession()).data.session?.user.id;
    if (!userId) throw new Error("Sign in to send a video");
    const path = `${conversationId}/${userId}/${ExpoCrypto.randomUUID()}.mov`;
    const { data, error } = await supabase.storage.from("genesis-chat").createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "No upload URL");
    console.warn("[chat] fake-storage video upload: this video will stay 'Processing'; set a real upload handler for Mux.");
    return { url: data.signedUrl, providerId: `fake-${ExpoCrypto.randomUUID()}`, provider: "mux" };
  },
};

export function chatVideoUpload(): ChatVideoUpload | undefined {
  const url = env.chatVideoUploadUrl;
  if (!url) return undefined;
  if (url === "fake-storage") {
    if (typeof __DEV__ !== "undefined" && __DEV__) return fakeStorageVideoUpload;
    console.warn("[chat] EXPO_PUBLIC_CHAT_VIDEO_UPLOAD_URL=fake-storage is for development builds only: videos go to storage as files.");
    return undefined;
  }
  return handlerVideoUpload(url);
}
