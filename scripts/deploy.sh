#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

host="terln-prod"
app_dir="/opt/loom/app"
data_dir="/opt/loom/data"
node_dir="/opt/loom/node"
port="5173"
node_version="v22.22.3"
node_home="$root/.deploy-cache/node-${node_version}-linux-x64"
stage="$root/.deploy-cache/stage"
empty="$root/.deploy-cache/empty"

if [[ ! -x "$node_home/bin/node" ]]; then
  mkdir -p "$root/.deploy-cache"
  archive="$root/.deploy-cache/node-${node_version}-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/${node_version}/node-${node_version}-linux-x64.tar.xz" -o "$archive"
  tar -xJf "$archive" -C "$root/.deploy-cache"
fi

npm --prefix web run build
npm --prefix admin run build
npm --prefix server run build

mkdir -p "$empty" "$stage"
rsync -a --delete "$empty/" "$stage/"
node scripts/install-skills.mjs
mkdir -p "$stage/server" "$stage/web" "$stage/admin" "$stage/skills" "$stage/agents"
cp -R server/dist "$stage/server/dist"
cp server/package.json server/package-lock.json "$stage/server/"
cp -R web/dist "$stage/web/dist"
cp -R admin/dist "$stage/admin/dist"
cp -R skills/listing "$stage/skills/listing"
cp -R agents/listing "$stage/agents/listing"
npm ci --omit=dev --os=linux --cpu=x64 --prefix "$stage/server"

cat > "$root/.deploy-cache/loom.service" << EOF
[Unit]
Description=Loom
After=network.target

[Service]
WorkingDirectory=$app_dir
Environment=PORT=$port
Environment=LOOM_DATA_DIR=$data_dir
Environment=PATH=$node_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$node_dir/bin/node $app_dir/server/dist/index.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

ssh "$host" "mkdir -p '$app_dir' '$data_dir' '$node_dir'"
ssh "$host" "command -v qemu-system-x86_64 >/dev/null && command -v qemu-img >/dev/null || { apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y qemu-system-x86 qemu-utils; }"
rsync -a --delete "$stage/" "$host:$app_dir/"
rsync -a --delete "$node_home/" "$host:$node_dir/"
scp "$root/.deploy-cache/loom.service" "$host:/etc/systemd/system/loom.service"
ssh "$host" "systemctl daemon-reload && systemctl enable loom && systemctl restart loom"

ready=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ssh "$host" "curl -fsS http://127.0.0.1:$port/api/tasks" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ -z "$ready" ]]; then
  ssh "$host" "systemctl --no-pager --full status loom; journalctl -u loom -n 40 --no-pager" || true
  echo "服务没有在 127.0.0.1:$port 起来" >&2
  exit 1
fi

ssh "$host" "curl -fsS -o /dev/null -w 'web %{http_code}\n' http://127.0.0.1:$port/ && curl -fsS -o /dev/null -w 'admin %{http_code}\n' http://127.0.0.1:$port/admin/"
echo "已部署到 $host:$app_dir ，监听 127.0.0.1:$port"
