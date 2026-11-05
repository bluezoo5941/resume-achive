# 服务器展示版部署

此版本在本地版基础上增加 APP_MODE=demo，不替换本地数据。用于低流量作品演示；不作为多人生产人事系统。

## 已实现边界

- Node 仍只监听 127.0.0.1。公网入口通过 Nginx HTTPS 转发，严格校验 PUBLIC_ORIGIN 对应 Host/Origin。
- 独立 DATA_DIR；发现无 owner 的本地简历或旧 JSON 即拒绝启动，禁止上传本地 data/.env。
- 签名、HttpOnly、SameSite Strict 访客 Cookie，有效期 24 小时；HTTPS 模式附 Secure。不同浏览器隔离列表、公司筛选、详情、PDF、预览、重试及去重。清除 Cookie 后无法找回原会话数据，不提供账户。
- 所有 settings 和 shutdown 接口在展示模式返回 403，密钥仅服务器环境文件配置。
- 5MB/份，原有 30 页上限；OCR/AI 队列单任务串行。每 UTC 自然日访客/IP 各最多 5 次，全站 30 次，新任务和失败重试均计数。重复文件不再扣额度。额度 SQLite 事务保存，重启不重置；不同访客同文件分别归档。
- 额度是处理次数，不是精确金额；设定供应商账户预算，避免额度内的高 token 消费。共享出口 IP 会共享 IP 限额。
- 完成/失败的演示记录和 PDF 超过上传时间 24 小时后，每分钟清理；处理中/排队记录等待结束后清理。服务停机期间不清理，下次启动补清理。SQLite 删除不是磁盘安全擦除，系统备份不会自动删除。
- 未配置 API Key 时明确显示“本地规则提取”，不声称已调用 AI。配置后发送简历文本给该模型供应商。页面提示只使用虚构资料。
- 无公开默认样例库，首次为空；用户可上传虚构 PDF 展示完整流程。

## 1. 上传安装（备案期间可进行）

前提：Ubuntu 24.04 x86_64，Node.js 24.14–24.x 已装到 /usr/local/bin/node。将 resume-demo-linux-source.tar.gz 上传到 /home/ubuntu/。这是源码包，不含 node_modules，必须在 Linux 安装依赖，不能复制 Windows 的依赖目录。

```bash
sudo install -d -m 755 /opt/resume-demo
sudo tar -xzf /home/ubuntu/resume-demo-linux-source.tar.gz -C /opt/resume-demo
sudo chown -R ubuntu:ubuntu /opt/resume-demo
cd /opt/resume-demo
npm ci --omit=dev
sudo bash deploy/install.sh
```

首次安装到专用空目录；已有部署先停止服务并备份数据和 /etc/resume-demo.env，再更新代码，勿覆盖运行数据。安装脚本不启动服务、不安装其他系统包、不修改防火墙；已存在的配置文件保留。

## 2. 配置与启动

```bash
sudo nano /etc/resume-demo.env
```

首次脚本已生成随机 SESSION_SECRET，不需要展示或发送给任何人。填 LLM_API_KEY；其他默认值允许 SSH 隧道本机测试。不要把配置截图或密钥发到聊天里。

```bash
sudo systemctl enable --now resume-demo
sudo systemctl status resume-demo --no-pager
curl -fsS http://127.0.0.1:3002/api/session
```

最后的会话响应只是本机检查，勿复制浏览器会话给他人。查看日志用 sudo journalctl -u resume-demo -n 50 --no-pager，分享前检查是否存在第三方异常内容。停止用 sudo systemctl stop resume-demo。

## 3. 本机 SSH 隧道

Windows PowerShell 打开并保持运行（使用已有登录方式，密码自行输入）：

```powershell
ssh -N -L 3002:127.0.0.1:3002 ubuntu@你的服务器IP
```

浏览器打开 http://127.0.0.1:3002。测试虚构简历上传、OCR、AI、搜索、原件预览；用另一个浏览器验证数据隔离。此时云防火墙无需开放 3002。

## 4. 备案通过后的公网步骤（尚未执行）

1. 确认域名实名认证及 ICP 备案完成，按要求展示备案信息；AI 在线功能是否涉及额外要求需向接入商确认。
2. 域名 A 记录解析到服务器公网 IPv4；安装 Nginx，申请并配置 HTTPS 证书及自动续期。
3. 修改 /etc/resume-demo.env 的 PUBLIC_ORIGIN=https://bluezoo.site，保留原 SESSION_SECRET，重启服务。
4. 参考 deploy/nginx.conf.example 配置，真实证书路径就绪后执行 sudo nginx -t，再启用站点。不要直接加载缺少证书的配置。
5. 仅开放必要的 80/443；3002 始终保持本机监听。Nginx 必须覆盖 X-Forwarded-For=$remote_addr，不能信任访客自行提供的地址。本例不支持直接叠加 CDN，增加 CDN 时重新设计可信代理链。
6. 实际验证 HTTPS、Cookie Secure、上传限额、访客隔离及原件访问，再把链接发给别人。

## 验证状态

开发机 Windows：真实 HTTP/SQLite 展示隔离与配额、跨访客对象访问、管理员接口禁用、CSRF、重启会话/额度保留、过期数据清理有测试；本地版已有真实 PDF/OCR 测试。测试中完成字段人为写入仅用于搜索隔离断言，不作为 AI 已调用证明。

Linux 服务器：待执行 npm ci、systemd、原生 PDF 渲染、中文 OCR 与真实模型端到端验收。开发机 Docker Linux 引擎未运行，未将 Windows 测试冒充 Linux 验收。Nginx/HTTPS/DNS/公网验收尚未执行。备案仍由域名持有人处理。
