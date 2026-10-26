---
"@marktiderman/genesis-chat": minor
---

`@marktiderman/genesis-chat/native`: chat on genesis-ui-native, over the `/react` hooks.

- **`ChatInboxScreen`** is built on `InboxPage`. It shows avatars, unread counts and the last message, supports pull to refresh, has an empty state that starts a conversation, and offers Mark read, Pin and Archive.
- **`ChatThreadScreen`** is an inverted FlashList that keeps its place while earlier messages load. It has:
  - day separators and the New line;
  - grouped bubbles, with names and avatars in groups;
  - typing and recording activity;
  - Retry and Delete on a failed send;
  - a long-press sheet (react, reply, copy, pin, delete) and swipe to reply;
  - pictures in a full-screen viewer.
- **The composer**:
  - grows with its text and keeps a draft per thread;
  - takes photos and videos from expo-image-picker, and a pasted picture;
  - plays haptics;
  - says why when the person can't post.
- **Voice notes on expo-audio**:
  - hold to record, slide to cancel, lock for hands-free;
  - a live waveform while recording;
  - playback with scrubbing and 1x / 1.5x / 2x speed, one note playing at a time.
- **`createTusUpload`**: resumable uploads through Supabase Storage's TUS endpoint, for `ChatProvider upload`.
- **Push glue** for genesis-native's push block:
  - the `messages` category, with Reply and Mark read actions;
  - `handleChatPushResponse`: a reply's client id is the notification's id, so replying twice posts once;
  - `chatThreadMatch`, to suppress pushes for the open thread.

Native modules are passed in and are optional peers.
