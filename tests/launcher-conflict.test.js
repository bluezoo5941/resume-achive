const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = process.env.PACKAGE_DIR || path.resolve(__dirname, "..");
const identity = require(path.join(root, "src/identity"));
async function run(dataDir, extra = {}, args = []) {
  const child = spawn(
    process.execPath,
    [path.join(root, "launcher.js"), ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        APP_MODE: "",
        PORT: "",
        DATA_DIR: dataDir,
        NO_BROWSER: "1",
        LLM_API_KEY: "",
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  const timer = setTimeout(() => child.kill(), 30000);
  const [code] = await once(child, "exit");
  clearTimeout(timer);
  return { code, out };
}
test("Launcher never opens old UI: detects same-data old build, skips other installs, remembers port, serves no-cache assets", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-conflict-"));
  const dataId = createHash("sha256").update(dir.toLowerCase()).digest("hex");
  let sameData = false,
    shutdowns = 0;
  const fake = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/shutdown") shutdowns++;
    res.end(
      JSON.stringify({
        appId: "resume-archive",
        dataId: sameData ? dataId : "other-data",
        csrfToken: "old-token",
      }),
    );
  });
  fake.listen(0, "127.0.0.1");
  await once(fake, "listening");
  const port = fake.address().port;
  let started = false;
  try {
    fs.writeFileSync(
      path.join(dir, "launcher-state.json"),
      JSON.stringify({ installId: identity.installId, port }),
    );
    sameData = true;
    const old = await run(dir);
    assert.notEqual(old.code, 0);
    assert.match(old.out, /旧版本|旧版/);
    assert.doesNotMatch(old.out, /已就绪/);
    assert.equal(shutdowns, 0);
    sameData = false;
    const explicit = await run(dir, { PORT: String(port) });
    assert.notEqual(explicit.code, 0);
    assert.match(explicit.out, /指定端口/);
    const skipped = await run(dir);
    assert.equal(skipped.code, 0, skipped.out);
    started = true;
    const saved = JSON.parse(
      fs.readFileSync(path.join(dir, "launcher-state.json"), "utf8"),
    );
    assert.notEqual(saved.port, port);
    const base = "http://127.0.0.1:" + saved.port;
    const response = await fetch(base + "/api/session");
    const body = await response.json();
    assert.equal(body.version, identity.version);
    assert.equal(body.installId, identity.installId);
    assert.equal(body.buildId, identity.buildId);
    for (const asset of ["/", "/styles.css", "/js/app.js"])
      assert.equal(
        (await fetch(base + asset)).headers.get("cache-control"),
        "no-store",
      );
    const html = await (await fetch(base + "/")).text();
    assert.ok(html.includes("匹配内容"));
    assert.ok(!html.includes("appVersion"));
    const css = await (await fetch(base + "/styles.css")).text();
    assert.ok(css.includes("#f5f7f9"));
    assert.ok(css.includes(".match-excerpt"));
    const reused = await run(dir);
    assert.equal(reused.code, 0, reused.out);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "launcher-state.json"))).port,
      saved.port,
    );
    assert.equal(shutdowns, 0);
  } finally {
    if (started) {
      const stop = await run(dir, {}, ["--stop"]);
      assert.equal(stop.code, 0, stop.out);
      await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => fake.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
