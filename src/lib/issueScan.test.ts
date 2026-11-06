// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createIssueScanHandler } from "./issueScan";
import { normalizeScan, classifyScan } from "./scanCode";

describe("employee issue scanning", () => {
  for (const [raw, expected] of [["ERP000000812", "ERP000000812"], ["УКЗ000000812", "ERP000000812"], ["MCT00012", "MCT00012"]]) {
    it(`preserves Shift/CapsLock burst ${raw}`, () => {
      const scans: string[] = []; const raws: string[] = []; let time = 100;
      const handler = createIssueScanHandler((code, value) => { scans.push(code); raws.push(value); }, () => time);
      for (const key of ["CapsLock", ...raw.split("").flatMap(k => ["Shift", k]), "Enter"]) {
        handler(new KeyboardEvent("keydown", { key })); time += 10;
      }
      expect(scans).toEqual([expected]); expect(raws).toEqual([raw]);
    });
  }
  it("normalizes ERP Russian layout", () => expect(normalizeScan("УКЗ000000123")).toBe("ERP000000123"));
  it("normalizes MCT Russian layout", () => expect(normalizeScan("ЬСЕ00101")).toBe("MCT00101"));
  it("strips spaces controls and enter", () => expect(normalizeScan(" \tMCT00001\n\r")).toBe("MCT00001"));
  it("classifies employee codes", () => expect(classifyScan("MCT00101")).toBe("employee"));
  it("classifies product codes", () => expect(classifyScan("ERP000000123")).toBe("product"));
  it("treats any non-MCT code as a product", () => expect(classifyScan("4607025392110")).toBe("product"));
  it("restores a focused quantity field and does not change order", () => {
    const input = document.createElement("input"); input.value = "17"; input.setSelectionRange(0, 1);
    const order = "SEL0081"; const scans: string[] = []; let time = 100;
    const handler = createIssueScanHandler(code => scans.push(code), () => time);
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, cancelable: true }); Object.defineProperty(event, "target", { value: input });
      handler(event); if (!event.defaultPrevented && key.length === 1) input.value += key;
      time += 50;
    };
    "ЬСЕ00101".split("").forEach(press); press("Enter");
    expect(scans).toEqual(["MCT00101"]); expect(input.value).toBe("17"); expect(order).toBe("SEL0081");
    "ERP000000123".split("").forEach(press); press("Enter");
    expect(scans[1]).toBe("ERP000000123"); expect(input.value).toBe("17");
  });
  it("does not submit slow typing or short bursts", () => {
    const scans: string[] = []; let time = 0;
    const handler = createIssueScanHandler(code => scans.push(code), () => time);
    for (const key of [..."MCT00001", "Enter"]) { handler(new KeyboardEvent("keydown", { key })); time += 51; }
    for (const key of [..."ER1", "Enter"]) { handler(new KeyboardEvent("keydown", { key })); time += 20; }
    expect(scans).toEqual([]);
  });
});