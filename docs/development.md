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
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\native_smoke.ps1
```

测试启动器只使用 `build/native-test` 合成数据目录，等待窗口检查结束并将日志落盘。不要直接用 `& electron.exe` 启动 GUI 测试后结束命令窗口：输出管道可能提前关闭。测试日志遇到 EPIPE 仍保存在本机文件，其他异常和断言失败仍返回失败。

项目代码与私人数据严格分离；源文件和安装载荷采用白名单。**日常修改只在本机验证；有阶段性成果时先向用户确认，得到本次确认后才测试 → 隐私检查 → 提交/推送。正式发布另确认版本和安装包。** 确认后可运行 `pwsh -NoProfile -File scripts/sync.ps1 -Message "更新说明" -ConfirmUpload`；不设置自动上传后台任务。

`docs/github-actions/` 保留自动测试与 Windows Release 模板。当前发布凭证没有 `workflow` 权限，因此模板未启用；日常同步和正式发布仍先在本机完成测试与隐私检查。未来授权后才能把模板放入 `.github/workflows/`，不能把模板当成已运行的 CI。

第三方软件及图标的许可说明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。本仓库尚未授予统一开源许可证，公开可查看不表示所有代码可任意再分发。
