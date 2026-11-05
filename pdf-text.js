const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { createWorker } = require("tesseract.js");

function openPdf(filePath) {
  const pdfjsRoot = path.dirname(
    require.resolve("pdfjs-dist/package.json", {
      paths: [path.dirname(require.resolve("pdf-parse"))],
    }),
  );
  return new PDFParse({
    data: fs.readFileSync(filePath),
    cMapUrl: pdfjsRoot + "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: pdfjsRoot + "/standard_fonts/",
  });
}

function textCount(text) {
  return (text.match(/[\p{L}\p{N}]/gu) || []).length;
}

async function extractPdf(
  filePath,
  { dataDir = path.join(__dirname, "data") } = {},
) {
  const parser = openPdf(filePath);
  let worker;
  try {
    const result = await parser.getText();
    if (result.pages.length > 30) throw new Error("PDF 超过 30 页处理上限");
    const output = [];
    const ocrPages = [];
    // Process one page at a time so a scanned attachment in a mixed PDF is also recognized.
    for (const page of result.pages) {
      let text = page.text || "";
      if (textCount(text) < 40) {
        if (!worker) {
          const langPath = path.join(dataDir, "ocr-languages");
          fs.mkdirSync(langPath, { recursive: true });
          for (const lang of ["chi_sim", "eng"]) {
            const source = path.join(
              path.dirname(require.resolve(`@tesseract.js-data/${lang}`)),
              "4.0.0",
              `${lang}.traineddata.gz`,
            );
            const target = path.join(langPath, `${lang}.traineddata.gz`);
            if (!fs.existsSync(target)) fs.copyFileSync(source, target);
          }
          worker = await createWorker(["chi_sim", "eng"], 1, {
            langPath,
            cacheMethod: "none",
            gzip: true,
          });
        }
        const screenshot = await parser.getScreenshot({
          partial: [page.num],
          desiredWidth: 1800,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const recognized = await worker.recognize(
          Buffer.from(screenshot.pages[0].data),
        );
        const cleaned = recognized.data.text.replace(
          /([\u3400-\u9fff])[^\S\r\n]+(?=[\u3400-\u9fff])/g,
          "$1",
        );
        if (textCount(cleaned) > textCount(text)) text = cleaned;
        ocrPages.push(page.num);
      }
      output.push(text);
    }
    const text = output.join("\n\n").trim();
    if (textCount(text) < 5)
      throw new Error("未识别到有效文字，请使用清晰、方向正确的扫描件");
    return {
      text,
      ocrPages,
      pageCount: result.pages.length,
      extractionMode: ocrPages.length ? "PDF + 本地 OCR" : "PDF 文本提取",
    };
  } finally {
    if (worker) await worker.terminate();
    await parser.destroy();
  }
}

module.exports = { extractPdf, openPdf };
