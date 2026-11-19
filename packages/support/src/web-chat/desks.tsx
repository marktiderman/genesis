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
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleRow,
} from "@marktiderman/genesis-ui";
import { requesterTenantsLabel, type AgentTicket, type SupportClient } from "../client";
import { chooseDesk, pickerDesks, type DeskTarget, type SupportDesk, type TicketDesk } from "../desks";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";

/** Desk query keys, under genesis-support's root (a support write refreshes them too). */
export const supportDeskKeys = {
  all: ["genesis-support", "desks"] as const,
  mine: ["genesis-support", "desks", "mine"] as const,
  ticket: (id: string) => ["genesis-support", "desks", "ticket", id] as const,
  targets: (id: string) => ["genesis-support", "desks", "targets", id] as const,
  requester: (id: string) => ["genesis-support", "desks", "requester", id] as const,
  requesterTenants: (id: string) => ["genesis-support", "desks", "requester-tenants", id] as const,
};

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
  return useQuery({
    queryKey: supportDeskKeys.mine,
    queryFn: () => client.myDesks!(),
    enabled: Boolean(client.myDesks) && options.enabled !== false,
    staleTime: 60_000,
  });
}

export interface SupportRequesterPanelProps {
  client: SupportClient;
  ticket: AgentTicket;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/** Who wrote: their name and email (a mailto link), the tenants they belong to, and where they wrote from. Migration 0022. */
export function SupportRequesterPanel({ client, ticket, copy: overrides, onError }: SupportRequesterPanelProps) {
  const copy = resolveSupportCopy(overrides);
  const userId = ticket.userId ?? "";
  const who = useQuery({
    queryKey: supportDeskKeys.requester(userId),
    queryFn: async () => (await client.reporters!([userId]))[0] ?? null,
    enabled: Boolean(userId && client.reporters),
    staleTime: 5 * 60_000,
  });
  const tenants = useQuery({
    queryKey: supportDeskKeys.requesterTenants(userId),
    queryFn: () => client.requesterTenants!(userId),
    enabled: Boolean(userId && client.requesterTenants),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (who.error) onError?.(who.error);
    if (tenants.error) onError?.(tenants.error);
  }, [who.error, tenants.error, onError]);
  const email = who.data?.email ?? ticket.requesterEmail;
  const belongs = tenants.data ? requesterTenantsLabel(tenants.data) : null;
  const sentFrom = [ticket.platform, ticket.appVersion].filter(Boolean).join(" · ");
  if (!email && !belongs && !sentFrom && !who.data?.name) return null;
  return (
    <Card data-testid="genesis-support-requester">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm">{who.data?.name ?? copy.requester.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-3 pt-0 text-sm">
        {email ? (
          <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${email}`} data-testid="genesis-support-requester-email">
            {email}
          </a>
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
      </CardContent>
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
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

type MoveKind = { kind: "escalate" } | { kind: "return" } | { kind: "move" };

/**
 * Where the ticket is, and moving it: a tenant desk's handler sends it up to the app's own desk; the
 * app's own desk hands an escalated one back; either moves it to another desk its person belongs
 * to. Nothing shows for a ticket that never moved and can't (the app's own, with no other desk).
 */
export function SupportDeskControls({ client, ticket, onMoved, allowMove = true, copy: overrides, onError }: SupportDeskControlsProps) {
  const copy = resolveSupportCopy(overrides);
  const desk = useQuery({ queryKey: supportDeskKeys.ticket(ticket.id), queryFn: () => client.ticketDesk!(ticket.id), enabled: Boolean(client.ticketDesk) });
  const targets = useQuery({
    queryKey: supportDeskKeys.targets(ticket.id),
    queryFn: () => client.deskMoveTargets!(ticket.id),
    enabled: Boolean(client.deskMoveTargets) && allowMove,
  });
  const mine = useSupportDesks(client);
  const [open, setOpen] = useState<MoveKind | null>(null);
  useEffect(() => {
    if (desk.error) onError?.(desk.error);
  }, [desk.error, onError]);
  const d = desk.data;
  if (!d) return null;
  const known = new Map<string, string>();
  for (const x of [...(mine.data ?? []), ...(targets.data ?? [])]) known.set(x.tenantId, deskName(x, copy));
  const nameOf = (id: string) => known.get(id) ?? (id === d.tenantId ? deskName(d, copy) : id === d.returnsTo ? deskName({ label: d.returnsToLabel, isDefault: false }, copy) : copy.desks.unnamedDesk);
  // Where an escalation goes: the app's own desk, by its name.
  const appDesk = deskName({ label: (targets.data ?? []).find((t) => t.isDefault)?.label ?? null, isDefault: true }, copy);
  const others = (targets.data ?? []).filter((t) => !t.isDefault && t.tenantId !== d.returnsTo);
  const moved = lastMoveLabel(d, copy, nameOf);
  const canMove = allowMove && others.length > 0;
  if (!moved && !d.canEscalate && !d.canReturn && !d.returnsTo && !canMove) return null;
  const returnsToName = d.returnsTo ? nameOf(d.returnsTo) : null;
  return (
    <Card data-testid="genesis-support-desk">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm">{deskName(d, copy)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2 p-3 pt-0 text-sm">
        {moved ? <p className="text-muted-foreground" data-testid="genesis-support-desk-last">{moved}</p> : null}
        {d.lastMove?.reason ? <p className="whitespace-pre-wrap">“{d.lastMove.reason}”</p> : null}
        {d.canEscalate ? (
          <Button size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setOpen({ kind: "escalate" })} data-testid="genesis-support-desk-escalate">
            {fill(copy.desks.escalate, { name: appDesk })}
          </Button>
        ) : null}
        {d.canReturn && returnsToName ? (
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
      </CardContent>
      {open ? (
        <MoveDialog
          client={client}
          ticketId={ticket.id}
          what={open}
          to={open.kind === "escalate" ? appDesk : open.kind === "return" ? (returnsToName ?? "") : null}
          targets={others}
          copy={copy}
          onClose={() => setOpen(null)}
          onMoved={() => onMoved?.(ticket.id)}
          onError={onError}
        />
      ) : null}
    </Card>
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
  onMoved: () => void;
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
      onMoved();
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
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {copy.desks.failed}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
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
  copy?: SupportCopyOverrides;
  className?: string;
}

/**
 * A desk picker for someone who works more than one desk (the app's staff who also run a tenant's
 * desk, an agent of two tenants). Renders nothing for one desk or none. Pair it with
 * `chooseDesk(desks, asked)` for the desk the inbox opens.
 */
export function SupportDeskPicker({ client, value, onChange, copy: overrides, className }: SupportDeskPickerProps) {
  const copy = resolveSupportCopy(overrides);
  const desks = useSupportDesks(client);
  if (!desks.data) return null;
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
  copy?: SupportCopyOverrides;
  /** After it changed (for a toast). */
  onChanged?: (enabled: boolean) => void;
  onError?: (error: unknown) => void;
  className?: string;
}

/**
 * A tenant's settings: whether its people's questions come to its own help desk, or go to the
 * app's support. Its admins turn it on or off (`support_set_desk`, which keeps every change); anyone
 * else sees it disabled. Renders nothing for someone who doesn't work the desk.
 */
export function SupportDeskSwitch({ client, tenantId, copy: overrides, onChanged, onError, className }: SupportDeskSwitchProps) {
  const copy = resolveSupportCopy(overrides);
  const queryClient = useQueryClient();
  const desks = useSupportDesks(client);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const desk = desks.data?.find((d) => d.tenantId === tenantId && !d.isDefault);
  if (!desk) return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await client.setDesk!(tenantId, enabled);
      await queryClient.invalidateQueries({ queryKey: supportDeskKeys.all });
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
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.desks.switchFailed}
        </p>
      ) : null}
    </div>
  );
}
