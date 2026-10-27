/**
 * The generic content packs genesis-work publishes: starting content an
 * organization's admin installs into blocks that are already there (see
 * `genesis_work.install_content_pack`). One file per pack, so they can move to
 * a package of their own later.
 */
import { oneOnOnesPack } from "./one-on-ones";
import { quarterlyObjectivesPack } from "./quarterly-objectives";
import { weeklyTeamMeetingPack } from "./weekly-team-meeting";

export { oneOnOnesPack, quarterlyObjectivesPack, weeklyTeamMeetingPack };

/** Every pack, for a catalog or a Settings → Packs list. @stability Experimental */
export const workPacks = [weeklyTeamMeetingPack, oneOnOnesPack, quarterlyObjectivesPack] as const;
