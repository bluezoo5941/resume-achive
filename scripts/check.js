const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.join(__dirname, "..");
let failed = false;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
      });
      if (result.status !== 0) {
        console.error(result.stderr);
        failed = true;
      }
    }
  }
}
for (const folder of ["src", "tests", "scripts", "public/js"])
  walk(path.join(root, folder));
for (const file of ["server.js", "pdf-text.js", "launcher.js"]) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log("JavaScript syntax checks passed");
