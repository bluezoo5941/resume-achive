const { extractPdf } = require("../pdf-text");
extractPdf(process.argv[2], { dataDir: process.argv[3] })
  .then((result) => process.send({ result }, () => process.exit(0)))
  .catch(() =>
    process.send({ error: "PDF/OCR 处理失败" }, () => process.exit(1)),
  );
