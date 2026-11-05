// Explicit opt-in smoke test: sends only fictional fixture text to the configured provider.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { textPdf } = require("../tests/fixtures");
async function main() {
  const source = path.join(__dirname, "..", "data");
  let settings;
  const dbFile = path.join(source, "library.sqlite");
  if (fs.existsSync(dbFile)) {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      const row = db.prepare("SELECT value FROM settings WHERE id=1").get();
      settings = row ? JSON.parse(row.value) : {};
    } finally {
      db.close();
    }
  } else
    settings = JSON.parse(
      fs.readFileSync(path.join(source, "settings.json"), "utf8"),
    );
  if (!settings.apiKey) throw new Error("未找到本机模型配置");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-live-"));
  let context, server;
  try {
    fs.writeFileSync(
      path.join(dataDir, "settings.json"),
      JSON.stringify(settings),
      { mode: 0o600 },
    );
    context = createApp({ dataDir });
    server = context.app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = await fetch(base + "/api/session");
    const cookie = session.headers.get("set-cookie").split(";")[0];
    const { csrfToken } = await session.json();
    const data = new FormData();
    data.append("file", new Blob([textPdf()]), "Fictional-Alice.pdf");
    const response = await fetch(base + "/api/resumes", {
      method: "POST",
      headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
      body: data,
    });
    assert.equal(response.status, 202);
    const { id } = await response.json();
    let result;
    for (let i = 0; i < 100; i++) {
      result = await (
        await fetch(base + "/api/resumes/" + id, {
          headers: { Cookie: cookie },
        })
      ).json();
      if (["done", "failed"].includes(result.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(result.status, "done", result.error);
    assert.equal(result.parseMode, "AI 解析");
    assert.match(result.email, /alice@example.com/);
    assert.ok(result.skills.length > 0);
    console.log(
      JSON.stringify({
        result: "PASS",
        workflow:
          "real PDF upload → configured AI → SQLite persistence → query",
        parseMode: result.parseMode,
        hasName: !!result.name,
        skillCount: result.skills.length,
      }),
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (context) {
      context.tasks.stopped = true;
      while (context.tasks.running)
        await new Promise((resolve) => setTimeout(resolve, 100));
      context.repo.close();
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
