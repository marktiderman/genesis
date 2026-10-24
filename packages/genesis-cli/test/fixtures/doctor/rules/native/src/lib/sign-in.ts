type Client = { auth: { signInWithOAuth(args: { provider: string }): Promise<unknown> } };

export function signInWithGoogle(supabase: Client) {
  return supabase.auth.signInWithOAuth({ provider: "google" });
}
