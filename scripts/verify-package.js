const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(process.argv[2]);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "MANIFEST.json"), "utf8"),
);
for (const entry of manifest.files) {
  const target = path.resolve(root, entry.path),
    relative = path.relative(root, target);
  assert.ok(
    !relative.startsWith("..") && !path.isAbsolute(relative),
    "Invalid manifest path",
  );
  assert.equal(
    createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    entry.sha256,
    entry.path,
  );
}
for (const name of ["data", ".env", "test-data", "tests", "scripts"])
  assert.equal(
    fs.existsSync(path.join(root, name)),
    false,
    `Unexpected private or test path: ${name}`,
  );
assert.ok(fs.existsSync(path.join(root, "runtime", "node.exe")));
assert.ok(fs.existsSync(path.join(root, "runtime", "LICENSE.txt")));
console.log(
  JSON.stringify({
    result: "PASS",
    verifiedFiles: manifest.files.length,
    version: manifest.version,
    noUserData: true,
  }),
);
