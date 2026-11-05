const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { textPdf } = require("./fixtures");
const root = process.env.PACKAGE_DIR || path.join(__dirname, "..");
async function start(dataDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "0",
      DATA_DIR: dataDir,
      LLM_API_KEY: "",
      LLM_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stderr.on("data", (chunk) => {
    if (!String(chunk).includes("ExperimentalWarning"))
      process.stderr.write(chunk);
  });
  child.on("exit", (code, signal) => {
    if (code) console.error("TEST_SERVER_EXIT", code, signal);
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server startup timeout")),
      15000,
    );
    child.stdout.on("data", (chunk) => {
      log += chunk;
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("server exited"));
    });
  });
  const session = await fetch(base + "/api/session");
  const cookie = session.headers.get("set-cookie").split(";")[0];
  const token = (await session.json()).csrfToken;
  async function api(url, options = {}) {
    const response = await fetch(base + url, {
      ...options,
      headers: { Cookie: cookie, "X-CSRF-Token": token, ...options.headers },
    }).catch((error) => {
      throw new Error(
        `HTTP request failed: ${options.method || "GET"} ${url}`,
        { cause: error },
      );
    });
    return { status: response.status, body: await response.json() };
  }
  async function upload(bytes, name = "test.pdf") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), name);
    return api("/api/resumes", { method: "POST", body: form });
  }
  return { child, base, api, upload, cookie };
}
async function waitFor(api, id) {
  for (let i = 0; i < 400; i++) {
    const result = await api("/api/resumes/" + id);
    if (["done", "failed"].includes(result.body.status)) return result.body;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("processing timeout");
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, "exit");
}
test(
  "HTTP: real PDF parsing, batch isolation, auth, validation, retry, dedupe and restart",
  { timeout: 180000 },
  async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-http-"));
    let service;
    try {
      service = await start(dataDir);
      assert.equal((await fetch(service.base + "/api/resumes")).status, 401);
      assert.equal(
        (
          await fetch(service.base + "/api/session", {
            headers: { Origin: "https://evil.test" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(service.base + "/api/settings", {
            method: "PUT",
            headers: {
              Cookie: service.cookie,
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (await service.upload(Buffer.from("not a PDF"))).status,
        400,
      );
      assert.equal((await service.upload(textPdf(), "test.exe")).status, 400);
      assert.equal(
        (await service.upload(Buffer.alloc(21 * 1024 * 1024), "large.pdf"))
          .status,
        413,
      );
      assert.equal((await service.api("/api/resumes?limit=10000")).status, 400);
      assert.equal(
        (
          await service.api("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl: "https://127.0.0.1",
              apiKey: "dummy",
              model: "test",
            }),
          })
        ).status,
        400,
      );
      const same = textPdf();
      const duplicates = await Promise.all([
        service.upload(same),
        service.upload(same),
      ]);
      assert.equal(duplicates[0].body.id, duplicates[1].body.id);
      assert.equal(duplicates.filter((x) => x.body.duplicate).length, 1);
      const uploads = [];
      for (let i = 0; i < 19; i++)
        uploads.push(
          await service.upload(
            textPdf(
              `Resume Candidate${i} Education Master Skills Python SQL Work experience five years contact candidate${i}@example.com`,
            ),
            `candidate${i}.pdf`,
          ),
        );
      const corrupt = await service.upload(
        Buffer.from("%PDF-1.4\ncorrupt"),
        "broken.pdf",
      );
      assert.equal(corrupt.status, 202);
      const done = await waitFor(service.api, uploads.at(-1).body.id);
      assert.equal(done.status, "done");
      const failed = await waitFor(service.api, corrupt.body.id);
      assert.equal(failed.status, "failed");
      const file = await fetch(
        service.base + `/api/resumes/${failed.id}/file`,
        { headers: { Cookie: service.cookie } },
      );
      assert.equal(file.status, 200);
      assert.match(await file.text(), /%PDF/);
      assert.equal(
        (
          await service.api(`/api/resumes/${failed.id}/retry`, {
            method: "POST",
          })
        ).status,
        202,
      );
      assert.equal(
        (
          await service.api(`/api/resumes/${failed.id}/retry`, {
            method: "POST",
          })
        ).status,
        409,
      );
      assert.equal((await waitFor(service.api, failed.id)).status, "failed");
      const query = await service.api("/api/resumes?status=done&limit=100");
      assert.equal(query.body.total, 20);
      assert.equal(
        (await service.api("/api/resumes?q=Work&status=done")).body.total,
        0,
      );
      const full = await service.api(
        "/api/resumes?q=Work&scope=full&status=done",
      );
      assert.equal(full.body.total, 20);
      assert.match(full.body.items[0].matchSnippet, /Work/i);
      assert.equal(
        (await service.api("/api/resumes?scope=invalid")).status,
        400,
      );
      assert.equal((await service.api("/api/filters")).status, 200);
      assert.equal(
        (
          await service.api(
            "/api/resumes?q=" + encodeURIComponent("' OR 1=1 --"),
          )
        ).body.total,
        0,
      );
      const settings = await service.api("/api/settings");
      assert.equal(settings.body.apiKey, undefined);
      assert.equal((await service.api("/api/resumes/missing")).status, 404);
      assert.equal(
        (await fetch(service.base + "/data/settings.json")).status,
        404,
      );
      const id = uploads[0].body.id;
      const saved = await service.api("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-chat",
          apiKey: "test-only-not-a-real-key",
        }),
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.hasApiKey, true);
      assert.equal(saved.body.apiKey, undefined);
      await stop(service.child);
      service = await start(dataDir);
      assert.equal((await service.api("/api/settings")).body.hasApiKey, true);
      assert.equal(
        (await service.api("/api/resumes/" + id)).body.status,
        "done",
      );
      assert.equal(
        (await service.api("/api/resumes?status=done")).body.total,
        20,
      );
      const pdf = await fetch(service.base + `/api/resumes/${id}/file`, {
        headers: { Cookie: service.cookie },
      });
      assert.equal(pdf.status, 200);
      assert.ok((await pdf.arrayBuffer()).byteLength > 100);
      const preview = await fetch(service.base + `/api/resumes/${id}/preview`, {
        headers: { Cookie: service.cookie },
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.get("content-type"), "image/png");
      const png = Buffer.from(await preview.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      for (const removedId of [failed.id, id]) {
        const url = "/api/resumes/" + removedId;
        assert.equal(
          (await service.api(url, { method: "DELETE" })).status,
          200,
        );
        assert.equal((await service.api(url)).status, 404);
        assert.equal(
          (
            await fetch(service.base + url + "/file", {
              headers: { Cookie: service.cookie },
            })
          ).status,
          404,
        );
      }
      assert.equal((await service.api("/api/resumes")).body.total, 19);
    } finally {
      if (service) await stop(service.child);
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
