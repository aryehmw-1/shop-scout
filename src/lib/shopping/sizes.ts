const SIZE_WORD: Record<string, string> = {
  xs: "XS",
  xsmall: "XS",
  "extra small": "XS",
  s: "S",
  small: "S",
  m: "M",
  medium: "M",
  l: "L",
  large: "L",
  xl: "XL",
  xlarge: "XL",
  "extra large": "XL",
  xxl: "XXL",
  xxlarge: "XXL",
  "2xl": "XXL",
  "3xl": "3XL",
  "4xl": "4XL",
};

/** Pull clothing/shoe size from user text */
export function parseSizeFromText(text: string): string | undefined {
  const lower = text.toLowerCase().trim();

  const wxl = lower.match(/\b(\d{2})\s*x\s*(\d{2})\b/);
  if (wxl) return `${wxl[1]}x${wxl[2]}`;

  const waistInseamSlash = lower.match(/\b(\d{2})\s*\/\s*(\d{2})\b/);
  if (waistInseamSlash) return `${waistInseamSlash[1]}x${waistInseamSlash[2]}`;

  const sizeSlash = lower.match(/\bsize\s+(\d{2})\s*\/\s*(\d{2})\b/);
  if (sizeSlash) return `${sizeSlash[1]}x${sizeSlash[2]}`;

  const waistInseamDash =
    /\b(pants?|jeans|chinos?|trousers|shorts|denim|slacks)\b/.test(lower) ?
      lower.match(/\b(\d{2})\s*-\s*(\d{2})\b/)
    : null;
  if (waistInseamDash) return `${waistInseamDash[1]}x${waistInseamDash[2]}`;

  const waistInseamWords = lower.match(/\bwaist\s+(\d{2})\b.*\binseam\s+(\d{2})\b/);
  if (waistInseamWords) return `${waistInseamWords[1]}x${waistInseamWords[2]}`;

  const shoe = lower.match(/\bsize\s+(\d{1,2}(?:\.\d)?)\b/);
  if (shoe && !lower.includes("size large")) return `Size ${shoe[1]}`;

  const labeled = lower.match(
    /\bsize\s+(xx?s|xx?l|x?s|x?l|small|medium|large|xlarge|extra\s+large|\d{1,2}x\d{1,2}|\d{2}\/\d{2})\b/i,
  );
  if (labeled) return normalizeSizeToken(labeled[1]);

  const sizeBeforeNoun = lower.match(
    /\b(xxlarge|xxlarge|xlarge|extra large|large|medium|small|xx?s|xx?l|xl)\s+(?:pants?|jeans|joggers?|chinos?|shirt|hoodie|shoes?|sneakers?|boots?|dress|shorts|jacket|top|sweater|coat|leggings|sweatpants?)\b/i,
  );
  if (sizeBeforeNoun) return normalizeSizeToken(sizeBeforeNoun[1]);

  const inSize = lower.match(
    /\bin\s+(?:a\s+)?(xx?s|xx?l|x?s|x?l|small|medium|large|xlarge|extra\s+large|\d{1,2}x\d{1,2})\b/i,
  );
  if (inSize) return normalizeSizeToken(inSize[1]);

  if (
    /\b(make sure|need|want|must be|has to be|they.?re|they are)\b/.test(lower) &&
    /\b(large|medium|small|xlarge|xx?s|xx?l|xl)\b/.test(lower)
  ) {
    const word = lower.match(/\b(xxlarge|xxlarge|xlarge|extra large|large|medium|small|xx?s|xx?l|xl)\b/i);
    if (word) return normalizeSizeToken(word[1]);
  }

  if (/^(large|medium|small|xl|xxl|xs)$/i.test(lower)) {
    return normalizeSizeToken(lower);
  }

  return undefined;
}

function normalizeSizeToken(raw: string): string {
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const slash = key.match(/^(\d{2})\/(\d{2})$/);
  if (slash) return `${slash[1]}x${slash[2]}`;
  if (SIZE_WORD[key]) return SIZE_WORD[key];
  if (/^\d{2}x\d{2}$/.test(key)) return key;
  if (/^\d{1,2}$/.test(key)) return `Size ${key}`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function sizeAppearsInText(text: string, size: string): boolean {
  const lower = text.toLowerCase();
  const s = size.toLowerCase();
  if (lower.includes(s)) return true;

  const wx = s.match(/^(\d{2})x(\d{2})$/);
  if (wx) {
    const [, w, i] = wx;
    if (new RegExp(`\\b${w}\\s*[/x]\\s*${i}\\b`, "i").test(lower)) return true;
  }

  const token = s.replace(/^size\s+/i, "");
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower);
}

export function isSizeOnlyFollowUp(text: string): boolean {
  const t = text.trim();
  if (parseSizeFromText(t)) return true;
  return /\b(make sure|size|in a|need (it )?in)\b/i.test(t.toLowerCase()) && t.split(/\s+/).length <= 12;
}
