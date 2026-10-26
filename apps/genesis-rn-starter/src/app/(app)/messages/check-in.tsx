import { CheckInScreen } from "@/lib/check-in-screen";

/**
 * The check-in opened from a card in a conversation: in the Messages stack, so Back returns to
 * the conversation (its back button reads the conversation's title).
 */
export default function MessagesCheckIn() {
  return <CheckInScreen />;
}
