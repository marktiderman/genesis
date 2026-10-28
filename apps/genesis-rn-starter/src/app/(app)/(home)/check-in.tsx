import { copy } from "@/copy";
import { CheckInScreen } from "@/lib/check-in-screen";

/** The check-in from Home (and its link, `genesis-starter://check-in?location=hilltop`). */
export default function HomeCheckIn() {
  return <CheckInScreen backTitle={copy.home.title} />;
}
