import { describe, it, expect } from "vitest";
import { uzLabel, uzText, uzAction } from "./uzLabels";
describe("uzLabels", () => {
  it("maps user-listed codes", () => {
    expect(uzLabel("in_progress")).toBe("Jarayonda");
    expect(uzLabel("completed")).toBe("Tugallangan");
    expect(uzLabel("pending")).toBe("Kutilmoqda");
    expect(uzLabel("normal")).toBe("Oddiy");
    expect(uzLabel("approved")).toBe("Tasdiqlangan");
    expect(uzLabel("rejected")).toBe("Rad etilgan");
    expect(uzLabel("not_checked")).toBe("Tekshirilmagan");
  });
  it("translates codes inside text", () => {
    expect(uzText("Ali: status pending → in_progress")).toBe("Ali: holat Kutilmoqda → Jarayonda");
    expect(uzAction("kassa.income.create")).toBe("Kassa kirimi qo'shildi");
  });
});
