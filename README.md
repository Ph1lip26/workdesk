# Workdesk · 个人工作台

把个人状态、收藏知识、购买决定和健康记录放在一个轻量桌面入口。复杂调研交给现有 AI 工具，Workdesk 负责保留结论、呈现来源和执行明确选择的流程。

## 下载 Windows 安装包

### [下载 Workdesk 0.2.7 · Windows x64](https://github.com/Ph1lip26/workdesk/releases/download/v0.2.7/Workdesk-Setup-0.2.7-x64.exe)

[版本详情](https://github.com/Ph1lip26/workdesk/releases/tag/v0.2.7) · [SHA256SUMS.txt](https://github.com/Ph1lip26/workdesk/releases/download/v0.2.7/SHA256SUMS.txt) · [Releases 最新发布页](https://github.com/Ph1lip26/workdesk/releases/latest)

**安装包在 Releases → Assets 中。** 下载 `.exe`，不是自动生成的 `Source code (zip)`。上面的固定链接对应最近留存的 0.2.7 发布回执；后续版本以 Releases 为准，源码更新不等于安装包已经更新。

- 当前交付 Windows x64，程序尚未代码签名；请核对来源和同版本 SHA256。
- AI 功能需要你自己的 Codex 登录与可用额度；知识库功能需要 Obsidian 及启用的 CLI。软件不提供会员、API Key 或无限额度。
- 安装包带独立 Python、Chromium 和主要转写依赖；视频解码组件、模型权重及可选 GPU 运行库不随包分发，按需要另行获取。
- **Mac 仍是适配准备，不是已可用平台。** 尚无经过 macOS 实际构建和真机验收的安装包。

## 已有功能

| 功能 | 用途 |
|---|---|
| 个人首页 | 六类卡片概览、拖动换位、功能跳转；手动生成有来源的短摘要 |
| 抖音收藏 | 手动同步、分页筛选、视频／静态图文入库、当前处理队列、收藏转行动 |
| 购买决策夹 | 保存需求、预算、候选、结论与等待条件；按需提炼关联知识库资料 |
| 个人健康 | 手动体重、真实趋势与悬停数值、知识库体重同步、生病记录 |

支持黑夜、白昼和跟随系统；双层导航可收展，一级功能顺序可调整。打开程序不会自动全量刷新抖音收藏或启动 AI 生成。

## 从这里开始

| 想了解什么 | 文档 |
|---|---|
| 安装、配置、使用、故障排查、数据迁移 | [使用指南](docs/usage-guide.md) |
| 每个版本交付了什么、哪些仍未验证 | [版本记录](CHANGELOG.md) |
| 目录分工、测试、打包、隐私检查、发布流程 | [开发与维护](docs/development.md) |
| Mac 准备到哪一步、怎样接续验收 | [Mac 测试版](docs/mac-preview.md) |
| 维护授权边界／第三方许可 | [AGENTS.md](AGENTS.md) · [第三方声明](THIRD_PARTY_NOTICES.md) |

源码放在 `backend/`、`desktop/`；通用图标在 `assets/`；构建与检查在 `scripts/`，测试在 `tests/`。安装包统一放 Releases，不混进源码目录。

## 隐私与限制

个人记录、知识库、登录资料、真实素材、运行配置、私人品牌和日志不进入公共仓库或安装包。**但 AI 功能不是离线处理：所选材料会发送至 Codex 连接的服务。** 只处理自己有权访问和使用的内容。

换电脑安装不会自动迁移数据或登录。关闭窗口会收进托盘；升级前保存编辑，等任务结束并正常退出，再备份私人数据。网站、网络与模型服务可能变化，不承诺永久采集成功或固定提速。

项目尚未提供统一开源许可证；公开可查看源码不等于获得任意再分发授权。私人品牌不属于通用发行资产。
