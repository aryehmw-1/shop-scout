import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.systemConfig.upsert({
    where: { key: "price_quote_ttl_minutes" },
    create: { key: "price_quote_ttl_minutes", valueJson: "30" },
    update: { valueJson: "30" },
  });
  await prisma.systemConfig.upsert({
    where: { key: "search_cache_ttl_minutes" },
    create: { key: "search_cache_ttl_minutes", valueJson: "15" },
    update: { valueJson: "15" },
  });
  console.info("System config seeded. Run search once to sync catalog products.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
