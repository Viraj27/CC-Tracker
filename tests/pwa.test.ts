import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pub = (...p: string[]) => path.join(process.cwd(), "public", ...p);
const manifest = JSON.parse(fs.readFileSync(pub("manifest.webmanifest"), "utf8"));

/** Width/height and color type from a PNG's IHDR chunk. */
function pngInfo(file: string) {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex"), file).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("web app manifest", () => {
  it("has the installability fields", () => {
    expect(manifest.name).toBe("CC-Tracker");
    expect(manifest.short_name).toBe("CC-Tracker");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("lists 192px and 512px PNG icons (plus maskable) that exist at their declared size", () => {
    const sizes = new Set<string>();
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      const { width, height } = pngInfo(pub(icon.src));
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
      sizes.add(`${icon.sizes}:${icon.purpose ?? "any"}`);
    }
    expect(sizes).toContain("192x192:any");
    expect(sizes).toContain("512x512:any");
    expect(sizes).toContain("512x512:maskable");
  });

  it("has a 180px Apple touch icon", () => {
    expect(pngInfo(pub("icons", "apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("is linked with credentials (Cloudflare Access) and iOS meta is configured", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/rel="manifest" href="\/manifest\.webmanifest" crossOrigin="use-credentials"/);
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("/icons/apple-touch-icon.png");
    expect(layout).toContain('viewportFit: "cover"');
  });

  it("registers no service worker, so pages and data are never served from a stale cache", () => {
    const files = fs.readdirSync(path.join(process.cwd(), "src"), { recursive: true, encoding: "utf8" });
    for (const f of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
      expect(fs.readFileSync(path.join(process.cwd(), "src", f), "utf8"), f).not.toContain("serviceWorker");
    }
    expect(fs.existsSync(pub("sw.js"))).toBe(false);
  });
});
