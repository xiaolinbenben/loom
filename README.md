# loom

交付型智能体。Pi 是底层执行，用户直接使用的是已经配好任务、规则、技能和流程的智能体。

当前交付「电商运营」，标价 ¥199/月。付款还没有接。用户在设置里雇佣这个智能体。

技能源码在 [food4agent](https://github.com/xiaolinbenben/food4agent)。Loom 不保存技能源码，只安装到 `skills/<name>`。

项目决策见 [DECISION.md](DECISION.md)。

## 本地运行

food4agent 默认放在 Loom 的上一级目录。换位置时设置 `FOOD4AGENT_DIR`。

```bash
npm run install-skills
npm install --prefix server
npm install --prefix web
npm install --prefix admin
npm run dev
```

`npm run dev` 会先安装技能。任务页是 `http://127.0.0.1:5173`。后台是 `http://127.0.0.1:5174/admin/`，账号 `admin`，密码 `admin123`。

图灵 API Key、Base URL 和模型 ID 在后台保存，不使用环境变量。Base URL 必须是已经核对过的完整前缀。

## 部署

```bash
npm run deploy
```

在本机构建任务页、后台和服务端，安装 food4agent 里的技能，连同 Linux 版 Node 22 上传到 `terln-prod` 的 `/opt/loom`。不在服务器上构建，也不在服务器上安装技能。进程监听 `127.0.0.1:5173`，数据在 `/opt/loom/data`。域名和反向代理需要在服务器上另行配置。
