const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { imagePdf, textPdf } = require("../tests/fixtures");
const dir = path.resolve(process.argv[2]);
if (fs.existsSync(dir)) throw new Error("请使用新的验收目录");
fs.mkdirSync(path.join(dir, "fixtures"), { recursive: true });
GlobalFonts.registerFromPath("C:/Windows/Fonts/msyh.ttc", "AcceptanceChinese");
const canvas = createCanvas(1200, 1600),
  ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, 1200, 1600);
ctx.fillStyle = "#111";
ctx.font = "40px AcceptanceChinese";
[
  "虚构验收简历（非真实个人资料）",
  "姓名：张测试",
  "学历：硕士，五年工作经验",
  "最近公司：星海科技，岗位：产品经理",
  "之前就职：栖云网络",
  "技能：SQL、SaaS、数据分析",
  "毕业学校：示例大学，专业：管理科学",
  "邮箱：test@example.com",
  "工作内容：负责供应商管理、产线调试",
  "推进跨团队合作，完成企业协作平台交付",
].forEach((line, i) => ctx.fillText(line, 65, 110 + i * 105));
fs.writeFileSync(
  path.join(dir, "fixtures", "张测试.pdf"),
  imagePdf(canvas.toBuffer("image/jpeg"), 1200, 1600),
);
fs.writeFileSync(path.join(dir, "fixtures", "Alice.pdf"), textPdf());
fs.writeFileSync(
  path.join(dir, "fixtures", "损坏测试.pdf"),
  "%PDF-1.4\ncorrupt",
);
if (process.argv.includes("--with-model")) {
  const db = new DatabaseSync(
    path.join(__dirname, "..", "data", "library.sqlite"),
    { readOnly: true },
  );
  try {
    const row = db.prepare("SELECT value FROM settings WHERE id=1").get();
    if (!row) throw new Error("缺少模型设置");
    fs.writeFileSync(path.join(dir, "settings.json"), row.value, {
      mode: 0o600,
    });
  } finally {
    db.close();
  }
}
console.log("Created fictional acceptance fixtures in isolated directory");
