import { it } from "vitest";
import { handleSiteRequest } from "../web/index";
import { brand, formsResolver, seededStore } from "./fixtures";

it("smoke", async () => {
  const store = await seededStore();
  const res = await handleSiteRequest(new Request("https://riverside.example/"), { store, brand: { getBrand: () => brand }, siteId: "landing", forms: formsResolver });
  const html = await res!.text();
  console.log(res!.status, [...res!.headers.entries()]);
  (await import("node:fs")).writeFileSync("/private/tmp/claude-501/-Users-mark-Git-streamlined-breakthrough--claude-worktrees-genesis-rn-starter-app-6ee7d6/3322f2b2-293f-4219-af6c-a1e879d91b21/scratchpad/sites-pg/smoke.html", `${res!.status}\n${JSON.stringify([...res!.headers.entries()])}\n${html}`);
});
