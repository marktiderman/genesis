#!/usr/bin/env node
// genesis-product: the product board and release notes for a repo, from features.json and its
// idea and feedback issues. Run from the repo root; reading a public repo needs no token.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { answeredBy, buildBoard, diffRelease, renderBoard, renderRelease } from "./index";
import { catalogAt, closeAnswered, githubSignals, publishBoardIssue, readCatalog, repoFromGit } from "./node";

const USAGE = `genesis-product <command> [options]

  board     The Now / Next / Later board, top ideas by demand, and the triage inbox.
              --out <file>   write it to a file instead of printing it
              --issue        write it to the repo's board issue (needs GITHUB_TOKEN; meant for the workflow)
              --board-author whose board issue to write (default github-actions[bot])
  release   Draft release notes for the features that reached beta or live.
              --from <ref>   the last release (a tag or commit); required
              --to <ref>     default: the working tree's features.json
              --name <name>  default: today's date
              --notify       list the idea issues it answers; with --yes, close each and comment
                             on it (needs GITHUB_TOKEN). Refuses more than 10 changed features
                             without --force, in case --from is wrong.

  Both: --repo <owner/repo> (default: the origin remote), --catalog <file> (default: features.json),
        --offline (no GitHub: the catalog only)`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      issue: { type: "boolean" },
      from: { type: "string" },
      to: { type: "string" },
      name: { type: "string" },
      notify: { type: "boolean" },
      yes: { type: "boolean" },
      force: { type: "boolean" },
      "board-author": { type: "string" },
      repo: { type: "string" },
      catalog: { type: "string", default: "features.json" },
      offline: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0];
  if (values.help || (command !== "board" && command !== "release")) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = values.repo ?? repoFromGit();
  const today = new Date().toISOString().slice(0, 10);
  const needsToken = (flag: string) => {
    if (!token || !repo) throw new Error(`${flag} needs GITHUB_TOKEN and a repo (--repo owner/repo).`);
    return { repo, token };
  };
  const writes = Boolean(values.issue || (values.notify && values.yes));
  let signals: Awaited<ReturnType<ReturnType<typeof githubSignals>["list"]>> = [];
  if (!values.offline && repo) {
    try {
      signals = await githubSignals({ repo, token }).list();
    } catch (error) {
      // Reading is best effort; writing to GitHub on a partial picture is not.
      if (writes) throw error;
      console.error(`Couldn't read the issues (${error instanceof Error ? error.message.split("\n", 1)[0] : error}); showing the catalog only.`);
    }
  }

  if (command === "board") {
    const markdown = renderBoard(buildBoard(readCatalog(values.catalog), signals), { date: today });
    if (values.issue) console.log(await publishBoardIssue({ ...needsToken("--issue"), author: values["board-author"] }, markdown));
    else if (values.out) writeFileSync(values.out, markdown);
    else console.log(markdown);
    return 0;
  }

  if (!values.from) throw new Error("release needs --from <ref>, the last release.");
  const after = values.to ? catalogAt(values.to, values.catalog) : readCatalog(values.catalog);
  const changes = diffRelease(catalogAt(values.from, values.catalog), after);
  const name = values.name ?? today;
  console.log(renderRelease(changes, signals, { name }));
  if (values.notify) {
    const answered = answeredBy(changes, signals);
    console.error(`Answers ${answered.length} open idea issue${answered.length === 1 ? "" : "s"}${answered.length ? `: ${answered.map((s) => s.id.replace(/^github/, "")).join(", ")}` : ""}.`);
    if (changes.length > 10 && !values.force) {
      throw new Error(`${changes.length} features changed since ${values.from}: is --from the last release? Pass --force if it is.`);
    }
    if (!values.yes) {
      console.error("Dry run: nothing was closed. Pass --yes to close these issues and comment on them.");
      return 0;
    }
    const closed = await closeAnswered(needsToken("--notify"), answered, (s) => {
      const change = changes.find((c) => c.feature.id === s.featureId || c.feature.aliases?.includes(s.featureId!));
      return `Shipped in release ${name}${change ? `: **${change.feature.name}**${change.change === "beta" ? " (in beta)" : ""}` : ""}. Thank you for asking.`;
    });
    console.error(`Closed ${closed.length} issue${closed.length === 1 ? "" : "s"}${closed.length ? `: #${closed.join(", #")}` : ""}.`);
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
