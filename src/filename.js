// Older multipart uploads stored UTF-8 filename bytes as Latin-1 text.
// Repair only lossless UTF-8 sequences, keeping genuine Latin-1 names intact.
function normalizeFilename(value) {
  if (typeof value !== "string") return "";
  if ([...value].some((character) => character.codePointAt(0) > 255))
    return value;
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded.includes("\ufffd") ? value : decoded;
}
module.exports = { normalizeFilename };
