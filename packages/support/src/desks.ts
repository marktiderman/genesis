/**
 * Desks (migration 0029): each tenant's own help desk, switched on by its admins, and tickets
 * moved between desks. The database decides who handles what; these types and functions only
 * read its answers and pick among them (which desk an inbox opens, which a picker offers).
 *
 * @stability Beta
 */
import { fill, type SupportCopy } from "./copy";

/** A help desk the signed-in login works (`support_my_desks`). */
export interface SupportDesk {
  /** The desk's tenant: the app's own (`isDefault`), or a tenant's id. */
  tenantId: string;
  /** The app's label for the tenant (`private.genesis_tenant_label`); null for the app's own desk and for a tenant with none. */
  label: string | null;
  /** The app's own desk (its default tenant): always on. */
  isDefault: boolean;
  /** Whether it takes new tickets now. */
  enabled: boolean;
  /** The login is the tenant's admin: they turn it on or off (`setDesk`). */
  manage: boolean;
  /** Its tickets still open (not addressed or won't fix, not the login's own): a desk turned off keeps these. */
  openTickets: number;
}

/** What happened at a desk (`support_desk_log`). */
export type DeskAction = "turned_on" | "turned_off" | "escalated" | "returned" | "moved";

const DESK_ACTIONS: readonly DeskAction[] = ["turned_on", "turned_off", "escalated", "returned", "moved"];

/** A ticket's desk, for its handlers (`support_ticket_desk`). */
export interface TicketDesk {
  tenantId: string;
  label: string | null;
  /** At the app's own desk. */
  isDefault: boolean;
  /** It can go up to the app's own desk (`escalateTicket`). */
  canEscalate: boolean;
  /** It can go back to the desk that sent it up (`returnTicket`). */
  canReturn: boolean;
  /** The desk that last sent it up, when it is at the app's own desk. */
  returnsTo: string | null;
  returnsToLabel: string | null;
  /** Its last move, or null when it never moved. */
  lastMove: {
    action: Exclude<DeskAction, "turned_on" | "turned_off">;
    from: string;
    to: string;
    byId: string | null;
    byName: string | null;
    reason: string | null;
    at: string;
  } | null;
}

/** A desk a ticket can be moved to (`support_desk_move_targets`). */
export interface DeskTarget {
  tenantId: string;
  label: string | null;
  isDefault: boolean;
}

/** One entry of a desk's log (`support_desk_history`). */
export interface DeskLogEntry {
  id: string;
  /** The desk a switch is about, or the desk a ticket left. */
  tenantId: string;
  ticketId: string | null;
  /** Where a ticket went. */
  toTenantId: string | null;
  /** `other` for an action this version doesn't know (a newer database's). */
  action: DeskAction | "other";
  reason: string | null;
  actorId: string | null;
  actorName: string | null;
  at: string;
}

/**
 * The desks with an inbox to open: the app's own, each tenant's that is on, and one turned off
 * that still has open tickets (its agents finish them). A tenant admin whose desk is off and empty
 * has nothing to answer (the switch turns it on).
 */
export function workedDesks(desks: readonly SupportDesk[]): SupportDesk[] {
  return desks.filter((d) => d.isDefault || d.enabled || d.openTickets > 0);
}

/**
 * The desk an inbox opens: the one asked for whenever the login works it (a notification's link
 * lands on its ticket, even at a desk that is off), else the app's own, else their first. Undefined
 * when there is none to open.
 */
export function chooseDesk(desks: readonly SupportDesk[], asked?: string | null): SupportDesk | undefined {
  const worked = workedDesks(desks);
  return (asked ? desks.find((d) => d.tenantId === asked) : undefined) ?? worked.find((d) => d.isDefault) ?? worked[0];
}

/** The desks a picker offers: those with an inbox to open, and the one open now. */
export function pickerDesks(desks: readonly SupportDesk[], chosen?: SupportDesk): SupportDesk[] {
  const worked = workedDesks(desks);
  return chosen && !worked.includes(chosen) ? [...worked, chosen] : worked;
}

/** The desk's tenant as the support client's `tenantId` names it: null for the app's own. */
export function deskTenant(desk: Pick<SupportDesk, "tenantId" | "isDefault"> | null | undefined): string | null {
  return !desk || desk.isDefault ? null : desk.tenantId;
}

/** A desk's name: the app's label, else the copy's ("Support" for the app's own). */
export function deskTitle(desk: { label: string | null; isDefault: boolean } | null | undefined, copy: Pick<SupportCopy, "desks">): string {
  if (!desk) return copy.desks.unnamedDesk;
  return desk.label?.trim() || (desk.isDefault ? copy.desks.appDesk : copy.desks.unnamedDesk);
}

/** What a ticket's last move says ("Sent up to Support by Ana from Acme."), or null when it never moved. */
export function lastMoveLine(desk: TicketDesk, copy: Pick<SupportCopy, "desks">, names: (tenantId: string) => string): string | null {
  const move = desk.lastMove;
  if (!move) return null;
  const by = move.byName ? fill(copy.desks.by, { name: move.byName }) : "";
  const template = move.action === "escalated" ? copy.desks.lastEscalated : move.action === "returned" ? copy.desks.lastReturned : copy.desks.lastMoved;
  return fill(template, { by, from: names(move.from), to: names(move.to) });
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** A `support_my_desks` row. @internal */
export function toDesk(r: Row): SupportDesk {
  return {
    tenantId: String(r["tenant_id"]),
    label: str(r["label"]),
    isDefault: r["is_default"] === true,
    enabled: r["enabled"] === true,
    manage: r["manage"] === true,
    openTickets: Number(r["open_tickets"] ?? 0),
  };
}

/** A `support_ticket_desk` row. @internal */
export function toTicketDesk(r: Row): TicketDesk {
  const action = str(r["last_action"]);
  return {
    tenantId: String(r["tenant_id"]),
    label: str(r["label"]),
    isDefault: r["is_default"] === true,
    canEscalate: r["can_escalate"] === true,
    canReturn: r["can_return"] === true,
    returnsTo: str(r["returns_to"]),
    returnsToLabel: str(r["returns_to_label"]),
    lastMove:
      action === "escalated" || action === "returned" || action === "moved"
        ? {
            action,
            from: String(r["last_from"]),
            to: String(r["last_to"]),
            byId: str(r["last_by"]),
            byName: str(r["last_by_name"]),
            reason: str(r["last_reason"]),
            at: String(r["last_at"]),
          }
        : null,
  };
}

/** A `support_desk_history` row. @internal */
export function toDeskLogEntry(r: Row): DeskLogEntry {
  return {
    id: String(r["id"]),
    tenantId: String(r["tenant_id"]),
    ticketId: str(r["ticket_id"]),
    toTenantId: str(r["to_tenant"]),
    action: DESK_ACTIONS.find((a) => a === r["action"]) ?? "other",
    reason: str(r["reason"]),
    actorId: str(r["actor"]),
    actorName: str(r["actor_name"]),
    at: String(r["at"]),
  };
}
