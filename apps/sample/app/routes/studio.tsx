// Genesis Data Studio in the sample app. The handler runs in the Vite dev
// server (studio/vite-plugin.ts); this page is everything an app adds on the
// client: a provider pointed at the handler, a router adapter, and a sign-in.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { DataStudio, createSearchParamsRouter } from "@marktiderman/genesis-studio";
import { createStudioProvider } from "@marktiderman/genesis-studio-server/client";
import { Button, Input, Label } from "@marktiderman/genesis-ui";

interface DevUser {
  id: string;
  name: string;
  note: string;
}

interface StudioConfig {
  configured: boolean;
  mode: "dev" | "supabase";
  users?: DevUser[];
  supabaseUrl?: string;
  publishableKey?: string;
}

interface Session {
  token: string;
  userId: string;
  label: string;
}

const SESSION_KEY = "genesis-sample-studio-session";

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

// The studio's handler runs in the dev server only (studio/vite-plugin.ts). A
// static build has none, so it shows the demo app's Data Studio, which runs
// on in-memory rows.
export default function Studio() {
  if (import.meta.env.PROD) return <Navigate to="/demo/harbor/data" replace />;
  return <DevStudio />;
}

function DevStudio() {
  const [params, setParams] = useSearchParams();
  const router = useMemo(
    () => createSearchParamsRouter(params, (next, { replace }) => setParams(next, { replace })),
    [params, setParams],
  );
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(readSession());
    fetch("/api/studio-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false, mode: "dev" }));
  }, []);

  const signIn = useCallback((next: Session) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const provider = useMemo(
    () => createStudioProvider({ url: "/api/studio", getAccessToken: () => session?.token ?? null }),
    [session],
  );

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="studio-page">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Data Studio</h1>
          <p className="text-sm text-muted-foreground">
            Your data, as you: the database's own row rules decide what you see and edit.
          </p>
        </div>
        {session && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground" data-testid="studio-signed-in-as">
              Signed in as {session.label}
            </span>
            <Button variant="outline" size="sm" onClick={signOut} testID="studio-sign-out">
              Sign out
            </Button>
          </div>
        )}
      </header>
      {config && !config.configured ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground" data-testid="studio-not-configured">
          The studio database isn't set up. Run <code>pnpm --filter sample studio:db</code>, then restart{" "}
          <code>pnpm --filter sample dev</code>.
        </p>
      ) : (
        <DataStudio
          provider={provider}
          router={router}
          sessionKey={session?.userId ?? null}
          title="Sample data"
          signIn={config ? <SignIn config={config} onSignIn={signIn} /> : null}
        />
      )}
    </div>
  );
}

function SignIn({ config, onSignIn }: { config: StudioConfig; onSignIn: (session: Session) => void }) {
  if (config.mode === "supabase") return <SupabaseSignIn config={config} onSignIn={onSignIn} />;
  return <DevSignIn users={config.users ?? []} onSignIn={onSignIn} />;
}

function DevSignIn({ users, onSignIn }: { users: DevUser[]; onSignIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function signInAs(user: DevUser) {
    setError(null);
    try {
      const res = await fetch(`/api/studio-dev-token?user=${encodeURIComponent(user.id)}`);
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) throw new Error(body.error ?? `Sign-in failed (${res.status}).`);
      onSignIn({ token: body.token, userId: user.id, label: user.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border bg-card p-4" data-testid="studio-dev-sign-in">
      <h2 className="text-sm font-semibold">Sign in as a sample user</h2>
      <p className="text-xs text-muted-foreground">
        Development only: the dev server signs a short-lived token for the user you pick.
      </p>
      {users.map((user) => (
        <Button
          key={user.id}
          variant="outline"
          className="w-full justify-between"
          testID={`studio-dev-user-${user.name.toLowerCase()}`}
          onClick={() => void signInAs(user)}
        >
          <span>{user.name}</span>
          <span className="text-xs text-muted-foreground">{user.note}</span>
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function SupabaseSignIn({ config, onSignIn }: { config: StudioConfig; onSignIn: (session: Session) => void }) {
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
      const body = (await res.json()) as { access_token?: string; user?: { id: string; email: string }; msg?: string };
      if (!res.ok || !body.access_token || !body.user) throw new Error(body.msg ?? "Sign-in failed.");
      onSignIn({ token: body.access_token, userId: body.user.id, label: body.user.email });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border bg-card p-4" data-testid="studio-supabase-sign-in">
      <h2 className="text-sm font-semibold">Sign in with Supabase</h2>
      <div className="space-y-1">
        <Label htmlFor="studio-email">Email</Label>
        <Input id="studio-email" name="email" type="email" autoComplete="username" required data-testid="studio-email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="studio-password">Password</Label>
        <Input
          id="studio-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          data-testid="studio-password"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy} testID="studio-sign-in-submit">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
