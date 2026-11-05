const path = require("node:path");
const fs = require("node:fs");
function config(overrides = {}) {
  const dataDir = path.resolve(
    overrides.dataDir ||
      process.env.DATA_DIR ||
      path.join(__dirname, "..", "data"),
  );
  const result = {
    demo: process.env.APP_MODE === "demo",
    publicOrigin: process.env.PUBLIC_ORIGIN || "",
    sessionSecret: process.env.SESSION_SECRET || "",
    demoDailyLimit: 30,
    demoVisitorLimit: 5,
    demoRetentionHours: 24,
    dataDir,
    uploads: path.join(dataDir, "uploads"),
    temp: path.join(dataDir, "incoming"),
    allowedHosts: (process.env.LLM_ALLOWED_HOSTS || "api.deepseek.com")
      .split(",")
      .map((s) => s.trim().toLowerCase()),
    ...overrides,
  };
  if (result.demo) {
    let origin;
    try {
      origin = new URL(result.publicOrigin);
    } catch {
      throw new Error("展示模式必须配置 PUBLIC_ORIGIN");
    }
    if (
      origin.origin !== result.publicOrigin ||
      !["https:", "http:"].includes(origin.protocol) ||
      (origin.protocol === "http:" &&
        !["127.0.0.1", "localhost"].includes(origin.hostname))
    )
      throw new Error("PUBLIC_ORIGIN 必须为 HTTPS 源地址，本机测试允许 HTTP");
    if (result.sessionSecret.length < 64)
      throw new Error("展示模式 SESSION_SECRET 至少 64 字符");
    if (!overrides.dataDir && !process.env.DATA_DIR)
      throw new Error("展示模式必须使用独立 DATA_DIR");
  }
  for (const dir of [result.dataDir, result.uploads, result.temp])
    fs.mkdirSync(dir, { recursive: true });
  return result;
}
module.exports = { config };
