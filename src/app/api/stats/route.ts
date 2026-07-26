/**
 * GET /api/stats
 *
 * Returns TVL, total user count, and a 24-h sparkline.
 * Response is cached by Next.js and revalidated every 60 seconds so
 * all clients see fresh data without hammering the RPC.
 *
 * Note: this route requires a Node.js runtime (Vercel / `next start`).
 * When building for static export (NEXT_EXPORT=true / GitHub Pages), set
 * output: "export" in next.config.ts — the export skips this route and the
 * frontend hook falls back to querying Horizon directly from the browser.
 */

import { NextResponse } from "next/server";
import { fetchStats } from "@/lib/stats";

export const revalidate = 60;

export async function GET() {
  try {
    const stats = await fetchStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[/api/stats]", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
