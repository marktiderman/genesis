/**
 * Desks on the phone (migration 0024), the twins of the web's `SupportDeskControls` and
 * `SupportDeskSwitch`:
 *
 *   <AgentDeskControls ticketId={id} />       → where a ticket is; send it up, back or across
 *   <AgentDeskSwitch tenantId={tenantId} />    → a tenant's admins turn its own desk on or off
 *
 * `useAgentThread`'s header shows the controls and `useAgentInbox`'s the switch (for a tenant's
 * desk); they are exported for a screen laid out the app's own way. The database decides who may;
 * with `support.desks` off (the `standard` and `min` presets) the controls and switch show nothing.
 *
 * @stability Beta
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Inline,
  NativeButton,
  NativeChip,
  NativeChipGroup,
  NativeDialog,
  NativeDialogContent,
  NativeDialogDescription,
  NativeDialogFooter,
  NativeDialogHeader,
  NativeDialogTitle,
  NativeInlineAlert,
  NativeText,
  NativeTextarea,
  NativeToggleRow,
  Stack,
} from "@marktiderman/genesis-ui-native/components";
import { deskTitle, lastMoveLine, type DeskTarget } from "../desks";
import { fill } from "../copy";
import { SUPPORT_QUERY_ROOT, useSupport } from "./support";
import { supportAgentKeys, useSignedInId } from "./agent";

/** The desks the signed-in person works (`client.myDesks`). */
function useMyDesks(enabled: boolean) {
  const { client } = useSupport();
  const me = useSignedInId(undefined);
  return useQuery({ queryKey: supportAgentKeys.desks(me ?? null), queryFn: () => client.myDesks!(), enabled: enabled && me !== undefined && Boolean(client.myDesks), staleTime: 60_000 });
}

type MoveKind = "escalate" | "return" | "move";

export interface AgentDeskControlsProps {
  ticketId: string;
  /** The ticket left this desk. Default: back to the agent inbox. */
  onMoved?: (ticketId: string) => void;
  /** Offer "Move to another desk" too. Default true. */
  allowMove?: boolean;
  testID?: string;
}

/**
 * Where the ticket is and its last move; a tenant desk's handler sends it up to the app's own desk,
 * the app's own desk hands an escalated one back, and either moves it to another desk its person
 * belongs to. Nothing for a ticket that never moved and can't.
 */
export function AgentDeskControls({ ticketId, onMoved, allowMove = true, testID = "genesis-support-desk" }: AgentDeskControlsProps) {
  const block = useSupport();
  const { client, copy } = block;
  const on = block.settings().support.desks;
  const me = useSignedInId(undefined);
  const ready = on && me !== undefined;
  const desk = useQuery({ queryKey: supportAgentKeys.ticketDesk(me ?? null, ticketId), queryFn: () => client.ticketDesk!(ticketId), enabled: ready && Boolean(client.ticketDesk) });
  const targets = useQuery({
    queryKey: supportAgentKeys.deskTargets(me ?? null, ticketId),
    queryFn: () => client.deskMoveTargets!(ticketId),
    enabled: ready && allowMove && Boolean(client.deskMoveTargets),
  });
  const mine = useMyDesks(on);
  const [open, setOpen] = useState<MoveKind | null>(null);
  const d = desk.data;
  if (!on || !d) return null;
  const known = new Map<string, string>();
  for (const x of [...(mine.data ?? []), ...(targets.data ?? [])]) known.set(x.tenantId, deskTitle(x, copy));
  const nameOf = (id: string) =>
    known.get(id) ?? (id === d.tenantId ? deskTitle(d, copy) : id === d.returnsTo ? deskTitle({ label: d.returnsToLabel, isDefault: false }, copy) : copy.desks.unnamedDesk);
  const appDesk = deskTitle({ label: (targets.data ?? []).find((t) => t.isDefault)?.label ?? null, isDefault: true }, copy);
  const others = (targets.data ?? []).filter((t) => !t.isDefault && t.tenantId !== d.returnsTo);
  const moved = lastMoveLine(d, copy, nameOf);
  const canEscalate = d.canEscalate && Boolean(client.escalateTicket);
  const canReturn = d.canReturn && Boolean(client.returnTicket);
  const canMove = allowMove && Boolean(client.moveTicket) && others.length > 0;
  const returnsToName = d.returnsTo ? nameOf(d.returnsTo) : null;
  if (!moved && !canEscalate && !canReturn && !returnsToName && !canMove) return null;
  const leave = onMoved ?? (() => block.options.navigate(block.paths.agent));
  return (
    <Stack gap="xs" testID={testID}>
      <NativeText preset="label">{deskTitle(d, copy)}</NativeText>
      {moved ? (
        <NativeText preset="body-sm" className="text-muted-foreground" testID={`${testID}-last`}>
          {moved}
        </NativeText>
      ) : null}
      {d.lastMove?.reason ? <NativeText preset="body-sm">{`“${d.lastMove.reason}”`}</NativeText> : null}
      {d.isDefault && !d.canReturn && returnsToName ? (
        <NativeText preset="body-sm" className="text-muted-foreground">
          {fill(copy.desks.cantReturn, { name: returnsToName })}
        </NativeText>
      ) : null}
      <Inline gap="sm" wrap>
        {canEscalate ? (
          <NativeButton size="sm" variant="outline" onPress={() => setOpen("escalate")} testID={`${testID}-escalate`}>
            {fill(copy.desks.escalate, { name: appDesk })}
          </NativeButton>
        ) : null}
        {canReturn && returnsToName ? (
          <NativeButton size="sm" variant="outline" onPress={() => setOpen("return")} testID={`${testID}-return`}>
            {fill(copy.desks.returnTo, { name: returnsToName })}
          </NativeButton>
        ) : null}
        {canMove ? (
          <NativeButton size="sm" variant="ghost" onPress={() => setOpen("move")} testID={`${testID}-move`}>
            {copy.desks.moveTo}
          </NativeButton>
        ) : null}
      </Inline>
      {open ? (
        <MoveDialog
          ticketId={ticketId}
          kind={open}
          to={open === "escalate" ? appDesk : open === "return" ? (returnsToName ?? "") : null}
          targets={others}
          onClose={() => setOpen(null)}
          onMoved={() => leave(ticketId)}
          testID={`${testID}-dialog`}
        />
      ) : null}
    </Stack>
  );
}

function MoveDialog({
  ticketId,
  kind,
  to,
  targets,
  onClose,
  onMoved,
  testID,
}: {
  ticketId: string;
  kind: MoveKind;
  /** The desk's name, for escalate and return. */
  to: string | null;
  targets: readonly DeskTarget[];
  onClose: () => void;
  onMoved: () => void;
  testID: string;
}) {
  const { client, copy } = useSupport();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState(targets[0]?.tenantId ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = to ?? deskTitle(targets.find((t) => t.tenantId === target), copy);
  const send = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const why = reason.trim() || null;
      if (kind === "escalate") await client.escalateTicket!(ticketId, why);
      else if (kind === "return") await client.returnTicket!(ticketId, why);
      else await client.moveTicket!(ticketId, target, why);
      void queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY_ROOT] });
      onClose();
      onMoved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const body = kind === "escalate" ? copy.desks.escalateBody : kind === "return" ? copy.desks.returnBody : copy.desks.moveBody;
  return (
    <NativeDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <NativeDialogContent testID={testID}>
        <NativeDialogHeader>
          <NativeDialogTitle>{kind === "move" ? copy.desks.moveTo : fill(copy.desks.moveTitle, { name })}</NativeDialogTitle>
          <NativeDialogDescription>{fill(body, { name })}</NativeDialogDescription>
        </NativeDialogHeader>
        {kind === "move" ? (
          <Stack gap="xs">
            <NativeText preset="label">{copy.desks.moveTarget}</NativeText>
            <NativeChipGroup mode="single" value={target} onChange={(v) => setTarget(String(v))} testID={`${testID}-target`}>
              {targets.map((t) => (
                <NativeChip key={t.tenantId} value={t.tenantId} testID={`${testID}-target-${t.tenantId}`}>
                  {deskTitle(t, copy)}
                </NativeChip>
              ))}
            </NativeChipGroup>
          </Stack>
        ) : null}
        <NativeTextarea label={copy.desks.reason} value={reason} onChangeText={setReason} maxLength={1000} rows={3} testID={`${testID}-reason`} />
        {failed ? <NativeInlineAlert variant="destructive" description={copy.desks.failed} testID={`${testID}-failed`} /> : null}
        <NativeDialogFooter>
          <NativeButton variant="outline" onPress={onClose} disabled={busy} testID={`${testID}-cancel`}>
            {copy.desks.cancel}
          </NativeButton>
          <NativeButton onPress={() => void send()} loading={busy} disabled={busy || (kind === "move" && !target)} testID={`${testID}-send`}>
            {copy.desks.send}
          </NativeButton>
        </NativeDialogFooter>
      </NativeDialogContent>
    </NativeDialog>
  );
}

export interface AgentDeskSwitchProps {
  /** The tenant whose desk this is. */
  tenantId: string;
  /** After it changed (for a toast). */
  onChanged?: (enabled: boolean) => void;
  testID?: string;
}

/**
 * Whether a tenant's people's questions come to its own help desk or go to the app's support. Its
 * admins turn it on or off (`setDesk`); its agents see it disabled; anyone else sees nothing.
 */
export function AgentDeskSwitch({ tenantId, onChanged, testID = "genesis-support-desk-switch" }: AgentDeskSwitchProps) {
  const block = useSupport();
  const { client, copy } = block;
  const queryClient = useQueryClient();
  const on = block.settings().support.desks;
  const desks = useMyDesks(on);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const desk = desks.data?.find((d) => d.tenantId === tenantId && !d.isDefault);
  if (!on || !desk) return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await client.setDesk!(tenantId, enabled);
      await queryClient.invalidateQueries({ queryKey: supportAgentKeys.all });
      onChanged?.(enabled);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="xs" testID={testID}>
      <NativeToggleRow
        label={copy.desks.switchLabel}
        description={desk.enabled ? copy.desks.switchOn : copy.desks.switchOff}
        checked={desk.enabled}
        disabled={busy || !desk.manage || !client.setDesk}
        onCheckedChange={(next) => void change(next)}
        testID={`${testID}-toggle`}
        rowTestID={`${testID}-row`}
      />
      {failed ? <NativeInlineAlert variant="destructive" description={copy.desks.switchFailed} testID={`${testID}-failed`} /> : null}
    </Stack>
  );
}
