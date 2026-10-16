// Runs once when the Next.js server starts: load catalog/ into the DB so the
// first request doesn't pay for it. Catalog loads never touch user data.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prisma } = await import("./lib/server/db");
  const { getCatalog } = await import("./lib/server/catalogStore");
  const catalog = await getCatalog(prisma);
  console.log(`[cc-tracker] catalog loaded: ${catalog.cards.length} cards (hash ${catalog.hash.slice(0, 12)})`);
}
