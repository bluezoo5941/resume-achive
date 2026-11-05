import { request } from "./api.js";
import { $, message } from "./ui.js";
export function setupSettings() {
  $("testModel").onclick = async () => {
    $("testModel").disabled = true;
    message("settingsMessage", "正在测试已保存的配置…");
    try {
      await request("/api/settings/test", { method: "POST" });
      message("settingsMessage", "连接成功");
    } catch (error) {
      message("settingsMessage", error.message, true);
    } finally {
      $("testModel").disabled = false;
    }
  };
  async function refresh() {
    try {
      const result = await request("/api/settings");
      $("baseUrl").value = result.baseUrl;
      $("model").value = result.model;
      $("apiKey").value = "";
      $("keyStatus").textContent = result.hasApiKey
        ? "已保存密钥（不回显），留空保留。"
        : "未配置密钥，将使用本地基础提取。";
    } catch (error) {
      message("settingsMessage", error.message, true);
    }
  }
  $("settingsForm").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await request("/api/settings", {
        method: "PUT",
        body: {
          baseUrl: $("baseUrl").value,
          model: $("model").value,
          apiKey: $("apiKey").value,
        },
      });
      await refresh();
      message("settingsMessage", "本机配置已保存");
    } catch (error) {
      message("settingsMessage", error.message, true);
    } finally {
      button.disabled = false;
    }
  };
  return refresh;
}
