import { describe, it, expect } from "vitest";
import { badgePosition, BADGE_W, BADGE_H, BADGES_PER_PAGE } from "./employeeBadges";
describe("badge sheet geometry", () => {
  it("uses 90×54 mm badges, ten per page", () => {
    expect(BADGE_W).toBe(90); expect(BADGE_H).toBe(54); expect(BADGES_PER_PAGE).toBe(10);
  });
  it("places ten badges on one centered A4 page (2 columns × 5 rows)", () => {
    const positions = Array.from({ length: 10 }, (_, i) => badgePosition(i));
    expect(positions.map(p => p.page)).toEqual(Array(10).fill(0));
    expect(positions[0]).toEqual({ page: 0, x: 15, y: 13.5 });
    expect(positions[1]).toEqual({ page: 0, x: 105, y: 13.5 });
    expect(positions[9]).toEqual({ page: 0, x: 105, y: 229.5 });
    // Varaq markazida: chap/o‘ng chekka 15 mm, yuqori/pastki 13.5 mm.
    expect(positions[9].y + BADGE_H).toBe(283.5);
  });
  it("starts a new page after ten badges", () => expect(badgePosition(10).page).toBe(1));
});
