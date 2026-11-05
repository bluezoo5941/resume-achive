const { openPdf } = require("../pdf-text");
async function main() {
  const parser = openPdf(process.argv[2]);
  let png;
  try {
    const result = await parser.getScreenshot({
      partial: [Number(process.argv[3])],
      desiredWidth: 1200,
      imageDataUrl: false,
      imageBuffer: true,
    });
    if (!result.pages[0]) throw new Error("missing page");
    png = Buffer.from(result.pages[0].data).toString("base64");
  } finally {
    await parser.destroy();
  }
  process.send({ png }, () => process.exit(0));
}
main().catch(() => process.send({ error: true }, () => process.exit(1)));
