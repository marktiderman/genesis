// Time zone names as calendar feeds write them. Wall-time arithmetic is core/dates' (instantIn,
// wallTimeIn); this holds only what core/dates doesn't: Windows names and vendor-prefixed TZIDs.
import { isTimeZone } from "@marktiderman/genesis-core/dates";

// Windows zone names, as Outlook and Exchange feeds write them, for the zones people mostly meet.
// A Map, not a plain object: a TZID of "constructor" or "__proto__" must not find an inherited member.
const WINDOWS_ZONES = new Map<string, string>(Object.entries({
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  "Canada Central Standard Time": "America/Regina",
  "Mexico Standard Time": "America/Mexico_City",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "SA Pacific Standard Time": "America/Bogota",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Russian Standard Time": "Europe/Moscow",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "W. Australia Standard Time": "Australia/Perth",
  "New Zealand Standard Time": "Pacific/Auckland",
  UTC: "UTC",
}));

/**
 * An IANA zone for a TZID as feeds write it: IANA (`Europe/London`), a Windows name
 * (`Pacific Standard Time`), or a vendor-prefixed path (`/mozilla.org/20050126_1/America/New_York`).
 * Null when it names no zone the runtime knows.
 *
 * @stability Beta
 */
export function resolveZone(tzid: string | null | undefined): string | null {
  if (!tzid) return null;
  const name = tzid.trim().replace(/^"|"$/g, "").replace(/^\/+/, "");
  if (!name || name.length > 200) return null;
  if (/^(utc|gmt|z|etc\/utc|etc\/gmt)$/i.test(name)) return "UTC";
  const windows = WINDOWS_ZONES.get(name);
  if (windows !== undefined) return isTimeZone(windows) ? windows : null;
  if (isTimeZone(name)) return name;
  const tail = /([A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.exec(name)?.[1];
  return tail && isTimeZone(tail) ? tail : null;
}
