import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppState";
import { Nav } from "@/components/Nav";
import { localToday } from "@/lib/domain/dates";
import { PROFILE_ID, prisma } from "@/lib/server/db";
import { getCatalog } from "@/lib/server/catalogStore";
import { loadUserData } from "@/lib/server/userData";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CC-Tracker",
  description: "Personal credit card tracker: benefits, annual fees, payments and 5/24.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1216" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getCatalog(prisma);
  const data = await loadUserData(prisma, PROFILE_ID);
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppProvider catalog={catalog} initialData={data} serverToday={localToday()}>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
