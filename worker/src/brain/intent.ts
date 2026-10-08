import { findPlace, type Place } from "./places";

export type Topic = "weather" | "irrigation" | "pest" | "satellite" | "market" | "timing" | "startups" | "general";

export interface TurnIntent {
  text: string;
  crop?: string;
  place?: Place;
  address?: string;
  topics: Set<Topic>;
  smalltalk: boolean;
}

const ADDRESS_RE =
  /\b(?:county\s+road\s+\d+[a-z]?|\d{2,5}\s+(?:[A-Za-z0-9.]+\s+){1,4}(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|boulevard|blvd|way|court|ct|highway|hwy))\b/i;

const CROPS: [string, RegExp][] = [
  ["almonds", /\balmonds?\b/i],
  ["walnuts", /\bwalnuts?\b/i],
  ["pistachios", /\bpistachios?\b/i],
  ["tomatoes", /\btomato(?:es)?\b/i],
  ["rice", /\brice\b|\bpaddy\b|\bpaddies\b/i],
  ["grapes", /\bgrapes?\b|\bvineyards?\b|\bvines?\b|\bwine\b/i],
];

const TOPICS: [Topic, RegExp][] = [
  ["weather", /weather|forecast|rain|temperature|\bhot\b|\bcold\b|frost|freez|\bwind|humid|\bheat|degrees|storm|\bfog\b|tomorrow|tonight|this week|weekend|next week/i],
  ["irrigation", /irrigat|water|moisture|\bdrip\b|flood|evapotrans|\beto?\b|\bdry\b|thirst|\bdrought/i],
  ["pest", /\bpest|\bmites?\b|worm|insect|aphid|fung|mildew|blight|disease|spray|pesticide|herbicide|chemical|insecticide|\brei\b|\bphi\b|label|\bweeds?\b|rot\b|\bbug/i],
  ["satellite", /satellite|earth engine|google earth|remote sensing|water index|moisture index|ndmi|ndvi|ndwi|vegetation|field health|crop health|canopy|greenness|imagery|stress|how(?:'s| is| are) my (?:field|crop|orchard|trees|vines)|how does my/i],
  ["market", /\bprice|\bmarket|worth|per ton|per pound|\bcwt\b|\bsell|\bselling/i],
  ["timing", /harvest|\bplant|\bsow|\bgdd\b|degree day|\bbloom|hull split|when (?:should|do|can)|timing|season|best time|fertiliz|prun/i],
  ["startups", /startup|compan(?:y|ies)|vendor|provider|agtech|who sells|who (?:can|does)|service/i],
];

const AG_HINT = /\bfarm|\bfield|orchard|crop|\bacre|\bsoil|\bfruit|\bnut\b|\bnuts\b|\bgrow|\byield|\btree|irrigat|harvest|\bplant/i;

export const PURE_SOCIAL =
  /^\W*(hi|hello|hey|thanks?|thank you|bye|goodbye|okay|ok|yes|yeah|yep|no|nope|sure|great|cool|alright|got it|good (morning|afternoon|evening))\W*$/i;

export function parseUtterance(text: string): TurnIntent {
  text = (text ?? "").trim();
  const intent: TurnIntent = { text, topics: new Set(), smalltalk: false };

  let bestPos = Infinity;
  for (const [crop, re] of CROPS) {
    const m = re.exec(text);
    if (m && m.index < bestPos) (intent.crop = crop), (bestPos = m.index);
  }

  const place = findPlace(text);
  if (place) intent.place = place;
  else {
    const a = ADDRESS_RE.exec(text);
    if (a) intent.address = a[0];
  }

  for (const [name, re] of TOPICS) if (re.test(text)) intent.topics.add(name);

  const hasEntity = !!(intent.crop || intent.place || intent.address || AG_HINT.test(text));
  if (hasEntity && intent.topics.size === 0) intent.topics.add("general"); // "what about walnuts?" -> weather + research
  intent.smalltalk = !(intent.topics.size || hasEntity);
  return intent;
}
