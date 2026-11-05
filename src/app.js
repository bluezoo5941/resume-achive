const express = require("express");
const path = require("node:path");
const { config: makeConfig } = require("./config");
const { Repository } = require("./repository");
const { ModelService } = require("./model-service");
const { TaskService } = require("./task-service");
const { localBoundary } = require("./security");
const { demoBoundary } = require("./demo-security");
const { DemoService } = require("./demo-service");
const { routes } = require("./routes");
const { AppError } = require("./errors");
function createApp(options = {}) {
  const config = makeConfig(options),
    repo = new Repository(config),
    model = new ModelService(repo, config),
    tasks = new TaskService(repo, model, config);
  const app = express();
  app.disable("x-powered-by");
  if (config.demo) app.set("trust proxy", "loopback");
  app.use(config.demo ? demoBoundary(config) : localBoundary(config));
  const demo = config.demo ? new DemoService(repo, config) : null;
  let cleanupTimer;
  if (demo) {
    demo.cleanup();
    cleanupTimer = setInterval(() => {
      try {
        demo.cleanup();
      } catch {
        console.error(JSON.stringify({ event: "demo_cleanup_failed" }));
      }
    }, 60000);
    cleanupTimer.unref();
  }
  app.once("close-resources", () => clearInterval(cleanupTimer));
  app.use(express.json({ limit: "16kb" }));
  app.post("/api/shutdown", (_req, res) => {
    res.status(202).json({ stopping: true });
    setImmediate(() => app.emit("shutdown"));
  });
  app.use("/api", routes(repo, model, tasks, config, demo));
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.get("/preview", (_req, res) => res.redirect("/"));
  app.use(
    express.static(path.join(__dirname, "..", "public"), {
      index: "index.html",
      etag: false,
      lastModified: false,
      setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
    }),
  );
  app.use((error, _req, res, _next) => {
    const status =
      error.status ||
      (error.code === "LIMIT_FILE_SIZE"
        ? 413
        : error.name === "MulterError"
          ? 400
          : 500);
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "request_failed",
          code: error.code || "INTERNAL_ERROR",
        }),
      );
    res.status(status).json({
      error:
        status === 413
          ? `文件过大，单份最大 ${config.demo ? 5 : 20}MB`
          : error instanceof AppError
            ? error.message
            : status === 400
              ? "请求格式无效，请检查文件或 JSON 内容"
              : "服务处理失败，请查看本机日志",
      code: error.code || "REQUEST_FAILED",
    });
  });
  return { app, repo, model, tasks };
}
module.exports = { createApp };
