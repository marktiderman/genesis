// @feat:native-app-shell
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { BootProvider, BootTimeoutError, createBoot, useBoot } from "../boot";

afterEach(() => {
  vi.useRealTimers();
});

describe("createBoot", () => {
  it("runs the steps in order, once each", async () => {
    const order: string[] = [];
    const boot = createBoot([
      { id: "wipe", run: async () => void order.push("wipe") },
      { id: "fonts", run: () => void order.push("fonts") },
    ]);
    await Promise.all([boot.start(), boot.start()]);
    await boot.start();
    expect(order).toEqual(["wipe", "fonts"]);
    expect(boot.getState()).toMatchObject({ status: "ready", completed: ["wipe", "fonts"] });
  });

  it("refuses a step listed twice", () => {
    expect(() => createBoot([{ id: "a", run: () => {} }, { id: "a", run: () => {} }])).toThrow(/listed twice/);
  });

  it("stops at a failing step and a retry resumes there", async () => {
    const first = vi.fn();
    let fail = true;
    const second = vi.fn(() => {
      if (fail) throw new Error("disk full");
    });
    const third = vi.fn();
    const boot = createBoot([
      { id: "first", run: first },
      { id: "second", run: second },
      { id: "third", run: third },
    ]);
    await boot.start();
    expect(boot.getState()).toMatchObject({ status: "failed", failedStep: "second", completed: ["first"] });
    expect(boot.getState().error?.message).toBe("disk full");
    expect(third).not.toHaveBeenCalled();

    fail = false;
    await boot.retry();
    expect(boot.getState().status).toBe("ready");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("fails a hung step at its timeout and aborts its signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const boot = createBoot([{ id: "hangs", run: (ctx) => ((signal = ctx.signal), new Promise(() => {})) }], { timeoutMs: 500 });
    const run = boot.start();
    await vi.advanceTimersByTimeAsync(499);
    expect(boot.getState().status).toBe("booting");
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(boot.getState().status).toBe("failed");
    expect(boot.getState().error).toBeInstanceOf(BootTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it("takes at least minimumMs", async () => {
    vi.useFakeTimers();
    const boot = createBoot([{ id: "quick", run: () => {} }], { minimumMs: 800 });
    const run = boot.start();
    await vi.advanceTimersByTimeAsync(799);
    expect(boot.getState().status).toBe("booting");
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(boot.getState().status).toBe("ready");
  });
});

describe("useBoot", () => {
  it("exposes the status to components", async () => {
    const boot = createBoot([{ id: "a", run: () => {} }]);
    function Status() {
      return <span data-testid="status">{useBoot().status}</span>;
    }
    render(
      <BootProvider boot={boot}>
        <Status />
      </BootProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("idle");
    await act(() => boot.start());
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });

  it("throws outside a provider", () => {
    function Status() {
      useBoot();
      return null;
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Status />)).toThrow(/inside <GenesisNativeApp>/);
  });
});

describe("createBoot after a timeout", () => {
  it("doesn't run a timed-out step twice at once: a retry waits for the abandoned run", async () => {
    vi.useFakeTimers();
    let running = 0;
    let most = 0;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          running++;
          most = Math.max(most, running);
          setTimeout(() => {
            running--;
            resolve();
          }, 1500);
        }),
    );
    const boot = createBoot([{ id: "slow", run }], { timeoutMs: 1000 });
    const first = boot.start();
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    expect(boot.getState().status).toBe("failed");
    const second = boot.retry();
    await vi.advanceTimersByTimeAsync(1000);
    await second;
    // The abandoned run finished during the retry's wait and counts: no second run.
    expect(boot.getState().status).toBe("ready");
    expect(run).toHaveBeenCalledTimes(1);
    expect(most).toBe(1);
  });

  it("fails the retry again while the abandoned run still hangs", async () => {
    vi.useFakeTimers();
    const run = vi.fn(() => new Promise<void>(() => {}));
    const boot = createBoot([{ id: "stuck", run }], { timeoutMs: 1000 });
    const first = boot.start();
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    const second = boot.retry();
    await vi.advanceTimersByTimeAsync(1000);
    await second;
    expect(boot.getState().error?.message).toMatch(/still running/);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
