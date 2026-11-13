import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { defineResource, useResource, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { Button } from "@marktiderman/genesis-ui";
import { CustomView } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Player = { id: string; name: string; team: "red" | "blue"; points: number };

const players = defineResource<Player>()({
  name: "players",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "team", type: "string", enumValues: ["red", "blue"] },
    { name: "points", type: "number" },
  ],
});

const playersView = defineView(players, {
  copy: { noun: "player", empty: { title: "No players yet", body: "Scores show here once the first game is played." } },
  orderBy: { field: "points", direction: "desc" },
  groupBy: "team",
});

const seed = (): Player[] => [
  { id: "1", name: "Ada", team: "red", points: 42 },
  { id: "2", name: "Bo", team: "blue", points: 37 },
  { id: "3", name: "Cy", team: "red", points: 31 },
  { id: "4", name: "Dee", team: "blue", points: 28 },
  { id: "5", name: "Eli", team: "red", points: 19 },
];

function WithPlayers({ rows = seed(), provider, children }: { rows?: Player[]; provider?: DataProvider; children: ReactNode }) {
  const [p] = useState(() => provider ?? createMockProvider({ players: rows }));
  return <GenesisProvider provider={p}>{children}</GenesisProvider>;
}

const ROW = 44;

/**
 * The app's own drawing: rows placed by rank, so a new score slides a row to its place. The rows
 * are an app part (`data-slot="app-leaderboard-row"`), coloured from roles only, and still when
 * the person asks for less motion.
 */
function Leaderboard({ rows, still }: { rows: readonly Player[]; still: boolean }) {
  const { update } = useResource<Player>("players", { enabled: false });
  const byName = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const rank = new Map(rows.map((r, i) => [r.id, i]));
  return (
    <ol data-slot="app-leaderboard" className="relative" style={{ height: rows.length * ROW }} aria-label="Leaderboard">
      {byName.map((p) => (
        <li
          key={p.id}
          data-slot="app-leaderboard-row"
          className="absolute inset-x-0 flex items-center gap-3 rounded-md border bg-card px-3 text-card-foreground"
          style={{ height: ROW - 6, transform: `translateY(${(rank.get(p.id) ?? 0) * ROW}px)`, transition: still ? "none" : "transform 300ms ease-out" }}
          aria-posinset={(rank.get(p.id) ?? 0) + 1}
          aria-setsize={rows.length}
        >
          <span className="w-6 text-sm font-semibold text-muted-foreground">{(rank.get(p.id) ?? 0) + 1}</span>
          <span className="flex-1 font-medium">{p.name}</span>
          <span className="tabular-nums text-primary">{p.points}</span>
          <Button size="sm" variant="ghost" onClick={() => void update(p.id, { points: p.points + 10 })}>
            +10
          </Button>
        </li>
      ))}
    </ol>
  );
}

const meta: Meta<typeof CustomView> = {
  title: "Foundation/Data/CustomView",
  component: CustomView,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CustomView>;

/**
 * `<CustomView>` over a view: Genesis loads the rows with the view's sort, scope and permissions
 * and draws loading, empty and error; the app draws only the leaderboard. Give a player +10 and
 * the save refreshes the view, so the row slides to its new rank.
 */
export const AnimatedLeaderboard: Story = {
  render: () => (
    <WithPlayers>
      <div className="max-w-md">
        <CustomView view={playersView} perPage={10} live>
          {({ rows, reducedMotion }) => <Leaderboard rows={rows} still={reducedMotion} />}
        </CustomView>
      </div>
    </WithPlayers>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Ada")).toBeInTheDocument());
    expect(canvasElement.querySelector('[data-slot="custom-view"]')?.getAttribute("data-state")).toBe("ready");
  },
};

/** The same rows under the view's `groupBy`, through `groups()`. */
export const Grouped: Story = {
  render: () => (
    <WithPlayers>
      <CustomView view={playersView}>
        {({ groups }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups().map((g) => (
              <section key={g.key} data-slot="app-team" className="rounded-lg border p-3">
                <h3 className="mb-2 font-semibold">{g.label}</h3>
                <ul className="space-y-1 text-sm">
                  {g.rows.map((p) => (
                    <li key={p.id}>
                      {p.name} <span className="text-muted-foreground">{p.points}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CustomView>
    </WithPlayers>
  ),
};

/** Nothing to show: the view's own empty words, drawn by Genesis. */
export const Empty: Story = {
  render: () => (
    <WithPlayers rows={[]}>
      <CustomView view={playersView}>{() => null}</CustomView>
    </WithPlayers>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText("No players yet")).toBeInTheDocument());
  },
};

const failing = { ...createMockProvider({ players: [] }), getList: async () => Promise.reject(new Error("The scores service is down.")) } as unknown as DataProvider;

/** A failed load: the reason and a retry, drawn by Genesis. */
export const Failed: Story = {
  render: () => (
    <WithPlayers provider={failing}>
      <CustomView view={playersView}>{() => null}</CustomView>
    </WithPlayers>
  ),
};
