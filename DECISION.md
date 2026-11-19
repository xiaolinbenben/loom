# Loom 项目决策

本文记录 Loom 当前有效的实现边界，以及明确还没决定的事项。

## 目标

用户使用的是交付好的智能体，不是一个空白的 Pi 会话。当前这个智能体接收商品资料，在任务工作区里完成上架流程，直接产出 Excel。Pi 只负责执行。

界面使用简体中文。生产域名预定为 `loom.terln.com`。

## 已确认的约束

- 核心是 Pi agent。推进任务的是 Pi 自己的运行机制，不是 Loom 自研的 agent loop。
- 不 fork Pi，也不把上架规则写进 Loom 的产品代码。
- 用户定制放在 skill 里。只有 skill 表达不了的集成，才加 Pi extension。
- 只做 Web。桌面端以后再说，现在不为它做抽象。
- 任务页是这个智能体的工作台，不安装整套 Pi Web UI，也不拷贝 BoldKit。
- 数据库用 SQLite。
- 模型由图灵 API `api.terln.com` 驱动，接入方式接近官方的 OpenAI 兼容接口。
- 密钥不进 git。图灵 API 配置由后台写入本机 SQLite。

## 决策

### 1. 进程内使用 Pi SDK

决定：服务端进程内调用 `@earendil-works/pi-coding-agent` 的 `createAgentSession`。Node 版本遵循该包的 `engines`，当前为 `>=22.19.0`。

原因：SDK 直接给出 session、工具、模型、技能和事件。`session.prompt` 会等到 Pi 发出 `agent_settled` 后返回。这样 Loom 只包一层任务，不重写 agent loop。

明确不做：不把 Pi CLI、print/JSON、RPC 子进程当作运行方式。不使用已从 Pi 主线移除的 `@earendil-works/pi-web-ui` 作为产品界面；它是浏览器聊天组件，不是本产品的 coding agent。

### 2. Web 与服务端分开

决定：`web/` 使用 Vite、React、TypeScript、Tailwind CSS v4。`server/` 使用 Node 和 Pi SDK。两者分开。

原因：界面是任务工作台，不是需要服务端渲染的站点。Pi SDK 只能跑在 Node，不能放进浏览器。

明确不做：不用 Next.js。不建桌面端，也不抽一层同时服务 Web 和桌面的 UI 框架。

### 3. 每个任务一个工作区

决定：每个任务的 cwd 是 `data/workspaces/<id>/`。用户上传的文件放在该目录的 `input/`。产出文件名来自智能体定义，放在该目录的 `output/`。当前文件名是 `listing.xlsx`。`data/` 不进 git。

原因：Pi 的 cwd 决定工具的默认路径和项目资源发现范围。任务文件限制在这个目录后，服务器和 skill 的交付契约就只剩这个输出文件在不在。

明确不做：不把 Pi 的 cwd 设为仓库根目录。不在服务器里实现列、文案、平台规则或 Excel 生成。不单独建产物表；文件是否可下载，以约定路径上的文件是否存在为准。

补充约束：cwd 放在本仓库内部时，Pi 仍会向祖先目录发现项目资源和 `AGENTS.md`。创建 session 时必须关掉这层自动发现，只加载 Loom 明确指定的 skill 和 prompt。`agentDir` 使用应用自己的目录，不使用开发者个人的 `~/.pi/agent`。

### 4. 定制只走 Pi 的扩展点

决定：上架流程、表格列、文案和 Excel 生成写成 Pi skill，源码放在 food4agent。Loom 只显式加载已经安装的 skill。通用任务说明使用 Pi prompt template，由它把任务交给对应 skill。需要拦截工具、增加工具或改会话行为时，才写 extension。

原因：Pi 启动时只把 skill 的名称和描述放进提示，需要时再读取 `SKILL.md`。prompt template 负责短提示，不承担整套业务流程。两者都是 Pi 原有机制。

明确不做：不把平台规则写进服务器提示词或业务代码。不把 skill 源码留在 Loom。不把只使用一次的流程提前做成 extension。不发布 npm 上的 Pi package。

### 5. 服务器只负责任务壳

决定：服务器负责上传、创建任务、把 Pi session 事件转成进度，以及提供结果下载。服务器等待 `session.prompt` 返回，再以约定输出文件是否存在判断任务是否完成。

原因：保留 Pi 的工具调用、重试、压缩和排队。服务器不解释上架是否正确，只报告 Pi 是否结束、以及 Excel 是否出现在约定路径。

明确不做：不在服务器里实现第二套对话循环、工具执行器或结果解析器。

### 6. SQLite 只存任务索引

决定：SQLite 只保存定位一个任务所需的字段：任务 id、状态、workspace 路径、Pi session 路径、交付的智能体 id、创建和更新时间、错误摘要。

原因：会话正文、工具轨迹和压缩状态已经由 Pi 的 `SessionManager` 持久化。数据库再存一份会形成两套事实来源。

明确不做：不存消息。不建对话表、产物表或模型调用账本。不引入其他数据库。

### 7. 模型通过 Pi 的自定义 provider 接入

决定：后台把图灵 API Key、Base URL 和模型 ID 存进 SQLite。创建 Pi session 时，服务根据这条记录生成 `data/agent/models.json`，`api` 使用 `openai-completions`。密钥不进 git，也不使用环境变量。

原因：这是 Pi 接入 OpenAI 兼容端点的官方方式。地址和模型要在核对图灵文档后由操作者填写，不能写死，也不该为此保留环境变量。Pi 文档要求兼容字段描述已经验证的差异，不能因为对方声称兼容就打开 `compat`。

明确不做：不把其他厂商的 Turing API 文档当作 `api.terln.com` 的文档。不设置未验证的 `compat`。不做备用 provider，也不从环境变量回退。

### 8. 第一版是单操作者 demo

决定：任务页只有一个操作者，不做登录和多租户。后台使用固定账号保护模型配置，账号不能在页面里修改。Pi 以运行服务的系统用户权限执行 `read`、`bash`、`edit`、`write`。cwd 只决定默认位置，挡不住命令访问该用户能访问的其他路径。

原因：Pi 自己的安全文档把这一点写明了：工作目录不是安全边界，Pi 也不会在每次工具调用前征求批准。单操作者本地或受控机器上的 demo 可以接受这个权限模型。

明确不做：不把 cwd 隔离、路径检查或提示词限制说成沙箱。不做可注册的账号系统。公网多用户上线前必须单独决定隔离方式，例如专用系统用户、容器或虚拟机。隔离方式确定之前，不部署成开放注册的服务，也不补一个假的安全层。

### 9. 界面是智能体工作台

决定：任务页展示当前交付的智能体。左侧是名称、月费和任务列表，中间是执行过程和输入，宽屏右侧展示这个智能体会做的事、遵守的规则、使用的技能和任务流程。新建任务在输入框里附上商品资料。页面是 Loom 自己的 React 视图，数据走任务 API。工具名可以映射成中文标签，事件仍来自 Pi session。任务页不把 Pi 呈现成用户要操作的产品。

原因：用户拿到的是一个可以直接使用的智能体。Pi 生态里的现成界面不能直接套进来：`@earendil-works/pi-web-ui` 在浏览器里跑 agent，`@agegr/pi-web` 和 `pi-web-ui` 是完整的 coding IDE。

明确不做：不安装这些整套 UI。不把任务页改成 Ant Design。后台继续用 Ant Design。不做代码编辑器、diff 视图或主题市场。不做英文界面，也不拷贝 BoldKit。

### 10. 部署只记录形态

决定：生产形态是一台机器上的 Web 服务和 Node 服务，反向代理到 `loom.terln.com`。SQLite 和 `data/workspaces/` 都在这台机器的磁盘上。

部署目录是 `/opt/loom`。本机构建后上传，不在服务器上构建，也不在服务器上安装 skill。机器自带的 Node 是 12，所以一并上传 Linux 版 Node 22。进程只监听 `127.0.0.1:5173`。数据放在 `/opt/loom/data`，重新部署不覆盖。域名和反向代理由操作者在服务器上配置。

原因：状态都在本地文件里。构建和 skill 安装发生在发布机器上，避免服务器再依赖一套源码目录。

明确不做：本文不规定 Docker、Kubernetes、对象存储或托管数据库。这些都要等隔离和公开范围决定后再选。

### 11. 交付物是智能体，skill 单独安装

决定：Loom 交付一个可以直接使用的智能体。智能体定义包含名称、月费、要执行的任务、遵守的规则、任务流程，以及要安装的 food4agent skill。月费只展示，不收款。第一轮把该智能体的 Pi prompt template 交给 session，继续对话时把用户原文交给同一个 session。

skill 从本机 food4agent 仓库安装到 Loom 的 `skills/<name>`。默认仓库在 Loom 的上一级目录，也可以用 `FOOD4AGENT_DIR` 指定。安装前删除同名目录。`skills/` 不进 git。部署在本机安装完成后再上传安装结果。

原因：用户不需要自己挑选或编写 skill。skill 会单独变化，源码留在 food4agent，Loom 只绑定自己要交付的那一个智能体。

明确不做：不在 Loom 里修改 skill 源码。不从 GitHub 临时下载 skill 当作另一条安装路径。不做 skill 市场，也不在任务页切换多个智能体。不接支付、订阅或账号。

## 开工前必须确认

下面这些事项还没有决定。相关实现只是当前代码的做法，不能把这里的问题当成已经有了答案。

1. 上架平台是哪一个，是否已有必须遵守的 Excel 模板。
2. 用户上传的是图片、表格、文本、链接，还是它们的组合。模型是否必须看图。
3. `api.terln.com` 的准确 base path、模型 id，以及它是否支持工具调用、图像输入和流式 usage。这些都还没有从该站点的文档核实。
4. 是否对公网开放。开放前必须先做第 8 条的隔离决定。部署形态本身见第 10 条。

## 参考

- Pi SDK：`@earendil-works/pi-coding-agent` 文档中的 `createAgentSession`、`SessionManager`、`DefaultResourceLoader`。
- Pi 模型配置：`models.json` 的自定义 provider，`api` 取 `openai-completions`。
- Pi 安全说明：cwd 不是安全边界；工具使用启动 Pi 的系统用户权限。

## 初步实现的临时约定

下面是代码里已经这样做、但还没有确认的做法。

- 本机开发时，服务端口是 `8787`，任务页端口是 `5173`，后台端口是 `5174`。
- 任务表里保存智能体 id 的列名仍是 `skill`。
- 上传文件会原样放进任务的 `input/`。补充说明写入 `input/note.txt`。服务器不把图片交给模型。
- 上架表的列不属于 Loom。当前安装的 skill 使用的是演示列。
