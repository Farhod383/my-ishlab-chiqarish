import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CHASSIS_RU } from "./chassisRu";
import { chassisText } from "./chassis";

describe("Shassi matnlari", () => {
  it("har bir tr(\"…\") matnining ruscha tarjimasi bor", () => {
    const dirs = ["../pages/chassis", "../components/chassis"].map((d) => resolve(__dirname, d));
    const missing: string[] = [];
    for (const dir of dirs) for (const f of readdirSync(dir)) {
      const src = readFileSync(resolve(dir, f), "utf8");
      for (const m of src.matchAll(/tr\("([^"]+)"\)/g)) if (!CHASSIS_RU[m[1]]) missing.push(m[1]);
      for (const m of src.matchAll(/(?:title|hint)="([^"]+)"/g)) if (!CHASSIS_RU[m[1]]) missing.push(m[1]);
    }
    expect([...new Set(missing)]).toEqual([]);
  });
  it("kirill avtomatik", () => {
    expect(chassisText("uzc", "Reestr")).toBe("Реестр");
    expect(chassisText("ru", "Reestr")).toBe("Реестр");
  });
});
