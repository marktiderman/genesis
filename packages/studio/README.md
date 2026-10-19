# @marktiderman/genesis-studio

**Genesis Data Studio**, the workspace UI: a sidebar of the tables the signed-in user may see, and a
sheet of the selected one where a cell is edited in place. Every save is checked against the
version of the row it was read at and committed with its audit entry, and the outcome is on screen:
"Saved", with the audit entry, or "Not saved" and why.

Built on genesis-ui's `ResourcePage` and `DataTable` (DATA-STUDIO.md decision 21). Routing and URL
state come from your app through an adapter (decision 23), and sign-in fills a slot.

**Status: 0.1, Experimental.** P0 scope: browse, search, sort, page, and single-cell edits.

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
| `router` | `{ location, navigate }`. `createSearchParamsRouter` adapts React Router or Next.js; `useHistoryRouter` works without a router; `useMemoryRouter` for tests. URL keys: `table`, `page`, `sort`, `q`. |
| `signIn` | Rendered instead of the studio while the provider reports nobody signed in. |
| `sessionKey` | The signed-in user's id. When it changes, everything loaded for the previous user is dropped. |
| `title`, `perPage`, `className` | Presentation. |

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
