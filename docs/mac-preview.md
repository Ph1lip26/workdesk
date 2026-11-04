# Mac 测试版：构建与验收

状态：Apple Silicon 适配开发中，尚无经 macOS 运行验证的安装包。本次Windows发布版本为0.2.5，不因本页改变。首个测试目标为M系列、macOS 14及以上；Intel、通用二进制、Developer ID签名、公证和自动更新均未交付。

## 已准备的代码

- 单独的Mac构建配置和`package:mac`，错误平台或Windows Python会被拒绝打包；Windows构建配置保持原样。
- Python采用python-build-standalone的CPython 3.13.18 arm64独立发行包，固定版本与SHA256，不复制开发者环境。依赖沿用项目锁文件，Chromium须在Mac主机下载；解码器仍按需获取，不随安装包分发。
- Mac私人数据默认路径与Electron的`workdesk`应用名对齐；GUI后台补充Homebrew命令目录、Obsidian应用内CLI后备路径。新电脑仍需自行安装并登录Codex，启用Obsidian CLI。
- 原生菜单提供复制／粘贴和经过任务空闲保护的Command+Q；标题栏给交通灯按钮留空间。Mac默认CPU/int8，保留Whisper small、beam_size=5和VAD，不宣称支持MPS或CUDA加速。

## 在真正的Mac主机上运行

使用干净的代码副本，安装Node.js 22+和可运行构建脚本的Python 3.12+；不要复制Windows的node_modules或build/runtime。脚本遇到已有runtime会停止，不自动覆盖。

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

合成冒烟只验证首次配置、独立后台、窗口与渲染器隔离等，不调用模型、不访问个人知识库。测试结果留在build中。输出为`build/dist-mac/*-macOS-arm64-TEST.dmg`和zip，不是正式稳定版。

## 远程构建的阻碍与接续

2026-11-01核验：当时GitHub凭证无`workflow`权限，仓库无现成Actions流程。`docs/github-actions/mac-test.yml`是未启用模板，不代表已运行成功；只支持手动触发，没有push、定时或自动发布。凭证不得发进聊天或提交仓库。

后续可给用于本项目的凭证补足workflow权限，或在GitHub网页手动新增`.github/workflows/mac-test.yml`并粘贴模板；还需确认测试分支包含本轮脱敏源码。工作流在Mac主机安装依赖、执行测试、打包、隐私检查和原生冒烟后，才上传测试包及SHA256为7天有效的Actions artifact；不发布稳定Release，不使用个人登录或知识库数据。

## 尚需验收

1. macOS主机的全部测试与构建实际通过；目前Windows验证不替代它。
2. 真实Mac安装／移动到Applications后的启动、Gatekeeper提示、Dock／托盘、休眠恢复、字体／交通灯及快捷键。
3. 用户自行登录后的抖音视频／图文下载、CPU转写、模型下载、Codex多模态分析、Obsidian链接维护；需要自己的额度与授权。
4. 程序搬动后Python／Chromium的可重定位性，更新／卸载时私人数据保留。

测试包配置为构建主机的ad-hoc签名，不是Developer ID签名，未公证，可能被其他Mac拦截；不能保证仅下载即可打开。CI还须实际启动打包后的Workdesk可执行文件与其独立后台，不能只靠开发用Electron冒烟通过。不关闭系统防护来绕过问题，不把构建产物存在等同于真机可用。

技术依据：
- [独立Python发行包](https://gregoryszorc.com/docs/python-build-standalone/main/distributions.html)
- [electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/)
- [GitHub macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
