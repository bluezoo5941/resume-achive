const fs = require("node:fs");
const path = require("node:path");
const { textPdf } = require("../tests/fixtures");
const folder = path.resolve(process.argv[2]);
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, "Alice-test.pdf"), textPdf());
fs.writeFileSync(
  path.join(folder, "Bob-test.pdf"),
  textPdf(
    "Resume Bob Smith Education Bachelor Skills Java SQL contact bob@example.com Work experience four years",
  ),
);
fs.writeFileSync(
  path.join(folder, "Broken-test.pdf"),
  "%PDF-1.4\nbroken test file",
);
console.log("Three fictional browser fixtures generated");
