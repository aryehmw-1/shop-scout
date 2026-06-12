/**
 * Seed RetailerSource rows for the priority retailers FROM THE CONFIG REGISTRY —
 * no duplicated retailer-specific code. Idempotent (upsert). Run AFTER applying
 * the verification-pipeline migration:
 *
 *   npx prisma migrate deploy
 *   npx tsx scripts/seed-retailer-sources.ts
 *
 * A retailer with no Bright Data dataset id yet (env unset) is seeded INACTIVE so
 * it never runs until you provide its dataset id.
 */
import { PrismaClient } from "@prisma/client";
import { allRetailerConfigs, brightDataDatasetIdFor } from "../src/lib/pipeline/ingestion/retailer-config";
import { TOP_RETAILERS } from "../src/lib/pipeline/sourcing/retailer-strategy";

const prisma = new PrismaClient();

async function main() {
  for (const config of allRetailerConfigs()) {
    const datasetId = brightDataDatasetIdFor(config) ?? `PENDING_${config.retailer.toUpperCase()}`;
    const hasDataset = !datasetId.startsWith("PENDING_");
    const priority = TOP_RETAILERS.indexOf(config.retailer);

    const row = await prisma.retailerSource.upsert({
      where: {
        retailerDomain_brightDataDatasetId: {
          retailerDomain: config.domain,
          brightDataDatasetId: datasetId,
        },
      },
      update: {
        retailerName: config.name,
        inputType: config.inputType,
        sourceMode: config.defaultSourceMode,
        priority: priority >= 0 ? priority : 100,
        active: config.enabled && hasDataset && config.defaultSourceMode !== "disabled",
      },
      create: {
        retailerName: config.name,
        retailerDomain: config.domain,
        brightDataDatasetId: datasetId,
        inputType: config.inputType,
        sourceMode: config.defaultSourceMode,
        priority: priority >= 0 ? priority : 100,
        active: config.enabled && hasDataset && config.defaultSourceMode !== "disabled",
      },
    });

    console.log(
      `  ${row.active ? "✓" : "·"} ${config.name.padEnd(12)} mode=${row.sourceMode.padEnd(12)} ` +
        `priority=${row.priority} dataset=${hasDataset ? "set" : "PENDING (inactive)"}`,
    );
  }
  console.log("\nDone. Set BRIGHT_DATA_DATASET_<RETAILER> env vars to activate pending retailers.");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
