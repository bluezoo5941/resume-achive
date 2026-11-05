import { connect } from "./api.js";
import { $, message } from "./ui.js";
import { setupUpload } from "./upload.js";
import { setupLibrary } from "./library.js";
import { showDetail } from "./detail.js";
import { setupSettings } from "./settings.js";
let current = "upload";
const labels = {
  upload: "上传简历",
  library: "简历库",
  detail: "简历详情",
  settings: "模型设置",
};
const upload = setupUpload((id) => {
  void go("detail");
  void showDetail(id);
});
const library = setupLibrary((id) => {
  void go("detail");
  void showDetail(id);
});
const settings = setupSettings();
async function go(page) {
  current = page;
  document
    .querySelectorAll(".page")
    .forEach((node) => node.classList.toggle("active", node.id === page));
  document
    .querySelectorAll("nav button")
    .forEach((node) =>
      node.classList.toggle(
        "active",
        node.dataset.page === (page === "detail" ? "library" : page),
      ),
    );
  document.title = labels[page] + " · 简历档案库";
  $("pageTitle").textContent = labels[page];
  if (page === "upload") await upload();
  if (page === "library") await library();
  if (page === "settings") await settings();
}
document.querySelectorAll("[data-page]").forEach(
  (node) =>
    (node.onclick = () => {
      go(node.dataset.page).catch((error) =>
        message("uploadMessage", error.message, true),
      );
    }),
);
try {
  await connect();
  await go("upload");
} catch (error) {
  message("uploadMessage", error.message, true);
}
let polling = false;
setInterval(async () => {
  if (current !== "upload" || document.hidden || polling) return;
  polling = true;
  try {
    await upload();
  } catch (error) {
    message("uploadMessage", error.message, true);
  } finally {
    polling = false;
  }
}, 2000);
