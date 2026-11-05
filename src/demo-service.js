const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("./errors");
class DemoService {
  constructor(repo, config) {
    this.repo = repo;
    this.config = config;
  }
  authorize(req, id) {
    const row = this.repo.raw(id);
    if (!row || row.owner !== req.visitor)
      throw new AppError(404, "简历不存在");
    return row;
  }
  reserve(req) {
    const allowed = this.repo.reserveDemoUsage([
      ["global", this.config.demoDailyLimit],
      ["visitor:" + req.visitor, this.config.demoVisitorLimit],
      ["ip:" + req.demoIp, this.config.demoVisitorLimit],
    ]);
    if (!allowed) throw new AppError(429, "今日演示处理额度已用完，请明天再试");
  }
  cleanup() {
    const cutoff = new Date(
      Date.now() - this.config.demoRetentionHours * 3600000,
    ).toISOString();
    for (const row of this.repo.expiredDemoRows(cutoff)) {
      if (path.basename(row.stored_name) !== row.stored_name)
        throw new Error("Invalid stored file");
      fs.rmSync(path.join(this.config.uploads, row.stored_name), {
        force: true,
      });
      this.repo.deleteDemoRow(row.id);
    }
    this.repo.pruneDemoUsage(
      new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    );
  }
}
module.exports = { DemoService };
