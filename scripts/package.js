const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "..", "..");
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("本打包脚本面向 Windows x64");
const license = path.join(workspace, "work", "NODE-LICENSE.txt");
if (!fs.existsSync(license))
  throw new Error("缺少 Node.js 官方许可证：work/NODE-LICENSE.txt");
const stage = fs.mkdtempSync(path.join(workspace, "work", "release-build-"));
const destination = path.join(stage, "简历档案库");
fs.mkdirSync(destination);
// Only explicit code/dependency paths enter the release; never copy data, .env, test fixtures or logs.
for (const name of [
  "src",
  "migrations",
  "public",
  "server.js",
  "pdf-text.js",
  "launcher.js",
  "package.json",
  "package-lock.json",
  "node_modules",
  "启动.cmd",
  "停止.cmd",
  ".env.example",
]) {
  fs.cpSync(path.join(root, name), path.join(destination, name), {
    recursive: true,
  });
}
fs.copyFileSync(
  path.join(root, "使用说明.md"),
  path.join(destination, "使用说明.md"),
);
fs.mkdirSync(path.join(destination, "runtime"));
fs.copyFileSync(
  process.execPath,
  path.join(destination, "runtime", "node.exe"),
);
fs.copyFileSync(license, path.join(destination, "runtime", "LICENSE.txt"));
const entries = [];
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.isFile())
      entries.push({
        path: path.relative(destination, file).replaceAll("\\", "/"),
        sha256: createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex"),
      });
  }
}
scan(destination);
if (
  entries.some(
    (entry) =>
      entry.path.startsWith("data/") ||
      entry.path === ".env" ||
      entry.path.startsWith("test-data/"),
  )
)
  throw new Error("交付内容检查失败");
fs.writeFileSync(
  path.join(destination, "MANIFEST.json"),
  JSON.stringify(
    {
      version: require("../package.json").version,
      platform: "win32-x64",
      node: process.version,
      files: entries,
    },
    null,
    2,
  ),
);
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..*$/, "")
  .replace("T", "-");
const zip = path.join(
  workspace,
  "outputs",
  `简历档案库-v${require("../package.json").version}-Windows-x64-${timestamp}.zip`,
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -LiteralPath ${quote(destination)} -DestinationPath ${quote(zip)} -CompressionLevel Optimal`,
  ],
  { stdio: "inherit", windowsHide: true },
);
console.log(
  JSON.stringify({
    zip,
    staged: destination,
    files: entries.length,
    containsRuntime: true,
    containsUserData: false,
  }),
);
