#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(id -u)" -ne 0 ]]; then echo 'Run with sudo bash deploy/install.sh'; exit 1; fi
[[ "$(pwd)" == /opt/resume-demo ]] || { echo 'Extract application into /opt/resume-demo first'; exit 1; }
/usr/local/bin/node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a!==24||b<14)process.exit(1)'
if ! id resume-demo >/dev/null 2>&1; then useradd --system --home-dir /var/lib/resume-demo --shell /usr/sbin/nologin resume-demo; fi
install -d -o resume-demo -g resume-demo -m 700 /var/lib/resume-demo
if [[ ! -f /etc/resume-demo.env ]]; then
    install -m 600 deploy/demo.env.example /etc/resume-demo.env
    secret=$(/usr/local/bin/node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
    sed -i "s/REPLACE_WITH_RANDOM_64_HEX_CHARACTERS/$secret/" /etc/resume-demo.env
fi
install -m 644 deploy/resume-demo.service /etc/systemd/system/resume-demo.service
systemctl daemon-reload
echo 'Installed. Edit /etc/resume-demo.env, then run: sudo systemctl enable --now resume-demo'
echo 'Local SSH-tunnel testing only. No firewall ports were opened.'
