/**
 * Sync variant groups from the in-code catalog (primary path).
 * Legacy color-on-variant migration only runs when old orphan rows exist.
 *
 *   npm run db:backfill-variant-groups
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function runCatalogSync() {
  execSync("npx tsx scripts/sync-catalog.ts", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  const before = await prisma.variantGroup.count();

  console.log("[backfill-variant-groups] syncing catalog → database …");
  await runCatalogSync();

  const after = await prisma.variantGroup.count();

  console.log("[backfill-variant-groups] done", {
    variantGroupsBefore: before,
    variantGroupsAfter: after,
    catalogGroupsAdded: after - before,
  });

  if (after === 0) {
    console.warn(
      "\nNo VariantGroup rows in DB. Only catalog items with `variantGroups` in catalog.ts get groups",
      "(e.g. Levi's jeans). Most pantry SKUs are single-SKU products with no color variants.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
