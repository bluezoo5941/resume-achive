const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const { config } = require("../src/config");
const { Repository } = require("../src/repository");
const c = config();
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files = ["settings.json", "resumes.json"]
  .map((name) => path.join(c.dataDir, name))
  .filter((file) => fs.existsSync(file));
const before = files.map(digest);
let repo;
try {
  repo = new Repository(c);
  files.forEach((file, index) => assert.equal(digest(file), before[index]));
  console.log(
    JSON.stringify({
      legacyFilesUnchanged: true,
      sqliteRecords: repo.list().total,
      migrationsApplied: repo.db
        .prepare("SELECT count(*) AS n FROM migrations")
        .get().n,
    }),
  );
} finally {
  repo?.close();
}
