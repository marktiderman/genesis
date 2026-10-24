// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { normalizeLink, type LinkOptions } from "../links";

const options: LinkOptions = {
  schemes: ["myapp"],
  hosts: ["example.com", "www.example.com"],
  map: {
    "/c/:id": "/clients/:id",
    "/clients/:id": "/clients/:id",
    "/invite/:code": ({ code }) => `/join?code=${code}`,
    "/help/*": "/support/*",
    "/settings": "/settings",
  },
  ignore: ["/auth/callback"],
};

describe("normalizeLink", () => {
  it("maps app-scheme links, where the first segment sits in the host position", () => {
    expect(normalizeLink("myapp://c/42", options)).toBe("/clients/42");
    expect(normalizeLink("myapp:///c/42", options)).toBe("/clients/42");
    expect(normalizeLink("MYAPP://settings", options)).toBe("/settings");
  });

  it("maps universal links on a known host, keeping the query", () => {
    expect(normalizeLink("https://example.com/c/42?tab=notes", options)).toBe("/clients/42?tab=notes");
    expect(normalizeLink("https://WWW.example.com:443/clients/7/#top", options)).toBe("/clients/7");
  });

  it("maps paths as expo-router passes them", () => {
    expect(normalizeLink("/c/42", options)).toBe("/clients/42");
    expect(normalizeLink("c/42", options)).toBe("/clients/42");
    expect(normalizeLink("//c//42/", options)).toBe("/clients/42");
  });

  it("fills function targets and rest segments", () => {
    expect(normalizeLink("myapp://invite/abc?src=mail", options)).toBe("/join?code=abc&src=mail");
    expect(normalizeLink("/help/billing/refunds", options)).toBe("/support/billing/refunds");
  });

  it("sends anything unknown to / and says so", () => {
    const onUnknown = vi.fn();
    const withSpy = { ...options, onUnknown };
    expect(normalizeLink("/old/route", withSpy)).toBe("/");
    expect(normalizeLink("https://evil.test/c/1", withSpy)).toBe("/");
    expect(normalizeLink("otherapp://c/1", withSpy)).toBe("/");
    expect(normalizeLink("mailto:someone@example.com", withSpy)).toBe("/");
    expect(normalizeLink("/c", withSpy)).toBe("/");
    expect(onUnknown).toHaveBeenCalledTimes(5);
    expect(onUnknown).toHaveBeenCalledWith("/old/route");
  });

  it("keeps the root, and ignores ignored paths", () => {
    expect(normalizeLink("myapp://", options)).toBe("/");
    expect(normalizeLink("https://example.com/?ref=ad", options)).toBe("/?ref=ad");
    expect(normalizeLink("myapp://auth/callback?code=1", options)).toBeNull();
  });

  it("never throws, even when a target does", () => {
    const throwing: LinkOptions = { map: { "/x": () => { throw new Error("bad"); } } };
    expect(normalizeLink("/x", throwing)).toBe("/");
  });
});
