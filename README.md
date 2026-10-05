# Workdesk

深色、黑白界面的个人工作台。当前模块：从自己的抖音收藏中选择视频或图文，生成有来源依据的 Obsidian 笔记。

## Windows 安装版

到仓库 **Releases** 下载 `Workdesk-Setup-版本-x64.exe`，按提示选择安装目录。当前仅验证 Windows x64；macOS 是后续计划，不是已完成支持。

- 安装包包含 Electron、Python、Chromium 及主要转写依赖；不需要在新电脑另装 Python、FFmpeg 或原有知识库 Skill。
- **仍需自己安装并登录 Codex CLI、安装 Obsidian、准备知识库。** AI 分析使用本机已登录的 Codex，模型可用性和额度取决于自己的账户；不包含 Plus 会员或任何 API Key。
- 首次启动选择知识库和外部程序路径；知识库须含 `处理文件/`、`原始资料/`，归类候选来自现有 `_索引.md`，软件不擅自创建新主题。
- 抖音首次使用需要扫码。有效登录之后，刷新和登录检查在后台进行；需要重新认证时才打开扫码窗口。
- 首次处理视频会在本机下载 PyAV 解码组件和 ASR 模型权重，需联网并留出空间。PyAV 固定版本来自官方 PyPI，不放入公共安装包；图文处理不需要这一步。模型默认使用官方来源，镜像可选但属于第三方。
- 关闭窗口会收进托盘，后台任务继续。托盘菜单可打开、修改配置，或在任务完成后彻底退出。
- 安装包暂未代码签名。请仅从本仓库 Releases 获取，并核对同版本 SHA256 文件；Windows 可能提示未知发布者。

### 数据边界

| 内容 | 位置与行为 |
|---|---|
| 程序 | 安装目录，可在更新时替换 |
| 收藏、队列、日志、登录状态、配置 | 本机 `%APPDATA%\workdesk`；不进仓库、安装包或 Release |
| 视频/原图和权重缓存 | 本机私人运行目录；素材也可选择知识库外的目录 |
| 笔记 | 用户选择的知识库 |

卸载默认保留本机私人数据。**换电脑安装不会自动搬运收藏、素材、知识库或登录状态**；知识库可自行同步，登录需重新认证。旧版迁移工具只复制队列数据库并保留源数据，不复制凭证，迁移后队列暂停。

视频和图文会发给本机 Codex 所连接的 AI 服务进行分析，这不是全程离线软件。只处理自己有权访问和使用的内容；抽样画面不等于完整审阅，笔记会保留证据与不确定项。

## 开发与更新

```powershell
npm ci
python scripts/prepare_runtime.py
npm test
npm run package:win
```

Windows 构建需 PowerShell 7、Node.js 22+ 和用于引导构建的 Python；`prepare_runtime.py` 从官方 CPython 包构建独立运行环境，验证官方 SHA512，并安装固定版本依赖。不要复制自己的 venv、浏览器 Profile 或 Codex 配置进项目。

完整运行时准备完后，可运行隔离的真实窗口检查：

```powershell
python scripts/make_fixture.py
$env:WORKDESK_HOME = Join-Path (Get-Location) 'build/native-test'
$env:WORKDESK_PYTHON = Join-Path (Get-Location) 'build/runtime/python.exe'
& .\node_modules\electron\dist\electron.exe .\scripts\native_smoke.cjs
```

项目代码与私人数据严格分离；源文件和安装载荷采用白名单。**每次代码更新：测试 → 隐私检查 → 提交 → 推送本仓库。正式版本另打 tag 并发布安装包。** 不设置“监视整个电脑并自动上传”的后台任务。

`docs/github-actions/` 保留自动测试与 Windows Release 模板。当前发布凭证没有 `workflow` 权限，因此模板未启用；日常同步和正式发布仍先在本机完成测试与隐私检查。未来授权后才能把模板放入 `.github/workflows/`，不能把模板当成已运行的 CI。

第三方软件及图标的许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本仓库尚未授予统一开源许可证，公开可查看不表示所有代码可任意再分发。
