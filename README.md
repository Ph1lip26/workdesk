# Workdesk · 个人工作台

Windows 桌面应用：个人首页、抖音收藏入库、购买决策夹、个人健康。私人记录保存在本机，不上传公共仓库。

## 下载 Windows 安装包

### [下载最新版：Workdesk 0.2.4 · Windows x64](https://github.com/Ph1lip26/workdesk/releases/download/v0.2.4/Workdesk-Setup-0.2.4-x64.exe)

| 你要找的内容 | 入口 |
|---|---|
| 最新已发布版本与更新说明 | [Releases 下载页](https://github.com/Ph1lip26/workdesk/releases/latest) |
| 安装包校验值 | [SHA256SUMS.txt](https://github.com/Ph1lip26/workdesk/releases/download/v0.2.4/SHA256SUMS.txt) |
| 安装与使用方法 | [使用指南](docs/usage-guide.md) |
| 功能与修改记录 | [CHANGELOG](CHANGELOG.md) |
| 开发、测试与打包 | [开发文档](docs/development.md) |

**安装包在 Releases 的 Assets 中，不在源码文件夹。** 不要下载页面自动生成的 `Source code (zip)` 来安装。

**版本边界：0.2.4 于 2026-10-21 发布。** 本版加入入库上下文减负、转写／抽帧缓存复用与差量校对：GPT只返回需校正的行，本机还原全文，不缩减画面检查或知识笔记。保留0.2.3已有功能；macOS 尚未构建和验证。

**可选 GPU 转写代码已包含，NVIDIA 运行库和模型不随安装包分发。** 目标电脑需要另行配置；未配置时仍可使用 CPU 转写。更详细的验证边界见 [Release](https://github.com/Ph1lip26/workdesk/releases/tag/v0.2.4) 与 CHANGELOG。升级前先备份本机数据并彻底退出工作台；换电脑安装不会自动迁移个人记录和登录态。

下载后运行 `.exe`，按提示安装。程序未签名，请核对来源与 SHA256。AI 入库需要你自己的 Codex 登录；使用知识库功能需要 Obsidian。软件不附带会员、API Key 或他人的数据。

## 仓库目录

| 目录／文件 | 用途 |
|---|---|
| `docs/` | 使用指南、开发说明与未启用的 CI 模板 |
| `backend/` | 本地服务、业务逻辑和界面源码 |
| `desktop/` | Electron 桌面窗口、设置与系统集成 |
| `assets/` | 通用应用图标 |
| `scripts/` | 构建、检查、合成测试与发布工具 |
| `tests/` | 自动化测试 |
| `package.json`、`package-lock.json` | 项目依赖与构建配置 |
| `AGENTS.md`、`THIRD_PARTY_NOTICES.md` | 维护边界与第三方声明 |

安装包统一放 Releases，使用说明统一放 `docs/`。运行数据、构建产物、登录资料和个人记录不上传仓库。项目尚未提供统一开源许可证，查看源码不等于获得任意再分发授权。
