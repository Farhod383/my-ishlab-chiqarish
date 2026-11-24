import { describe, expect, it, vi } from "vitest";
import { createReloader } from "./realtimeReload";

describe("createReloader", () => {
  it("bir zumdagi bir nechta o'zgarish — bitta yuklash", () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const r = createReloader(load, 700);
    r.schedule(); r.schedule(); r.schedule();
    vi.advanceTimersByTime(699);
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("cancel() — sahifa yopilganda yuklamaydi", () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const r = createReloader(load, 500);
    r.schedule(); r.cancel();
    vi.advanceTimersByTime(1000);
    expect(load).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
