const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const runtime = fs.existsSync(path.join(root, "runtime", "node.exe"))
    ? path.join(root, "runtime", "node.exe")
    : process.execPath;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-launch-"));
  const finder = net.createServer();
  finder.listen(0, "127.0.0.1");
  await once(finder, "listening");
  const port = finder.address().port;
  await new Promise((resolve) => finder.close(resolve));
  const env = {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    NO_BROWSER: "1",
    LLM_API_KEY: "",
  };
  function run(args = []) {
    const command = process.platform === "win32" ? "cmd.exe" : runtime;
    const argumentsList =
      process.platform === "win32"
        ? ["/d", "/c", args.includes("--stop") ? "停止.cmd" : "启动.cmd"]
        : ["launcher.js", ...args];
    const result = spawnSync(command, argumentsList, {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 25000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  }
  async function session() {
    const response = await fetch(`http://127.0.0.1:${port}/api/session`);
    return response.json();
  }
  try {
    run();
    const first = await session();
    assert.equal(first.appId, "resume-archive");
    run();
    const second = await session();
    assert.equal(first.csrfToken, second.csrfToken);
    run(["--stop"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await assert.rejects(() => session());
    run();
    const third = await session();
    assert.notEqual(third.csrfToken, first.csrfToken);
    run(["--stop"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    console.log(
      "PASS: launcher starts, reuses, stops and restarts bundled service",
    );
  } finally {
    try {
      run(["--stop"]);
    } catch (error) {
      console.error("Cleanup could not stop launcher:", error.message);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
