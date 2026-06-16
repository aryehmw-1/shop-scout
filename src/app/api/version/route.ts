import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Reports the deployed build so we can confirm what's actually live in production
 * (Vercel injects VERCEL_GIT_* at build time). Hit /api/version on any host to
 * see the commit currently serving that environment.
 */
export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    shortCommit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    region: process.env.VERCEL_REGION ?? null,
    builtAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  });
}
