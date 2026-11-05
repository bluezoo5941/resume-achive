export const $ = (id) => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text, action, secondary = true) {
  const node = element("button", text, "btn" + (secondary ? " secondary" : ""));
  node.type = "button";
  node.onclick = action;
  return node;
}
export function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).className = "message" + (error ? " error" : "");
}
export function badge(status) {
  return element(
    "span",
    { queued: "排队中", processing: "解析中", done: "已归档", failed: "失败" }[
      status
    ] || status,
    "badge " + status,
  );
}
