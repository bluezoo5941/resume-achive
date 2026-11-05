const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const hash = createHash("sha256");
function scan(relative) {
  const file = path.join(root, relative);
  if (fs.statSync(file).isDirectory()) {
    for (const name of fs.readdirSync(file).sort())
      scan(path.join(relative, name));
  } else {
    hash.update(relative.replaceAll("\\", "/"));
    hash.update(fs.readFileSync(file));
  }
}
for (const relative of [
  "src",
  "public",
  "migrations",
  "server.js",
  "launcher.js",
  "pdf-text.js",
  "package.json",
])
  scan(relative);
module.exports = {
  version: require("../package.json").version,
  buildId: hash.digest("hex"),
  installId: createHash("sha256").update(root.toLowerCase()).digest("hex"),
};
