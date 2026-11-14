// CI helper (deploy job): find the `cc-tracker` D1 database in the Cloudflare
// account, create it on the very first deploy, and write its id into
// wrangler.jsonc in the CI workspace only. Keeps account-specific ids out of
// the repo. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the env.
//
//   node scripts/cf-d1-ensure.mjs                     production: cc-tracker, edits wrangler.jsonc in place (CI only)
//   node scripts/cf-d1-ensure.mjs --staging           staging: cc-tracker-staging, writes wrangler.staging.local.jsonc
//                                                     (gitignored) and never touches wrangler.jsonc
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const staging = process.argv.includes("--staging");
const NAME = staging ? "cc-tracker-staging" : "cc-tracker";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const configPath = path.join(process.cwd(), staging ? "wrangler.staging.jsonc" : "wrangler.jsonc");
const outPath = path.join(process.cwd(), staging ? "wrangler.staging.local.jsonc" : "wrangler.jsonc");
const wrangler = path.join(process.cwd(), "node_modules", ".bin", "wrangler");

// Locally, staging may use a `wrangler login` session instead of a token; production never runs outside CI.
for (const v of staging ? [] : ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
  if (!process.env[v]) {
    console.error(`${v} is not set (add it as a GitHub Actions secret; see docs/DEPLOY.md).`);
    process.exit(1);
  }
}

const run = (args) => execFileSync(wrangler, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const find = () => {
  const list = JSON.parse(run(["d1", "list", "--json"]));
  return list.find((db) => db.name === NAME)?.uuid;
};

let id = find();
if (id) {
  console.log(`D1 database "${NAME}" found.`);
} else {
  console.log(`D1 database "${NAME}" not found — creating it (first deploy).`);
  run(["d1", "create", NAME]);
  id = find();
  if (!id) throw new Error(`Created D1 database "${NAME}" but could not find it in \`wrangler d1 list\`.`);
}

const config = fs.readFileSync(configPath, "utf8");
if (!config.includes(PLACEHOLDER)) throw new Error(`wrangler.jsonc has no database_id placeholder (${PLACEHOLDER}).`);
if (!config.includes(`"database_name": "${NAME}"`)) throw new Error(`${path.basename(configPath)} does not name the D1 database "${NAME}".`);
fs.writeFileSync(outPath, config.replace(PLACEHOLDER, id));
console.log(`${path.basename(outPath)}: database_id set (not committed).`);
