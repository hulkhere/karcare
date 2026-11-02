import { describe, expect, it } from "vitest";
import { CATEGORY_LABEL, CHANGES, CURRENT_VARIANTS } from "../lib/changelog";
import { CATALOG, unitCost } from "../lib/costs";

describe("change log", () => {
  it("every entry has a valid date and category", () => {
    for (const c of CHANGES) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(c.date))).toBe(false);
      expect(CATEGORY_LABEL[c.category]).toBeTruthy();
      expect(c.affects.length).toBeGreaterThan(0);
    }
  });

  it("today's rates cover every catalogue product, each with a cost", () => {
    const now = new Date().toISOString();
    for (const p of CATALOG) expect(CURRENT_VARIANTS.some((v) => v.product === p.name)).toBe(true);
    for (const v of CURRENT_VARIANTS) expect(unitCost(v.product, v.variant, now)).not.toBeNull();
  });

  it("logs the Car Door Protector cost change on 31 Oct", () => {
    const c = CHANGES.find((x) => x.date === "2026-10-31" && x.category === "cost")!;
    expect(c.changes).toContainEqual({ label: "4pcs - For 1 Car", from: "₹55", to: "₹80" });
  });
});
