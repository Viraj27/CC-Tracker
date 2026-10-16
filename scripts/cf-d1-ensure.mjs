// CI helper (deploy job): find the `cc-tracker` D1 database in the Cloudflare
// account, create it on the very first deploy, and write its id into
// wrangler.jsonc in the CI workspace only. Keeps account-specific ids out of
// the repo. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the env.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NAME = "cc-tracker";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const configPath = path.join(process.cwd(), "wrangler.jsonc");
const wrangler = path.join(process.cwd(), "node_modules", ".bin", "wrangler");

for (const v of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
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
fs.writeFileSync(configPath, config.replace(PLACEHOLDER, id));
console.log("wrangler.jsonc: database_id set for this CI run (not committed).");
