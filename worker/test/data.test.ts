import { describe, expect, it } from "vitest";
import { lookupChemicals, lookupStartups } from "../src/brain/data";

describe("local directories", () => {
  it("finds irrigation-sensor companies in the town asked about", () => {
    const r = lookupStartups("Any ag tech companies in Davis for irrigation sensors?");
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((s) => `${s.name} ${s.focus} ${s.description}`.toLowerCase()).join(" ")).toMatch(/sensor|irrigation|water/);
  });
  it("returns nothing for unrelated questions", () => {
    expect(lookupStartups("will it rain tomorrow")).toEqual([]);
  });
  it("matches product labels by pest and crop", () => {
    expect(lookupChemicals("what can I spray for mites", "almonds")[0]?.product_name).toBeTruthy();
    expect(lookupChemicals("mites", "rice")).toEqual([]);
  });
});
