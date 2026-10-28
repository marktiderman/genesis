/**
 * The check-in example (`features.checkIn`): a sample form in focus layout, with every check-in
 * field type, an "Other" answer, a list filtered by an earlier answer, a searchable list, a
 * question a link can fill in (`?location=hilltop`) and content steps. Drafts and the submit outbox
 * keep their data in AsyncStorage, so a check-in survives the app closing and waits offline.
 *
 * Submissions go to a stub `send` that answers like `submitResponse` would. Point it at your own
 * endpoint (a Supabase Edge Function that runs `submitResponse`) to store them for real, and
 * declare the answers in the iOS privacy manifest then: genesis.config.json `privacy.collects`
 * ("other user content" for the free text, "phone number" for the phone field, and so on).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  createDraftStore,
  createSubmitOutbox,
  parseForm,
  registerContentType,
  type ChoiceOption,
  type FormDefinition,
  type SubmitResult,
} from "@marktiderman/genesis-forms";
import type { FormHaptics } from "@marktiderman/genesis-forms-native";
import sample from "../forms/check-in.json";
import { createCheckInPhotos, stubUpload, type LaunchLibrary } from "./check-in-photos";

// A callout is a content kind this app adds. Register it wherever the form is parsed (here, and
// on the server that checks submissions), so every side reads the same definition.
for (const kind of sample.contentTypes) {
  try {
    registerContentType(kind);
  } catch {
    // Already registered (a fast refresh re-ran this module).
  }
}

function load(raw: unknown): FormDefinition {
  const parsed = parseForm(raw);
  if (!parsed.ok) throw new Error(`[check-in] The sample form doesn't parse: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return parsed.form;
}

/** The sample check-in, checked once when the app loads. */
export const checkInForm: FormDefinition = load(sample.definition);

/** The people the app supplies for the filtered question (`optionsFrom: { source: "host", key: "members" }`). */
export const checkInHostOptions: Readonly<Record<string, readonly ChoiceOption[]>> = { members: sample.members };

/** Where check-in drafts are kept, by form and respondent. */
export const checkInDrafts = createDraftStore(AsyncStorage);

/**
 * The stub server: waits a moment and answers as `submitResponse` does when it stores a
 * response. Replace with a `fetch` to your endpoint, returning its JSON body.
 */
async function send(item: { id: string }): Promise<SubmitResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { ok: true, id: `stub-${item.id}`, receivedAt: new Date().toISOString() };
}

/** Idempotency keys: one per check-in, so a retry is stored once. */
export const checkInKey = (): string => Crypto.randomUUID();

/** One outbox for the whole app: submissions wait on the phone until the server has them. */
export const checkInOutbox = createSubmitOutbox({
  storage: AsyncStorage,
  prefix: "genesis-starter:check-in-outbox",
  send,
  createKey: checkInKey,
});
checkInOutbox.start();
NetInfo.addEventListener((state) => checkInOutbox.setOnline(state.isConnected !== false && state.isInternetReachable !== false));

/** The photo question's picker (the photo library) and storage (a stub; see `check-in-photos.ts`). */
export const checkInPhotos = createCheckInPhotos(ImagePicker.launchImageLibraryAsync as LaunchLibrary, stubUpload(Crypto.randomUUID));

/** A pick, a sent check-in and a refused step, felt. */
export const checkInHaptics: FormHaptics = {
  selection: () => void Haptics.selectionAsync(),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
