# Mac 测试版：准备状态与接续验收

**目前没有经过 macOS 实际构建、运行和真机验收的安装包。** Windows 0.2.6 已包含跨平台适配准备，不代表 Mac 可用。本页于 2026-11-13 按本地脚本及既有记录整理，未新增 Mac 测试或产物。

目标是 Apple Silicon（M 系列）、macOS 14+。Intel／Universal、Developer ID签名、公证、自动更新和跨设备数据同步均未交付。

## 1. 已准备与未证明的事

| 已有准备 | 不能据此宣称 |
|---|---|
| 独立 `electron-builder.mac.cjs` 与 `package:mac` | 已有可安装 DMG |
| 固定来源与 SHA256 的 arm64 Python 准备脚本 | 依赖已在 Mac 导入成功 |
| Mac私人目录、GUI命令发现、Obsidian应用内CLI后备路径 | 用户的 Codex／Obsidian 已配置或登录 |
| 原生编辑与安全退出菜单、交通灯留白 | Dock、窗口、休眠和键盘真机表现已合格 |
| CPU/int8 默认、跳过无意义 CUDA 探测 | MPS 或 CUDA 加速已经支持 |
| 手动 Actions 模板及冒烟脚本 | CI 已启用或检查已经通过 |

`scripts/prepare_macos_runtime.py` 当前固定使用 python-build-standalone CPython 3.13.18 arm64及其SHA256；版本与哈希以脚本为准，不建议无验证地换成“最新”。保留上游许可证，依赖沿用锁文件，Chromium须在Mac主机下载，解码组件仍按需获取。

2026-11-01 记录：曾下载上游发行档并核对哈希、入口与许可；37个Mac兼容wheel可取得。**这只是可下载性证据，不是Mac导入、启动、打包或入库成功。** 当时 Windows 208项逻辑、185项原生复测通过，不替代Mac运行测试。

## 2. 在真正的 Mac 上构建

使用库外干净副本，准备 Node.js 22+ 和构建引导用 Python 3.12+。先明确该副本绝对路径并进入项目根目录，再执行以下命令；不要复制 Windows 的 `node_modules`、`build/runtime` 或私人配置。运行时目录已存在时脚本会停止，不自动覆盖。

```bash
npm ci
python3 scripts/prepare_macos_runtime.py
export WORKDESK_PYTHON="$PWD/build/runtime/bin/python3"
export PYTHONDONTWRITEBYTECODE=1
npm test
npm run package:mac
node scripts/audit_payload.cjs build/dist-mac/mac-arm64/Workdesk.app/Contents
export WORKDESK_HOME="$PWD/build/mac-smoke"
export WORKDESK_TEST_PAYLOAD="$PWD/build/dist-mac/mac-arm64/Workdesk.app"
export WORKDESK_PYTHON="$WORKDESK_TEST_PAYLOAD/Contents/Resources/runtime/bin/python3"
mkdir -p "$WORKDESK_HOME"
node_modules/.bin/electron scripts/mac_smoke.cjs
```

上述是**待执行接续步骤，不是已完成记录**。输出目标为 `build/dist-mac/*-macOS-arm64-TEST.dmg` 和 zip，不打稳定版标签、不更改 Windows 发布号。冒烟用合成数据，不调用模型或访问个人知识库；日志留 build，不上传私人资料。

除开发用 Electron 冒烟，还要按模板运行 `scripts/mac_packaged_boot.py` 的打包可执行文件启动检查，确认真正的 `Workdesk.app` 能启动独立后台。具体参数读取脚本／模板，不以开发窗口启动成功代替打包产物启动。

## 3. 远程构建如何接续

模板位于 [`github-actions/mac-test.yml`](github-actions/mac-test.yml)，仅手动触发；不因推送／定时自动发布，不使用个人登录或知识库。

2026-11-01核验时凭证缺 `workflow` 权限，仓库无已启用流程；**当前权限必须在实际接续时重新确认**。得到授权后可在GitHub配置所需权限或创建 `.github/workflows/mac-test.yml`，确认测试分支包含目标脱敏源码。凭证不发进聊天、不提交仓库。

流程目标是在Mac runner完成依赖、测试、打包、隐私门禁、原生冒烟及实际包启动后，将测试包与SHA256留为7天有效的Actions artifact；不是稳定Release，artifact存在也不能替代真机验收。

## 4. 必须补齐的验收

- [ ] macOS arm64 主机依赖安装、逻辑测试、构建与隐私检查实际通过。
- [ ] 开发冒烟及打包可执行文件／独立后台启动均通过，失败日志保留。
- [ ] 真实Mac安装、移入Applications、程序移动后的Python／Chromium可重定位性。
- [ ] Gatekeeper、Dock／托盘、窗口按钮、字体、快捷键、休眠恢复与安全退出。
- [ ] 用户自行登录后，真实收藏刷新、视频／图文下载、CPU转写、模型获取、Codex多模态和Obsidian写入链路。
- [ ] 更新／卸载保留私人记录，未保存保护与中断恢复有效。

当前配置仅为构建机 ad-hoc 签名，未公证，不是Developer ID分发；其他Mac可能拦截，不能承诺下载即用。不要关闭系统防护绕过问题。真实账号与额度测试需要用户授权，不能从Windows机器复制凭证充作验证。

## 5. 参考入口

以下保留工程参考链接，本轮文档整理未联网重新核验其最新说明：

- [python-build-standalone发行说明](https://gregoryszorc.com/docs/python-build-standalone/main/distributions.html)
- [electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/)
- [GitHub托管runner说明](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

Windows发布与授权流程见 [开发与维护](development.md)，总体下载入口见 [README](../README.md)。
