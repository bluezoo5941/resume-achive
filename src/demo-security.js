const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { AppError } = require("./errors");
function demoBoundary(config) {
  const origin = new URL(config.publicOrigin);
  const sign = (value) =>
    createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  const safe = (a, b) =>
    typeof a === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b));
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (
      req.headers.host !== origin.host ||
      (req.headers.origin && req.headers.origin !== config.publicOrigin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return next(new AppError(403, "不允许跨站请求"));
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("demo_session="))
        ?.slice(13) || "";
    const parts = cookie.split(".");
    let valid =
      parts.length === 3 &&
      /^[a-f0-9]{48}$/.test(parts[0]) &&
      /^\d{13}$/.test(parts[1]) &&
      Number(parts[1]) > Date.now() &&
      Number(parts[1]) <= Date.now() + 86400000 &&
      safe(parts[2], sign(parts[0] + "." + parts[1]));
    let identity = valid ? parts[0] + "." + parts[1] : "";
    if (req.path === "/api/session" && req.method === "GET") {
      if (!valid)
        identity =
          randomBytes(24).toString("hex") + "." + (Date.now() + 86400000);
      res.cookie("demo_session", identity + "." + sign(identity), {
        httpOnly: true,
        sameSite: "strict",
        secure: origin.protocol === "https:",
        path: "/",
        maxAge: Math.max(0, Number(identity.split(".")[1]) - Date.now()),
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        csrfToken: sign("csrf:" + identity),
        mode: "demo",
        retentionHours: config.demoRetentionHours,
        dailyLimit: config.demoVisitorLimit,
        aiConfigured: Boolean(process.env.LLM_API_KEY),
      });
    }
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      if (!valid) return next(new AppError(401, "会话已过期，请刷新页面"));
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !safe(req.headers["x-csrf-token"], sign("csrf:" + identity))
      )
        return next(new AppError(403, "请求校验失败，请刷新页面"));
      if (req.path.startsWith("/api/settings") || req.path === "/api/shutdown")
        return next(new AppError(403, "展示版不提供管理接口"));
      req.visitor = parts[0];
      req.demoIp = sign("ip:" + req.ip);
    }
    next();
  };
}
module.exports = { demoBoundary };
