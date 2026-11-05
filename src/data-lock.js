const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
function acquireLock(dataDir) {
  const file = path.join(dataDir, "runtime.lock");
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, owner, { flag: "wx", mode: 0o600 });
      return () => {
        if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === owner)
          fs.unlinkSync(file);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const previous = fs.readFileSync(file, "utf8");
      let pid;
      try {
        pid = JSON.parse(previous).pid;
      } catch {
        throw new Error(
          "运行锁格式无效，请确认旧服务已关闭后检查 data/runtime.lock",
        );
      }
      if (!Number.isInteger(pid) || pid < 1)
        throw new Error("运行锁进程编号无效");
      try {
        process.kill(pid, 0);
        throw new Error("该数据目录已有服务运行，请勿同时启动多个实例");
      } catch (check) {
        if (check.code !== "ESRCH") throw check;
        if (fs.readFileSync(file, "utf8") !== previous)
          throw new Error("另一实例正在启动，请稍后重试");
        fs.unlinkSync(file);
      }
    }
  }
  throw new Error("无法获得数据目录运行锁");
}
module.exports = { acquireLock };
