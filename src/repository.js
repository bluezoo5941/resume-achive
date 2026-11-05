const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { acquireLock } = require("./data-lock");
const { normalizeFilename } = require("./filename");
const { searchExpression, termsOf, snippetOf } = require("./search");
class Repository {
  constructor(config) {
    this.config = config;
    this.releaseLock = acquireLock(config.dataDir);
    try {
      this.db = new DatabaseSync(path.join(config.dataDir, "library.sqlite"));
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
      );
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)",
      );
      for (const name of fs
        .readdirSync(path.join(__dirname, "..", "migrations"))
        .sort()) {
        if (
          this.db.prepare("SELECT name FROM migrations WHERE name=?").get(name)
        )
          continue;
        this.transaction(() => {
          this.db.exec(
            fs.readFileSync(
              path.join(__dirname, "..", "migrations", name),
              "utf8",
            ),
          );
          this.db.prepare("INSERT INTO migrations VALUES (?)").run(name);
        });
      }
      if (config.demo) {
        if (
          this.db
            .prepare("SELECT count(*) AS n FROM resumes WHERE owner=''")
            .get().n ||
          fs.existsSync(path.join(config.dataDir, "resumes.json")) ||
          fs.existsSync(path.join(config.dataDir, "settings.json"))
        )
          throw new Error("展示模式禁止使用本地人事数据目录");
      } else this.importLegacy();
      this.db
        .prepare(
          "UPDATE resumes SET status='queued', error='' WHERE status='processing'",
        )
        .run();
    } catch (error) {
      this.db?.close();
      this.releaseLock();
      throw error;
    }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  importLegacy() {
    for (const source of ["settings.json", "resumes.json"]) {
      const file = path.join(this.config.dataDir, source);
      if (
        !fs.existsSync(file) ||
        this.db.prepare("SELECT source FROM imports WHERE source=?").get(source)
      )
        continue;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      this.transaction(() => {
        if (source === "settings.json") this.saveSettings(data);
        else {
          if (!Array.isArray(data)) throw new Error("旧简历索引格式无效");
          for (const row of data) {
            if (
              !row.storedName ||
              path.basename(row.storedName) !== row.storedName
            )
              throw new Error("旧文件路径无效");
            const filePath = path.join(this.config.uploads, row.storedName);
            if (!fs.existsSync(filePath))
              throw new Error("旧索引引用的 PDF 不存在，请恢复文件后启动");
            const hash = createHash("sha256")
              .update(fs.readFileSync(filePath))
              .digest("hex");
            this.db
              .prepare(
                "INSERT INTO resumes(id,hash,filename,stored_name,status,result,created_at,updated_at) VALUES(?,?,?,?,'done',?,?,?) ON CONFLICT(hash) DO NOTHING",
              )
              .run(
                row.id || randomUUID(),
                hash,
                row.originalName,
                row.storedName,
                JSON.stringify(row),
                row.uploadedAt,
                row.uploadedAt,
              );
          }
        }
        this.db
          .prepare("INSERT INTO imports VALUES(?,?)")
          .run(source, new Date().toISOString());
      });
    }
  }
  settings() {
    return JSON.parse(
      this.db.prepare("SELECT value FROM settings WHERE id=1").get()?.value ||
        "{}",
    );
  }
  saveSettings(value) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(value));
  }
  decode(row) {
    if (!row) return null;
    const result = JSON.parse(row.result);
    const safe = {};
    for (const field of [
      "name",
      "education",
      "experienceYears",
      "targetRole",
      "currentCompany",
      "skills",
      "email",
      "phone",
      "rawText",
      "parseMode",
      "pageCount",
      "extractionMode",
      "ocrPages",
      "companies",
      "school",
      "major",
    ])
      if (Object.hasOwn(result, field)) safe[field] = result[field];
    return {
      ...safe,
      id: row.id,
      originalName: normalizeFilename(row.filename),
      status: row.status,
      error: row.error,
      attempts: row.attempts,
      uploadedAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  raw(id) {
    return this.db.prepare("SELECT * FROM resumes WHERE id=?").get(id);
  }
  get(id) {
    return this.decode(this.raw(id));
  }
  byHash(hash) {
    return this.decode(
      this.db.prepare("SELECT * FROM resumes WHERE hash=?").get(hash),
    );
  }
  add({ id, hash, filename, storedName, owner = "" }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO resumes(id,hash,filename,stored_name,status,created_at,updated_at,owner) VALUES(?,?,?,?,'queued',?,?,?) ON CONFLICT(hash) DO NOTHING",
      )
      .run(id, hash, filename, storedName, now, now, owner);
    return this.byHash(hash);
  }
  list({
    q = "",
    education = "",
    company = "",
    scope = "keywords",
    page = 1,
    limit = 25,
    status = "",
    owner,
  } = {}) {
    const terms = termsOf(q);
    const searchable = searchExpression(scope);
    const conditions = terms.map(() => `instr(lower(${searchable}), ?) > 0`);
    const params = [...terms];
    if (owner !== undefined) {
      conditions.push("owner=?");
      params.push(owner);
    }
    if (education) {
      conditions.push("json_extract(result,'$.education')=?");
      params.push(education);
    }
    if (status) {
      conditions.push("status=?");
      params.push(status);
    }
    if (company) {
      conditions.push(
        "(json_extract(result,'$.currentCompany')=? OR EXISTS(SELECT 1 FROM json_each(result,'$.companies') WHERE value=?))",
      );
      params.push(company, company);
    }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    const total = this.db
      .prepare("SELECT count(*) AS n FROM resumes" + where)
      .get(...params).n;
    const rows = this.db
      .prepare(
        "SELECT * FROM resumes" +
          where +
          " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
      )
      .all(...params, limit, (page - 1) * limit);
    return {
      items: rows.map((row) => {
        const result = this.decode(row);
        result.matchSnippet = snippetOf(result, q, scope);
        delete result.rawText;
        delete result.storedName;
        return result;
      }),
      total,
      page,
      limit,
    };
  }
  companies(owner) {
    if (owner !== undefined)
      return this.db
        .prepare(
          "SELECT json_extract(result,'$.currentCompany') AS company FROM resumes WHERE owner=? AND status='done' UNION SELECT j.value AS company FROM resumes r,json_each(r.result,'$.companies') j WHERE r.owner=? AND r.status='done' AND j.type='text' ORDER BY company LIMIT 1000",
        )
        .all(owner, owner)
        .map((r) => r.company)
        .filter(Boolean);
    return this.db
      .prepare(
        "SELECT company FROM (SELECT json_extract(result,'$.currentCompany') AS company FROM resumes WHERE status='done' UNION SELECT j.value AS company FROM resumes r,json_each(r.result,'$.companies') j WHERE r.status='done') WHERE company IS NOT NULL AND trim(company)<>'' ORDER BY company LIMIT 1000",
      )
      .all()
      .map((row) => row.company);
  }
  claim() {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT * FROM resumes WHERE status='queued' ORDER BY created_at,id LIMIT 1",
        )
        .get();
      if (!row) return null;
      this.db
        .prepare(
          "UPDATE resumes SET status='processing', attempts=attempts+1, updated_at=? WHERE id=? AND status='queued'",
        )
        .run(new Date().toISOString(), row.id);
      return row;
    });
  }
  complete(id, result) {
    this.db
      .prepare(
        "UPDATE resumes SET status='done',result=?,error='',updated_at=? WHERE id=?",
      )
      .run(JSON.stringify(result), new Date().toISOString(), id);
  }
  fail(id, message) {
    this.db
      .prepare(
        "UPDATE resumes SET status='failed',error=?,updated_at=? WHERE id=?",
      )
      .run(message, new Date().toISOString(), id);
  }
  retry(id) {
    return this.db
      .prepare(
        "UPDATE resumes SET status='queued',error='',updated_at=? WHERE id=? AND status='failed'",
      )
      .run(new Date().toISOString(), id).changes;
  }
  deleteLocalResume(id, removeFile) {
    return this.transaction(() => {
      const row = this.raw(id);
      if (!row || row.owner !== "") return "missing";
      if (row.status === "processing") return "busy";
      this.db.prepare("DELETE FROM resumes WHERE id=?").run(id);
      const shared = this.db
        .prepare("SELECT 1 FROM resumes WHERE stored_name=? LIMIT 1")
        .get(row.stored_name);
      if (!shared) removeFile(row.stored_name);
      return "deleted";
    });
  }
  reserveDemoUsage(subjects) {
    return this.transaction(() => {
      const day = new Date().toISOString().slice(0, 10);
      for (const [subject, limit] of subjects) {
        const count =
          this.db
            .prepare("SELECT count FROM demo_usage WHERE day=? AND subject=?")
            .get(day, subject)?.count || 0;
        if (count >= limit) return false;
      }
      for (const [subject] of subjects)
        this.db
          .prepare(
            "INSERT INTO demo_usage VALUES(?,?,1) ON CONFLICT(day,subject) DO UPDATE SET count=count+1",
          )
          .run(day, subject);
      return true;
    });
  }
  expiredDemoRows(cutoff) {
    return this.db
      .prepare(
        "SELECT id,stored_name FROM resumes WHERE owner<>'' AND status IN ('done','failed') AND created_at<?",
      )
      .all(cutoff);
  }
  deleteDemoRow(id) {
    this.db
      .prepare(
        "DELETE FROM resumes WHERE id=? AND owner<>'' AND status IN ('done','failed')",
      )
      .run(id);
  }
  pruneDemoUsage(day) {
    this.db.prepare("DELETE FROM demo_usage WHERE day<?").run(day);
  }
  close() {
    try {
      this.db.close();
    } finally {
      this.releaseLock();
    }
  }
}
module.exports = { Repository };
