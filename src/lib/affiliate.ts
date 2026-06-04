import { buildStoreSearchQuery } from "./retailers/store-search-query";
import type { RetailerId, ShoppingIntent } from "./types";

const AFFILIATE_TAGS: Partial<Record<RetailerId, string | undefined>> = {
  walmart: process.env.AFFILIATE_WALMART_TAG,
  target: process.env.AFFILIATE_TARGET_TAG,
  amazon: process.env.AFFILIATE_AMAZON_TAG,
  ebay: process.env.AFFILIATE_EBAY_TAG,
  kroger: process.env.AFFILIATE_KROGER_TAG,
  instacart: process.env.AFFILIATE_INSTACART_TAG,
  costco: process.env.AFFILIATE_COSTCO_TAG,
  sams: process.env.AFFILIATE_SAMS_TAG,
  aldi: process.env.AFFILIATE_ALDI_TAG,
  publix: process.env.AFFILIATE_PUBLIX_TAG,
  burlington: process.env.AFFILIATE_BURLINGTON_TAG,
  dicks: process.env.AFFILIATE_DICKS_TAG,
  kohls: process.env.AFFILIATE_KOHLS_TAG,
  macys: process.env.AFFILIATE_MACYS_TAG,
  oldnavy: process.env.AFFILIATE_OLDNAVY_TAG,
  ross: process.env.AFFILIATE_ROSS_TAG,
  tjmaxx: process.env.AFFILIATE_TJMAXX_TAG,
  footlocker: process.env.AFFILIATE_FOOTLOCKER_TAG,
  zappos: process.env.AFFILIATE_ZAPPOS_TAG,
  hm: process.env.AFFILIATE_HM_TAG,
  nike: process.env.AFFILIATE_NIKE_TAG,
  adidas: process.env.AFFILIATE_ADIDAS_TAG,
  newbalance: process.env.AFFILIATE_NEWBALANCE_TAG,
  underarmour: process.env.AFFILIATE_UNDERARMOUR_TAG,
  asics: process.env.AFFILIATE_ASICS_TAG,
  puma: process.env.AFFILIATE_PUMA_TAG,
};

/** Retailer search URLs — opens that store with your product pre-filled */
export function buildRetailerSearchUrl(
  retailer: RetailerId,
  searchQuery: string,
): string {
  const q = encodeURIComponent(searchQuery.trim() || "deals");

  switch (retailer) {
    case "walmart":
      return `https://www.walmart.com/search?q=${q}`;
    case "target":
      return `https://www.target.com/s?searchTerm=${q}`;
    case "amazon":
      return `https://www.amazon.com/s?k=${q}`;
    case "ebay":
      return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
    case "shopsavvy":
      return googleShoppingFallback(searchQuery);
    case "bestbuy":
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
    case "kroger":
      return `https://www.kroger.com/search?query=${q}&searchType=default`;
    case "publix":
      return `https://www.publix.com/search?query=${q}`;
    case "costco":
      return `https://www.costco.com/CatalogSearch?dept=All&keyword=${q}`;
    case "sams":
      return `https://www.samsclub.com/sams/search?searchTerm=${q}`;
    case "aldi":
      return `https://www.aldi.us/products/?search=${q}`;
    case "instacart":
      return `https://www.instacart.com/store/s?k=${q}`;
    case "burlington":
      return `https://www.burlington.com/search?q=${q}`;
    case "dicks":
      return `https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm=${q}`;
    case "kohls":
      return `https://www.kohls.com/search.jsp?search=${q}`;
    case "macys":
      return `https://www.macys.com/shop/search?keyword=${q}`;
    case "oldnavy":
      return `https://oldnavy.gap.com/browse/search.do?searchText=${q}`;
    case "ross":
      return googleShoppingFallback(searchQuery);
    case "tjmaxx":
      return `https://www.tjmaxx.com/us/store/shop/?Ntt=${q}`;
    case "footlocker":
      return `https://www.footlocker.com/search?query=${q}`;
    case "zappos":
      return `https://www.zappos.com/search?term=${q}`;
    case "hm":
      return `https://www2.hm.com/en_us/search-results.html?q=${q}`;
    case "nike":
      return `https://www.nike.com/w?q=${q}`;
    case "adidas":
      return `https://www.adidas.com/us/search?q=${q}`;
    case "newbalance":
      return `https://www.newbalance.com/search/?q=${q}`;
    case "underarmour":
      return `https://www.underarmour.com/en-us/search?q=${q}`;
    case "asics":
      return `https://www.asics.com/us/en-us/search/?q=${q}`;
    case "puma":
      return `https://us.puma.com/us/en/search?q=${q}`;
    case "zara":
      return `https://www.zara.com/us/en/search?searchTerm=${q}`;
    case "uniqlo":
      return `https://www.uniqlo.com/us/en/search?q=${q}`;
    case "gap":
      return `https://www.gap.com/browse/search.do?searchText=${q}`;
    case "levis":
      return `https://www.levis.com/US/en_US/search?q=${q}`;
    case "ralphlauren":
      return `https://www.ralphlauren.com/search?query=${q}`;
    case "lululemon":
      return `https://shop.lululemon.com/search?Ntt=${q}`;
    case "northface":
      return `https://www.thenorthface.com/en-us/search?q=${q}`;
    case "skechers":
      return `https://www.skechers.com/search/?q=${q}`;
    case "victoriassecret":
      return `https://www.victoriassecret.com/us/vs/search?q=${q}`;
    case "calvinklein":
      return `https://www.calvinklein.us/en/search?query=${q}`;
    case "tommyhilfiger":
      return `https://usa.tommy.com/en/search?q=${q}`;
    case "coach":
      return `https://www.coach.com/search?q=${q}`;
    case "michaelkors":
      return `https://www.michaelkors.com/search?q=${q}`;
    case "next":
      return `https://www.next.co.uk/search?w=${q}`;
    case "louisvuitton":
      return `https://us.louisvuitton.com/eng-us/search?keyword=${q}`;
    case "chanel":
      return `https://www.chanel.com/us/search?q=${q}`;
    case "hermes":
      return `https://www.hermes.com/us/en/search/?q=${q}`;
    case "dior":
      return `https://www.dior.com/en_us/search?q=${q}`;
    case "gucci":
      return `https://www.gucci.com/us/en/st/search?q=${q}`;
    case "prada":
      return `https://www.prada.com/us/en/search?q=${q}`;
    case "burberry":
      return `https://us.burberry.com/search?q=${q}`;
    case "moncler":
      return `https://www.moncler.com/en-us/search?q=${q}`;
    case "barnesnoble":
      return `https://www.barnesandnoble.com/s/${q}`;
    case "indigo":
      return `https://www.indigo.ca/en-ca/search/?q=${q}`;
    case "waterstones":
      return `https://www.waterstones.com/books/search/term/${q}`;
    case "abebooks":
      return `https://www.abebooks.com/servlet/SearchResults?kn=${q}`;
    case "fnac":
      return `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}`;
    case "whsmith":
      return `https://www.whsmith.co.uk/search/go?w=${q}`;
    case "kinokuniya":
      return `https://usa.kinokuniya.com/search?q=${q}`;
    case "booksamillion":
      return `https://www.booksamillion.com/search?query=${q}`;
    case "powells":
      return `https://www.powells.com/searchresults?keyword=${q}`;
    case "bookshop":
      return `https://bookshop.org/search?keywords=${q}`;
    case "worldofbooks":
      return `https://www.worldofbooks.com/search?q=${q}`;
    case "alibris":
      return `https://www.alibris.com/search/books/${q}`;
    case "betterworldbooks":
      return `https://www.betterworldbooks.com/search/results?q=${q}`;
    case "halfpricebooks":
      return `https://www.hpb.com/search?q=${q}`;
    case "dymocks":
      return `https://www.dymocks.com.au/search?query=${q}`;
    case "strand":
      return `https://www.strandbooks.com/search?query=${q}`;
    case "bookoutlet":
      return `https://www.bookoutlet.com/search?query=${q}`;
    case "wayfair":
      return `https://www.wayfair.com/keyword.php?keyword=${q}`;
    case "mattressfirm":
      return `https://www.mattressfirm.com/search?q=${q}`;
    case "sleepnumber":
      return `https://www.sleepnumber.com/search?q=${q}`;
    case "ashley":
      return `https://www.ashleyfurniture.com/search-results/?q=${q}`;
    case "brooklinen":
      return `https://www.brooklinen.com/search?q=${q}`;
    case "bollbranch":
      return `https://www.boll-and-branch.com/search?q=${q}`;
    case "saatva":
      return `https://www.saatva.com/search?q=${q}`;
    case "purple":
      return `https://purple.com/search?q=${q}`;
    case "casper":
      return `https://casper.com/search?q=${q}`;
    case "nectar":
      return `https://www.nectarsleep.com/search?q=${q}`;
    case "dreamcloud":
      return `https://www.dreamcloudsleep.com/search?q=${q}`;
    case "parachute":
      return `https://www.parachutehome.com/search?q=${q}`;
    case "cozyearth":
      return `https://cozyearth.com/search?q=${q}`;
    case "potterybarn":
      return `https://www.potterybarn.com/search/results.html?words=${q}`;
    case "westelm":
      return `https://www.westelm.com/search/results.html?words=${q}`;
    case "ikea":
      return `https://www.ikea.com/us/en/search/?q=${q}`;
    case "quince":
      return `https://www.quince.com/search?q=${q}`;
    case "avocado":
      return `https://www.avocadogreenmattress.com/search?q=${q}`;
    case "helix":
      return `https://helixsleep.com/search?q=${q}`;
    case "brooklynbedding":
      return `https://brooklynbedding.com/search?q=${q}`;
    case "frette":
      return `https://www.frette.com/us_en/search?q=${q}`;
    case "sferra":
      return `https://www.sferra.com/search?q=${q}`;
    case "peacockalley":
      return `https://www.peacockalley.com/search?q=${q}`;
    case "zinus":
      return `https://zinus.com/search?q=${q}`;
    case "tuftandneedle":
      return `https://www.tuftandneedle.com/search?q=${q}`;
    case "leesa":
      return `https://www.leesa.com/search?q=${q}`;
    case "buffy":
      return `https://www.buffys.co/search?q=${q}`;
    case "tempurpedic":
      return `https://www.tempurpedic.com/search?query=${q}`;
    case "nordstrom":
      return `https://www.nordstrom.com/sr?keyword=${q}`;
    case "nordstromrack":
      return `https://www.nordstromrack.com/search?query=${q}`;
    case "jcrew":
      return `https://www.jcrew.com/search?Ntrm=${q}`;
    case "anthropologie":
      return `https://www.anthropologie.com/search?q=${q}`;
    case "athleta":
      return `https://athleta.gap.com/browse/search.do?searchText=${q}`;
    case "patagonia":
      return `https://www.patagonia.com/search/?q=${q}`;
    case "rei":
      return `https://www.rei.com/search?q=${q}`;
    case "dillards":
      return `https://www.dillards.com/search-term/${q}`;
    case "bloomingdales":
      return `https://www.bloomingdales.com/shop/search?keyword=${q}`;
    case "childrensplace":
      return `https://www.childrensplace.com/us/search?q=${q}`;
    case "carters":
      return `https://www.carters.com/search?q=${q}`;
    case "oshkosh":
      return `https://www.carters.com/search?q=${q}%20oshkosh`;
    case "shein":
      return `https://us.shein.com/search?keyword=${q}`;
    case "urbanoutfitters":
      return `https://www.urbanoutfitters.com/search?q=${q}`;
    case "forever21":
      return `https://www.forever21.com/search?q=${q}&type=product`;
    case "llbean":
      return `https://www.llbean.com/search?q=${q}`;
    case "columbia":
      return `https://www.columbia.com/search?q=${q}`;
    case "skims":
      return `https://skims.com/search?q=${q}`;
    case "albertsons":
      return `https://www.albertsons.com/shop/search-results.html?q=${q}`;
    case "safeway":
      return `https://www.safeway.com/shop/search-results.html?q=${q}`;
    case "vons":
      return `https://www.vons.com/shop/search-results.html?q=${q}`;
    case "jewelosco":
      return `https://www.jewelosco.com/shop/search-results.html?q=${q}`;
    case "sprouts":
      return `https://www.sprouts.com/search?q=${q}`;
    case "wholefoods":
      return `https://www.wholefoodsmarket.com/search?text=${q}`;
    case "heb":
      return `https://www.heb.com/search?q=${q}`;
    case "meijer":
      return `https://www.meijer.com/shopping/search.html?searchTerm=${q}`;
    case "hyvee":
      return `https://www.hy-vee.com/aisles-online/search?search=${q}`;
    case "wegmans":
      return `https://shop.wegmans.com/search?query=${q}`;
    case "stopandshop":
      return `https://www.stopandshop.com/product-search?q=${q}`;
    case "giantfood":
      return `https://giantfood.com/product-search?q=${q}`;
    case "weismarkets":
      return `https://www.weismarkets.com/shop/search-results.html?q=${q}`;
    case "freshdirect":
      return `https://www.freshdirect.com/search?searchTerms=${q}`;
    case "thrivemarket":
      return `https://thrivemarket.com/search?search=${q}`;
    case "boxed":
      return `https://www.boxed.com/search?q=${q}`;
    case "shipt":
      return `https://www.shipt.com/search?q=${q}`;
    case "katespade":
      return `https://www.katespade.com/search?q=${q}`;
    case "samsonite":
      return `https://shop.samsonite.com/search?q=${q}`;
    case "tumi":
      return `https://www.tumi.com/s/US/search?q=${q}`;
    case "longchamp":
      return `https://www.longchamp.com/us/en/search?q=${q}`;
    case "marcjacobs":
      return `https://www.marcjacobs.com/search?q=${q}`;
    case "toryburch":
      return `https://www.toryburch.com/en-us/search?q=${q}`;
    case "rimowa":
      return `https://www.rimowa.com/us/en/search?q=${q}`;
    case "away":
      return `https://www.awaytravel.com/search?q=${q}`;
    case "herschel":
      return `https://herschel.com/search?q=${q}`;
    case "jansport":
      return `https://www.jansport.com/search?q=${q}`;
    case "fjallraven":
      return `https://www.fjallraven.com/us/en-us/search?q=${q}`;
    case "dagnedover":
      return `https://www.dagnedover.com/search?q=${q}`;
    case "beis":
      return `https://beistravel.com/search?q=${q}`;
    case "verabradley":
      return `https://www.verabradley.com/us/search?q=${q}`;
    case "mcm":
      return `https://www.mcmworldwide.com/us/en/search?q=${q}`;
    case "bottegaveneta":
      return `https://www.bottegaveneta.com/en-us/search?q=${q}`;
    case "saintlaurent":
      return `https://www.ysl.com/en-us/search?q=${q}`;
    case "potterybarnkids":
      return `https://www.potterybarnkids.com/search/results.html?words=${q}`;
    case "gerber":
      return `https://www.gerberchildrenswear.com/search?q=${q}`;
    case "buybuybaby":
      return `https://www.buybuybaby.com/s/search?q=${q}`;
    case "hannaandersson":
      return `https://www.hannaandersson.com/search?q=${q}`;
    case "primary":
      return `https://www.primary.com/search?q=${q}`;
    case "monicaandandy":
      return `https://monicaandandy.com/search?q=${q}`;
    case "kytebaby":
      return `https://kytebaby.com/search?q=${q}`;
    case "crateandkids":
      return `https://www.crateandkids.com/search?query=${q}`;
    case "littlesleepies":
      return `https://littlesleepies.com/search?q=${q}`;
    case "poshpeanut":
      return `https://poshpeanut.com/search?q=${q}`;
    case "maisonette":
      return `https://www.maisonette.com/search?q=${q}`;
    case "janieandjack":
      return `https://www.janieandjack.com/search?q=${q}`;
    case "gymboree":
      return `https://www.gymboree.com/search?q=${q}`;
    case "honest":
      return `https://www.honest.com/search?q=${q}`;
    case "burtsbeesbaby":
      return `https://www.burtsbeesbaby.com/search?q=${q}`;
    case "albeebaby":
      return `https://www.albeebaby.com/search?q=${q}`;
    case "marshalls":
      return `https://www.marshalls.com/us/store/shop/?Ntt=${q}`;
    case "basspro":
      return `https://www.basspro.com/l/search?q=${q}`;
    case "cabelas":
      return `https://www.cabelas.com/l/search?q=${q}`;
    case "academy":
      return `https://www.academy.com/search?searchTerm=${q}`;
    case "sportsmanswarehouse":
      return `https://www.sportsmans.com/search?q=${q}`;
    case "scheels":
      return `https://www.scheels.com/search?q=${q}`;
    case "backcountry":
      return `https://www.backcountry.com/search?q=${q}`;
    case "moosejaw":
      return `https://www.moosejaw.com/search?q=${q}`;
    case "evo":
      return `https://www.evo.com/shop?text=${q}`;
    case "sierra":
      return `https://www.sierra.com/search?q=${q}`;
    case "big5":
      return `https://www.big5sportinggoods.com/search?q=${q}`;
    case "hibbett":
      return `https://www.hibbett.com/search?q=${q}`;
    case "dunhams":
      return `https://www.dunhamssports.com/search?q=${q}`;
    case "fleetfeet":
      return `https://www.fleetfeet.com/search?q=${q}`;
    case "orvis":
      return `https://www.orvis.com/search?q=${q}`;
    case "westmarine":
      return `https://www.westmarine.com/search?Ntt=${q}`;
    case "campingworld":
      return `https://www.campingworld.com/search?q=${q}`;
    case "decathlon":
      return `https://www.decathlon.com/us/search?query=${q}`;
    case "publiclands":
      return `https://www.publiclands.com/search?query=${q}`;
    default:
      return googleShoppingFallback(searchQuery);
  }
}

/** Guaranteed-working fallback if a retailer URL pattern fails */
export function googleShoppingFallback(searchQuery: string): string {
  const q = encodeURIComponent(`${searchQuery.trim()} buy`);
  return `https://www.google.com/search?q=${q}&tbm=shop`;
}

export function buildProductSearchUrl(
  retailer: RetailerId,
  brand: string,
  title: string,
  size: string,
  searchContext?: string,
): string {
  const searchQuery = buildStoreSearchQuery(
    { brand, title, size },
    searchContext ? ({ query: searchContext } as ShoppingIntent) : undefined,
  );
  return buildRetailerSearchUrl(retailer, searchQuery);
}

function isRetailerSearchUrl(productUrl: string): boolean {
  try {
    const url = new URL(productUrl);
    const pathQuery = `${url.pathname}${url.search}`.toLowerCase();
    if (/[?&](q|query|keyword|ntt|searchterm|search)=/.test(pathQuery)) {
      return true;
    }
    return /\/search/.test(pathQuery);
  } catch {
    return false;
  }
}

/**
 * Convert any eBay URL into an EPN (eBay Partner Network) affiliate URL.
 * Works on both product pages (/itm/...) and search pages (/sch/...).
 * Falls back to the original URL if campaign ID is missing or URL is malformed.
 */
export function buildEbayAffiliateUrl(productUrl: string): string {
  const campaignId = process.env.AFFILIATE_EBAY_CAMPAIGN_ID?.trim();
  if (!campaignId) return productUrl;
  try {
    const url = new URL(productUrl);
    const marketplaceId =
      process.env.AFFILIATE_EBAY_MARKETPLACE_ID?.trim() ?? "711-53200-19255-0";
    const customId = process.env.AFFILIATE_EBAY_CUSTOM_ID?.trim();
    url.searchParams.set("mkcid", "1");
    url.searchParams.set("mkrid", marketplaceId);
    url.searchParams.set("siteid", "0");
    url.searchParams.set("campid", campaignId);
    url.searchParams.set("toolid", "10001");
    if (customId) url.searchParams.set("customid", customId);
    return url.toString();
  } catch {
    return productUrl;
  }
}

export function buildAffiliateUrl(
  retailer: RetailerId,
  productUrl: string,
): string {
  try {
    // eBay: EPN tracking applies to ALL eBay URLs (product + search).
    // Gated on AFFILIATE_EBAY_CAMPAIGN_ID alone — AFFILIATE_EBAY_TAG is just
    // a marker that the retailer is enrolled; the real tracking ID is the campaign.
    if (retailer === "ebay") {
      return buildEbayAffiliateUrl(productUrl);
    }

    const url = new URL(productUrl);
    const tag = AFFILIATE_TAGS[retailer];
    // Affiliate params on search URLs often break TJX / Oracle Commerce stores.
    if (tag && isRetailerSearchUrl(productUrl)) {
      return productUrl;
    }
    if (tag) {
      switch (retailer) {
        case "amazon":
          url.searchParams.set("tag", tag);
          break;
        case "walmart":
          url.searchParams.set("wmlspartner", tag);
          break;
        case "target":
          url.searchParams.set("afid", tag);
          break;
        default:
          url.searchParams.set("affiliate_id", tag);
      }
    }
    return url.toString();
  } catch {
    return productUrl;
  }
}

/** Build link with retailer name in query for maximum findability */
export function buildStoreProductLink(
  retailer: RetailerId,
  brand: string,
  title: string,
  size: string,
  userQuery?: string,
): string {
  const searchQuery = buildStoreSearchQuery(
    { brand, title, size },
    userQuery ? ({ query: userQuery } as ShoppingIntent) : undefined,
  );
  const url = buildRetailerSearchUrl(retailer, searchQuery);
  return buildAffiliateUrl(retailer, url);
}
