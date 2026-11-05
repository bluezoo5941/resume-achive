const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const identity = require("./src/identity");
async function main() {
  const dataDir = path.resolve(
    process.env.DATA_DIR || path.join(__dirname, "data"),
  );
  const dataId = createHash("sha256")
    .update(dataDir.toLowerCase())
    .digest("hex");
  const stateFile = path.join(dataDir, "launcher-state.json");
  let savedPort;
  if (fs.existsSync(stateFile)) {
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (
      saved.installId === identity.installId &&
      Number.isInteger(saved.port) &&
      saved.port > 0 &&
      saved.port <= 65535
    )
      savedPort = saved.port;
  }
  const explicit = Boolean(process.env.PORT);
  let port = Number(process.env.PORT || savedPort || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必须为 1 至 65535");
  async function probe() {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/session`, {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (!response.ok) return { conflict: true };
      let body;
      try {
        body = await response.json();
      } catch {
        return { conflict: true };
      }
      if (body.appId !== "resume-archive") return { conflict: true };
      const sameData = body.dataId === dataId;
      const sameInstall = body.installId === identity.installId;
      if (!sameData || !sameInstall || body.buildId !== identity.buildId)
        return {
          conflict: true,
          sameData,
          sameInstall,
          canStop: sameData && (!body.installId || sameInstall),
          token: body.csrfToken,
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      const cookie = response.headers.get("set-cookie");
      if (!cookie) return { conflict: true };
      return { token: body.csrfToken, cookie: cookie.split(";")[0] };
    } catch (error) {
      if (error.cause?.code === "ECONNREFUSED") return null;
      // An occupied port that does not speak HTTP must never be opened as this app.
      if (
        error.name === "TimeoutError" ||
        error.cause?.code === "UND_ERR_SOCKET" ||
        error.cause?.code === "ECONNRESET"
      )
        return { conflict: true };
      throw error;
    }
  }
  let session = await probe();
  if (process.argv.includes("--stop")) {
    if (session?.conflict && !session.canStop)
      throw new Error(
        "该端口运行的是另一份程序或旧版本，未停止它。请使用对应目录的停止.cmd。",
      );
    if (!session) {
      console.log("服务未运行");
      return;
    }
    const response = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
      headers: { Cookie: session.cookie, "X-CSRF-Token": session.token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("停止服务失败");
    console.log("正在停止服务，当前解析完成后会退出。");
    return;
  }
  if (session?.conflict && session.sameData)
    throw new Error(
      "此数据目录仍由旧版本或另一安装目录使用。请先用旧版停止.cmd停止服务，再启动新版；未打开旧页面。",
    );
  if (session?.conflict && explicit)
    throw new Error(
      "指定端口被旧版或其他程序占用。请先停止对应服务或修改 PORT；未打开旧页面。",
    );
  for (let attempts = 0; session?.conflict && attempts < 20; attempts++) {
    port++;
    if (port > 65535) break;
    session = await probe();
    if (session?.conflict && session.sameData)
      throw new Error("数据目录仍被另一实例占用，请先停止旧版。");
  }
  if (session?.conflict) throw new Error("未找到可用端口，请停止旧版后重试。");
  fs.mkdirSync(dataDir, { recursive: true });
  if (!session) {
    const stdout = fs.openSync(path.join(dataDir, "service.log"), "a"),
      stderr = fs.openSync(path.join(dataDir, "error.log"), "a");
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
      cwd: __dirname,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr],
      env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) },
    });
    child.unref();
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const found = await probe();
      if (found && !found.conflict) {
        ready = true;
        break;
      }
      if (found?.conflict)
        throw new Error("启动期间端口被其他程序占用，未打开页面。");
    }
    if (!ready)
      throw new Error("启动失败，请查看 data/error.log；未打开旧页面。");
  }
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ port, installId: identity.installId }),
  );
  const url = `http://127.0.0.1:${port}/?build=${identity.buildId.slice(0, 12)}`;
  if (process.env.NO_BROWSER !== "1") {
    if (process.platform !== "win32")
      throw new Error(`服务已启动，请手动打开 ${url}`);
    const browser = spawn(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", url],
      { detached: true, windowsHide: true, stdio: "ignore" },
    );
    browser.unref();
  }
  console.log(`本地版 v${identity.version} 已就绪：${url}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
