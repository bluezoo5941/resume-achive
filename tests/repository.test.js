const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { config } = require("../src/config");
const { Repository } = require("../src/repository");
const { validateResult, validateBase } = require("../src/model-service");
const { normalizeFilename } = require("../src/filename");
test("Chinese legacy filename repair without changing original Latin-1 names", () => {
  const text = "虚构测试简历_张明远.pdf";
  assert.equal(normalizeFilename(Buffer.from(text).toString("latin1")), text);
  assert.equal(normalizeFilename("café.pdf"), "café.pdf");
  assert.equal(normalizeFilename(text), text);
});
test("SQLite parameter binding, unique hash, claim recovery and restart persistence", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-repo-"));
  let repo;
  try {
    const c = config({ dataDir });
    repo = new Repository(c);
    assert.throws(() => new Repository(c), /已有服务运行/);
    const payload = "Robert'); DROP TABLE resumes;--";
    repo.add({
      id: "one",
      hash: "hash",
      filename: payload,
      storedName: "one.pdf",
    });
    assert.equal(
      repo.add({
        id: "two",
        hash: "hash",
        filename: "duplicate",
        storedName: "two.pdf",
      }).id,
      "one",
    );
    assert.equal(repo.list({ q: payload }).total, 1);
    assert.equal(repo.list({ q: "' OR 1=1 --" }).total, 0);
    assert.equal(repo.claim().id, "one");
    assert.equal(repo.claim(), null);
    repo.close();
    repo = new Repository(c);
    assert.equal(repo.get("one").status, "queued");
    repo.complete("one", {
      name: payload,
      education: "本科",
      skills: ["SQL"],
      rawText: "example",
    });
    assert.equal(repo.retry("one"), 0);
    repo.close();
    repo = new Repository(c);
    assert.equal(repo.get("one").name, payload);
    assert.equal(repo.list().total, 1);
  } finally {
    repo?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
test("Legacy import is repeatable and keeps JSON and original PDF", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-legacy-"));
  let repo;
  try {
    const c = config({ dataDir });
    fs.writeFileSync(path.join(c.uploads, "old.pdf"), "%PDF-test");
    fs.writeFileSync(
      path.join(dataDir, "resumes.json"),
      JSON.stringify([
        {
          id: "old",
          originalName: "old.pdf",
          storedName: "old.pdf",
          uploadedAt: new Date().toISOString(),
          name: "旧记录",
        },
      ]),
    );
    repo = new Repository(c);
    assert.equal(repo.list().total, 1);
    repo.close();
    repo = new Repository(c);
    assert.equal(repo.list().total, 1);
    assert.ok(fs.existsSync(path.join(dataDir, "resumes.json")));
    assert.ok(fs.existsSync(path.join(c.uploads, "old.pdf")));
  } finally {
    repo?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
test("Model schema allowlist rejects malformed data and URLs", () => {
  const valid = {
    name: "Test",
    education: "本科学士",
    skills: ["SQL"],
    experienceYears: 3,
  };
  assert.equal(
    validateResult({ ...valid, id: "override", status: "done" }).id,
    undefined,
  );
  assert.equal(validateResult(valid).education, "本科");
  for (const bad of [
    {},
    { ...valid, experienceYears: "3" },
    { ...valid, name: {} },
    { ...valid, skills: "SQL" },
    { ...valid, experienceYears: 90 },
  ])
    assert.throws(() => validateResult(bad));
  for (const url of [
    "http://api.deepseek.com",
    "https://127.0.0.1",
    "https://api.deepseek.com.evil.test",
    "https://user:password@api.deepseek.com",
    "https://api.deepseek.com/?x=1",
  ])
    assert.throws(() => validateBase(url, ["api.deepseek.com"]));
  assert.equal(
    validateBase("https://api.deepseek.com/v1/", ["api.deepseek.com"]),
    "https://api.deepseek.com/v1",
  );
});
