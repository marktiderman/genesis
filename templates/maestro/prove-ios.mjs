#!/usr/bin/env node
// Proves the app on an iOS Simulator, end to end, against its own local Supabase stack:
//
//   node .maestro/prove-ios.mjs                       stack + test login, build (or reuse), every flow in .maestro/flows
//   node .maestro/prove-ios.mjs --flows workbench     the flows in .maestro/workbench instead (or any folder under .maestro)
//   node .maestro/prove-ios.mjs --flow launch,deep-link   only these flows
//   node .maestro/prove-ios.mjs --rebuild             build again even when the cached build matches
//   node .maestro/prove-ios.mjs --no-stack            no Supabase stack and no test login (an app that runs on sample data)
//   node .maestro/prove-ios.mjs --force               regenerate ios/ even when the app commits it (its native edits go)
//   node .maestro/prove-ios.mjs --stop                stop the stack (its data goes); the simulator is kept
//
// It writes the evidence a pull request links: each flow's screenshots, Maestro's logs and a
// summary.md, in .e2e/artifacts/<run>/ (git-ignored).
//
// Local only, by construction:
// - The stack is this app's own (`supabase start` here, on the ports supabase/config.toml sets);
//   it refuses an API that isn't http://127.0.0.1, and the default port 54321, which another
//   project on the machine may be using.
// - The test login is made through that stack's admin API, with a new password each run, kept in
//   .e2e/login.json (git-ignored).
// - The build is the development variant (APP_VARIANT=development), built for the Simulator,
//   with no .env file read.
// - Its simulator is its own ("<app name> Proof", made on the first run and kept), so it never
//   touches a simulator someone else is using.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const maestroDir = dirname(fileURLToPath(import.meta.url));
const app = dirname(maestroDir);
const cacheDir = join(app, ".e2e");
const DEVICE_TYPE = "iPhone 17 Pro";
const TEST_EMAIL = "prove@example.test";
const LEAN_EXCLUDE = "studio,imgproxy,vector,logflare,supavisor,postgres-meta,edge-runtime,mailpit,inbucket";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (line) => console.log(`\x1b[36mprove\x1b[0m ${line}`);
const fail = (line) => {
  console.error(`\x1b[31mprove\x1b[0m ${line}`);
  process.exit(1);
};
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { stdio: "inherit", ...opts });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  return r.status ?? 1;
};
const out = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts }).trim();

/** The app's name and development bundle id, from starter.config.ts (APP_VARIANT=development appends `.dev`). */
function identity() {
  const config = readFileSync(join(app, "starter.config.ts"), "utf8");
  const field = (key) => new RegExp(`\\b${key}:\\s*"([^"]+)"`).exec(config)?.[1] ?? fail(`starter.config.ts has no app.${key}`);
  return { name: field("name"), bundleId: `${field("bundleId")}.dev` };
}
const { name: appName, bundleId } = identity();
const DEVICE_NAME = `${appName} Proof`;

// The stack ------------------------------------------------------------------------------------
function stack({ start }) {
  const status = () => {
    const r = spawnSync("supabase", ["status", "-o", "json"], { cwd: app, encoding: "utf8" });
    if (r.status !== 0) return null;
    try {
      return JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    } catch {
      return null;
    }
  };
  let s = status();
  if (!s) {
    if (!start) return null;
    // Before starting anything: a config on the default port would start a stack beside (or on
    // top of) another project's, and the refusal below would only come after it was running.
    const config = existsSync(join(app, "supabase", "config.toml")) ? readFileSync(join(app, "supabase", "config.toml"), "utf8") : "";
    const apiSection = /^\[api\][ \t]*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(config)?.[1] ?? "";
    const apiPort = /^\s*port\s*=\s*(\d+)/m.exec(apiSection)?.[1];
    if (!apiPort || apiPort === "54321") fail(`Refusing to start: supabase/config.toml's [api] port is ${apiPort ?? "unset (54321)"}. Give the app its own (genesis init --supabase-ports, or [api] port), not 54321.`);
    // Lean: the database, auth, the API and realtime are all a proof run needs (the test login is
    // made through the admin API, so no mail; no Studio, logs, image proxy, pooler or functions).
    log("Starting this app's local Supabase stack (lean)…");
    if (run("supabase", ["start", "-x", LEAN_EXCLUDE], { cwd: app }) !== 0) fail("supabase start failed (is Docker running?)");
    s = status() ?? fail("supabase status failed after start");
  }
  const url = s.API_URL;
  const key = s.PUBLISHABLE_KEY ?? s.ANON_KEY;
  const admin = s.SECRET_KEY ?? s.SERVICE_ROLE_KEY;
  // Never anything but this machine, and never the default port another project may be using.
  const m = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(url ?? "");
  if (!m || m[1] === "54321") fail(`Refusing: the stack's API is ${url}; set its own port in supabase/config.toml ([api] port), not 54321.`);
  return { url, key, admin };
}

/** The test login, made (or its password reset) through the stack's admin API. */
async function login(s) {
  const password = randomBytes(18).toString("base64url");
  const headers = { apikey: s.admin, Authorization: `Bearer ${s.admin}`, "Content-Type": "application/json" };
  const created = await fetch(`${s.url}/auth/v1/admin/users`, { method: "POST", headers, body: JSON.stringify({ email: TEST_EMAIL, password, email_confirm: true }) });
  if (!created.ok) {
    const page = await fetch(`${s.url}/auth/v1/admin/users?per_page=1000`, { headers });
    const users = (await page.json()).users ?? [];
    const existing = users.find((u) => u.email === TEST_EMAIL);
    if (!existing) fail(`Couldn't make the test login: ${created.status} ${await created.text()}`);
    const updated = await fetch(`${s.url}/auth/v1/admin/users/${existing.id}`, { method: "PUT", headers, body: JSON.stringify({ password, email_confirm: true }) });
    if (!updated.ok) fail(`Couldn't reset the test login's password: ${updated.status}`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "login.json"), JSON.stringify({ email: TEST_EMAIL, password }, null, 2));
  return { email: TEST_EMAIL, password };
}

// The simulator ----------------------------------------------------------------------------------
function device({ create }) {
  const list = JSON.parse(out("xcrun", ["simctl", "list", "devices", "available", "-j"]));
  for (const devices of Object.values(list.devices)) {
    const d = devices.find((x) => x.name === DEVICE_NAME);
    if (d) return d.udid;
  }
  if (!create) return null;
  const runtime = JSON.parse(out("xcrun", ["simctl", "list", "runtimes", "available", "-j"])).runtimes.filter((r) => r.platform === "iOS").at(-1);
  if (!runtime) fail("No iOS Simulator runtime is installed (Xcode, Settings, Components).");
  log(`Creating the simulator "${DEVICE_NAME}" (${DEVICE_TYPE}, ${runtime.name}), kept for later runs…`);
  return out("xcrun", ["simctl", "create", DEVICE_NAME, DEVICE_TYPE, runtime.identifier]);
}

// The build --------------------------------------------------------------------------------------
const buildEnv = (s) => {
  const env = { ...process.env, APP_VARIANT: "development", EXPO_NO_DOTENV: "1", LANG: "en_US.UTF-8", SENTRY_DISABLE_AUTO_UPLOAD: "true", CI: "1" };
  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (s.url) Object.assign(env, { EXPO_PUBLIC_SUPABASE_URL: s.url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: s.key });
  delete env.EXPO_PUBLIC_SENTRY_DSN;
  delete env.SENTRY_AUTH_TOKEN;
  return env;
};

/** What the build is made from: the app's files git knows (not its flows), the lockfile and the stack. */
function buildKey(s) {
  const hash = createHash("sha256").update(`${s.url}\n${s.key}\n${bundleId}\n`);
  const files = out("git", ["ls-files", "-co", "--exclude-standard", "--", "."], { cwd: app })
    .split("\n")
    .filter((f) => f && !/^(\.maestro|\.e2e|ios|android|__tests__)\//.test(f) && existsSync(join(app, f)))
    .sort();
  for (const f of files) hash.update(f).update(readFileSync(join(app, f)));
  // In the Genesis monorepo the packages are linked: their sources are part of the build too.
  const root = out("git", ["rev-parse", "--show-toplevel"], { cwd: app });
  for (const lock of ["pnpm-lock.yaml", "bun.lock", "package-lock.json"].map((l) => join(root, l))) if (existsSync(lock)) hash.update(readFileSync(lock));
  if (existsSync(join(root, "packages"))) {
    const sources = out("git", ["ls-files", "-co", "--exclude-standard", "--", "packages/*/src"], { cwd: root }).split("\n").filter(Boolean).sort();
    for (const f of sources) if (existsSync(join(root, f))) hash.update(f).update(readFileSync(join(root, f)));
  }
  return hash.digest("hex").slice(0, 16);
}

function buildApp(s, udid) {
  const key = buildKey(s);
  const cached = join(cacheDir, "app", key);
  const existing = existsSync(cached) ? readdirSync(cached).find((f) => f.endsWith(".app")) : undefined;
  if (existing && !flag("rebuild")) {
    log(`Reusing the cached build ${key}.`);
    return join(cached, existing);
  }
  const env = buildEnv(s);
  log("Generating the native project (expo prebuild, development variant)…");
  // An app that commits its native project would lose its edits: prebuild --clean regenerates ios/.
  if (out("git", ["ls-files", "--", "ios"], { cwd: app }).trim() && !flag("force")) {
    fail("This app commits ios/, and a proof run regenerates it (expo prebuild --clean). Commit or stash your native edits, then run again with --force.");
  }
  // prebuild --clean's own delete of a large ios/ (Pods) can fail with ENOTEMPTY: remove it first, with retries.
  rmSync(join(app, "ios"), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (run("npx", ["expo", "prebuild", "-p", "ios", "--clean", "--no-install"], { cwd: app, env }) !== 0) fail("expo prebuild failed");
  if (run("pod", ["install"], { cwd: join(app, "ios"), env }) !== 0) fail("pod install failed");
  const workspace = readdirSync(join(app, "ios")).find((f) => f.endsWith(".xcworkspace")) ?? fail("prebuild made no .xcworkspace");
  const scheme = basename(workspace, ".xcworkspace");
  log(`Building ${scheme} (Release, Simulator) as ${key}; later runs with the same sources only reinstall…`);
  mkdirSync(cacheDir, { recursive: true });
  const derived = join(cacheDir, "derived-data");
  // prebuild --clean regenerates ios/ and its Pods, so the last build's intermediates (precompiled
  // headers, header maps) point at files that are gone: start each new build from empty.
  rmSync(derived, { recursive: true, force: true });
  const logFile = join(cacheDir, "build.log");
  const xcode = spawnSync(
    "xcodebuild",
    ["-workspace", join(app, "ios", workspace), "-scheme", scheme, "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", `id=${udid}`, "-derivedDataPath", derived, "build"],
    { cwd: app, env, encoding: "utf8", maxBuffer: 1 << 30 },
  );
  writeFileSync(logFile, `${xcode.stdout ?? ""}\n${xcode.stderr ?? ""}`);
  if (xcode.error || xcode.status !== 0) {
    console.error((xcode.stdout ?? "").split("\n").filter((l) => /error:|BUILD FAILED/.test(l)).slice(-20).join("\n"));
    fail(`The build failed: ${logFile}`);
  }
  const products = join(derived, "Build", "Products", "Release-iphonesimulator");
  const built = readdirSync(products).find((f) => f.endsWith(".app")) ?? fail(`Built, but no .app in ${products}.`);
  rmSync(join(cacheDir, "app"), { recursive: true, force: true });
  mkdirSync(cached, { recursive: true });
  cpSync(join(products, built), join(cached, built), { recursive: true });
  return join(cached, built);
}

// The flows --------------------------------------------------------------------------------------
function flowFiles() {
  const folder = join(maestroDir, option("flows") ?? "flows");
  if (!existsSync(folder)) fail(`No flows folder ${relative(app, folder)}.`);
  const all = readdirSync(folder).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort();
  const asked = option("flow")?.split(",").map((n) => n.trim().replace(/\.yaml$/, ""));
  for (const n of asked ?? []) if (!all.includes(n)) fail(`No flow ${n} in ${relative(app, folder)}: ${all.join(", ")}`);
  return (asked ?? all).map((n) => ({ name: n, file: join(folder, `${n}.yaml`) }));
}

function pngs(dir) {
  return readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".png")).map((f) => join(dir, String(f))).sort();
}

function maestroBin() {
  const home = join(homedir(), ".maestro", "bin", "maestro");
  if (existsSync(home)) return home;
  if (spawnSync("maestro", ["--version"], { stdio: "ignore" }).status === 0) return "maestro";
  fail("Maestro isn't installed: curl -fsSL https://get.maestro.mobile.dev | bash");
}

function runFlows(udid, account) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const artifacts = join(cacheDir, "artifacts", stamp);
  mkdirSync(artifacts, { recursive: true });
  const maestro = maestroBin();
  const env = { APP_ID: bundleId, MAESTRO_TEST_EMAIL: account.email, MAESTRO_TEST_PASSWORD: account.password };
  const results = [];
  for (const { name, file } of flowFiles()) {
    const dir = join(artifacts, name);
    mkdirSync(dir, { recursive: true });
    log(`Flow ${name}…`);
    const argv = ["--device", udid, "test", file, "--config", join(maestroDir, "config.yaml"), "--test-output-dir", dir, "--debug-output", dir];
    for (const [k, v] of Object.entries(env)) argv.push("-e", `${k}=${v}`);
    const status = run(maestro, argv, { cwd: dir, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "1", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" } });
    results.push({ name, ok: status === 0, screenshots: pngs(dir) });
  }
  const lines = [`# ${appName}: proof run ${stamp}`, "", `${results.filter((r) => r.ok).length} of ${results.length} flows passed.`, "", "| Flow | Result | Screenshots |", "| --- | --- | --- |"];
  for (const r of results) lines.push(`| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.screenshots.map((p) => `\`${relative(artifacts, p)}\``).join("<br>")} |`);
  writeFileSync(join(artifacts, "summary.md"), `${lines.join("\n")}\n`);
  console.log("");
  for (const r of results) {
    console.log(`  ${r.ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${r.name}`);
    for (const png of r.screenshots) console.log(`          ${relative(artifacts, png)}`);
  }
  console.log(`\n  Evidence: ${join(artifacts, "summary.md")}\n`);
  return results.every((r) => r.ok);
}

// Main -------------------------------------------------------------------------------------------
if (flag("stop")) {
  if (stack({ start: false })) run("supabase", ["stop", "--no-backup"], { cwd: app });
  const udid = device({ create: false });
  if (udid) spawnSync("xcrun", ["simctl", "shutdown", udid], { stdio: "ignore" });
  log(`Stopped. The simulator "${DEVICE_NAME}" is kept.`);
  process.exit(0);
}

// --no-stack: an app that runs on sample data needs no stack and no login (its build has no Supabase URL).
const noStack = flag("no-stack");
const s = noStack ? { url: "", key: "" } : stack({ start: true });
if (!noStack) log(`Stack: ${s.url}. Making the test login…`);
const account = noStack ? { email: "", password: "" } : await login(s);
const udid = device({ create: true });
log(`Simulator: ${DEVICE_NAME} (${udid}).`);
spawnSync("xcrun", ["simctl", "boot", udid], { stdio: "ignore" });
if (run("xcrun", ["simctl", "bootstatus", udid, "-b"], { stdio: "ignore" }) !== 0) fail(`The simulator ${udid} didn't boot.`);
const built = buildApp(s, udid);
// A clean install: no saved session or held link from an earlier run (the Keychain outlives an uninstall).
spawnSync("xcrun", ["simctl", "uninstall", udid, bundleId], { stdio: "ignore" });
spawnSync("xcrun", ["simctl", "keychain", udid, "reset"], { stdio: "ignore" });
if (run("xcrun", ["simctl", "install", udid, built]) !== 0) fail("Installing the app failed.");
process.exit(runFlows(udid, account) ? 0 : 1);
