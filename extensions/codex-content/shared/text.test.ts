import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { shortenPath } from "./text.ts";

test("shortenPath renders cwd files relative to the root cwd", () => {
  const cwd = process.cwd();

  assert.equal(shortenPath(path.join(cwd, "src", "app.ts")), path.join("src", "app.ts"));
  assert.equal(shortenPath("src/app.ts"), path.join("src", "app.ts"));
  assert.equal(shortenPath(cwd), ".");
});

test("shortenPath keeps files outside cwd as absolute paths", () => {
  const outsidePath = path.resolve(process.cwd(), "..", "external.txt");

  assert.equal(shortenPath(outsidePath), outsidePath);
  assert.equal(shortenPath("../external.txt"), outsidePath);
});
