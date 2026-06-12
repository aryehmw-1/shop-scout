import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logValidation } from "@/lib/pipeline/validation-log";
import type { ProcessingStatus } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

/**
 * Product-level admin actions for the validation console:
 *   publish | unpublish | reject | revalidate | merge | split
 *
 * These operate on canonical Products (the raw-record actions live in
 * /api/admin/product-validation). Every action writes a ValidationLog entry.
 */
type Action = "publish" | "unpublish" | "reject" | "revalidate" | "merge" | "split";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    productId?: string;
    action?: Action;
    /** merge: the product to merge INTO (survivor). split: new raw status. */
    targetProductId?: string;
    adminUserId?: string;
  };

  if (!body.productId || !body.action) {
    return NextResponse.json({ error: "productId and action required" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: body.productId } });
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  const log = (newStatus: ProcessingStatus, reasons: string[], pid = product.id) =>
    logValidation({
      productId: pid,
      oldStatus: product.processingStatus as ProcessingStatus,
      newStatus,
      reasons,
      adminOverride: true,
      adminUserId: body.adminUserId,
    });

  switch (body.action) {
    case "publish": {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          published: true,
          validationStatus: "approved",
          processingStatus: "PUBLISHED",
          lastVerifiedAt: new Date(),
        },
      });
      await log("PUBLISHED", ["admin_publish"]);
      return NextResponse.json({ ok: true });
    }

    case "unpublish": {
      // Hidden from public search immediately (the gate requires published+approved).
      await prisma.product.update({
        where: { id: product.id },
        data: { published: false, processingStatus: "NEEDS_REVIEW" },
      });
      await log("NEEDS_REVIEW", ["admin_unpublish"]);
      return NextResponse.json({ ok: true });
    }

    case "reject": {
      await prisma.product.update({
        where: { id: product.id },
        data: { published: false, validationStatus: "rejected", processingStatus: "REJECTED" },
      });
      await log("REJECTED", ["admin_reject"]);
      return NextResponse.json({ ok: true });
    }

    case "revalidate": {
      // Send back to review so the pipeline / a human re-checks it. Hidden until
      // it is re-approved.
      await prisma.product.update({
        where: { id: product.id },
        data: { published: false, validationStatus: "needs_review", processingStatus: "CHECKED" },
      });
      await log("CHECKED", ["admin_revalidate"]);
      return NextResponse.json({ ok: true });
    }

    case "merge": {
      // Move every offer/identity/history off the duplicate onto the survivor,
      // then unpublish the duplicate. Survivor = targetProductId.
      if (!body.targetProductId || body.targetProductId === product.id) {
        return NextResponse.json(
          { error: "merge requires a different targetProductId (survivor)" },
          { status: 400 },
        );
      }
      const survivor = await prisma.product.findUnique({ where: { id: body.targetProductId } });
      if (!survivor) return NextResponse.json({ error: "survivor not found" }, { status: 404 });

      const groupId = survivor.duplicateGroupId ?? product.duplicateGroupId ?? survivor.id;
      await prisma.$transaction([
        prisma.priceQuote.updateMany({
          where: { productId: product.id },
          data: { productId: survivor.id, duplicateGroupId: groupId },
        }),
        prisma.priceHistory.updateMany({
          where: { productId: product.id },
          data: { productId: survivor.id },
        }),
        prisma.priceHistorySnapshot.updateMany({
          where: { productId: product.id },
          data: { productId: survivor.id },
        }),
        prisma.productIdentifier.updateMany({
          where: { productId: product.id },
          data: { productId: survivor.id },
        }),
        prisma.rawProductRecord.updateMany({
          where: { matchedProductId: product.id },
          data: { matchedProductId: survivor.id, duplicateGroupId: groupId },
        }),
        prisma.product.update({
          where: { id: survivor.id },
          data: { duplicateGroupId: groupId, published: true, validationStatus: "approved" },
        }),
        // The merged-away product is retired: unpublished + marked duplicate.
        prisma.product.update({
          where: { id: product.id },
          data: { published: false, processingStatus: "STALE", duplicateGroupId: groupId },
        }),
      ]);
      await log("STALE", [`admin_merge_into:${survivor.id}`]);
      await logValidation({
        productId: survivor.id,
        newStatus: "PUBLISHED",
        reasons: [`admin_merge_from:${product.id}`],
        adminOverride: true,
        adminUserId: body.adminUserId,
      });
      return NextResponse.json({ ok: true, survivorId: survivor.id });
    }

    case "split": {
      // Detach a wrongly-grouped product: clear its group and send to review so
      // it can be re-validated as its own identity. Quotes stay with it.
      await prisma.product.update({
        where: { id: product.id },
        data: {
          duplicateGroupId: null,
          published: false,
          validationStatus: "needs_review",
          processingStatus: "NEEDS_REVIEW",
        },
      });
      await prisma.priceQuote.updateMany({
        where: { productId: product.id },
        data: { duplicateGroupId: null },
      });
      await log("NEEDS_REVIEW", ["admin_split"]);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `unknown action ${body.action}` }, { status: 400 });
  }
}
