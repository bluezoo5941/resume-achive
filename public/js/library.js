import { request } from "./api.js";
import { $, element, button, message } from "./ui.js";
import { highlight } from "./highlight.js";
export function setupLibrary(openDetail) {
  let page = 1,
    total = 0,
    sequence = 0,
    debounce;
  async function refresh() {
    const ticket = ++sequence,
      q = $("query").value;
    message("libraryMessage", "正在查询…");
    try {
      const params = new URLSearchParams({
        q,
        education: $("education").value,
        company: $("company").value,
        scope: $("fullText").checked ? "full" : "keywords",
        status: "done",
        page: String(page),
      });
      const result = await request("/api/resumes?" + params);
      if (ticket !== sequence) return;
      total = result.total;
      $("rows").replaceChildren();
      for (const item of result.items) {
        const row = element("tr"),
          name = element("td"),
          link = button("", () => openDetail(item.id));
        link.className = "name-link";
        highlight(link, item.name || "未识别姓名", q);
        name.append(link);
        row.append(name);
        for (const value of [
          item.targetRole || "—",
          item.currentCompany || "—",
          item.education || "未识别",
          item.experienceYears == null ? "—" : `${item.experienceYears} 年`,
        ]) {
          const cell = element("td");
          highlight(cell, value, q);
          row.append(cell);
        }
        const skills = element("td"),
          tags = element("div", undefined, "tags");
        for (const skill of (item.skills || []).slice(0, 5)) {
          const tag = element("span", undefined, "skill-tag");
          tag.title = skill;
          highlight(tag, skill, q);
          tags.append(tag);
        }
        skills.append(tags);
        row.append(skills);
        const match = element("td", undefined, "match-cell"),
          excerpt = element("div", undefined, "match-excerpt");
        highlight(excerpt, item.matchSnippet || "—", q);
        excerpt.title = item.matchSnippet || "";
        match.append(excerpt);
        row.append(match);
        $("rows").append(row);
      }
      $("empty").textContent = result.items.length ? "" : "没有符合条件的简历";
      $("searchCount").textContent = `${total} 份简历`;
      $("pageInfo").textContent =
        `${page} / ${Math.max(1, Math.ceil(total / 25))}`;
      $("previous").disabled = page === 1;
      $("next").disabled = page * 25 >= total;
      message("libraryMessage", "");
    } catch (error) {
      if (ticket === sequence) message("libraryMessage", error.message, true);
    }
  }
  async function filters() {
    try {
      const { companies } = await request("/api/filters"),
        selected = $("company").value;
      $("company").replaceChildren(element("option", "全部公司"));
      $("company").firstChild.value = "";
      for (const name of companies) {
        const option = element("option", name);
        option.value = name;
        $("company").append(option);
      }
      $("company").value = companies.includes(selected) ? selected : "";
    } catch (error) {
      message("libraryMessage", error.message, true);
    }
  }
  function search() {
    page = 1;
    void refresh();
  }
  $("searchForm").onsubmit = (event) => {
    event.preventDefault();
    clearTimeout(debounce);
    search();
  };
  $("query").oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(search, 250);
  };
  for (const id of ["education", "company", "fullText"])
    $(id).onchange = search;
  $("clearFilters").onclick = () => {
    $("education").value = "";
    $("company").value = "";
    search();
  };
  $("filterToggle").onclick = () => {
    const open = $("filterPanel").hidden;
    $("filterPanel").hidden = !open;
    $("filterToggle").setAttribute("aria-expanded", String(open));
  };
  $("previous").onclick = () => {
    if (page > 1) {
      page--;
      void refresh();
    }
  };
  $("next").onclick = () => {
    if (page * 25 < total) {
      page++;
      void refresh();
    }
  };
  return async () => {
    await filters();
    await refresh();
  };
}
