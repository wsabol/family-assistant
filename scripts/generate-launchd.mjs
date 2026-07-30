import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(root, "launchd-template");
const outDir = join(root, "launchd");

mkdirSync(outDir, { recursive: true });

const templates = readdirSync(templateDir).filter((name) => name.endsWith(".plist"));

if (templates.length === 0) {
  console.error(`No plist templates found in ${templateDir}`);
  process.exit(1);
}

for (const name of templates) {
  const content = readFileSync(join(templateDir, name), "utf8");
  writeFileSync(
    join(outDir, name),
    content.replaceAll("REPLACE_WITH_PROJECT", root),
    "utf8",
  );
  console.log(`Wrote ${join(outDir, name)}`);
}

console.log(`Generated ${templates.length} launchd plist(s) for ${root}`);
