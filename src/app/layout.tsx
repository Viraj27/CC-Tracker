import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Space_Mono } from "next/font/google";
import { AppProvider } from "@/components/AppState";
import { SheetHost } from "@/components/CardSheets";
import { SheetProvider } from "@/components/Sheet";
import { Nav, TabBar } from "@/components/Nav";
import { localToday } from "@/lib/domain/dates";
import { getDb, PROFILE_ID } from "@/lib/server/db";
import { getCatalog } from "@/lib/server/catalogStore";
import { loadUserData } from "@/lib/server/userData";
import "./globals.css";

export const dynamic = "force-dynamic";

// Self-hosted at build time by next/font (no runtime requests to Google).
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hanken", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CC-Tracker",
  description: "Personal credit card tracker: benefits, annual fees, payments and 5/24.",
  applicationName: "CC-Tracker",
  // iOS "Add to Home Screen": standalone app with its own title and icon.
  appleWebApp: { capable: true, title: "CC-Tracker", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page extend under the notch / home indicator; globals.css pads by the safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7e5e0" },
    { media: "(prefers-color-scheme: dark)", color: "#141518" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const catalog = await getCatalog(db);
  const data = await loadUserData(db.prisma, PROFILE_ID);
  return (
    <html lang="en" className={`${hanken.variable} ${spaceMono.variable}`}>
      <head>
        {/* Static manifest (public/). use-credentials so the request carries the Cloudflare Access cookie. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="min-h-screen">
        <AppProvider catalog={catalog} initialData={data} serverToday={localToday()}>
          <SheetProvider>
            <Nav />
            {/* Phones have no top bar: pad for the notch. Bottom padding keeps content clear of the phone tab bar. */}
            <main className="mx-auto max-w-6xl px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:pt-6 lg:pb-16">
              {children}
            </main>
            <TabBar />
            <SheetHost />
          </SheetProvider>
        </AppProvider>
      </body>
    </html>
  );
}
