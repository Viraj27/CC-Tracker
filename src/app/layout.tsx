import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppState";
import { Nav } from "@/components/Nav";
import { localToday } from "@/lib/domain/dates";
import { getDb, PROFILE_ID } from "@/lib/server/db";
import { getCatalog } from "@/lib/server/catalogStore";
import { loadUserData } from "@/lib/server/userData";
import "./globals.css";

export const dynamic = "force-dynamic";

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
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1216" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const catalog = await getCatalog(db);
  const data = await loadUserData(db.prisma, PROFILE_ID);
  return (
    <html lang="en">
      <head>
        {/* Static manifest (public/). use-credentials so the request carries the Cloudflare Access cookie. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="min-h-screen">
        <AppProvider catalog={catalog} initialData={data} serverToday={localToday()}>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
