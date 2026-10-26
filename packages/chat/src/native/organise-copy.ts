/**
 * @feat:chat
 * The words of chat's organising features on native (topics, scheduled send, availability,
 * broadcast, search, moderation), part of `ChatNativeCopy`, so an app overrides them the same
 * way (`ChatNativeProvider copy`). `{name}`, `{count}`, `{when}` and `{query}` are filled in.
 */
export interface ChatOrganiseCopy {
  // Topics
  topics: string;
  topicAll: string;
  topicClosed: string;
  topicOptions: string;
  topicNew: string;
  topicRename: string;
  topicClose: string;
  topicReopen: string;
  topicName: string;
  topicNamePlaceholder: string;
  topicAdd: string;
  topicSave: string;
  topicExists: string;
  topicClosedNotice: string;
  topicPlaceholder: string;
  topicClosedDone: string;
  topicReopenedDone: string;
  // Scheduled send
  schedule: string;
  scheduleTitle: string;
  scheduleHint: string;
  schedulePick: string;
  scheduleDate: string;
  scheduleTime: string;
  scheduleConfirm: string;
  scheduleOutOfRange: string;
  scheduledFor: string;
  scheduleFailed: string;
  scheduleNoFiles: string;
  scheduledCount: string;
  scheduledCountOne: string;
  scheduledTitle: string;
  scheduledEmpty: string;
  scheduledEmptyBody: string;
  scheduledCancel: string;
  scheduledCancelled: string;
  scheduledCouldntSend: string;
  // Availability
  availabilityTitle: string;
  awayMessage: string;
  awayMessagePlaceholder: string;
  awayUntil: string;
  awayUntilOn: string;
  imBack: string;
  workingHours: string;
  workingHoursOn: string;
  workingHoursHint: string;
  workingDay: string;
  notWorking: string;
  hoursFrom: string;
  hoursTo: string;
  hoursSameTime: string;
  timeZone: string;
  timeZoneSearch: string;
  availabilitySave: string;
  availabilitySaved: string;
  // Broadcast
  broadcastTitle: string;
  broadcastExplainer: string;
  broadcastMessage: string;
  broadcastPlaceholder: string;
  broadcastTo: string;
  broadcastFilter: string;
  broadcastSelectAll: string;
  broadcastClear: string;
  broadcastPickSome: string;
  broadcastPicked: string;
  broadcastPickedOne: string;
  broadcastSend: string;
  broadcastSendTo: string;
  broadcastSent: string;
  broadcastSentOne: string;
  broadcastSentSome: string;
  broadcastNoMatches: string;
  broadcastNoConversations: string;
  // Search
  search: string;
  searchPlaceholder: string;
  searchThreadPlaceholder: string;
  searchHint: string;
  searchNoResults: string;
  searchNoResultsBody: string;
  searchResults: string;
  searchResultsOne: string;
  searchIn: string;
  transcript: string;
  messageGone: string;
  // Moderation
  moderationHidden: string;
  moderationHiddenMine: string;
  moderationFlagged: string;
}

export const chatOrganiseCopy: ChatOrganiseCopy = {
  topics: "Topics",
  topicAll: "All",
  topicClosed: "Closed",
  topicOptions: "Topic options",
  topicNew: "New topic",
  topicRename: "Rename topic",
  topicClose: "Close topic",
  topicReopen: "Reopen topic",
  topicName: "Name",
  topicNamePlaceholder: "Week 1: Habits",
  topicAdd: "Add topic",
  topicSave: "Save",
  topicExists: "There's already a topic with that name.",
  topicClosedNotice: "This topic is closed.",
  topicPlaceholder: "Message #{name}",
  topicClosedDone: "Closed {name}",
  topicReopenedDone: "Reopened {name}",
  schedule: "Schedule message",
  scheduleTitle: "Schedule message",
  scheduleHint: "It sends at this time, in your time zone, as if you'd sent it then.",
  schedulePick: "Pick a date and time",
  scheduleDate: "Date",
  scheduleTime: "Time",
  scheduleConfirm: "Schedule",
  scheduleOutOfRange: "Pick a time from a minute to a year from now.",
  scheduledFor: "Scheduled for {when}",
  scheduleFailed: "Couldn't schedule it",
  scheduleNoFiles: "Photos and files can't be scheduled yet. Send them now, or remove them to schedule the text.",
  scheduledCount: "{count} scheduled messages",
  scheduledCountOne: "1 scheduled message",
  scheduledTitle: "Scheduled",
  scheduledEmpty: "Nothing scheduled",
  scheduledEmptyBody: "Touch and hold Send to schedule a message.",
  scheduledCancel: "Cancel",
  scheduledCancelled: "Scheduled message cancelled",
  scheduledCouldntSend: "Couldn't send",
  availabilityTitle: "Availability",
  awayMessage: "Away message",
  awayMessagePlaceholder: "Back Monday. For anything urgent, call the office.",
  awayUntil: "Away until",
  awayUntilOn: "Set an end",
  imBack: "I'm back",
  workingHours: "Working hours",
  workingHoursOn: "Tell people when you usually reply",
  workingHoursHint: "An end before the start runs past midnight.",
  workingDay: "Working on {name}",
  notWorking: "Not working",
  hoursFrom: "{name} from",
  hoursTo: "{name} to",
  hoursSameTime: "A day's start and end can't be the same time.",
  timeZone: "Time zone",
  timeZoneSearch: "Search time zones",
  availabilitySave: "Save",
  availabilitySaved: "Availability saved",
  broadcastTitle: "Broadcast",
  broadcastExplainer: "Each person gets this in their own conversation with you, so replies come back to you privately. No one sees who else got it.",
  broadcastMessage: "Message",
  broadcastPlaceholder: "Write once, send to everyone you pick",
  broadcastTo: "Send to",
  broadcastFilter: "Filter",
  broadcastSelectAll: "Select all",
  broadcastClear: "Clear",
  broadcastPickSome: "Pick who gets it",
  broadcastPicked: "{count} conversations",
  broadcastPickedOne: "1 conversation",
  broadcastSend: "Send",
  broadcastSendTo: "Send to {count}",
  broadcastSent: "Sent to {count} conversations",
  broadcastSentOne: "Sent to 1 conversation",
  broadcastSentSome: "Sent to {count} of {total}. You can't post in the others.",
  broadcastNoMatches: "No matches",
  broadcastNoConversations: "No conversations yet",
  search: "Search",
  searchPlaceholder: "Search messages",
  searchThreadPlaceholder: "Search this conversation",
  searchHint: "Type at least two letters.",
  searchNoResults: "No results",
  searchNoResultsBody: "Nothing matches “{query}”.",
  searchResults: "{count} results",
  searchResultsOne: "1 result",
  searchIn: "in {name}",
  transcript: "Transcript",
  messageGone: "That message isn't here any more",
  moderationHidden: "Hidden by moderation",
  moderationHiddenMine: "Hidden by moderation. Only you can see it.",
  moderationFlagged: "Flagged",
};
