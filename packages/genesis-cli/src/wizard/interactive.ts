/**
 * Whether the wizard may open: a person at a terminal. Both streams are TTYs, and it isn't CI: a CI
 * job can allocate a pseudo-terminal, and a wizard there would wait 30 minutes for nobody.
 */
export function atTerminal(tty: { stdin?: boolean; stdout?: boolean }, env: Readonly<Record<string, string | undefined>>): boolean {
  const ci = env.CI;
  return tty.stdin === true && tty.stdout === true && (ci === undefined || ci === "" || ci === "0" || ci.toLowerCase() === "false");
}
