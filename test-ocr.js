const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { extractPdf } = require("./pdf-text");

async function main() {
  GlobalFonts.registerFromPath("C:/Windows/Fonts/msyh.ttc", "TestChinese");
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = "black";
  ctx.font = "42px TestChinese";
  [
    "RESUME: Alice Chen",
    "Education: Master",
    "Skills: Python SQL",
    "Email: alice@example.com",
    "姓名：张测试",
    "学历：硕士",
  ].forEach((s, i) => ctx.fillText(s, 70, 100 + i * 95));
  const jpg = canvas.toBuffer("image/jpeg");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1200 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      ),
      jpg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(
      "<< /Length 31 >>\nstream\nq 600 0 0 400 0 0 cm /Im0 Do Q\nendstream",
    ),
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from("\nendobj\n"));
  });
  const xref = Buffer.concat(parts).length;
  parts.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((x) => String(x).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-ocr-"));
  const file = path.join(dir, "scan.pdf");
  fs.writeFileSync(file, Buffer.concat(parts));
  try {
    const result = await extractPdf(file, { dataDir: dir });
    assert.deepEqual(result.ocrPages, [1]);
    assert.match(result.text, /Alice/i);
    assert.match(result.text, /Python/i);
    assert.match(result.text, /硕士/);
    console.log("PASS: scanned PDF recognized with local Chinese/English OCR");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
