export function splitMatches(text, query) {
  const terms = [...new Set(query.trim().split(/\s+/u).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!terms.length) return [{ text, match: false }];
  const pattern = new RegExp(
    "(" +
      terms
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")",
    "giu",
  );
  const parts = [];
  let start = 0;
  for (const hit of text.matchAll(pattern)) {
    if (hit.index > start)
      parts.push({ text: text.slice(start, hit.index), match: false });
    parts.push({ text: hit[0], match: true });
    start = hit.index + hit[0].length;
  }
  if (start < text.length)
    parts.push({ text: text.slice(start), match: false });
  return parts;
}
export function highlight(node, text, query) {
  for (const part of splitMatches(String(text || ""), query)) {
    if (part.match) {
      const mark = document.createElement("mark");
      mark.textContent = part.text;
      node.append(mark);
    } else node.append(document.createTextNode(part.text));
  }
}
