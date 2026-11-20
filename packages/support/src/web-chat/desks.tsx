/**
 * Desks on the web (migration 0024): the cards an agent's details panel shows (who wrote, and
 * where the ticket is with the way to send it up, back or across), a desk picker for an agent who
 * works more than one, and the switch a tenant's admins turn their desk on with.
 *
 * `SupportAgentInbox` shows `SupportRequesterPanel` and `SupportDeskControls` itself (its
 * `requesterPanel` and `deskControls` props); they are exported for an app that lays its details
 * out its own way. Each reads through the support client, and the database decides who may.
 *
 * @stability Beta
 */
import { useEffect, useId, useMemo, useState } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineAlert,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  ToggleRow,
  toast,
} from "@marktiderman/genesis-ui";
import { requesterTenantsLabel, type AgentTicket, type SupportClient, type SupportPersonMatch } from "../client";
import { chooseDesk, pickerDesks, type DeskLogEntry, type DeskTarget, type SupportDesk, type TicketDesk } from "../desks";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { mailtoHref, supportSettingValues, type SupportSettingsInput } from "../settings";
import { useLoginScope, type LoginScope } from "./tenant";
import { listView, ViewList } from "./list-view";


/**
 * Desk query keys, under genesis-support's root (a support write refreshes them too), each scoped
 * to its support client and the signed-in login (`scope`, from `useSupportDeskScope(client)`), so
 * two clients sharing a QueryClient, or two logins one after the other, never read each other's desks.
 */
export const supportDeskKeys = {
  all: ["genesis-support", "desks"] as const,
  mine: (scope: string) => ["genesis-support", "desks", scope, "mine"] as const,
  ticket: (scope: string, id: string) => ["genesis-support", "desks", scope, "ticket", id] as const,
  targets: (scope: string, id: string) => ["genesis-support", "desks", scope, "targets", id] as const,
  requester: (scope: string, id: string) => ["genesis-support", "desks", scope, "requester", id] as const,
  requesterTenants: (scope: string, id: string) => ["genesis-support", "desks", scope, "requester-tenants", id] as const,
  log: (scope: string, tenantId: string | null) => ["genesis-support", "desks", scope, "log", tenantId] as const,
  people: (scope: string, tenantId: string | null, query: string) => ["genesis-support", "desks", scope, "people", tenantId, query] as const,
  manages: (scope: string, tenantId: string | null) => ["genesis-support", "desks", scope, "manages", tenantId] as const,
};

/** A support client's scope for `supportDeskKeys`: the client and the signed-in login (null until it's known). */
export function useSupportDeskScope(client: Pick<SupportClient, "signedInId" | "onSignedInChange">): LoginScope {
  return useLoginScope(client, null);
}

/** A desk's name: the app's label, else the copy's ("Support" for the app's own). */
export function deskName(desk: { label: string | null; isDefault: boolean } | null | undefined, copy: SupportCopy): string {
  if (!desk) return copy.desks.unnamedDesk;
  return desk.label?.trim() || (desk.isDefault ? copy.desks.appDesk : copy.desks.unnamedDesk);
}

/** What the details panel says about a ticket's last move, or null when it never moved. */
export function lastMoveLabel(desk: TicketDesk, copy: SupportCopy, names: (tenantId: string) => string): string | null {
  const move = desk.lastMove;
  if (!move) return null;
  const by = move.byName ? fill(copy.desks.by, { name: move.byName }) : "";
  const template = move.action === "escalated" ? copy.desks.lastEscalated : move.action === "returned" ? copy.desks.lastReturned : copy.desks.lastMoved;
  return fill(template, { by, from: names(move.from), to: names(move.to) });
}

/** The desks the signed-in person works (`support_my_desks`), or undefined while loading. */
export function useSupportDesks(client: SupportClient, options: { enabled?: boolean } = {}) {
  const { scope } = useSupportDeskScope(client);
  const myDesks = client.myDesks?.bind(client);
  return useQuery({
    queryKey: supportDeskKeys.mine(scope ?? ""),
    queryFn: myDesks && scope && options.enabled !== false ? () => myDesks() : skipToken,
    staleTime: 60_000,
  });
}

export interface SupportRequesterPanelProps {
  client: SupportClient;
  ticket: AgentTicket;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/** Whether the signed-in login manages a desk's agents (`canManageAgents`); false while unknown or without the method. */
export function useCanManageAgents(client: SupportClient, tenantId: string | null): { known: boolean; manages: boolean; failed: boolean; error: unknown } {
  const login = useSupportDeskScope(client);
  const ask = client.canManageAgents?.bind(client);
  const scope = login.scope;
  const manages = useQuery({
    queryKey: supportDeskKeys.manages(scope ?? "", tenantId),
    queryFn: ask && scope ? () => ask({ tenantId }) : skipToken,
    staleTime: 60_000,
  });
  if (login.failed) return { known: true, manages: false, failed: true, error: login.error };
  return { known: !ask || manages.isSuccess || manages.isError, manages: manages.data === true, failed: manages.isError, error: manages.error };
}

/**
 * Who wrote: their name and email (a mailto link), the tenants they belong to, and where they wrote
 * from (migration 0022). Whoever manages the desk's agents (`canManageAgents`) also gets "Make an
 * agent" (`setAgent`).
 */
export function SupportRequesterPanel({ client, ticket, copy: overrides, onError }: SupportRequesterPanelProps) {
  const copy = resolveSupportCopy(overrides);
  const queryClient = useQueryClient();
  const setAgent = client.setAgent?.bind(client);
  const manage = useCanManageAgents(client, ticket.tenantId);
  const [busy, setBusy] = useState(false);
  const userId = ticket.userId ?? "";
  const login = useSupportDeskScope(client);
  const scope = login.scope;
  const reporters = client.reporters?.bind(client);
  const requesterTenants = client.requesterTenants?.bind(client);
  const who = useQuery({
    queryKey: supportDeskKeys.requester(scope ?? "", userId),
    queryFn: userId && reporters && scope ? async () => (await reporters([userId]))[0] ?? null : skipToken,
    staleTime: 5 * 60_000,
  });
  const tenants = useQuery({
    queryKey: supportDeskKeys.requesterTenants(scope ?? "", userId),
    queryFn: userId && requesterTenants && scope ? () => requesterTenants(userId) : skipToken,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (who.error) onError?.(who.error);
    if (tenants.error) onError?.(tenants.error);
    if (manage.error) onError?.(manage.error);
  }, [who.error, tenants.error, manage.error, onError]);
  if (login.failed) return <InlineAlert variant="destructive" description={copy.requester.failed} testID="genesis-support-requester-failed" />;
  if ((userId && !scope) || who.isLoading || tenants.isLoading) {
    return (
      <div role="status" aria-label={copy.requester.title} data-testid="genesis-support-requester-loading">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (who.isError) return <InlineAlert variant="destructive" description={copy.requester.failed} testID="genesis-support-requester-failed" />;
  const email = who.data?.email ?? ticket.requesterEmail;
  const belongs = tenants.data ? requesterTenantsLabel(tenants.data) : null;
  const sentFrom = [ticket.platform, ticket.appVersion].filter(Boolean).join(" · ");
  const already = tenants.data?.some((t) => t.tenantId === ticket.tenantId && (t.role === "agent" || t.role === "admin")) ?? false;
  const canMakeAgent = Boolean(userId && setAgent && manage.manages && !already);
  if (!email && !belongs && !sentFrom && !who.data?.name && !canMakeAgent) return null;
  const makeAgent = async () => {
    if (!setAgent) return;
    setBusy(true);
    try {
      await setAgent(ticket.tenantId, userId, "agent");
      await queryClient.invalidateQueries({ queryKey: supportDeskKeys.requesterTenants(scope ?? "", userId) });
      await queryClient.invalidateQueries({ queryKey: supportAgentKeys.all });
      toast.success(copy.requester.madeAgent);
    } catch (error) {
      toast.error(copy.agents.failed);
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card data-testid="genesis-support-requester">
      <CardHeader>
        <CardTitle className="text-sm">{who.data?.name ?? copy.requester.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-1 text-sm">
        {email ? (
          <Button asChild variant="link" className="h-auto p-0" testID="genesis-support-requester-email">
            <a href={mailtoHref(email)}>{email}</a>
          </Button>
        ) : null}
        {belongs && tenants.data?.some((t) => t.role) ? (
          <ul data-testid="genesis-support-requester-tenants" aria-label={copy.requester.tenants} className="flex flex-col gap-0.5">
            {tenants.data
              .filter((t) => t.label?.trim())
              .map((t) => (
                <li key={t.tenantId}>
                  {t.label}
                  {t.role ? <span className="text-muted-foreground"> · {(copy.requester.roles as Record<string, string>)[t.role] ?? t.role}</span> : null}
                </li>
              ))}
          </ul>
        ) : belongs ? (
          <p data-testid="genesis-support-requester-tenants">
            <span className="text-muted-foreground">{copy.requester.tenants}: </span>
            {belongs}
          </p>
        ) : null}
        {sentFrom ? (
          <p className="text-muted-foreground">
            {copy.requester.sentFrom}: {sentFrom}
          </p>
        ) : null}
        {canMakeAgent ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void makeAgent()} data-testid="genesis-support-requester-make-agent">
            {copy.requester.makeAgent}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Agent lists' query keys (`SupportAgentsAdmin`), under genesis-support's root. */
export const supportAgentKeys = {
  all: ["genesis-support", "agents"] as const,
  list: (scope: string) => ["genesis-support", "agents", scope] as const,
};

/** A search for people in a desk's tenant (`searchPeople`, for the desk's agents), and the pick among those it found. */
export function PersonSearch({
  client,
  tenantId,
  value,
  onChange,
  words,
  testId,
}: {
  client: SupportClient;
  /** The desk whose tenant to search (null: the app's own). */
  tenantId: string | null;
  value: SupportPersonMatch | null;
  onChange: (person: SupportPersonMatch | null) => void;
  words: { search: string; placeholder: string; noMatches: string; unnamed: string; failed: string };
  testId: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const login = useSupportDeskScope(client);
  const scope = login.scope;
  const search = client.searchPeople?.bind(client);
  const found = useQuery({
    queryKey: supportDeskKeys.people(scope ?? "", tenantId, q),
    queryFn: search && scope && q.length >= 2 ? () => search({ tenantId, query: q }) : skipToken,
    staleTime: 30_000,
  });
  const people = found.data ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{words.search}</Label>
        <Input id={id} type="search" value={query} placeholder={words.placeholder} onChange={(e) => setQuery(e.target.value)} data-testid={`${testId}-search`} />
      </div>
      {q.length < 2 ? null : found.isError || login.failed ? (
        <InlineAlert variant="destructive" description={words.failed} testID={`${testId}-search-failed`} />
      ) : found.isSuccess ? (
        people.length ? (
          <Select value={value?.personId ?? ""} onValueChange={(pick) => onChange(people.find((p) => p.personId === pick) ?? null)}>
            <SelectTrigger aria-label={words.search} data-testid={`${testId}-pick`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.personId} value={p.personId}>
                  {personLabel(p, words.unnamed)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            {words.noMatches}
          </p>
        )
      ) : null}
    </div>
  );
}

/** A found person as a pick shows them: their name and email, else whichever there is. */
function personLabel(p: { name: string | null; email?: string | null }, unnamed: string): string {
  const name = p.name?.trim();
  return name && p.email ? `${name} (${p.email})` : (name || p.email || unnamed);
}

export interface SupportLinkRequesterProps {
  client: SupportClient;
  ticket: AgentTicket;
  /** After it's linked (the inbox re-reads the ticket). */
  onLinked?: (ticketId: string) => void;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/**
 * An email ticket with no login: find the person in the ticket's tenant (`searchPeople`) and, after
 * a confirm that names both, link it to their login (`linkRequester`), so it shows in their app. It
 * can't be undone here. For the desk's agents (who handle its tickets): one rule for searching and
 * linking. The database refuses anyone who doesn't handle the ticket, and a person outside its tenant.
 */
export function SupportLinkRequester({ client, ticket, onLinked, copy: overrides, onError }: SupportLinkRequesterProps) {
  const copy = resolveSupportCopy(overrides);
  const queryClient = useQueryClient();
  const linkRequester = client.linkRequester?.bind(client);
  const [person, setPerson] = useState<SupportPersonMatch | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (ticket.channel !== "email" || ticket.userId || !linkRequester || !client.searchPeople) return null;
  const name = person ? personLabel(person, copy.agents.unnamed) : "";
  const link = async () => {
    if (!person) return;
    setBusy(true);
    setFailed(false);
    try {
      await linkRequester(ticket.id, person.userId);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["genesis-support"] });
      toast.success(fill(copy.requester.linked, { name }));
      onLinked?.(ticket.id);
    } catch (error) {
      setConfirming(false);
      setFailed(true);
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card data-testid="genesis-support-link-requester">
      <CardHeader>
        <CardTitle className="text-sm">{copy.requester.linkTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">{copy.requester.linkBody}</p>
        <PersonSearch
          client={client}
          tenantId={ticket.tenantId}
          value={person}
          onChange={setPerson}
          words={{ search: copy.requester.linkSearch, placeholder: copy.requester.linkSearchPlaceholder, noMatches: copy.requester.linkNoMatches, unnamed: copy.agents.unnamed, failed: copy.requester.linkSearchFailed }}
          testId="genesis-support-link-requester"
        />
        {failed ? <InlineAlert variant="destructive" description={copy.requester.linkFailed} testID="genesis-support-link-requester-failed" /> : null}
        <Button size="sm" className="self-start" disabled={!person || busy} onClick={() => setConfirming(true)} data-testid="genesis-support-link-requester-send">
          {copy.requester.link}
        </Button>
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={(open) => (busy ? null : setConfirming(open))}>
        <AlertDialogContent data-testid="genesis-support-link-requester-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.requester.linkConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{fill(copy.requester.linkConfirmBody, { email: ticket.requesterEmail ?? copy.requester.linkNoEmail, name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="genesis-support-link-requester-cancel">
              {copy.requester.linkCancel}
            </AlertDialogCancel>
            <Button disabled={busy} onClick={() => void link()} data-testid="genesis-support-link-requester-confirm-send">
              {copy.requester.link}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export interface SupportDeskControlsProps {
  client: SupportClient;
  ticket: AgentTicket;
  /** The ticket left this desk: close it and refresh the queues (the inbox does both). */
  onMoved?: (ticketId: string) => void;
  /** Offer "Move to another desk" too (any desk its person belongs to that is on). Default true. */
  allowMove?: boolean;
  /** Genesis settings: with `support.desks` off (the `standard` and `min` presets) this shows nothing. Left out, `max`. */
  settings?: SupportSettingsInput | null;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

type MoveKind = { kind: "escalate" } | { kind: "return" } | { kind: "move" };

/**
 * Where the ticket is, and moving it: a tenant desk's handler sends it up to the app's own desk; the
 * app's own desk hands an escalated one back; either moves it to another desk its person belongs
 * to. Nothing shows for a ticket that never moved and can't (the app's own, with no other desk).
 */
export function SupportDeskControls(props: SupportDeskControlsProps) {
  // Another ticket is a fresh card: an open dialog never carries over to it.
  return <DeskControls key={props.ticket.id} {...props} />;
}

function DeskControls({ client, ticket, onMoved, allowMove = true, settings, copy: overrides, onError }: SupportDeskControlsProps) {
  const copy = resolveSupportCopy(overrides);
  const on = supportSettingValues(settings).support.desks;
  const login = useSupportDeskScope(client);
  const scope = login.scope;
  const ticketDesk = client.ticketDesk?.bind(client);
  const moveTargets = client.deskMoveTargets?.bind(client);
  const desk = useQuery({ queryKey: supportDeskKeys.ticket(scope ?? "", ticket.id), queryFn: ticketDesk && scope && on ? () => ticketDesk(ticket.id) : skipToken });
  const targets = useQuery({
    queryKey: supportDeskKeys.targets(scope ?? "", ticket.id),
    queryFn: moveTargets && scope && allowMove && on ? () => moveTargets(ticket.id) : skipToken,
  });
  const mine = useSupportDesks(client, { enabled: on });
  const [open, setOpen] = useState<MoveKind | null>(null);
  useEffect(() => {
    if (desk.error) onError?.(desk.error);
  }, [desk.error, onError]);
  if (!on || !ticketDesk) return null;
  if (login.failed) return <InlineAlert variant="destructive" description={copy.desks.loadFailed} testID="genesis-support-desk-failed" />;
  if (desk.isPending) {
    return (
      <div role="status" aria-label={copy.desks.pickerLabel} data-testid="genesis-support-desk-loading">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (desk.isError) return <InlineAlert variant="destructive" description={copy.desks.loadFailed} testID="genesis-support-desk-failed" />;
  const d = desk.data;
  if (!d) return null;
  const known = new Map<string, string>();
  for (const x of [...(mine.data ?? []), ...(targets.data ?? [])]) known.set(x.tenantId, deskName(x, copy));
  const nameOf = (id: string) => known.get(id) ?? (id === d.tenantId ? deskName(d, copy) : id === d.returnsTo ? deskName({ label: d.returnsToLabel, isDefault: false }, copy) : copy.desks.unnamedDesk);
  // Where an escalation goes: the app's own desk, by its name.
  const appDesk = deskName({ label: (targets.data ?? []).find((t) => t.isDefault)?.label ?? null, isDefault: true }, copy);
  const others = (targets.data ?? []).filter((t) => !t.isDefault && t.tenantId !== d.returnsTo);
  const moved = lastMoveLabel(d, copy, nameOf);
  const canMove = allowMove && Boolean(client.moveTicket) && others.length > 0;
  const canEscalate = d.canEscalate && Boolean(client.escalateTicket);
  const canReturn = d.canReturn && Boolean(client.returnTicket);
  const history = client.deskHistory?.bind(client);
  if (!moved && !canEscalate && !canReturn && !d.returnsTo && !canMove && !history) return null;
  const returnsToName = d.returnsTo ? nameOf(d.returnsTo) : null;
  const sentTo = open?.kind === "escalate" ? appDesk : open?.kind === "return" ? (returnsToName ?? "") : null;
  return (
    <Card data-testid="genesis-support-desk">
      <CardHeader>
        <CardTitle className="text-sm">{deskName(d, copy)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2 text-sm">
        {moved ? <p className="text-muted-foreground" data-testid="genesis-support-desk-last">{moved}</p> : null}
        {d.lastMove?.reason ? <p className="whitespace-pre-wrap">“{d.lastMove.reason}”</p> : null}
        {canEscalate ? (
          <Button size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setOpen({ kind: "escalate" })} data-testid="genesis-support-desk-escalate">
            {fill(copy.desks.escalate, { name: appDesk })}
          </Button>
        ) : null}
        {canReturn && returnsToName ? (
          <Button size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setOpen({ kind: "return" })} data-testid="genesis-support-desk-return">
            {fill(copy.desks.returnTo, { name: returnsToName })}
          </Button>
        ) : null}
        {d.isDefault && !d.canReturn && returnsToName ? <p className="text-muted-foreground">{fill(copy.desks.cantReturn, { name: returnsToName })}</p> : null}
        {canMove ? (
          <Button size="sm" variant="ghost" className="h-auto whitespace-normal text-left" onClick={() => setOpen({ kind: "move" })} data-testid="genesis-support-desk-move">
            {copy.desks.moveTo}
          </Button>
        ) : null}
        {history ? <DeskLog history={history} scope={scope ?? ""} tenantId={d.isDefault ? null : d.tenantId} nameOf={nameOf} copy={copy} onError={onError} /> : null}
      </CardContent>
      {open ? (
        <MoveDialog
          client={client}
          ticketId={ticket.id}
          what={open}
          to={sentTo}
          targets={others}
          copy={copy}
          onClose={() => setOpen(null)}
          onMoved={(name) => {
            toast.success(fill(copy.desks.sent, { name }));
            onMoved?.(ticket.id);
          }}
          onError={onError}
        />
      ) : null}
    </Card>
  );
}

type DeskLogRow = { id: string; what: string; at: string } & Record<string, unknown>;

/** The desk's log (`deskHistory`), folded away until opened: who turned it on or off, and the conversations that left it. */
function DeskLog({
  history,
  scope,
  tenantId,
  nameOf,
  copy,
  onError,
}: {
  history: NonNullable<SupportClient["deskHistory"]>;
  scope: string;
  tenantId: string | null;
  nameOf: (id: string) => string;
  copy: SupportCopy;
  onError: ((error: unknown) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const log = useQuery({ queryKey: supportDeskKeys.log(scope, tenantId), queryFn: open ? () => history({ tenantId, limit: 20 }) : skipToken, staleTime: 60_000 });
  useEffect(() => {
    if (log.error) onError?.(log.error);
  }, [log.error, onError]);
  const view = useMemo(
    () =>
      listView<DeskLogRow>("support_desk_log", { title: copy.desks.log, noun: copy.desks.logNoun, nounPlural: copy.desks.logNounPlural, emptyTitle: copy.desks.logEmpty }, [
        { name: "what", label: copy.desks.logWhat },
        { name: "at", label: copy.desks.logWhen, type: "datetime", display: "datetime" },
      ]),
    [copy],
  );
  const rows = log.data?.map((e: DeskLogEntry): DeskLogRow => ({
    id: e.id,
    what: fill(copy.desks.logActions[e.action], { by: e.actorName?.trim() || copy.desks.logSomeone, to: e.toTenantId ? nameOf(e.toTenantId) : "" }),
    at: e.at,
  }));
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <Button size="sm" variant="ghost" data-testid="genesis-support-desk-log-toggle">
          {copy.desks.log}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ViewList view={view} rows={rows} loading={log.isPending} error={log.isError} errorMessage={copy.desks.logFailed} onRetry={() => void log.refetch()} testId="genesis-support-desk-log" />
      </CollapsibleContent>
    </Collapsible>
  );
}

function MoveDialog({
  client,
  ticketId,
  what,
  to,
  targets,
  copy,
  onClose,
  onMoved,
  onError,
}: {
  client: SupportClient;
  ticketId: string;
  what: MoveKind;
  /** The desk's name, for escalate and return. */
  to: string | null;
  targets: readonly DeskTarget[];
  copy: SupportCopy;
  onClose: () => void;
  /** Moved: the name of the desk it went to. */
  onMoved: (name: string) => void;
  onError: ((error: unknown) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<string>(targets[0]?.tenantId ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const targetName = deskName(targets.find((t) => t.tenantId === target), copy);
  const name = to ?? targetName;
  const send = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const why = reason.trim() || null;
      if (what.kind === "escalate") await client.escalateTicket!(ticketId, why);
      else if (what.kind === "return") await client.returnTicket!(ticketId, why);
      else await client.moveTicket!(ticketId, target, why);
      void queryClient.invalidateQueries({ queryKey: ["genesis-support"] });
      onClose();
      onMoved(name);
    } catch (error) {
      setFailed(true);
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  const body = what.kind === "escalate" ? copy.desks.escalateBody : what.kind === "return" ? copy.desks.returnBody : copy.desks.moveBody;
  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent mobileLayout="sheet" data-testid="genesis-support-desk-dialog">
        <DialogHeader>
          <DialogTitle>{what.kind === "move" ? copy.desks.moveTo : fill(copy.desks.moveTitle, { name })}</DialogTitle>
          <DialogDescription>{fill(body, { name })}</DialogDescription>
        </DialogHeader>
        {what.kind === "move" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="genesis-support-desk-target">{copy.desks.moveTarget}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="genesis-support-desk-target" data-testid="genesis-support-desk-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t.tenantId} value={t.tenantId}>
                    {deskName(t, copy)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="genesis-support-desk-reason">{copy.desks.reason}</Label>
          <Textarea id="genesis-support-desk-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} data-testid="genesis-support-desk-reason" />
        </div>
        {failed ? <InlineAlert variant="destructive" description={copy.desks.failed} testID="genesis-support-desk-failed" /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy} data-testid="genesis-support-desk-cancel">
            {copy.desks.cancel}
          </Button>
          <Button onClick={() => void send()} disabled={busy || (what.kind === "move" && !target)} aria-busy={busy} data-testid="genesis-support-desk-send">
            {copy.desks.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface SupportDeskPickerProps {
  client: SupportClient;
  /** The desk open now (its tenant id), e.g. from `?desk=`. Left out, the one `chooseDesk` picks. */
  value?: string | null;
  /** Another desk was picked: open its inbox. */
  onChange: (desk: SupportDesk) => void;
  /** Genesis settings: with `support.desks` off (the `standard` and `min` presets) this shows nothing. Left out, `max`. */
  settings?: SupportSettingsInput | null;
  copy?: SupportCopyOverrides;
  className?: string;
}

/**
 * A desk picker for someone who works more than one desk (the app's staff who also run a tenant's
 * desk, an agent of two tenants). Renders nothing for one desk or none. Pair it with
 * `chooseDesk(desks, asked)` for the desk the inbox opens.
 */
export function SupportDeskPicker({ client, value, onChange, settings, copy: overrides, className }: SupportDeskPickerProps) {
  const copy = resolveSupportCopy(overrides);
  const on = supportSettingValues(settings).support.desks;
  const desks = useSupportDesks(client, { enabled: on });
  if (!desks.data || !on) return null;
  const chosen = chooseDesk(desks.data, value);
  const offered = pickerDesks(desks.data, chosen);
  if (offered.length < 2 || !chosen) return null;
  return (
    <Select
      value={chosen.tenantId}
      onValueChange={(id) => {
        const next = offered.find((d) => d.tenantId === id);
        if (next) onChange(next);
      }}
    >
      <SelectTrigger className={className ?? "w-56"} aria-label={copy.desks.pickerLabel} data-testid="genesis-support-desk-picker">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {offered.map((d) => (
          <SelectItem key={d.tenantId} value={d.tenantId}>
            {deskName(d, copy)}
            {d.openTickets ? ` (${d.openTickets})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface SupportDeskSwitchProps {
  client: SupportClient;
  /** The tenant whose desk this is. */
  tenantId: string;
  /** Genesis settings: with `support.desks` off (the `standard` and `min` presets) this shows nothing. Left out, `max`. */
  settings?: SupportSettingsInput | null;
  copy?: SupportCopyOverrides;
  /** After it changed (it shows its own toast: `switchedOn` or `switchedOff`). */
  onChanged?: (enabled: boolean) => void;
  onError?: (error: unknown) => void;
  className?: string;
}

/**
 * A tenant's settings: whether its people's questions come to its own help desk, or go to the
 * app's support. Its admins turn it on or off (`support_set_desk`, which keeps every change); anyone
 * else sees it disabled. Renders nothing for someone who doesn't work the desk.
 */
export function SupportDeskSwitch({ client, tenantId, settings, copy: overrides, onChanged, onError, className }: SupportDeskSwitchProps) {
  const copy = resolveSupportCopy(overrides);
  const queryClient = useQueryClient();
  const on = supportSettingValues(settings).support.desks;
  const desks = useSupportDesks(client, { enabled: on });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const desk = desks.data?.find((d) => d.tenantId === tenantId && !d.isDefault);
  if (!desk || !on) return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await client.setDesk!(tenantId, enabled);
      await queryClient.invalidateQueries({ queryKey: supportDeskKeys.all });
      toast.success(enabled ? copy.desks.switchedOn : copy.desks.switchedOff);
      onChanged?.(enabled);
    } catch (error) {
      setFailed(true);
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="genesis-support-desk-switch" className={className}>
      <ToggleRow
        label={copy.desks.switchLabel}
        description={desk.enabled ? copy.desks.switchOn : copy.desks.switchOff}
        checked={desk.enabled}
        disabled={busy || !desk.manage || !client.setDesk}
        onCheckedChange={(on: boolean) => void change(on)}
        testID="genesis-support-desk-switch-toggle"
      />
      {failed ? <InlineAlert variant="destructive" description={copy.desks.switchFailed} testID="genesis-support-desk-switch-failed" /> : null}
    </div>
  );
}
