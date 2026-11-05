import { demoMode, request } from "./api.js";
import { $, element, button, badge, message } from "./ui.js";
export function setupUpload(openDetail) {
  let sending = false;
  const pending = [];
  function rejected(file, reason, retry = false) {
    const row = element("div", undefined, "job");
    row.append(element("span", `${file.name}：${reason}`, "message error"));
    if (retry)
      row.append(
        button("重新上传", () => {
          row.remove();
          enqueue([file]);
        }),
      );
    $("uploadErrors").append(row);
  }
  async function refresh() {
    const result = await request("/api/resumes?limit=100");
    $("jobs").replaceChildren();
    if (!result.items.length)
      $("jobs").append(element("p", "尚无上传记录", "muted"));
    for (const job of result.items) {
      const row = element("div", undefined, "job"),
        info = element("div", undefined, "job-name");
      info.append(element("b", job.originalName));
      if (job.error) info.append(element("small", job.error));
      const actions = element("div", undefined, "job-actions");
      actions.append(badge(job.status));
      if (job.status === "done")
        actions.append(button("查看", () => openDetail(job.id)));
      if (job.status === "failed")
        actions.append(
          button("重试", async () => {
            try {
              await request(`/api/resumes/${job.id}/retry`, { method: "POST" });
              await refresh();
            } catch (error) {
              message("uploadMessage", error.message, true);
            }
          }),
        );
      if (!demoMode && job.status !== "processing")
        actions.append(
          button("删除", async () => {
            if (
              !window.confirm(
                `确定删除「${job.originalName}」？原始 PDF 和记录将一并删除。`,
              )
            )
              return;
            try {
              await request(`/api/resumes/${job.id}`, { method: "DELETE" });
              await refresh();
              message("uploadMessage", "已删除上传记录");
            } catch (error) {
              message("uploadMessage", error.message, true);
            }
          }),
        );
      row.append(info, actions);
      $("jobs").append(row);
    }
  }
  async function send() {
    if (sending) return;
    sending = true;
    try {
      let file;
      while ((file = pending.shift())) {
        if (!/\.pdf$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
          rejected(file, "仅支持 20MB 以内的 PDF");
          message(
            "uploadMessage",
            `${file.name}：仅支持 20MB 以内的 PDF`,
            true,
          );
          continue;
        }
        message(
          "uploadMessage",
          `正在上传 ${file.name}，剩余 ${pending.length} 份`,
        );
        const data = new FormData();
        data.append("file", file);
        try {
          const result = await request("/api/resumes", {
            method: "POST",
            body: data,
          });
          message(
            "uploadMessage",
            result.duplicate
              ? `${file.name} 已存在，已复用原记录`
              : `${file.name} 已保存，后台自动解析中`,
          );
          await refresh();
        } catch (error) {
          rejected(file, error.message, true);
          message("uploadMessage", `${file.name}：${error.message}`, true);
        }
      }
    } finally {
      sending = false;
    }
  }
  function enqueue(files) {
    pending.push(...files);
    void send();
  }
  $("choose").onclick = () => $("file").click();
  $("file").onchange = () => {
    enqueue([...$("file").files]);
    $("file").value = "";
  };
  const drop = $("drop");
  drop.ondragover = (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    enqueue([...event.dataTransfer.files]);
  };
  return refresh;
}
