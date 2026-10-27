// @marktiderman/genesis-product/server: what an app's server uses to tell people their idea
// shipped, through genesis-notifications. The same exports are in the core (`.`), because the
// app's notification registry is imported by the web and the phone as well; neither does I/O.
export * from "./notifications";
