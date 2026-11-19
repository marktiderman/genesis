/**
 * `@marktiderman/genesis-support/web-boards`: the person's reports, the idea board (with the staff
 * status control), shipped ideas, a report's FeatureId control and a help article, as genesis-ui
 * ResourceViews. Its own entry, so `/web` (the feedback panel and launcher) doesn't bring in
 * genesis-core's resource views, genesis-ui's data layer or TanStack Query.
 *
 * @stability Beta
 */
export {
  SupportHelpArticle,
  SupportIdeaBoard,
  SupportIdeaStatusControl,
  SupportMyReports,
  SupportReportFeatureControl,
  SupportShippedIdeas,
  ideaVotable,
  ideaVotesLabel,
  supportBoardKeys,
  type SupportHelpArticleProps,
  type SupportIdeaBoardProps,
  type SupportIdeaRow,
  type SupportIdeaStatusControlProps,
  type SupportMyReportsProps,
  type SupportReportFeatureControlProps,
  type SupportReportRow,
  type SupportShippedIdeasProps,
} from "./boards";
