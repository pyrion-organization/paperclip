import { afterEach, describe, expect, it, vi } from "vitest";
import { sleepUntilEmailWorkerWake, type EmailWorkerControl } from "../email-worker.js";

describe("email worker control", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves idle sleep immediately when already stopped", async () => {
    const control: EmailWorkerControl = { stopped: true, wake: null };

    await expect(sleepUntilEmailWorkerWake(30_000, control)).resolves.toBeUndefined();
    expect(control.wake).toBeNull();
  });

  it("wakes idle sleep when shutdown is requested", async () => {
    vi.useFakeTimers();
    const control: EmailWorkerControl = { stopped: false, wake: null };
    let resolved = false;

    const sleeping = sleepUntilEmailWorkerWake(30_000, control).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(false);

    control.stopped = true;
    control.wake?.();

    await sleeping;
    expect(resolved).toBe(true);
    expect(control.wake).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
