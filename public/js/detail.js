import { request } from "./api.js";
import { $, element, message } from "./ui.js";
let sequence = 0;
export async function showDetail(id) {
  const ticket = ++sequence;
  message("detailMessage", "正在加载…");
  $("pdf").removeAttribute("src");
  $("download").removeAttribute("href");
  $("detailName").textContent = "简历详情";
  $("detailFile").textContent = "";
  $("facts").replaceChildren();
  $("skills").replaceChildren();
  $("rawText").textContent = "";
  try {
    const item = await request(`/api/resumes/${id}`);
    if (ticket !== sequence) return;
    $("detailName").textContent = item.name || "未识别姓名";
    $("detailFile").textContent = item.originalName;
    $("rawText").textContent = item.rawText || "暂无提取文本";
    for (const [label, value] of [
      ["学历", item.education],
      [
        "经验",
        item.experienceYears == null ? "未识别" : `${item.experienceYears} 年`,
      ],
      ["岗位", item.targetRole],
      ["最近公司", item.currentCompany],
      ["任职公司", (item.companies || []).join("、")],
      ["学校", item.school],
      ["专业", item.major],
      ["电话", item.phone],
      ["邮箱", item.email],
      ["解析方式", item.parseMode],
      ["文字来源", item.extractionMode],
    ]) {
      const fact = element("div", undefined, "fact");
      fact.append(element("span", label), element("b", value || "—"));
      $("facts").append(fact);
    }
    for (const skill of item.skills || [])
      $("skills").append(element("span", skill, "badge"));
    $("download").href = `/api/resumes/${id}/file`;
    let page = 1;
    const total = item.pageCount || 1;
    function preview() {
      $("pdf").src = `/api/resumes/${id}/preview?page=${page}`;
      $("previewPage").textContent = `${page} / ${total}`;
      $("previewPrevious").disabled = page === 1;
      $("previewNext").disabled = page >= total;
    }
    $("previewPrevious").onclick = () => {
      if (page > 1) {
        page--;
        preview();
      }
    };
    $("previewNext").onclick = () => {
      if (page < total) {
        page++;
        preview();
      }
    };
    $("pdf").onerror = () =>
      message("detailMessage", "预览暂不可用，可打开原始 PDF 或稍后重试", true);
    preview();
    message("detailMessage", "");
  } catch (error) {
    if (ticket === sequence) message("detailMessage", error.message, true);
  }
}
