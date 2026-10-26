/**
 * `@marktiderman/genesis-support/web-chat`: a report's thread on genesis-chat, for the web (the
 * support-chat block). `SupportReportThread` is the person's view: the report, then the live
 * conversation with support (photos, files, voice notes). `SupportStaffThread` is staff's: the
 * report's status and assignee over the same conversation, with internal notes in the composer.
 *
 * Needs `@marktiderman/genesis-chat` (an optional peer of genesis-support): render under its
 * `ChatProvider` in a TanStack QueryClientProvider, with a support client made with the `chat`
 * option. Kept out of `/web` so apps without genesis-chat never import it.
 *
 * @stability Beta
 */
export { SupportReportThread, supportWebKeys, type SupportReportThreadProps } from "./report-thread";
export { SupportStaffThread, type SupportStaffThreadProps } from "./staff-thread";
