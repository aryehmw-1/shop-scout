/**
 * Shop Scout's own price database — one check per product per day.
 * Stores prices + photo URLs in SQLite/Postgres; searches read this DB only.
 */
export {
  runNightlyPriceIndex as runDailyPriceCheck,
  indexCatalogItemNightly as indexCatalogItemDaily,
  purgeExpiredPriceQuotes,
  type NightlyIndexReport as DailyCheckReport,
  type NightlyIndexOptions as DailyCheckOptions,
} from "../indexing/nightly-quotes";

export { ownDbHistoryDays, searchUsesOwnDbOnly, DAILY_INDEX_SOURCE } from "./config";
