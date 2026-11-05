const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { textPdf } = require("./fixtures");
const { DemoService } = require("../src/demo-service");
test("Demo HTTP isolates visitors, protects management, persists quotas and sessions, cleans only expired demo data", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-http-"));
  const options = {
    demo: true,
    dataDir: dir,
    publicOrigin: "http://localhost:3999",
    sessionSecret: "a".repeat(64),
    demoDailyLimit: 3,
    demoVisitorLimit: 2,
    demoRetentionHours: 24,
  };
  let service, server;
  const probe = require("node:net").createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  options.publicOrigin = `http://127.0.0.1:${port}`;
  async function start() {
    service = createApp(options);
    service.tasks.stopped = true;
    server = service.app.listen(port, "127.0.0.1");
    await once(server, "listening");
  }
  async function stop() {
    service.app.emit("close-resources");
    await new Promise((r) => server.close(r));
    service.repo.close();
  }
  async function call(url, client = {}, extra = {}) {
    return fetch("http://127.0.0.1:" + server.address().port + url, {
      ...extra,
      headers: {
        Connection: "close",
        Cookie: client.cookie || "",
        "X-CSRF-Token": client.csrf || "",
        "X-Forwarded-For": client.ip || "203.0.113.1",
        ...extra.headers,
      },
    });
  }
  async function session(ip) {
    const r = await call("/api/session", { ip });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.mode, "demo");
    return {
      cookie: r.headers.get("set-cookie").split(";")[0],
      csrf: b.csrfToken,
      ip,
    };
  }
  async function upload(
    c,
    body = textPdf("Fictional resume"),
    name = "fiction.pdf",
  ) {
    const f = new FormData();
    f.append("file", new Blob([body]), name);
    return call("/api/resumes", c, { method: "POST", body: f });
  }
  try {
    await start();
    const a = await session("203.0.113.1"),
      b = await session("203.0.113.2");
    assert.notEqual(a.cookie, b.cookie);
    assert.equal(
      (
        await call("/api/resumes", {
          ...a,
          cookie: a.cookie.slice(0, -1) + "z",
        })
      ).status,
      401,
    );
    assert.equal((await call("/api/resumes")).status, 401);
    assert.equal(
      (
        await call(
          "/api/session",
          {},
          { headers: { Origin: "https://evil.test" } },
        )
      ).status,
      403,
    );
    assert.equal((await call("/api/settings", a)).status, 403);
    assert.equal(
      (await call("/api/shutdown", a, { method: "POST" })).status,
      403,
    );
    assert.equal(
      (await call("/api/resumes", { ...a, csrf: "bad" }, { method: "POST" }))
        .status,
      403,
    );
    const first = await upload(a);
    assert.equal(first.status, 202);
    const row = await first.json();
    assert.equal((await upload(a)).status, 200);
    for (const suffix of ["", "/file", "/preview?page=1", "/retry"])
      assert.equal(
        (
          await call(
            "/api/resumes/" + row.id + suffix,
            b,
            suffix === "/retry" ? { method: "POST" } : {},
          )
        ).status,
        404,
      );
    assert.equal((await (await call("/api/resumes", b)).json()).total, 0);
    service.repo.complete(row.id, {
      name: "Fiction",
      currentCompany: "Only A",
      companies: ["Past A"],
      rawText: "负责",
      skills: [],
    });
    assert.deepEqual(
      (await (await call("/api/filters", b)).json()).companies,
      [],
    );
    assert.deepEqual((await (await call("/api/filters", a)).json()).companies, [
      "Only A",
      "Past A",
    ]);
    assert.equal(
      (await (await call("/api/resumes?q=负责&scope=full", a)).json()).total,
      1,
    );
    const same = await upload(b);
    assert.equal(same.status, 202);
    assert.notEqual((await same.json()).id, row.id);
    service.tasks.stopped = false;
    await service.tasks.start();
    const bRows = (await (await call("/api/resumes", b)).json()).items;
    assert.equal(bRows[0].status, "done");
    assert.equal(
      (await (await call("/api/resumes/" + bRows[0].id, b)).json()).parseMode,
      "本地规则提取",
    );
    service.tasks.stopped = true;
    assert.equal((await upload(a, textPdf("Another resume"))).status, 202);
    assert.equal((await upload(a, textPdf("Third resume"))).status, 429);
    await stop();
    await start();
    assert.equal((await (await call("/api/resumes", a)).json()).total, 2);
    assert.equal((await upload(a, textPdf("After restart"))).status, 429);
    assert.equal((await upload(b, textPdf("Global cap"))).status, 429);
    service.repo.db
      .prepare("UPDATE resumes SET created_at=? WHERE id=?")
      .run("2000-01-01T00:00:00.000Z", row.id);
    new DemoService(service.repo, service.repo.config).cleanup();
    assert.equal(service.repo.get(row.id), null);
    assert.equal(
      fs.existsSync(path.join(dir, "uploads", row.id + ".pdf")),
      false,
    );
    assert.equal(service.repo.list().total, 2);
  } finally {
    if (server?.listening) await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
