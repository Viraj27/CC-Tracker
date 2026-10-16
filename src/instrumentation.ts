// Runs once when the Next.js server starts: load catalog/ into the DB so the
// first request doesn't pay for it. Catalog loads never touch user data.
// On Cloudflare Workers the D1 binding only exists inside a request, so
// there the catalog is synced on the first request instead (same hash rule).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isCloudflareWorker } = await import("./lib/server/dbHandle");
  if (isCloudflareWorker()) return;
  const { getDb } = await import("./lib/server/db");
  const { getCatalog } = await import("./lib/server/catalogStore");
  const catalog = await getCatalog(await getDb());
  console.log(`[cc-tracker] catalog loaded: ${catalog.cards.length} cards (hash ${catalog.hash.slice(0, 12)})`);
}
