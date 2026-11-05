let csrfToken = "";
export let demoMode = false;
export async function connect() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  if (!response.ok) throw new Error("无法建立本机会话，请检查服务");
  const session = await response.json();
  csrfToken = session.csrfToken;
  demoMode = session.mode === "demo";
  if (demoMode) {
    document.querySelector('[data-page="settings"]').hidden = true;
    document.getElementById("demoNotice").hidden = false;
    if (!session.aiConfigured)
      document
        .getElementById("demoNotice")
        .append(" 当前未配置 AI 密钥，仅使用本地规则提取。");
  }
}
export async function request(url, { method = "GET", body } = {}) {
  const headers = {};
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(url, {
    method,
    body,
    headers,
    credentials: "same-origin",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "服务器响应格式无效" }));
  if (!response.ok)
    throw new Error(result.error || `请求失败（${response.status}）`);
  return result;
}
