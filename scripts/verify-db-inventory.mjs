import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const query = process.argv.find((arg) => arg.startsWith("--query="))?.slice("--query=".length) ?? "cheerios";

function normalize(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

try {
  const q = normalize(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: query } },
        { brand: { contains: query } },
        ...tokens.map((token) => ({ keywordsJson: { contains: token } })),
      ],
    },
    include: {
      priceQuotes: {
        where: {
          source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
        },
        orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
        take: 20,
      },
      identifiers: true,
    },
    take: 10,
  });

  const withOffers = products.filter((product) => product.priceQuotes.length > 0);
  const first = withOffers[0];
  const providerRows = first?.priceQuotes.filter((quote) => quote.providerSource) ?? [];

  console.log(JSON.stringify({
    ok: Boolean(first && first.priceQuotes.length),
    query,
    productCount: products.length,
    productsWithOffers: withOffers.length,
    firstProduct: first ? {
      catalogId: first.catalogId,
      title: first.title,
      quoteCount: first.priceQuotes.length,
      providerQuoteCount: providerRows.length,
      firstQuote: first.priceQuotes[0] ? {
        retailerId: first.priceQuotes[0].retailerId,
        source: first.priceQuotes[0].source,
        providerSource: first.priceQuotes[0].providerSource,
        priceUsd: first.priceQuotes[0].priceUsd,
        shippingUsd: first.priceQuotes[0].shippingUsd,
        deliveredTotalUsd: first.priceQuotes[0].deliveredTotalUsd,
        sourceLabel: first.priceQuotes[0].sourceLabel,
        sellerName: first.priceQuotes[0].sellerName,
        condition: first.priceQuotes[0].condition,
      } : null,
    } : null,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
