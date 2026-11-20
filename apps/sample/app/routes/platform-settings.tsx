// The Genesis Settings screen in the sample app: what an app's platform-admin page adds. The
// handler (genesis-supabase's createSettingsHandler) runs in the Vite dev server
// (settings/vite-plugin.ts); this page signs in with Supabase Auth and mounts <GenesisSettings>
// over a client pointed at it. A platform admin sees everything; with ?tenant=<id>, a tenant's
// admin sees that tenant's keys; anyone else their own.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { GenesisSettings } from "@marktiderman/genesis-config/settings/react";
import { APP_HOST_CAPABILITIES, createSettingsClient } from "@marktiderman/genesis-config/settings-protocol";
import { Button, InlineAlert, Input, Label } from "@marktiderman/genesis-ui";

interface SettingsConfig {
  configured: boolean;
  supabaseUrl?: string;
  publishableKey?: string;
}

interface Session {
  token: string;
  email: string;
}

const SESSION_KEY = "genesis-sample-settings-session";

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export default function PlatformSettings() {
  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="platform-settings-page">
      {import.meta.env.PROD ? (
        <InlineAlert
          variant="info"
          title="Genesis settings run on a server"
          description="This page mounts <GenesisSettings> over createSettingsHandler, which needs a server and a Supabase project. Run the sample with pnpm --filter sample dev and SETTINGS_SUPABASE_URL and SETTINGS_SUPABASE_PUBLISHABLE_KEY in apps/sample/.env.local."
          testID="platform-settings-static"
        />
      ) : (
        <DevSettings />
      )}
    </div>
  );
}

function DevSettings() {
  const [params] = useSearchParams();
  const tenant = params.get("tenant") ?? undefined;
  const [config, setConfig] = useState<SettingsConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(readSession());
    fetch("/api/genesis/settings-config")
      .then((r) => r.json() as Promise<SettingsConfig>)
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
  }, []);

  const signIn = useCallback((next: Session) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const client = useMemo(
    () => createSettingsClient((input, init) => fetch(input, init), { baseUrl: "/api/genesis/settings", token: () => session?.token ?? null }),
    [session],
  );

  if (config && !config.configured) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground" data-testid="platform-settings-not-configured">
        Set <code>SETTINGS_SUPABASE_URL</code> and <code>SETTINGS_SUPABASE_PUBLISHABLE_KEY</code> in <code>apps/sample/.env.local</code> (a project
        with genesis-supabase&apos;s settings migrations applied and <code>genesis settings sync</code> run), then restart{" "}
        <code>pnpm --filter sample dev</code>.
      </p>
    );
  }
  if (!config) return null;
  if (!session) return <SignIn config={config} onSignIn={signIn} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground" data-testid="platform-settings-signed-in-as">
          Signed in as {session.email}
        </span>
        <Button variant="outline" size="sm" onClick={signOut} testID="platform-settings-sign-out">
          Sign out
        </Button>
      </div>
      <GenesisSettings key={session.token} client={client} capabilities={APP_HOST_CAPABILITIES} {...(tenant ? { tenant } : {})} />
    </div>
  );
}

function SignIn({ config, onSignIn }: { config: SettingsConfig; onSignIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: config.publishableKey ?? "" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = (await res.json()) as { access_token?: string; user?: { email: string }; msg?: string };
      if (!res.ok || !body.access_token || !body.user) throw new Error(body.msg ?? "Sign-in failed.");
      onSignIn({ token: body.access_token, email: body.user.email });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border bg-card p-4" data-testid="platform-settings-sign-in">
      <h2 className="text-sm font-semibold">Sign in with Supabase</h2>
      <div className="space-y-1">
        <Label htmlFor="platform-settings-email">Email</Label>
        <Input id="platform-settings-email" name="email" type="email" autoComplete="username" required data-testid="platform-settings-email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="platform-settings-password">Password</Label>
        <Input id="platform-settings-password" name="password" type="password" autoComplete="current-password" required data-testid="platform-settings-password" />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy} testID="platform-settings-sign-in-submit">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
