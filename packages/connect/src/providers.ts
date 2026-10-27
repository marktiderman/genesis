/**
 * An OAuth 2.0 provider is plain data: where to send the person, where to
 * trade codes and refresh tokens, where to revoke. Google is built in; any
 * other authorization-code provider is an object of the same shape.
 */
export interface OAuthProvider {
  /** A short id, used in the default cookie name and the state key's derivation: `"google"`. */
  readonly id: string;
  /** The authorization endpoint the browser is sent to. */
  readonly authorizeUrl: string;
  /** The token endpoint (code and refresh-token grants). */
  readonly tokenUrl: string;
  /** The revocation endpoint (RFC 7009), when the provider has one. */
  readonly revokeUrl?: string | undefined;
  /** Scopes asked for when neither the connector nor `start` names any. */
  readonly defaultScopes?: readonly string[] | undefined;
  /**
   * Extra authorization parameters, such as Google's `access_type=offline`
   * and `prompt=consent` (which is what makes it send a refresh token).
   */
  readonly authorizeParams?: Readonly<Record<string, string>> | undefined;
  /**
   * How the client authenticates at the token endpoint: in the form body
   * (`client_secret_post`, the default) or with HTTP Basic (`client_secret_basic`).
   */
  readonly tokenAuth?: "client_secret_post" | "client_secret_basic" | undefined;
  /** Whether the revocation request also carries the client's credentials. Default false. */
  readonly revokeWithClientAuth?: boolean | undefined;
  /** How the provider joins scopes. Default a space (RFC 6749). */
  readonly scopeSeparator?: string | undefined;
  /**
   * Shorthand scopes the provider answers with their full name, so the
   * granted-scope check compares like with like: Google grants `email` as
   * `https://www.googleapis.com/auth/userinfo.email`. Both what is asked
   * for and what is granted are mapped through it.
   */
  readonly scopeAliases?: Readonly<Record<string, string>> | undefined;
}

/** Google's OAuth 2.0 endpoints, asking for offline access (a refresh token) every time. */
export const googleProvider: OAuthProvider = {
  id: "google",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revokeUrl: "https://oauth2.googleapis.com/revoke",
  defaultScopes: [],
  authorizeParams: {
    access_type: "offline",
    // Without consent on every sign-in, Google sends a refresh token only the first time.
    prompt: "consent",
    // Only the scopes asked for now, so the granted-scope check means what it says.
    include_granted_scopes: "false",
  },
  tokenAuth: "client_secret_post",
  scopeAliases: {
    email: "https://www.googleapis.com/auth/userinfo.email",
    profile: "https://www.googleapis.com/auth/userinfo.profile",
    openid: "openid",
  },
};

/** Google scopes apps commonly connect with. Prefer the narrowest. */
export const GOOGLE_SCOPES = {
  /** OpenID Connect: an ID token naming the account. */
  openid: "openid",
  /** The account's email address (Google grants it as `…/auth/userinfo.email`). */
  email: "email",
  /** The account's name and picture (granted as `…/auth/userinfo.profile`). */
  profile: "profile",
  /** Files the person picked or created through the app, and nothing else. */
  driveFile: "https://www.googleapis.com/auth/drive.file",
  /** Every spreadsheet the person can reach. Prefer `driveFile`. */
  spreadsheets: "https://www.googleapis.com/auth/spreadsheets",
  /** Events on the person's calendars. */
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  /** Send mail as the person. */
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
} as const;
