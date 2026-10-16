import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (force-dynamic in the root layout) and reads D1, so
// no incremental cache (R2/KV) is needed.
export default defineCloudflareConfig({});
