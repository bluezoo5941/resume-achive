const { fork } = require("node:child_process");
const path = require("node:path");
function extractInWorker(file, dataDir) {
  return new Promise((resolve, reject) => {
    const worker = fork(
      path.join(__dirname, "pdf-worker.js"),
      [file, dataDir],
      { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    const timer = setTimeout(() => {
      worker.kill();
      reject(new Error("PDF/OCR 处理超时，请缩小文件或检查扫描质量"));
    }, 180000);
    worker.once("message", (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("PDF/OCR 处理异常"));
    });
    worker.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("PDF/OCR 处理已中断"));
    });
  });
}
class TaskService {
  constructor(repo, model, config) {
    this.repo = repo;
    this.model = model;
    this.config = config;
    this.running = false;
    this.stopped = false;
  }
  async start() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      let job;
      while (!this.stopped && (job = this.repo.claim())) {
        try {
          const extraction = await extractInWorker(
            path.join(this.config.uploads, job.stored_name),
            this.config.dataDir,
          );
          const result = await this.model.extract(
            extraction.text,
            job.filename,
          );
          this.repo.complete(job.id, {
            ...result,
            rawText: extraction.text,
            pageCount: extraction.pageCount,
            extractionMode: extraction.extractionMode,
            ocrPages: extraction.ocrPages,
          });
        } catch (error) {
          const message = error.status
            ? error.message
            : error.message.includes("超时")
              ? error.message
              : "PDF 无法读取或 OCR 识别失败，请检查文件是否损坏、加密或不清晰";
          this.repo.fail(job.id, message);
          console.error(
            JSON.stringify({
              event: "resume_processing_failed",
              id: job.id,
              code: error.code || "PROCESSING_FAILED",
            }),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
module.exports = { TaskService };
