# @marktiderman/genesis-studio

**Genesis Data Studio**, the workspace UI: a sidebar of the tables the signed-in user may see, and a
sheet of the selected one where a cell is edited in place. Every save is checked against the
version of the row it was read at and committed with its audit entry, and the outcome is on screen:
"Saved", with the audit entry, or "Not saved" and why.

Built on genesis-ui's `ResourcePage` and `DataTable` (DATA-STUDIO.md decision 21). Routing and URL
state come from your app through an adapter (decision 23), and sign-in fills a slot.

**Status: 0.3, Experimental.** P2 adds:
- the **sheet view**, with keyboard editing and copy and paste;
- multi-row pastes saved in one transaction;
- **undo** from the audit;
- **bulk** set and delete;
- **CSV import** with a dry run;
- code-configured **form sections and conditions** (`forms`).

From P1:
- the sheet grid, with in-place edits;
- a record pop-up with a schema-built form, related records, history and delete;
- adding rows, and relation pickers;
- a filter builder, multi-field sort and group-by;
- saved views and CSV export.

## Embed it in any app

```tsx
import { DataStudio } from "@marktiderman/genesis-studio";
import { createSupabaseStudioProvider } from "@marktiderman/genesis-studio-server/client";
import "@marktiderman/genesis-studio/standalone.css";
import { supabase } from "@/integrations/supabase/client";

const provider = createSupabaseStudioProvider(supabase, { url: "/api/studio" });

export default function DataPage() {
  return <DataStudio provider={provider} />;
}
```

`npx @marktiderman/genesis-cli studio init` writes this page and its server for you.

- **No router or session wiring.** The studio keeps its state in the page's query string. The
  Supabase provider tells it when the signed-in user changes.
- **`standalone.css`** is prebuilt: every class the studio uses, for apps without Tailwind v4
  (Tailwind 3, CSS modules, or none). It adds no global reset. A small reset applies only inside
  the studio and its pop-ups. The app's own shadcn-style theme variables (`--background`,
  `--primary`, …) win over Genesis's defaults, so the studio matches the app.
- An app already on Tailwind v4 imports `styles.css` instead (see below).

## Use it

```tsx
import { DataStudio, createSearchParamsRouter } from "@marktiderman/genesis-studio";
import { createStudioProvider } from "@marktiderman/genesis-studio-server/client";
import { useSearchParams } from "react-router";

export default function AdminData() {
  const { session } = useSupabaseSession(); // your app's own sign-in
  const [params, setParams] = useSearchParams();
  const router = createSearchParamsRouter(params, (next, { replace }) => setParams(next, { replace }));
  const provider = useMemo(
    () => createStudioProvider({ url: "/api/studio", getAccessToken: () => session?.access_token ?? null }),
    [session],
  );
  return <DataStudio provider={provider} router={router} sessionKey={session?.user.id} signIn={<SignInForm />} />;
}
```

The server half — the handler at `/api/studio` — is
[`@marktiderman/genesis-studio-server`](../studio-server/README.md).

Tailwind v4 needs to see the studio's classes:

```css
@import "tailwindcss";
@import "@marktiderman/genesis-ui/styles.css";
@import "@marktiderman/genesis-studio/styles.css";
```

## Props

| Prop | |
| --- | --- |
| `provider` | Any Genesis `DataProvider` with `describe` and `listResources` — usually `createStudioProvider`. |
| `router` | `{ location, navigate }`. `createSearchParamsRouter` adapts React Router or Next.js; `useHistoryRouter` works without a router; `useMemoryRouter` for tests. URL keys: `table`, `page`, `sort`, `q`, `filter`, `group`, `record`. |
| `signIn` | Rendered instead of the studio while the provider reports nobody signed in. |
| `sessionKey` | The signed-in user's id. When it changes, everything loaded for the previous user is dropped. |
| `forms` | Per `schema.table`: `{ sections: [{ title, fields }], visibleWhen: { field: (values) => boolean } }`. |
| `title`, `perPage`, `className` | Presentation. |

## What it does

- **Open a record** with the ⤢ button on any row. The pop-up has three tabs:
  - **Details:** a form built from the schema, with validation for required fields, numbers,
    dates, enums and JSON, and pickers for links. Read-only fields show why they can't change.
  - **Related:** records this one links to and from.
  - **History:** the record's audit trail.

  The URL names the record (`?record=…`), so **Copy link** shares it. History entries
  have an **Undo** button.
- **New row** opens a form of only the fields the user may set.
- **Filter, Sort, Group** run on the server and live in the URL. **Views** saves them, with
  search and visible columns, per table.
- **Export CSV** pages through every matching row, up to 10 000. Cells a spreadsheet would run
  as formulas are neutralised.
- **Sheet view** (Table | Sheet, `?view=sheet`): arrows, Tab and Shift+arrows move and select;
  Enter, F2 or typing edits; Delete clears; Cmd/Ctrl+C and Cmd/Ctrl+V copy and paste with Sheets
  and Excel. A paste across rows is **one transaction**: every row changes at the version you
  see, or none does, and the failing cells are marked. **Cmd/Ctrl+Z** undoes your latest
  change from its audit entry.
- **Select rows** to set a field on all of them, or delete them: all or none.
- **Import CSV:** map the file's columns, **Check rows** (a dry run against the database that
  lists every row that won't import, and why), then **Import**, in one transaction.
- **Board view** (`?view=kanban&by=status`): one column per value of an enum or yes/no field,
  50 cards per column with **Load more**, the same filters, search and sort as the table. Drag a
  card, or use its **Move to** menu from the keyboard: a move is a version-checked update.
- **Calendar view** (`?view=calendar&by=starts_on&month=2026-10`): a month of rows by a date or
  timestamp field, one request per month, up to 200 rows. Timestamps show on the viewer's day.
- **Row actions** the server offers are buttons in the record pop-up, asking first when the
  action has a `confirm` question. A **Comments** tab lists and adds comments.
- **Link cells** show the linked row's label (one query per linked table per page). Links are
  edited in the record form, with a picker that searches on the server.

## What it shows

- **Read-only tables** carry a lock in the sidebar and a banner with the server's reason (no version
  trigger, editing not enabled, RLS off…).
- **Columns** are exactly the fields `describe()` returned for this user; a column they can't read
  never renders. Only fields with `permissions.update` are editable; enum and boolean fields edit
  as a select.
- **A conflict** keeps the editor open with the message, and the row then shows the other person's
  value, so the next edit starts from it.
- **This session's edits** lists every save and refusal, with the audit id, actor, time and the
  before → after of each changed field.
