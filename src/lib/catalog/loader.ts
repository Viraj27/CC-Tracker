/**
 * Standalone catalog loader: reads `catalog/`, validates it with zod and
 * computes a content hash. No Next.js or database dependencies, so scripts
 * and future automation (v2) can use it directly.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  type Catalog,
  CardSchema,
  PerkDefaultsFileSchema,
  ProgramsFileSchema,
  RotatingProgramSchema,
  RulesFileSchema,
} from "./schema";

export class CatalogError extends Error {}

export function defaultCatalogDir(): string {
  return process.env.CATALOG_DIR ?? path.join(process.cwd(), "catalog");
}

function listYaml(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => path.join(dir, f));
}

function parseFile<T>(file: string, schema: z.ZodType<T>, hasher: ReturnType<typeof createHash>, root: string): T {
  const text = fs.readFileSync(file, "utf8");
  hasher.update(path.relative(root, file)).update("\0").update(text).update("\0");
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (e) {
    throw new CatalogError(`${file}: invalid YAML: ${(e as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new CatalogError(`${file}: catalog validation failed\n${issues}`);
  }
  return result.data;
}

export function loadCatalog(dir: string = defaultCatalogDir()): Catalog {
  const hasher = createHash("sha256");
  const cards = listYaml(path.join(dir, "cards")).map((f) => {
    const card = parseFile(f, CardSchema, hasher, dir);
    if (path.basename(f).replace(/\.ya?ml$/, "") !== card.id) {
      throw new CatalogError(`${f}: file name must match card id "${card.id}"`);
    }
    return card;
  });
  const rules = listYaml(path.join(dir, "rules")).flatMap(
    (f) => parseFile(f, RulesFileSchema, hasher, dir).rules,
  );
  const perkFile = path.join(dir, "perk-defaults.yaml");
  const perkDefaults = fs.existsSync(perkFile)
    ? parseFile(perkFile, PerkDefaultsFileSchema, hasher, dir).perks
    : [];
  const programsFile = path.join(dir, "programs.yaml");
  const programs = fs.existsSync(programsFile)
    ? parseFile(programsFile, ProgramsFileSchema, hasher, dir).programs
    : [];
  const rotating = listYaml(path.join(dir, "rotating")).map((f) =>
    parseFile(f, RotatingProgramSchema, hasher, dir),
  );

  const catalog: Catalog = { hash: hasher.digest("hex"), cards, rules, perkDefaults, programs, rotating };
  checkReferences(catalog);
  return catalog;
}

/** Cross-file integrity checks that zod cannot express per file. */
export function checkReferences(c: Catalog): void {
  const errors: string[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${kind} id "${id}"`);
      seen.add(id);
    }
  };
  dup("card", c.cards.map((x) => x.id));
  dup("rule", c.rules.map((x) => x.id));
  dup("perk default", c.perkDefaults.map((x) => x.id));
  dup("program", c.programs.map((x) => x.id));

  const cardIds = new Set(c.cards.map((x) => x.id));
  const perkIds = new Set(c.perkDefaults.map((x) => x.id));
  const programIds = new Set(c.programs.map((x) => x.id));
  const rotatingIds = new Set(c.rotating.map((x) => x.id));

  for (const card of c.cards) {
    dup(`benefit (card ${card.id})`, card.benefits.map((b) => b.id));
    if (!programIds.has(card.rewards_program)) {
      errors.push(`card ${card.id}: unknown rewards_program "${card.rewards_program}"`);
    }
    if (card.rotating_program && !rotatingIds.has(card.rotating_program)) {
      errors.push(`card ${card.id}: unknown rotating_program "${card.rotating_program}"`);
    }
    for (const b of card.benefits) {
      if (b.perk_default && !perkIds.has(b.perk_default)) {
        errors.push(`card ${card.id} benefit ${b.id}: unknown perk_default "${b.perk_default}"`);
      }
    }
    for (const d of card.downgrade_options) {
      if (d.target_card_id && !cardIds.has(d.target_card_id)) {
        errors.push(`card ${card.id}: downgrade target_card_id "${d.target_card_id}" not in catalog`);
      }
    }
  }
  const families = new Set(c.cards.map((x) => x.family).filter((f): f is string => !!f));
  for (const r of c.rules) {
    for (const f of r.applies_to?.families ?? []) {
      if (!families.has(f)) errors.push(`rule ${r.id}: applies_to family "${f}" is not used by any card`);
    }
  }
  for (const r of c.rotating) {
    for (const id of r.card_ids) {
      if (!cardIds.has(id)) errors.push(`rotating ${r.id}: unknown card "${id}"`);
    }
  }
  if (errors.length) throw new CatalogError(`catalog reference errors:\n  - ${errors.join("\n  - ")}`);
}
