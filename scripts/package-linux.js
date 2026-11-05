const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const out = path.resolve(root, "..", "resume-demo-linux-source.tar.gz");
const names = [
  "src",
  "migrations",
  "public",
  "deploy",
  "server.js",
  "pdf-text.js",
  "package.json",
  "package-lock.json",
  ".env.example",
  "README.md",
  "AGENTS.md",
];
execFileSync("tar", ["-czf", out, "-C", root, ...names]);
const listed = execFileSync("tar", ["-tzf", out], { encoding: "utf8" })
  .trim()
  .split(/\r?\n/);
if (
  listed.some((n) =>
    n
      .split("/")
      .some((p) => ["data", "node_modules", ".env", ".git"].includes(p)),
  )
)
  throw new Error("Private file in package");
const hash = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
fs.writeFileSync(out + ".sha256", hash + "  " + path.basename(out) + "\n");
console.log(
  JSON.stringify({
    package: out,
    bytes: fs.statSync(out).size,
    files: listed.length,
    sha256: hash,
  }),
);
