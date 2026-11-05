require("dotenv").config({ quiet: true });
const { createApp } = require("./src/app");
const { app, repo, tasks } = createApp();
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`简历档案库：http://127.0.0.1:${server.address().port}`);
  void tasks.start();
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "端口已被占用，请关闭旧服务或设置 PORT"
      : "服务启动失败",
  );
  process.exitCode = 1;
  repo.close();
});
async function stop() {
  app.emit("close-resources");
  tasks.stopped = true;
  server.close();
  while (tasks.running)
    await new Promise((resolve) => setTimeout(resolve, 100));
  repo.close();
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
app.once("shutdown", stop);
