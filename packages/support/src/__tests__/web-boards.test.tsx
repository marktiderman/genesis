// The person's lists on the web (reports, the idea board, what shipped), staff's two controls and
// one help article, each over a fake support client.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { SupportError, type HelpArticle, type SupportClient, type SupportIdea, type SupportReport } from "..";
import {
  SupportHelpArticle,
  SupportIdeaBoard,
  SupportIdeaStatusControl,
  SupportMyReports,
  SupportReportFeatureControl,
  SupportShippedIdeas,
  ideaVotable,
  ideaVotesLabel,
} from "../web-boards";

afterEach(cleanup);

function wrap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Nothing is read through the provider: the lists draw the client's rows.
  const provider = {
    getList: vi.fn(async () => ({ data: [], total: 0 })),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  return { wrapper: Wrapper, provider };
}

const report = (over: Partial<SupportReport> = {}): SupportReport => ({
  id: "r1",
  type: "bug",
  title: "Export is broken",
  message: "It does nothing",
  status: "in_progress",
  featureId: null,
  route: "/reports",
  page: "Reports (/reports)",
  appVersion: null,
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  lastStaffReplyAt: "2026-11-04T10:00:00Z",
  lastUserReplyAt: null,
  userReadAt: null,
  staffReadAt: null,
  unread: true,
  ...over,
});

const idea = (over: Partial<SupportIdea> = {}): SupportIdea => ({
  id: "i1",
  title: "Dark mode",
  body: "Easier at night",
  status: "open",
  featureId: null,
  shippedAt: null,
  voteCount: 3,
  voted: false,
  mine: false,
  createdAt: "2026-11-01T10:00:00Z",
  ...over,
});

describe("SupportMyReports", () => {
  it("lists the person's reports with unread and status badges, and the thread in the peek", async () => {
    const client = { myReports: vi.fn(async () => [report(), report({ id: "r2", title: null, message: "Love it", status: "addressed", unread: false })]), deleteReport: vi.fn() };
    const onSendFeedback = vi.fn();
    render(<SupportMyReports client={client} tenantId="t1" onSendFeedback={onSendFeedback} renderDetail={(r) => <p data-testid="thread">thread of {r.id}</p>} />, wrap());
    expect(await screen.findByText("Export is broken")).toBeTruthy();
    expect(screen.getByText("Love it")).toBeTruthy();
    expect(client.myReports).toHaveBeenCalledWith({ tenantId: "t1" });
    expect(within(screen.getByTestId("support-report-status-r1")).getByText("New reply")).toBeTruthy();
    expect(within(screen.getByTestId("support-report-status-r1")).getByText("In progress")).toBeTruthy();
    expect(screen.queryByTestId("support-report-unread-r2")).toBeNull();

    fireEvent.click(screen.getByTestId("support-reports-send-feedback"));
    expect(onSendFeedback).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("Export is broken"));
    expect((await screen.findByTestId("thread")).textContent).toBe("thread of r1");
    expect(within(screen.getByTestId("support-report-fields")).getByText("Reports (/reports)")).toBeTruthy();
  });

  it("deletes a report after the confirm and reads the list again", async () => {
    let rows = [report()];
    const client = {
      myReports: vi.fn(async () => rows),
      deleteReport: vi.fn(async () => {
        rows = [];
      }),
    };
    render(<SupportMyReports client={client} />, wrap());
    fireEvent.click(await screen.findByText("Export is broken"));
    fireEvent.click(await screen.findByTestId("detail-panel-delete"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this report?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(client.deleteReport).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("No reports yet")).toBeTruthy();
    expect(client.myReports).toHaveBeenCalledTimes(2);
  });

  it("takes its words from the copy", async () => {
    const client = { myReports: vi.fn(async () => []), deleteReport: vi.fn() };
    render(<SupportMyReports client={client} copy={{ inbox: { emptyTitle: "Nothing sent yet" } }} />, wrap());
    expect(await screen.findByText("Nothing sent yet")).toBeTruthy();
  });
});

describe("SupportIdeaBoard", () => {
  const board = (over: Partial<Pick<SupportClient, "ideas" | "suggestIdea" | "vote" | "unvote" | "setIdeaStatus">> = {}) => ({
    ideas: vi.fn(async () => [idea(), idea({ id: "i2", title: "Export to CSV", voted: true, mine: true, voteCount: 1, status: "planned" }), idea({ id: "i3", title: "Fax support", status: "declined", voteCount: 0 })]),
    suggestIdea: vi.fn(async (input: { title: string; body?: string }) => idea({ id: "new", title: input.title })),
    vote: vi.fn(async () => undefined),
    unvote: vi.fn(async () => undefined),
    ...over,
  });

  it("votes and unvotes, and only on ideas still in play", async () => {
    const client = board();
    render(<SupportIdeaBoard client={client} />, wrap());
    expect(await screen.findByText("Dark mode")).toBeTruthy();
    expect(screen.getByText("Yours")).toBeTruthy();
    fireEvent.click(screen.getByTestId("support-idea-vote-i1"));
    await waitFor(() => expect(client.vote).toHaveBeenCalledWith("i1"));
    fireEvent.click(screen.getByTestId("support-idea-vote-i2"));
    await waitFor(() => expect(client.unvote).toHaveBeenCalledWith("i2"));
    expect((screen.getByTestId("support-idea-vote-i3") as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(vi.mocked(client.ideas).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(ideaVotable({ status: "shipped" })).toBe(false);
    expect(ideaVotesLabel(1)).toBe("1 vote");
    expect(ideaVotesLabel(4)).toBe("4 votes");
  });

  it("suggests an idea", async () => {
    const client = board();
    render(<SupportIdeaBoard client={client} />, wrap());
    await screen.findByText("Dark mode");
    fireEvent.click(screen.getByRole("button", { name: /Suggest an idea/ }));
    const dialog = await screen.findByTestId("support-idea-suggest");
    fireEvent.change(within(dialog).getByTestId("support-idea-suggest-title"), { target: { value: "  Keyboard shortcuts " } });
    fireEvent.click(within(dialog).getByTestId("support-idea-suggest-submit"));
    await waitFor(() => expect(client.suggestIdea).toHaveBeenCalledWith({ title: "Keyboard shortcuts" }));
    await waitFor(() => expect(screen.queryByTestId("support-idea-suggest")).toBeNull());
  });

  it("says when a suggestion is refused for the rate limit", async () => {
    const onError = vi.fn();
    const client = board({ suggestIdea: vi.fn(async () => Promise.reject(new SupportError("slow down", "GS429", "suggestIdea"))) });
    render(<SupportIdeaBoard client={client} onError={onError} />, wrap());
    await screen.findByText("Dark mode");
    fireEvent.click(screen.getByRole("button", { name: /Suggest an idea/ }));
    const dialog = await screen.findByTestId("support-idea-suggest");
    fireEvent.change(within(dialog).getByTestId("support-idea-suggest-title"), { target: { value: "More" } });
    fireEvent.click(within(dialog).getByTestId("support-idea-suggest-submit"));
    expect((await screen.findByTestId("support-idea-suggest-failed")).textContent).toMatch(/a lot of feedback/);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("shows staff the status control in the peek, and nobody else", async () => {
    const client = board({ setIdeaStatus: vi.fn(async () => undefined) });
    const { unmount } = render(<SupportIdeaBoard client={client} />, wrap());
    fireEvent.click(await screen.findByText("Dark mode"));
    await screen.findByTestId("support-idea-detail");
    expect(screen.queryByTestId("support-idea-status-control")).toBeNull();
    unmount();
    render(<SupportIdeaBoard client={client} staff />, wrap());
    fireEvent.click(await screen.findByText("Dark mode"));
    expect(await screen.findByTestId("support-idea-status-control")).toBeTruthy();
  });
});

describe("SupportIdeaStatusControl", () => {
  it("saves the status and the feature that delivers it", async () => {
    const client = { setIdeaStatus: vi.fn(async () => undefined) };
    const onChanged = vi.fn();
    render(<SupportIdeaStatusControl client={client} idea={idea({ status: "shipped", featureId: "old" })} onChanged={onChanged} />);
    fireEvent.change(screen.getByTestId("support-idea-status-feature"), { target: { value: " billing-export " } });
    fireEvent.click(screen.getByTestId("support-idea-status-save"));
    await waitFor(() => expect(client.setIdeaStatus).toHaveBeenCalledWith("i1", "shipped", "billing-export"));
    expect((await screen.findByTestId("support-idea-status-message")).textContent).toBe("Saved the idea's status");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("says when the save fails", async () => {
    const client = { setIdeaStatus: vi.fn(async () => Promise.reject(new SupportError("no", "42501", "setIdeaStatus"))) };
    render(<SupportIdeaStatusControl client={client} idea={idea()} />);
    fireEvent.click(screen.getByTestId("support-idea-status-save"));
    expect((await screen.findByTestId("support-idea-status-message")).textContent).toBe("The status wasn't saved. Try again.");
  });

  it("draws nothing for a client without setIdeaStatus", () => {
    render(<SupportIdeaStatusControl client={{}} idea={idea()} />);
    expect(screen.queryByTestId("support-idea-status-control")).toBeNull();
  });
});

describe("SupportReportFeatureControl", () => {
  it("reads the report fresh and keeps the status it has now", async () => {
    const client = { report: vi.fn(async () => report({ status: "addressed" })), setStatus: vi.fn(async () => undefined) };
    render(<SupportReportFeatureControl client={client} report={report({ status: "open", featureId: "tasks" })} />);
    expect((screen.getByTestId("support-report-feature-input") as HTMLInputElement).value).toBe("tasks");
    fireEvent.change(screen.getByTestId("support-report-feature-input"), { target: { value: "billing-export" } });
    fireEvent.click(screen.getByTestId("support-report-feature-save"));
    await waitFor(() => expect(client.setStatus).toHaveBeenCalledWith("r1", "addressed", "billing-export"));
    expect(client.report).toHaveBeenCalledWith("r1");
    expect((await screen.findByTestId("support-report-feature-message")).textContent).toBe("Saved the feature");
  });

  it("keeps the list's status when the report can't be read, and clears with a blank", async () => {
    const client = { report: vi.fn(async () => null), setStatus: vi.fn(async () => undefined) };
    render(<SupportReportFeatureControl client={client} report={report({ status: "pending", featureId: "tasks" })} />);
    fireEvent.change(screen.getByTestId("support-report-feature-input"), { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("support-report-feature-save"));
    await waitFor(() => expect(client.setStatus).toHaveBeenCalledWith("r1", "pending", ""));
  });
});

describe("SupportShippedIdeas", () => {
  it("lists what shipped with whether the person suggested it or voted for it", async () => {
    const client = {
      shippedForMe: vi.fn(async () => [
        idea({ status: "shipped", featureId: "dark-mode", shippedAt: "2026-11-10T10:00:00Z", mine: true }),
        idea({ id: "i2", title: "Export to CSV", status: "shipped", featureId: "csv", shippedAt: "2026-11-12T10:00:00Z", voted: true }),
      ]),
    };
    render(<SupportShippedIdeas client={client} />, wrap());
    expect(await screen.findByText("Dark mode")).toBeTruthy();
    expect(screen.getByText("Suggested it")).toBeTruthy();
    expect(screen.getByText("Voted for it")).toBeTruthy();
    fireEvent.click(screen.getByText("Dark mode"));
    expect(within(await screen.findByTestId("support-shipped-fields")).getByText("dark-mode")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    render(<SupportShippedIdeas client={{ shippedForMe: vi.fn(async () => []) }} />, wrap());
    expect(await screen.findByText("Nothing yet")).toBeTruthy();
  });
});

describe("SupportHelpArticle", () => {
  const article: HelpArticle = {
    id: "a1",
    collectionId: null,
    slug: "export",
    title: "Exporting your data",
    summary: "Where the export lives",
    status: "published",
    publishedAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    body: "Open Settings.\n\nPick Export.",
  };

  it("renders the article's title, summary and paragraphs, and the footer", async () => {
    const client = { helpArticle: vi.fn(async () => article) };
    render(<SupportHelpArticle client={client} slug="export" tenantId={null} footer={<a href="/help">Open Help</a>} />, wrap());
    expect(screen.getByTestId("support-help-article-loading")).toBeTruthy();
    expect((await screen.findByTestId("support-help-article-title")).textContent).toBe("Exporting your data");
    expect(screen.getByTestId("support-help-article-summary").textContent).toBe("Where the export lives");
    expect(screen.getByTestId("support-help-article-body").querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("Open Help")).toBeTruthy();
    expect(client.helpArticle).toHaveBeenCalledWith("export", { tenantId: null });
  });

  it("is not found for a missing article or a client without a help center", async () => {
    render(<SupportHelpArticle client={{ helpArticle: vi.fn(async () => null) }} slug="gone" />, wrap());
    expect(await screen.findByText("We couldn't find that article")).toBeTruthy();
    cleanup();
    render(<SupportHelpArticle client={{}} slug="gone" />, wrap());
    expect(await screen.findByTestId("support-help-article-not-found")).toBeTruthy();
  });

  it("says when it didn't load, and tries again", async () => {
    const onError = vi.fn();
    const helpArticle = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(article);
    render(<SupportHelpArticle client={{ helpArticle }} slug="export" onError={onError} />, wrap());
    expect(await screen.findByText("This article didn't load")).toBeTruthy();
    expect(onError).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("support-help-article-retry"));
    expect(await screen.findByText("Exporting your data")).toBeTruthy();
  });
});
