// @feat:push
import { describe, expect, it } from "vitest";
import { isRichPushUrl, richPushMessage } from "../../push/payload";

describe("richPushMessage", () => {
  it("sets mutableContent, without which iOS never runs the service extension", () => {
    const m = richPushMessage({ to: "ExponentPushToken[x]", title: "Hi", data: { url: "/x" } });
    expect(m).toEqual({ to: "ExponentPushToken[x]", title: "Hi", mutableContent: true, data: { url: "/x" } });
  });

  it("puts https images in data and keeps the rest of data", () => {
    const m = richPushMessage({ to: "t", data: { url: "/x", seq: 3 } }, { image: "https://cdn.example.com/p.jpg", senderAvatar: "https://cdn.example.com/a.png" });
    expect(m.data).toEqual({ url: "/x", seq: 3, image: "https://cdn.example.com/p.jpg", senderAvatar: "https://cdn.example.com/a.png" });
  });

  it("drops an image that isn't https, given or already in data", () => {
    const m = richPushMessage({ to: "t", data: { senderAvatar: "http://cdn.example.com/a.png" } }, { image: "file:///etc/hosts" });
    expect(m.data).toEqual({});
  });

  it("a field given replaces the one in data, and null removes it", () => {
    expect(richPushMessage({ data: { image: "https://a.example/1.jpg" } }, { image: "https://a.example/2.jpg" }).data.image).toBe("https://a.example/2.jpg");
    expect(richPushMessage({ data: { image: "https://a.example/1.jpg" } }, { image: null }).data).toEqual({});
  });

  it("doesn't change the message it was given", () => {
    const message = { to: "t", data: { url: "/x" } };
    richPushMessage(message, { image: "https://a.example/1.jpg" });
    expect(message).toEqual({ to: "t", data: { url: "/x" } });
  });
});

describe("isRichPushUrl", () => {
  it.each([
    ["https://cdn.example.com/a.jpg", true],
    ["HTTPS://cdn.example.com/a.jpg", true],
    ["http://cdn.example.com/a.jpg", false],
    ["https://user:pw@cdn.example.com/a.jpg", false],
    ["data:image/png;base64,AAAA", false],
    ["/relative.jpg", false],
    [`https://cdn.example.com/${"a".repeat(2048)}`, false],
    [42, false],
  ])("%s → %s", (value, ok) => expect(isRichPushUrl(value)).toBe(ok));
});
