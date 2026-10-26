// @feat:web-handoff
import { describe, expect, it, vi } from "vitest";
import { openOnWeb, type OpenOnWebOptions } from "../web-handoff";

const ENDPOINT = "https://app.example.test/api/auth/handoff";

function setup(response: { status?: number; body?: unknown } | Error, token: string | null = "access-1") {
  const browser = { openBrowserAsync: vi.fn(async () => ({ type: "cancel" })) };
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status ?? 200, headers: { "content-type": "application/json" } });
  });
  const options: OpenOnWebOptions = {
    endpoint: ENDPOINT,
    getAccessToken: async () => token,
    browser,
    browserOptions: { presentationStyle: "pageSheet" },
    fetch: fetch as unknown as typeof globalThis.fetch,
  };
  return { browser, fetch, options };
}

describe("openOnWeb", () => {
  it("asks the server with the bearer token and opens the signed-in link in the in-app browser", async () => {
    const url = "https://app.example.test/auth/handoff#t=abc&next=%2Fclients%2F1";
    const { browser, fetch, options } = setup({ body: { url } });
    expect(await openOnWeb("/clients/1", options)).toEqual({ signedIn: true });
    const [endpoint, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer access-1");
    expect(JSON.parse(init.body as string)).toEqual({ path: "/clients/1" });
    expect(browser.openBrowserAsync).toHaveBeenCalledWith(url, { presentationStyle: "pageSheet" });
  });

  it.each(["https://evil.com/x", "//evil.com", "/\\evil.com", "javascript:alert(1)", "relative", "/\t/evil.com"])("refuses %j before asking anyone", async (path) => {
    const { browser, fetch, options } = setup({ body: {} });
    await expect(openOnWeb(path, options)).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it("opens the page signed out without a session", async () => {
    const { browser, fetch, options } = setup({ body: {} }, null);
    expect(await openOnWeb("/x", options)).toEqual({ signedIn: false, reason: "signed_out" });
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.openBrowserAsync).toHaveBeenCalledWith("https://app.example.test/auth/handoff#next=%2Fx", { presentationStyle: "pageSheet" });
  });

  it("opens the page signed out when the server can't be reached", async () => {
    const { browser, options } = setup(new Error("offline"));
    expect(await openOnWeb("/x", options)).toEqual({ signedIn: false, reason: "unreachable" });
    expect(browser.openBrowserAsync).toHaveBeenCalledWith("https://app.example.test/auth/handoff#next=%2Fx", expect.anything());
  });

  it("opens the server's fallback for an account without an email", async () => {
    const fallbackUrl = "https://app.example.test/auth/handoff#next=%2Fx";
    const { browser, options } = setup({ status: 409, body: { error: "no_email", fallbackUrl } });
    expect(await openOnWeb("/x", options)).toEqual({ signedIn: false, reason: "no_email" });
    expect(browser.openBrowserAsync).toHaveBeenCalledWith(fallbackUrl, expect.anything());
  });

  it("never opens a link to another origin, whatever the server says", async () => {
    const { browser, options } = setup({ body: { url: "https://evil.com/auth/handoff#t=abc" } });
    expect(await openOnWeb("/x", options)).toEqual({ signedIn: false, reason: "refused" });
    expect(browser.openBrowserAsync).toHaveBeenCalledWith("https://app.example.test/auth/handoff#next=%2Fx", expect.anything());
  });

  it("throws when the server refuses the path", async () => {
    const { browser, options } = setup({ status: 400, body: { error: "bad_path" } });
    await expect(openOnWeb("/x", options)).rejects.toThrow(TypeError);
    expect(browser.openBrowserAsync).not.toHaveBeenCalled();
  });
});
