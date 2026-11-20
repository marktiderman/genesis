/**
 * `SupportRoute`: every support screen from one route file, in every navigation zone.
 *
 * An app with expo-router puts two files under each zone's `basePath` (`index.tsx` and
 * `[...route].tsx`), each one line:
 *
 *   export { SupportRoute as default } from "@marktiderman/genesis-support/native";
 *
 * It reads the path (`useCurrentRoute`, expo-router's `usePathname`), works out the screen
 * (`supportScreenOf`, minus the zone from `createSupport`'s `zones`) and renders it from the same
 * hooks and Genesis layouts a hand-written route file would use. `createSupport`'s `router`
 * (`{ Screen: Stack.Screen, useSearchParams: useLocalSearchParams }`) gives it the stack header and
 * the help center's `?q=` / `?collection=`. A screen of the app's own replaces Genesis's through
 * `screens`; anything else is Genesis's.
 *
 * @stability Beta
 */
import { useEffect, type ComponentType, type ReactNode } from "react";
import { ScrollView } from "react-native";
import { getInboxPageStackOptions, getSettingsSubPageStackOptions, getThreadPageStackOptions, InboxPage, SettingsSubPage, ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { supportScreenOf, type SupportScreen, type SupportScreenName } from "../routes";
import type { SupportSettingValues } from "../settings";
import { useAgentInbox, useAgentThread } from "./agent";
import { FeedbackForm } from "./feedback-form";
import { HelpArticleBody, useHelpArticle, useHelpCenter, useMessengerHome, useStartConversation } from "./help";
import { useIdeaBoard, useShippedIdeas, useSupportInbox, useSupportThread } from "./screens";
import { useSupport } from "./support";

/** What a screen of the app's own gets: the screen the path names, and the search params. */
export interface SupportScreenProps {
  screen: SupportScreen;
  params: Readonly<Record<string, string | string[] | undefined>>;
}

export interface SupportRouteProps {
  /** The path, when the route file reads it itself. Default the block's `useCurrentRoute`. */
  path?: string;
  /** Search params, when the route file reads them itself. Default the block's `router.useSearchParams`. */
  params?: Readonly<Record<string, string | string[] | undefined>>;
  /** The app's own screens, by name, in place of Genesis's. */
  screens?: Partial<Record<SupportScreenName, ComponentType<SupportScreenProps>>>;
  /** Shown for a path that is no support screen. Default nothing. */
  notFound?: ReactNode;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
const noParams = () => ({});
const noPath = () => "";

/** Every support screen, from one route file per zone. See the module's notes. */
export function SupportRoute({ path, params, screens, notFound = null }: SupportRouteProps) {
  const block = useSupport();
  const current = (block.options.useCurrentRoute ?? noPath)();
  const search = (block.options.router?.useSearchParams ?? noParams)();
  const where = path ?? current;
  // A path the route file passes is where the person is (when the block has no route hook of its
  // own): links from here keep its zone, and leaving puts the route back as it was.
  const tracked = Boolean(block.options.useCurrentRoute);
  useEffect(() => {
    if (!path || tracked) return undefined;
    return block.noteRoute(path);
  }, [block, path, tracked]);
  const screen = supportScreenOf(where, block.paths.inbox, block.options.zones);
  if (!screen || !screenOn(screen.name, block.settings(), block.options.ideas)) return <>{notFound}</>;
  const query = params ?? search;
  const Own = screens?.[screen.name];
  if (Own) return <Own screen={screen} params={query} />;
  return <DefaultScreen screen={screen} params={query} />;
}

/** Whether the app's settings have this screen on (a screen turned off is `notFound`). */
function screenOn(name: SupportScreenName, s: SupportSettingValues, ideas: boolean | undefined): boolean {
  switch (name) {
    case "inbox":
    case "thread":
      return s.support.inbox;
    case "feedback":
      return s.support.feedback;
    case "ideas":
    case "shipped":
      // An `ideas` option the app gave wins over the setting, as in createSupport.
      return ideas ?? s.support.ideas;
    case "home":
    case "message":
      return s.support.messenger;
    case "help":
    case "article":
      return s.support.helpCenter;
    case "agent":
    case "agentThread":
      return s.support.agentDesk;
  }
}

/** The stack header, when the app gave `router.Screen`. */
function Header({ options }: { options: Record<string, unknown> }) {
  const Screen = useSupport().options.router?.Screen;
  return Screen ? <Screen options={options} /> : null;
}

function DefaultScreen({ screen, params }: SupportScreenProps) {
  switch (screen.name) {
    case "inbox":
      return <Inbox />;
    case "feedback":
      return <Feedback />;
    case "thread":
      return <Thread id={screen.id} />;
    case "ideas":
      return <Ideas />;
    case "shipped":
      return <Shipped />;
    case "home":
      return <Home />;
    case "message":
      return <Start />;
    case "help": {
      const q = first(params["q"]);
      const collection = first(params["collection"]);
      return <Help key={`${q ?? ""}|${collection ?? ""}`} initialQuery={q} collectionId={collection} />;
    }
    case "article":
      return <Article slug={screen.slug} />;
    case "agent":
      return <Agent />;
    case "agentThread":
      return <AgentThread id={screen.id} />;
  }
}

function Inbox() {
  const { headerTitle, ...inbox } = useSupportInbox();
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...inbox} />
    </>
  );
}

function Feedback() {
  const block = useSupport();
  return (
    <>
      <Header options={getSettingsSubPageStackOptions({ headerTitle: block.copy.feedback.title })} />
      <SettingsSubPage testID="genesis-support-route-feedback" onConfirmLeave={null}>
        <FeedbackForm />
      </SettingsSubPage>
    </>
  );
}

/** Leaves a screen whose record is gone: back to where it is listed. */
function useLeave(gone: boolean, to: string) {
  const navigate = useSupport().options.navigate;
  useEffect(() => {
    if (gone) navigate(to);
  }, [gone, to, navigate]);
}

function Thread({ id }: { id: string }) {
  const block = useSupport();
  const { headerTitle, notFound, awaiting: _awaiting, report: _report, loading: _loading, mode: _mode, conversationId: _conversationId, ...thread } = useSupportThread(id);
  useLeave(notFound, block.paths.inbox);
  return (
    <>
      <Header options={getThreadPageStackOptions({ headerTitle })} />
      <ThreadPage {...thread} />
    </>
  );
}

function Ideas() {
  const { headerTitle, ...board } = useIdeaBoard();
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...board} />
    </>
  );
}

function Shipped() {
  const { headerTitle, ...board } = useShippedIdeas();
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...board} />
    </>
  );
}

function Home() {
  const { headerTitle, ...home } = useMessengerHome();
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...home} />
    </>
  );
}

function Start() {
  const { headerTitle, failed: _failed, expectation: _expectation, ...start } = useStartConversation();
  return (
    <>
      <Header options={getThreadPageStackOptions({ headerTitle })} />
      <ThreadPage {...start} />
    </>
  );
}

function Help({ initialQuery, collectionId }: { initialQuery: string | undefined; collectionId: string | undefined }) {
  const { headerTitle, ...help } = useHelpCenter({ ...(initialQuery ? { initialQuery } : {}), ...(collectionId ? { collectionId } : {}) });
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...help} />
    </>
  );
}

function Article({ slug }: { slug: string }) {
  const article = useHelpArticle(slug);
  return (
    <>
      <Header options={getThreadPageStackOptions({ headerTitle: article.headerTitle })} />
      <ScrollView testID="genesis-support-route-article">
        <HelpArticleBody {...article} />
      </ScrollView>
    </>
  );
}

function Agent() {
  const { headerTitle, view: _view, setView: _setView, views: _views, counts: _counts, notAllowed: _notAllowed, ...inbox } = useAgentInbox();
  return (
    <>
      <Header options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...inbox} />
    </>
  );
}

function AgentThread({ id }: { id: string }) {
  const block = useSupport();
  const {
    headerTitle,
    notFound,
    notAllowed: _notAllowed,
    ticket: _ticket,
    requester: _requester,
    requesterTenants: _requesterTenants,
    live: _live,
    me: _me,
    mine: _mine,
    statusLabel: _statusLabel,
    assigneeLabel: _assigneeLabel,
    statuses: _statuses,
    setStatus: _setStatus,
    assignees: _assignees,
    assign: _assign,
    toggleMine: _toggleMine,
    changeFailed: _changeFailed,
    sendFailed: _sendFailed,
    ...thread
  } = useAgentThread(id);
  useLeave(notFound, block.paths.agent);
  return (
    <>
      <Header options={getThreadPageStackOptions({ headerTitle })} />
      <ThreadPage {...thread} />
    </>
  );
}
