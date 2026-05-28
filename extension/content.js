function parsePrice(text) {
  if (!text) return undefined;
  const m = String(text).replace(/,/g, "").match(/\$?\s*([\d]+(?:\.\d{2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function scrapeAmazon() {
  const asin =
    window.location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] ||
    document.querySelector("#ASIN")?.value;

  const title =
    document.querySelector("#productTitle")?.textContent?.trim() ||
    document.querySelector("meta[name='title']")?.content;

  const price =
    parsePrice(document.querySelector(".a-price .a-offscreen")?.textContent) ||
    parsePrice(document.querySelector("#corePrice_feature_div .a-offscreen")?.textContent);

  return { retailer: "amazon", asin, title, price };
}

function scrapeGeneric() {
  const ogTitle = document.querySelector("meta[property='og:title']")?.content;
  const title = ogTitle || document.title;
  const price =
    parsePrice(document.querySelector("meta[property='product:price:amount']")?.content) ||
    parsePrice(document.querySelector("[itemprop='price']")?.getAttribute("content")) ||
    parsePrice(document.querySelector("[itemprop='price']")?.textContent);

  return { title, price };
}

function scrapePage() {
  const host = window.location.hostname;
  if (/amazon\.com/i.test(host)) {
    return { ...scrapeGeneric(), ...scrapeAmazon(), url: location.href };
  }
  return { ...scrapeGeneric(), url: location.href };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SCRAPE_PAGE") {
    sendResponse(scrapePage());
  }
  return true;
});
