const { fork } = require("node:child_process");
const path = require("node:path");
const { AppError } = require("./errors");
let active = 0;
function preview(file, page) {
  if (active >= 2) throw new AppError(429, "预览处理中，请稍后重试");
  active++;
  return new Promise((resolve, reject) => {
    const child = fork(
      path.join(__dirname, "preview-worker.js"),
      [file, String(page)],
      { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new AppError(504, "PDF 预览超时，请打开原始文件"));
    }, 30000);
    child.once("message", (message) => {
      clearTimeout(timer);
      if (message.error)
        reject(new AppError(422, "该页面无法预览，请打开原始 PDF"));
      else resolve(Buffer.from(message.png, "base64"));
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new AppError(502, "预览服务异常"));
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new AppError(502, "预览进程中断"));
    });
  }).finally(() => {
    active--;
  });
}
module.exports = { preview };
