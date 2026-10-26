/**
 * The staff view of a report on genesis-chat: the report, its status and who has it, and the
 * conversation, where staff reply as observers and write internal notes (the composer's note
 * toggle) the person never sees.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui";
import { chatKeys, useChat } from "@marktiderman/genesis-chat/react";
import type { ResolveUser } from "@marktiderman/genesis-chat/web";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "../contract";
import { resolveSupportCopy, type SupportCopy } from "../copy";
import { ReportThreadShell, supportWebKeys, type SupportReportThreadProps } from "./report-thread";

export interface SupportStaffThreadProps extends Omit<SupportReportThreadProps, "resolveUser"> {
  /** Names people: the reporter and staff. Required, since staff see who wrote what. */
  resolveUser: ResolveUser;
  /** Who a report can be given to (support staff). Without it there is no assignee picker. */
  staff?: readonly { id: string; name: string }[];
  /** Every refused change (not staff, a network failure), for reporting. */
  onError?: (error: unknown) => void;
}

const NOBODY = "__nobody__";

interface ControlsProps {
  client: SupportStaffThreadProps["client"];
  reportId: string;
  status: FeedbackStatus;
  reporter: string | null;
  conversationId: string;
  staff?: SupportStaffThreadProps["staff"];
  resolveUser: ResolveUser;
  copy: SupportCopy;
  onError?: (error: unknown) => void;
}

function StaffControls({ client, reportId, status, reporter, conversationId, staff, resolveUser, copy, onError }: ControlsProps) {
  const chat = useChat();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  const conversation = useQuery({ queryKey: chatKeys.conversation(conversationId), queryFn: () => chat.client.conversation(conversationId) });
  const assignee = conversation.data?.assigneeId ?? null;
  const run = (work: Promise<unknown>) =>
    work
      .then(() => {
        setFailed(false);
        void queryClient.invalidateQueries({ queryKey: supportWebKeys.report(reportId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
      })
      .catch((error: unknown) => {
        setFailed(true);
        onError?.(error);
      });
  return (
    <div className="flex flex-wrap items-end gap-4">
      {reporter ? (
        <div className="flex flex-col gap-1">
          <Label>{copy.staff.reporter}</Label>
          <span className="text-sm">{resolveUser(reporter).name}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="genesis-support-staff-status">{copy.staff.status}</Label>
        <Select value={status} onValueChange={(value) => void run(client.setStatus(reportId, value as FeedbackStatus))}>
          <SelectTrigger id="genesis-support-staff-status" className="w-44" data-testid="genesis-support-staff-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {copy.status[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {staff ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="genesis-support-staff-assignee">{copy.staff.assignee}</Label>
          <Select value={assignee ?? NOBODY} onValueChange={(value) => void run(client.assign(reportId, value === NOBODY ? null : value))}>
            <SelectTrigger id="genesis-support-staff-assignee" className="w-48" data-testid="genesis-support-staff-assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>{copy.staff.unassigned}</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.staff.failed}
        </p>
      ) : null}
    </div>
  );
}

/** A report for staff: status and assignee controls over the live conversation, with internal notes. */
export function SupportStaffThread({ staff, onError, ...props }: SupportStaffThreadProps) {
  const copy = useMemo(() => resolveSupportCopy(props.copy), [props.copy]);
  return (
    <ReportThreadShell
      {...props}
      copyResolved={copy}
      testID="genesis-support-staff-thread"
      toolbar={(report, conversationId) => (
        <StaffControls
          client={props.client}
          reportId={props.reportId}
          status={report.status}
          reporter={report.userId ?? null}
          conversationId={conversationId}
          staff={staff}
          resolveUser={props.resolveUser}
          copy={copy}
          onError={onError}
        />
      )}
    />
  );
}
