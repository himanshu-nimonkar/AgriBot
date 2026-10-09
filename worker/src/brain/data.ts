import chemicalsJson from "../data/chemicals.json";
import startupsJson from "../data/startups.json";

interface Chemical { product_name: string; active_ingredient: string; crops: string[]; pests: string[]; rate: string; rei: string; phi?: string; notes?: string }
interface Startup { id: string | number; name: string; city: string; focus: string; description: string }

const chemicals = chemicalsJson as Chemical[];
const startups = startupsJson as Startup[];

export function lookupChemicals(query: string, crop?: string): Chemical[] {
  const q = query.toLowerCase();
  return chemicals
    .filter((c) => {
      if (crop && !c.crops.some((x) => x === crop || (crop === "grapes" && x === "wine_grapes"))) return false;
      return c.pests.some((p) => q.includes(p)) || q.includes(c.product_name.toLowerCase());
    })
    .slice(0, 3);
}

const GENERIC_Q = new Set(["any", "companies", "company", "startup", "startups", "tech", "agtech", "that", "with", "have", "need", "want", "local", "near", "know", "there", "which", "provide", "provides", "service", "services", "vendor", "vendors", "provider", "providers", "farm", "farms", "yolo", "county", "for", "the"]);

/** Rank the local ag-company directory by the words that matter (name > focus > description) and by town. */
export function lookupStartups(query: string): Startup[] {
  const q = query.toLowerCase();
  const words = [...new Set(q.match(/[a-z]{4,}/g) ?? [])].filter((w) => !GENERIC_Q.has(w));
  const stem = (w: string) => w.replace(/(ing|ers|er|ed|es|s)$/, "");
  return startups
    .map((s) => {
      const name = s.name.toLowerCase(), focus = s.focus.toLowerCase(), desc = s.description.toLowerCase();
      let score = q.includes(name) ? 8 : 0;
      for (const w of words) {
        const k = stem(w);
        if (k.length < 3) continue;
        if (name.includes(k)) score += 4;
        if (focus.includes(k)) score += 3;
        if (desc.includes(k)) score += 1.5;
      }
      if (score > 0 && q.includes(s.city.toLowerCase())) score += 2; // same town as the caller asked about
      return { s, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s);
}

// Indicative baselines (2024/25 USDA-style). Not a live feed - the prompt labels it that way.
const COMMODITIES: Record<string, { name: string; unit: string; price: number; trend: string }> = {
  almonds: { name: "Almonds", unit: "pound", price: 1.95, trend: "stable" },
  walnuts: { name: "Walnuts", unit: "pound", price: 0.65, trend: "down" },
  tomatoes: { name: "Processing tomatoes", unit: "ton", price: 138, trend: "up" },
  rice: { name: "Rice", unit: "hundredweight", price: 18.5, trend: "stable" },
};
export const marketFor = (crop?: string) => (crop ? COMMODITIES[crop] : undefined);
