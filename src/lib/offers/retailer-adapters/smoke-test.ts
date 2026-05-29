/**
 * Smoke-test retailer search parsers (no network).
 * Run: npx tsx src/lib/offers/retailer-adapters/smoke-test.ts
 */
import { aldiAdapter } from "./aldi";
import { amazonAdapter } from "./amazon";
import { costcoAdapter } from "./costco";
import { krogerAdapter } from "./kroger";
import { targetAdapter } from "./target";
import { walmartAdapter } from "./walmart";

const walmartHtml = `
<script id="__NEXT_DATA__" type="application/json">{
  "props":{"pageProps":{"initialData":{"searchResult":{"itemStacks":[{"items":[{
    "usItemId":"123456789",
    "name":"Levi's Slim Fit Jeans Men's",
    "priceInfo":{"currentPrice":{"price":34.98}},
    "imageInfo":{"thumbnailUrl":"https://i5.walmartimages.com/asr/abc.jpg"},
    "canonicalUrl":"https://www.walmart.com/ip/Levis-Slim-Fit/123456789"
  }]}]}}}}
}</script>`;

const targetHtml = `
<script id="__NEXT_DATA__" type="application/json">{
  "props":{"pageProps":{"dehydratedState":{"queries":[{
    "state":{"data":{"search":{"products":[{
      "tcin":"87654321",
      "price":{"current_retail":29.99,"formatted_current_price":"$29.99"},
      "item":{"product_description":{"title":"Levi's 511 Slim Jeans"}}
    }]}}}}
  }]}}}}
}</script>`;

const amazonHtml = `
<div data-asin="B0TEST1234" class="s-result-item">
  <span class="a-text-normal">Levi's Men's 511 Slim Jeans</span>
  <span class="a-price"><span class="a-offscreen">$42.50</span></span>
  <img src="https://m.media-amazon.com/images/I/test.jpg"/>
</div>`;

function assert(label: string, ok: boolean, detail: unknown) {
  if (!ok) {
    console.error("FAIL", label, detail);
    process.exitCode = 1;
    return;
  }
  console.log("ok", label, detail);
}

const w = walmartAdapter.extractSearchResults(walmartHtml, "https://www.walmart.com/search?q=jeans");
assert("walmart price", w?.priceUsd === 34.98, w);
assert("walmart pdp", Boolean(w?.pdpUrl?.includes("/ip/")), w?.pdpUrl);

const t = targetAdapter.extractSearchResults(targetHtml, "https://www.target.com/s?searchTerm=jeans");
assert("target price", t?.priceUsd === 29.99, t);
assert("target pdp", t?.pdpUrl?.includes("87654321") === true, t?.pdpUrl);

const a = amazonAdapter.extractSearchResults(amazonHtml, "https://www.amazon.com/s?k=jeans");
assert("amazon price", a?.priceUsd === 42.5, a);
assert("amazon asin", a?.pdpUrl?.includes("B0TEST1234") === true, a?.pdpUrl);

const aldiHtml = `<script id="__NEXT_DATA__">{"products":[{"sku":"SKU1","slug":"organic-spinach","name":"Organic Spinach","price":{"amount":2.49}}]}</script>`;
const al = aldiAdapter.extractSearchResults(aldiHtml, "https://www.aldi.us/products/?search=spinach");
assert("aldi price", al?.priceUsd === 2.49, al);

const krogerHtml = `{"upc":"00011122233344","description":"Chicken Breast","price":{"regular":12.99},"productPageURL":"https://www.kroger.com/p/tyson-chicken/00011122233344"}`;
const k = krogerAdapter.extractSearchResults(krogerHtml, "https://www.kroger.com/search?query=chicken");
assert("kroger price", k?.priceUsd === 12.99, k);

const costcoHtml = `"itemNumber":"1234567","itemName":"Organic Spinach","unitSellPrice":7.99,"href":"https://www.costco.com/organic-spinach.product.1234567.html"`;
const c = costcoAdapter.extractSearchResults(costcoHtml, "https://www.costco.com/CatalogSearch?keyword=spinach");
assert("costco price", c?.priceUsd === 7.99, c);

if (process.exitCode !== 1) {
  console.log("retailer adapter smoke tests passed");
}
