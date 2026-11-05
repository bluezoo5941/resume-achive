const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { config } = require("../src/config");
const { Repository } = require("../src/repository");
const { validateResult } = require("../src/model-service");
test("Keyword vs full-text scope, past companies, school, combined filters and snippets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-search-"));
  let repo;
  try {
    repo = new Repository(config({ dataDir: dir }));
    repo.add({
      id: "search",
      hash: "one",
      filename: "test.pdf",
      storedName: "test.pdf",
    });
    repo.complete("search", {
      ...validateResult({
        name: "测试人员",
        education: "硕士",
        experienceYears: 5,
        currentCompany: "星海科技",
        companies: ["栖云网络", "星海科技"],
        school: "示例大学",
        major: "管理科学",
        skills: ["SQL", "SaaS"],
      }),
      rawText: "负责企业协同平台交付，推动跨团队合作，提升工作效率。",
    });
    assert.equal(repo.list({ q: "负责" }).total, 0);
    const full = repo.list({ q: "负责", scope: "full" });
    assert.equal(full.total, 1);
    assert.match(full.items[0].matchSnippet, /负责/);
    assert.equal(full.items[0].rawText, undefined);
    assert.equal(repo.list({ q: "栖云网络 硕士" }).total, 1);
    assert.equal(repo.list({ q: "示例大学 管理科学" }).total, 1);
    assert.equal(
      repo.list({ company: "栖云网络", education: "硕士" }).total,
      1,
    );
    assert.equal(repo.list({ company: "其他公司" }).total, 0);
    assert.equal(repo.list({ company: "' OR 1=1 --" }).total, 0);
    assert.deepEqual(repo.companies(), ["星海科技", "栖云网络"]);
  } finally {
    repo?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("Highlight handles regex metacharacters and HTML as literal text", async () => {
  const { splitMatches } = await import("../public/js/highlight.js");
  for (const term of ["负责", "a+b", "[test]", "<img>"]) {
    const text = `before ${term} after`,
      parts = splitMatches(text, term);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.deepEqual(
      parts.filter((part) => part.match).map((part) => part.text),
      [term],
    );
  }
  assert.equal(
    splitMatches("SQL sql", "sql").filter((part) => part.match).length,
    2,
  );
});
