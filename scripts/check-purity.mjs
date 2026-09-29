/**
 * `core` and `fig-clipboard` must not depend on extension APIs (PRD §4.3):
 * all the correctness risk lives there and it has to be testable without a
 * browser extension harness. Their tsconfigs already exclude the chrome
 * types; this catches what types cannot, such as string-keyed access and
 * imports of extension-only packages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PURE_PACKAGES = ["packages/core", "packages/fig-clipboard"];

const FORBIDDEN = [
  {
    pattern:
      /\b(?:chrome|browser)\.(?:runtime|tabs|scripting|storage|action|extension|webRequest|permissions)\b/,
    why: "extension API",
  },
  { pattern: /\bglobalThis\.(?:chrome|browser)\b/, why: "extension API" },
  {
    pattern: /from\s+["'](?:wxt|wxt\/[^"']*|webextension-polyfill|@wxt-dev\/[^"']*)["']/,
    why: "extension-only import",
  },
  { pattern: /from\s+["']@conjure\/extension[^"']*["']/, why: "imports the extension package" },
];

/** fig-clipboard may use core's types, never its runtime. */
const TYPE_ONLY = [
  {
    pkg: "packages/fig-clipboard",
    pattern: /^import\s+(?!type\b)[^;]*from\s+["']@conjure\/core["']/m,
    why: "runtime import of @conjure/core (use `import type`)",
  },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(?:ts|tsx|mts|js|mjs)$/.test(name)) yield path;
  }
}

const violations = [];
for (const pkg of PURE_PACKAGES) {
  for (const file of walk(join(ROOT, pkg))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) {
          violations.push(`${relative(ROOT, file)}:${index + 1}  ${rule.why}: ${line.trim()}`);
        }
      }
    });
    const text = lines.join("\n");
    for (const rule of TYPE_ONLY) {
      if (pkg === rule.pkg && rule.pattern.test(text)) {
        violations.push(`${relative(ROOT, file)}  ${rule.why}`);
      }
    }
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, pkg, "package.json"), "utf8"));
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (/^(?:wxt|@wxt-dev\/|webextension-polyfill|@types\/chrome|@conjure\/extension)/.test(dep)) {
      violations.push(`${pkg}/package.json  depends on ${dep}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Purity check failed:\n");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log(`Purity check passed: ${PURE_PACKAGES.join(", ")}`);
