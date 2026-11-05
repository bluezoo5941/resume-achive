const KEY_FIELDS = [
  "name",
  "education",
  "targetRole",
  "currentCompany",
  "companies",
  "skills",
  "email",
  "phone",
  "school",
  "major",
];
function searchExpression(scope) {
  const fields = scope === "full" ? [...KEY_FIELDS, "rawText"] : KEY_FIELDS;
  return (
    "filename || ' ' || " +
    fields
      .map((field) => `coalesce(json_extract(result,'$.${field}'),'')`)
      .join(" || ' ' || ")
  );
}
function termsOf(q) {
  return q.trim().toLowerCase().split(/\s+/u).filter(Boolean);
}
function snippetOf(record, q, scope) {
  if (!q.trim()) return "";
  const fields = [
    ...KEY_FIELDS.map((key) =>
      Array.isArray(record[key])
        ? record[key].join("、")
        : String(record[key] || ""),
    ),
  ];
  if (scope === "full") fields.push(record.rawText || "");
  const terms = termsOf(q);
  const source =
    fields.find((value) =>
      terms.some((term) => value.toLowerCase().includes(term)),
    ) || record.originalName;
  const position = Math.max(
    0,
    source
      .toLowerCase()
      .indexOf(terms.find((term) => source.toLowerCase().includes(term)) || ""),
  );
  const start = Math.max(0, position - 35);
  return (
    (start ? "…" : "") +
    source.slice(start, start + 180).replace(/\s+/g, " ") +
    (source.length > start + 180 ? "…" : "")
  );
}
module.exports = { searchExpression, termsOf, snippetOf };
