---
"@marktiderman/genesis-chat": minor
---

Native chat for migration 0002's organising features, in `@marktiderman/genesis-chat/native`, matching the web:

- **Topics:** `ChatThreadScreen` shows a topic bar (`ChatTopicBar`: "All" and each topic as chips, a lock on closed ones) when the conversation has topics, and lists the topic chosen, with "Message #Topic" in the field. Owners and admins add, rename, close and reopen topics from its options sheet. A member sees "This topic is closed." instead of the field in a closed topic.
- **Scheduled send:** touch and hold Send (also a VoiceOver action) to open `ChatScheduleSheet`, with tomorrow 9 AM, Monday 9 AM, or a date and time from genesis-ui-native's `NativeDatePicker` and `NativeTimePicker`. `ChatScheduledBar` ("2 scheduled messages") over the composer opens `ChatScheduledList`, where each one can be cancelled. Text only for now: a message with photos asks you to send or remove them.
- **Availability:** the thread shows `ChatAwayLine` under the header when the other person is away or outside their hours (everyone away, in a group), re-read each minute (`useAwayLine`). `ChatAvailabilityScreen` sets your away message and its end, working hours per weekday and the time zone, on a `SettingsSubPage`.
- **Broadcast:** `ChatBroadcastSheet` picks conversations from the inbox (filter, select all) and sends one message into each, so replies come back privately. It says how many it reached.
- **Search:** `ChatSearchScreen` searches all conversations or one, with the matched words highlighted, a Transcript badge, and who, where and when. `ChatThreadScreen jumpTo` opens a thread at a result, loading earlier pages until it is there (`loadUntil`), then scrolls to it and highlights it.
- **Moderation:** a hidden message tells its sender "Only you can see it"; observers see "Hidden by moderation" and "Flagged" markers.
- Also: `ChatIconButton` (a 44-point icon button for headers), `ChatComposer onSchedule` and `placeholder`, `MessageBubble observer`, `ChatOrganiseCopy` (its strings, part of `ChatNativeCopy`), and the pure helpers behind each (`checkTopicName`, `scheduleInputFrom`, `weekFromHours`, `hoursFromWeek`, `availabilityInput`, `broadcastRows`, `moderationNote`, `rowIndexOf`).
