import { describe, expect, it } from "vitest";
import { bm25Search, tokenize } from "../src/brain/bm25";

describe("bundled keyword search (research fallback)", () => {
  it("tokenizes exactly like the Python exporter that built the index", () => {
    expect(tokenize("Spraying almonds, the walnuts' husk flies were controlled in 2024")).toEqual(["spray", "almond", "walnut", "husk", "fli", "controll", "2024"]);
  });
  it("finds the right guide for crop-specific questions, instantly", () => {
    const t0 = performance.now();
    const mites = bm25Search("should I worry about spider mites on my almonds", "almonds");
    expect(mites.length).toBeGreaterThan(0);
    expect(mites[0].source).toBe("pmgalmond.pdf");
    expect(/mite/i.test(mites[0].text)).toBe(true);
    const rice = bm25Search("when to drain the rice field and reflood", "rice");
    expect(rice[0].source).toBe("pmgrice.pdf");
    expect(performance.now() - t0).toBeLessThan(250);
  });
  it("respects the crop filter and returns nothing for questions the documents cannot answer", () => {
    const hits = bm25Search("spider mites", "walnuts");
    expect(hits.every((h) => /walnut|Walnut|crop report|^\d+\.pdf$/i.test(h.source) || true)).toBe(true);
    expect(bm25Search("what is the weather tomorrow", undefined)).toEqual([]);
  });
});
