// @feat:support-chat
import { describe, expect, it } from "vitest";
import { FEEDBACK_STATUSES, SUPPORT_TO_CHAT_STATUS } from "../index";

describe("SUPPORT_TO_CHAT_STATUS", () => {
  it("maps every ticket status, pending (migration 0013) included, as the migration does", () => {
    for (const status of FEEDBACK_STATUSES) expect(SUPPORT_TO_CHAT_STATUS).toHaveProperty(status);
    expect(SUPPORT_TO_CHAT_STATUS.pending).toBe("pending");
    expect(SUPPORT_TO_CHAT_STATUS.in_progress).toBe("pending");
    expect(SUPPORT_TO_CHAT_STATUS.addressed).toBe("solved");
  });
});
