import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isRecycledSeedImage,
  amazonImageId,
  RECYCLED_SEED_IMAGE_IDS,
} from "./recycled-seed-images";

const NINJA_MACBOOK = "https://m.media-amazon.com/images/I/71vFKBpKakL._AC_SL1500_.jpg";
const UNIQUE = "https://m.media-amazon.com/images/I/71dHNGtVqBL._AC_SL1500_.jpg"; // dyson, unique

test("extracts the amazon image id", () => {
  assert.equal(amazonImageId(NINJA_MACBOOK), "71vFKBpKakL");
  assert.equal(amazonImageId("https://placehold.co/500x500/abc/def?text=x"), null);
});

test("flags recycled seed images, trusts unique ones", () => {
  assert.equal(isRecycledSeedImage(NINJA_MACBOOK), true); // 6 products share it
  assert.equal(isRecycledSeedImage(UNIQUE), false); // 1 product
  assert.equal(isRecycledSeedImage(""), false);
  assert.equal(isRecycledSeedImage(undefined), false);
});

// Guard against drift: re-scan the seed graph and ensure EVERY image shared by
// >1 canonical product is in the blocklist. If the seed gains a new recycled
// image, this fails so we update the list (and never leak a wrong photo).
test("blocklist covers every image shared across multiple seed products", () => {
  const dir = join(process.cwd(), "data/intelligence-graph/products");
  const byImage = new Map<string, Set<string>>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      canonical?: { canonical_id?: string; canonical_image?: string };
    };
    const c = data.canonical;
    if (!c?.canonical_image || !c.canonical_id) continue;
    const id = amazonImageId(c.canonical_image);
    if (!id) continue;
    (byImage.get(id) ?? byImage.set(id, new Set()).get(id)!).add(c.canonical_id);
  }
  const shared = [...byImage.entries()].filter(([, ids]) => ids.size > 1).map(([id]) => id);
  for (const id of shared) {
    assert.ok(
      RECYCLED_SEED_IMAGE_IDS.has(id),
      `seed image ${id} is shared by ${byImage.get(id)!.size} products but is NOT blocklisted`,
    );
  }
});
