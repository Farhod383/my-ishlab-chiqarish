import { describe, it, expect, vi } from "vitest";
import { registerScanHandler, scanHandlerCount } from "./scanChannel";

const key = (k: string) => new KeyboardEvent("keydown", { key: k, bubbles: true });

describe("scanChannel — yagona faol skaner", () => {
  it("faqat oxirgi ro'yxatdan o'tgan tinglovchi hodisani oladi", () => {
    const first = vi.fn();
    const second = vi.fn();
    const off1 = registerScanHandler(first);
    const off2 = registerScanHandler(second);
    window.dispatchEvent(key("a"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    off1(); off2();
  });

  it("yuqori tinglovchi o'chirilganda pastgisi qayta faollashadi", () => {
    const first = vi.fn();
    const second = vi.fn();
    const off1 = registerScanHandler(first);
    const off2 = registerScanHandler(second);
    off2();
    window.dispatchEvent(key("b"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    off1();
  });

  it("tozalash funksiyasi tinglovchini stekdan olib tashlaydi", () => {
    const h = vi.fn();
    const off = registerScanHandler(h);
    const before = scanHandlerCount();
    off();
    expect(scanHandlerCount()).toBe(before - 1);
    window.dispatchEvent(key("c"));
    expect(h).not.toHaveBeenCalled();
  });
});
