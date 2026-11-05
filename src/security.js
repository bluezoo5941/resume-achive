const { randomBytes, timingSafeEqual, createHash } = require("node:crypto");
const { AppError } = require("./errors");
const identity = require("./identity");
function localBoundary(config) {
  const token = randomBytes(32).toString("hex");
  const equal = (value) =>
    typeof value === "string" &&
    Buffer.byteLength(value) === Buffer.byteLength(token) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(token));
  return (req, res, next) => {
    const port = req.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host))
      return next(new AppError(403, "仅允许本机地址访问", "FORBIDDEN"));
    const origin = req.headers.origin;
    if (origin && !hosts.map((h) => "http://" + h).includes(origin))
      return next(new AppError(403, "不允许跨站请求", "FORBIDDEN"));
    if (req.headers["sec-fetch-site"] === "cross-site")
      return next(new AppError(403, "不允许跨站请求", "FORBIDDEN"));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    if (req.path === "/api/session" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.cookie("local_session", token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
      return res.json({
        csrfToken: token,
        appId: "resume-archive",
        ...identity,
        dataId: createHash("sha256")
          .update(config.dataDir.toLowerCase())
          .digest("hex"),
      });
    }
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      const cookie = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("local_session="))
        ?.slice(14);
      if (!equal(cookie))
        return next(
          new AppError(401, "请刷新页面建立本机会话", "UNAUTHORIZED"),
        );
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !equal(req.headers["x-csrf-token"])
      )
        return next(
          new AppError(403, "请求校验失败，请刷新后重试", "FORBIDDEN"),
        );
    }
    next();
  };
}
module.exports = { localBoundary };
