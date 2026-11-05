import { describe, it, expect } from "vitest";
import { badgePosition } from "./employeeBadges";
describe("badge sheet geometry", () => {
  it("places eight badges on one centered A4 page", () => {
    const positions = Array.from({ length: 8 }, (_, i) => badgePosition(i, 8));
    expect(positions.map(p => p.page)).toEqual(Array(8).fill(0));
    expect(positions[0]).toEqual({ page: 0, x: 5, y: 8.5 });
    expect(positions[7]).toEqual({ page: 0, x: 105, y: 218.5 });
    expect(badgePosition(8, 8).page).toBe(1);
  });
  it("centers six badges in three rows", () => expect(badgePosition(0, 6).y).toBe(43.5));
  it("centers four badges in two rows", () => expect(badgePosition(0, 4).y).toBe(78.5));
});