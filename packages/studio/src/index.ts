// @marktiderman/genesis-studio — the Data Studio workspace UI.
// Pair it with @marktiderman/genesis-studio-server, or any DataProvider that
// implements `describe` and `listResources`.

export { DataStudio, type DataStudioProps, type StudioActivity } from "./DataStudio";
export {
  createSearchParamsRouter,
  locationFromSearchParams,
  searchParamsFromLocation,
  useHistoryRouter,
  useMemoryRouter,
  type StudioLocation,
  type StudioNavigateOptions,
  type StudioRouter,
  type StudioView,
} from "./router";
