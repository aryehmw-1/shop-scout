import "server-only";

// Aggregations for the /admin/analytics dashboard. All read-only. Uses Prisma
// groupBy/count for top-N rollups and raw SQL (Postgres date_trunc) for time
// series. Kept in one place so the page stays a thin renderer.

import { prisma } from "../db/prisma";

const DAY = 24 * 60 * 60 * 1000;

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface CountPair {
  label: string;
  count: number;
}
export interface TimePoint {
  bucket: string; // ISO date (day) or period label
  count: number;
}

export interface DashboardData {
  overview: {
    totalSearches: number;
    searchesToday: number;
    searchesWeek: number;
    searchesMonth: number;
    uniqueVisitors: number;
    returningVisitors: number;
    newVisitors: number;
    productClicks: number;
    retailerClicks: number;
    productRequests: number;
  };
  search: {
    topTerms: CountPair[]; // top 100 all-time
    topToday: CountPair[];
    topWeek: CountPair[];
    topMonth: CountPair[];
    noResults: CountPair[]; // queries that returned 0 results
    volumeDaily: TimePoint[]; // last 30 days
    volumeWeekly: TimePoint[]; // last 12 weeks
    volumeMonthly: TimePoint[]; // last 12 months
  };
  missing: {
    requested: CountPair[]; // ProductRequest grouped by query
    searchedMissing: CountPair[]; // MissingProduct grouped by query
    byCategory: CountPair[]; // MissingProduct grouped by category
  };
  products: {
    topProducts: CountPair[]; // most-clicked productIds (with titles)
    topRetailers: CountPair[]; // most-clicked retailers
    retailerCtr: { retailer: string; clicks: number; ctrPct: number }[];
    productCtrPct: number; // product clicks / total searches
    retailerCtrPct: number; // retailer clicks / total searches
  };
  users: {
    returning: number;
    new: number;
    searchesPerUser: number; // avg searches per known user
    topLandingPages: CountPair[];
    requestTrendDaily: TimePoint[];
    retailerClickTrendDaily: TimePoint[];
  };
}

async function topQueries(
  where: Record<string, unknown>,
  take: number,
): Promise<CountPair[]> {
  const rows = await prisma.searchEvent.groupBy({
    by: ["query"],
    where,
    _count: { _all: true },
    orderBy: { _count: { query: "desc" } },
    take,
  });
  return rows.map((r) => ({ label: r.query, count: r._count._all }));
}

async function dailySeries(table: string, days: number): Promise<TimePoint[]> {
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; count: bigint }[]>(
    `SELECT date_trunc('day', "createdAt") AS bucket, COUNT(*)::bigint AS count
     FROM "${table}"
     WHERE "createdAt" >= NOW() - INTERVAL '${days} days'
     GROUP BY 1 ORDER BY 1 ASC`,
  );
  return rows.map((r) => ({ bucket: new Date(r.bucket).toISOString().slice(0, 10), count: Number(r.count) }));
}

async function periodSeries(unit: "week" | "month", periods: number): Promise<TimePoint[]> {
  const interval = unit === "week" ? `${periods * 7} days` : `${periods} months`;
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; count: bigint }[]>(
    `SELECT date_trunc('${unit}', "createdAt") AS bucket, COUNT(*)::bigint AS count
     FROM "SearchEvent"
     WHERE "createdAt" >= NOW() - INTERVAL '${interval}'
     GROUP BY 1 ORDER BY 1 ASC`,
  );
  return rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString().slice(0, 10),
    count: Number(r.count),
  }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const today = startOfTodayUtc();
  const week = new Date(Date.now() - 7 * DAY);
  const month = new Date(Date.now() - 30 * DAY);

  const [
    totalSearches,
    searchesToday,
    searchesWeek,
    searchesMonth,
    productClicks,
    retailerClicks,
    productRequests,
    visitorRows,
    knownUserRows,
  ] = await Promise.all([
    prisma.searchEvent.count(),
    prisma.searchEvent.count({ where: { createdAt: { gte: today } } }),
    prisma.searchEvent.count({ where: { createdAt: { gte: week } } }),
    prisma.searchEvent.count({ where: { createdAt: { gte: month } } }),
    prisma.productClick.count({ where: { kind: "product" } }),
    prisma.productClick.count({ where: { kind: "retailer" } }),
    prisma.productRequest.count(),
    // visitors: searches grouped by session, to derive unique + returning.
    prisma.searchEvent.groupBy({
      by: ["sessionId"],
      where: { sessionId: { not: null } },
      _count: { _all: true },
    }),
    prisma.searchEvent.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const uniqueVisitors = visitorRows.length;
  const returningVisitors = visitorRows.filter((v) => v._count._all > 1).length;
  const newVisitors = uniqueVisitors - returningVisitors;

  const [topTerms, topToday, topWeek, topMonth] = await Promise.all([
    topQueries({}, 100),
    topQueries({ createdAt: { gte: today } }, 25),
    topQueries({ createdAt: { gte: week } }, 25),
    topQueries({ createdAt: { gte: month } }, 25),
  ]);

  const noResultsRows = await prisma.searchEvent.groupBy({
    by: ["query"],
    where: { resultsCount: 0 },
    _count: { _all: true },
    orderBy: { _count: { query: "desc" } },
    take: 50,
  });
  const noResults = noResultsRows.map((r) => ({ label: r.query, count: r._count._all }));

  const [volumeDaily, volumeWeekly, volumeMonthly] = await Promise.all([
    dailySeries("SearchEvent", 30),
    periodSeries("week", 12),
    periodSeries("month", 12),
  ]);

  // Missing products.
  const [requestedRows, missingRows, missingCatRows] = await Promise.all([
    prisma.productRequest.groupBy({
      by: ["productQuery"],
      _count: { _all: true },
      orderBy: { _count: { productQuery: "desc" } },
      take: 50,
    }),
    prisma.missingProduct.groupBy({
      by: ["query"],
      _count: { _all: true },
      orderBy: { _count: { query: "desc" } },
      take: 50,
    }),
    prisma.missingProduct.groupBy({
      by: ["category"],
      where: { category: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 25,
    }),
  ]);

  // Product performance.
  const [productClickRows, retailerClickRows] = await Promise.all([
    prisma.productClick.groupBy({
      by: ["productId"],
      where: { kind: "product", productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 25,
    }),
    prisma.productClick.groupBy({
      by: ["retailer"],
      where: { kind: "retailer", retailer: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { retailer: "desc" } },
      take: 25,
    }),
  ]);

  // Resolve product titles for the clicked productIds.
  // Clicks store the product's catalogId; resolve titles by catalogId (fall back
  // to id in case some rows stored a raw Product.id).
  const clickedIds = productClickRows.map((r) => r.productId).filter(Boolean) as string[];
  const titleRows = clickedIds.length
    ? await prisma.product.findMany({
        where: { OR: [{ catalogId: { in: clickedIds } }, { id: { in: clickedIds } }] },
        select: { id: true, catalogId: true, title: true },
      })
    : [];
  const titleById = new Map<string, string>();
  for (const t of titleRows) {
    titleById.set(t.catalogId, t.title);
    titleById.set(t.id, t.title);
  }

  const topProducts = productClickRows.map((r) => ({
    label: (r.productId && titleById.get(r.productId)) || r.productId || "unknown",
    count: r._count._all,
  }));
  const topRetailers = retailerClickRows.map((r) => ({ label: r.retailer ?? "unknown", count: r._count._all }));

  const retailerCtr = retailerClickRows.map((r) => ({
    retailer: r.retailer ?? "unknown",
    clicks: r._count._all,
    ctrPct: totalSearches > 0 ? Math.round((r._count._all / totalSearches) * 1000) / 10 : 0,
  }));
  const productCtrPct = totalSearches > 0 ? Math.round((productClicks / totalSearches) * 1000) / 10 : 0;
  const retailerCtrPct = totalSearches > 0 ? Math.round((retailerClicks / totalSearches) * 1000) / 10 : 0;

  // User behavior.
  const searchesByKnownUser = knownUserRows.reduce((a, r) => a + r._count._all, 0);
  const searchesPerUser = knownUserRows.length > 0 ? Math.round((searchesByKnownUser / knownUserRows.length) * 10) / 10 : 0;

  const landingRows = await prisma.searchEvent.groupBy({
    by: ["pageUrl"],
    where: { pageUrl: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { pageUrl: "desc" } },
    take: 15,
  });
  const topLandingPages = landingRows.map((r) => ({ label: r.pageUrl ?? "unknown", count: r._count._all }));

  const [requestTrendDaily, retailerClickTrendDaily] = await Promise.all([
    dailySeries("ProductRequest", 30),
    prisma.$queryRawUnsafe<{ bucket: Date; count: bigint }[]>(
      `SELECT date_trunc('day', "createdAt") AS bucket, COUNT(*)::bigint AS count
       FROM "ProductClick" WHERE "kind" = 'retailer' AND "createdAt" >= NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1 ASC`,
    ).then((rows) => rows.map((r) => ({ bucket: new Date(r.bucket).toISOString().slice(0, 10), count: Number(r.count) }))),
  ]);

  return {
    overview: {
      totalSearches,
      searchesToday,
      searchesWeek,
      searchesMonth,
      uniqueVisitors,
      returningVisitors,
      newVisitors,
      productClicks,
      retailerClicks,
      productRequests,
    },
    search: {
      topTerms,
      topToday,
      topWeek,
      topMonth,
      noResults,
      volumeDaily,
      volumeWeekly,
      volumeMonthly,
    },
    missing: {
      requested: requestedRows.map((r) => ({ label: r.productQuery, count: r._count._all })),
      searchedMissing: missingRows.map((r) => ({ label: r.query, count: r._count._all })),
      byCategory: missingCatRows.map((r) => ({ label: r.category ?? "uncategorized", count: r._count._all })),
    },
    products: {
      topProducts,
      topRetailers,
      retailerCtr,
      productCtrPct,
      retailerCtrPct,
    },
    users: {
      returning: returningVisitors,
      new: newVisitors,
      searchesPerUser,
      topLandingPages,
      requestTrendDaily,
      retailerClickTrendDaily,
    },
  };
}
