# loom

交付型智能体。Pi 是底层执行，用户直接使用的是已经配好介绍、协作指令和技能的智能体。

Loomer 是元智能体，免费且默认可用，在后台单独编辑。电商运营这类专业智能体在后台创建，标价只展示，用户在设置里雇佣。雇佣保存当时的 Loomer、协作指令和技能。后台更新后，任务页提示采用新版本；已经开始的对话保持原快照。

技能源码在 [food4agent](https://github.com/xiaolinbenben/food4agent)。Loom 不保存技能源码。后台从本机 food4agent 安装到 `skills/<name>`，再分配给智能体。

项目决策见 [DECISION.md](DECISION.md)。

## 本地运行

food4agent 默认放在 Loom 的上一级目录。换位置时设置 `FOOD4AGENT_DIR`。

```bash
npm install --prefix server
npm install --prefix web
npm install --prefix admin
npm run dev
```

模型、对象存储、Loomer、技能和智能体在后台分开展示。智能体列表分页，新建和编辑单独填写。后台地址是 `http://127.0.0.1:5174/admin/`。

任务页是 `http://127.0.0.1:5173`。首次启动如果还没有管理员账号，会创建 `admin` 并把密码打印到服务终端。已有密码不会在之后的启动中修改。空数据库会写入 loomer 和电商运营的初始记录，之后只以后台保存的内容为准。

图灵 API Key、Base URL 和模型 ID 在后台保存，不使用环境变量。Base URL 必须是已经核对过的完整前缀。

对象存储使用 S3，在后台填写 Endpoint、Region、Bucket 和密钥。图片默认保存 14 天。

本机执行任务需要 QEMU。macOS 上先运行 `brew install qemu`。

## 部署

```bash
npm run deploy
```

在本机构建任务页、后台和服务端，上传后台已经安装的技能，按 Linux x64 安装服务端依赖，连同 Linux 版 Node 22 上传到 `terln-prod` 的 `/opt/loom`。服务器上需要 `qemu-system-x86_64` 和 `qemu-img`；没有时部署脚本会安装。不在服务器上构建，也不在服务器上安装技能。进程监听 `127.0.0.1:5173`，数据在 `/opt/loom/data`。管理员账号不存在时，部署会创建 `admin`，并把用户名和密码打印到终端。已有密码不会被后续部署修改。首次执行任务会下载 Gondolin 的 `alpine-base` 镜像。域名和反向代理需要在服务器上另行配置。
