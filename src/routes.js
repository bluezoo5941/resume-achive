const express = require("express");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { AppError } = require("./errors");
const { preview } = require("./preview-service");
const { normalizeFilename } = require("./filename");
function routes(repo, model, tasks, config, demo = null) {
  const router = express.Router();
  const upload = multer({
    dest: config.temp,
    limits: { fileSize: (demo ? 5 : 20) * 1024 * 1024, files: 1, fields: 0 },
  });
  router.get("/health", (_req, res) => res.json({ status: "ok" }));
  router.get("/settings", (_req, res) => res.json(model.publicSettings()));
  router.put("/settings", (req, res) => res.json(model.save(req.body)));
  router.get("/filters", (req, res) =>
    res.json({ companies: repo.companies(demo ? req.visitor : undefined) }),
  );
  router.post("/settings/test", async (_req, res) =>
    res.json(await model.test()),
  );
  router.get("/resumes", (req, res) => {
    const {
      q = "",
      education = "",
      page = "1",
      limit = "25",
      status = "",
      company = "",
      scope = "keywords",
    } = req.query;
    if (
      typeof q !== "string" ||
      q.length > 300 ||
      typeof company !== "string" ||
      company.length > 200 ||
      !["keywords", "full"].includes(scope) ||
      typeof education !== "string" ||
      !["", "博士", "硕士", "本科", "大专", "高中", "中专", "未识别"].includes(
        education,
      ) ||
      !["", "queued", "processing", "done", "failed"].includes(status) ||
      !/^\d+$/.test(String(page)) ||
      !/^\d+$/.test(String(limit)) ||
      Number(page) < 1 ||
      Number(page) > 1000000 ||
      Number(limit) < 1 ||
      Number(limit) > 100
    )
      throw new AppError(400, "搜索条件无效");
    res.json(
      repo.list({
        q,
        education,
        page: Number(page),
        limit: Number(limit),
        status,
        company,
        scope,
        owner: demo ? req.visitor : undefined,
      }),
    );
  });
  router.get("/resumes/:id", (req, res) => {
    if (demo) demo.authorize(req, req.params.id);
    const result = repo.get(req.params.id);
    if (!result) throw new AppError(404, "简历不存在");
    delete result.storedName;
    res.json(result);
  });
  router.get("/resumes/:id/file", (req, res) => {
    if (demo) demo.authorize(req, req.params.id);
    const row = repo.raw(req.params.id);
    if (!row) throw new AppError(404, "简历不存在");
    const name = path.basename(row.stored_name);
    if (name !== row.stored_name) throw new AppError(404, "文件不存在");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(normalizeFilename(row.filename))}`,
    );
    res.type("application/pdf").sendFile(path.join(config.uploads, name));
  });
  router.get("/resumes/:id/preview", async (req, res) => {
    if (demo) demo.authorize(req, req.params.id);
    const row = repo.raw(req.params.id);
    if (!row) throw new AppError(404, "简历不存在");
    const page = String(req.query.page || "1");
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 30)
      throw new AppError(400, "预览页码无效");
    if (path.basename(row.stored_name) !== row.stored_name)
      throw new AppError(404, "文件不存在");
    res.setHeader("Cache-Control", "private, max-age=300");
    res
      .type("png")
      .send(
        await preview(path.join(config.uploads, row.stored_name), Number(page)),
      );
  });
  let windowStart = Date.now(),
    uploads = 0;
  router.post(
    "/resumes",
    (req, res, next) => {
      if (Date.now() - windowStart > 60000) {
        windowStart = Date.now();
        uploads = 0;
      }
      if (++uploads > 60)
        return next(new AppError(429, "上传过于频繁，请稍后再试"));
      if (repo.list({ status: "queued", limit: 1 }).total >= 100)
        return next(new AppError(429, "待处理任务较多，请稍后上传"));
      next();
    },
    upload.single("file"),
    (req, res) => {
      if (!req.file) throw new AppError(400, "请选择 PDF 文件");
      let moved = false;
      try {
        const filename = normalizeFilename(req.file.originalname);
        const bytes = fs.readFileSync(req.file.path);
        if (
          !/\.pdf$/i.test(filename) ||
          filename.length > 250 ||
          !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))
        )
          throw new AppError(400, "仅支持有效的 PDF 文件");
        const hash = createHash("sha256")
          .update(demo ? req.visitor : "")
          .update(bytes)
          .digest("hex");
        const existing = repo.byHash(hash);
        if (existing) {
          res.status(200).json({ ...existing, duplicate: true });
          return;
        }
        const id = randomUUID(),
          storedName = id + ".pdf";
        if (demo) demo.reserve(req);
        fs.renameSync(req.file.path, path.join(config.uploads, storedName));
        moved = true;
        let record;
        try {
          record = repo.add({
            id,
            hash,
            filename,
            storedName,
            owner: demo ? req.visitor : "",
          });
        } catch (error) {
          fs.unlinkSync(path.join(config.uploads, storedName));
          throw error;
        }
        if (record.id !== id)
          fs.unlinkSync(path.join(config.uploads, storedName));
        res.status(202).json({ ...record, duplicate: record.id !== id });
        void tasks.start();
      } finally {
        if (!moved && fs.existsSync(req.file.path))
          fs.unlinkSync(req.file.path);
      }
    },
  );
  router.post("/resumes/:id/retry", (req, res) => {
    if (demo) {
      const row = demo.authorize(req, req.params.id);
      if (row.status !== "failed")
        throw new AppError(409, "只有失败任务可以重试");
      demo.reserve(req);
    }
    if (!repo.get(req.params.id)) throw new AppError(404, "简历不存在");
    if (!repo.retry(req.params.id))
      throw new AppError(409, "只有失败任务可以重试");
    res.status(202).json(repo.get(req.params.id));
    void tasks.start();
  });
  if (!demo)
    router.delete("/resumes/:id", (req, res) => {
      const result = repo.deleteLocalResume(req.params.id, (name) => {
        if (!name || path.basename(name) !== name || !/\.pdf$/i.test(name))
          throw new AppError(409, "原文件路径无效，无法删除");
        fs.rmSync(path.join(config.uploads, name), { force: true });
      });
      if (result === "missing") throw new AppError(404, "简历不存在");
      if (result === "busy")
        throw new AppError(409, "简历正在解析，请完成后再删除");
      res.json({ deleted: true });
    });
  return router;
}
module.exports = { routes };
