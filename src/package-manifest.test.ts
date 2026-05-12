import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PackageJson = {
  files?: string[];
  pi?: { extensions?: string[] };
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
}

test("published pi extension entries point at compiled JavaScript", () => {
  const pkg = readPackageJson();
  const extensions = pkg.pi?.extensions ?? [];

  expect(extensions.length).toBeGreaterThan(0);
  expect(extensions.every((entry) => entry.startsWith("./dist/extensions/"))).toBe(true);
  expect(extensions.every((entry) => entry.endsWith(".js"))).toBe(true);
});

test("published package does not include TypeScript source trees used only for development", () => {
  const pkg = readPackageJson();

  expect(pkg.files ?? []).toContain("dist");
  expect(pkg.files ?? []).not.toContain("src");
  expect(pkg.files ?? []).not.toContain("extensions");
});
