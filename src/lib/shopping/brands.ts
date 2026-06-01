/** Brands we recognize in user messages (lowercase key → display name) */
export const KNOWN_BRANDS: Record<string, string> = {
  nike: "Nike",
  adidas: "Adidas",
  "new balance": "New Balance",
  newbalance: "New Balance",
  puma: "Puma",
  asics: "ASICS",
  "under armour": "Under Armour",
  underarmour: "Under Armour",
  levi: "Levi's",
  levis: "Levi's",
  "levi's": "Levi's",
  gap: "Gap",
  "old navy": "Old Navy",
  oldnavy: "Old Navy",
  zara: "Zara",
  uniqlo: "Uniqlo",
  hm: "H&M",
  "h&m": "H&M",
  lululemon: "lululemon",
  "north face": "The North Face",
  northface: "The North Face",
  patagonia: "Patagonia",
  columbia: "Columbia",
  coach: "Coach",
  gucci: "Gucci",
  prada: "Prada",
  chanel: "Chanel",
  dior: "Dior",
  hermes: "Hermès",
  burberry: "Burberry",
  "ralph lauren": "Polo Ralph Lauren",
  ralphlauren: "Polo Ralph Lauren",
  "tommy hilfiger": "Tommy Hilfiger",
  tommyhilfiger: "Tommy Hilfiger",
  "calvin klein": "Calvin Klein",
  calvinklein: "Calvin Klein",
  brooklinen: "Brooklinen",
  casper: "Casper",
  ikea: "IKEA",
  wayfair: "Wayfair",
  carters: "Carter's",
  oshkosh: "OshKosh",
  rei: "REI",
  "dick's": "Dick's Sporting Goods",
  dicks: "Dick's Sporting Goods",
  basspro: "Bass Pro Shops",
  cabelas: "Cabela's",
  primary: "Primary",
  honest: "Honest",
  hannaandersson: "Hanna Andersson",
  janieandjack: "Janie and Jack",
  gymboree: "Gymboree",
  samsonite: "Samsonite",
  tumi: "Tumi",
  away: "Away",
  herschel: "Herschel",
  "great value": "Great Value",
  greatvalue: "Great Value",
  kirkland: "Kirkland",
  "kirkland signature": "Kirkland",
  "member's mark": "Member's Mark",
  membersmark: "Member's Mark",
  "365": "365",
  "365 everyday value": "365",
  goodgather: "Good & Gather",
  "good & gather": "Good & Gather",
  marketside: "Marketside",
  equate: "Equate",
  upup: "up & up",
  "up & up": "up & up",
  folgers: "Folgers",
  cheerios: "Cheerios",
  "nature valley": "Nature Valley",
  chobani: "Chobani",
  bounty: "Bounty",
  charmin: "Charmin",
  tide: "Tide",
  dawn: "Dawn",
  "cheez-it": "Cheez-It",
  cheezit: "Cheez-It",
  "cheez it": "Cheez-It",
  goldfish: "Goldfish",
  ritz: "Ritz",
  oreo: "Oreo",
};

/** Walmart/Costco/Target private-label store brands. */
export const PRIVATE_LABEL_BRANDS: Record<string, string> = {
  "great value": "Great Value",
  greatvalue: "Great Value",
  kirkland: "Kirkland",
  "kirkland signature": "Kirkland",
  "member's mark": "Member's Mark",
  membersmark: "Member's Mark",
  "365 everyday value": "365",
  "365": "365",
  goodgather: "Good & Gather",
  "good & gather": "Good & Gather",
  marketside: "Marketside",
  equate: "Equate",
  upup: "up & up",
  "up & up": "up & up",
};

export function parsePrivateLabelBrand(text: string): string | undefined {
  const lower = text.toLowerCase();
  const sorted = Object.keys(PRIVATE_LABEL_BRANDS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) return PRIVATE_LABEL_BRANDS[key];
  }
  return undefined;
}

export function parseBrandFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const sorted = Object.keys(KNOWN_BRANDS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) return KNOWN_BRANDS[key];
  }
  if (/\bfrom\s+([a-z][a-z0-9'&\s-]{2,24})\b/i.test(lower)) {
    const m = lower.match(/\bfrom\s+([a-z][a-z0-9'&\s-]{2,24})\b/i);
    if (m?.[1]) {
      const candidate = m[1].trim();
      if (KNOWN_BRANDS[candidate]) return KNOWN_BRANDS[candidate];
    }
  }
  return undefined;
}
