param([Parameter(Mandatory=$true)][string]$Message,[switch]$ConfirmUpload)
$ErrorActionPreference='Stop'
if(-not $ConfirmUpload){throw '先向用户确认本次阶段性成果是否上传；确认后才可传入 -ConfirmUpload。未提交或推送。'}
$root=Split-Path -Parent $PSScriptRoot
if(-not [IO.Path]::IsPathRooted($root)){throw 'Project path must be absolute'}
Push-Location -LiteralPath $root
try {
    & npm test
    if($LASTEXITCODE){throw 'Tests or source privacy gate failed; not committed or pushed'}
    & git -C $root add -- .
    if($LASTEXITCODE){throw 'Git staging failed'}
    $python=Join-Path $root 'build/runtime/python.exe'
    if(-not (Test-Path -LiteralPath $python)){$python='python'}
    & $python (Join-Path $root 'scripts/privacy_check.py') --tracked
    if($LASTEXITCODE){throw 'Tracked privacy gate failed; review the staged files'}
    & git -C $root diff --cached --check
    if($LASTEXITCODE){throw 'Staged diff check failed'}
    & git -C $root diff --cached --stat
    & git -C $root diff --cached --quiet
    if($LASTEXITCODE -eq 1){
        & git -C $root -c user.name='Codex' -c user.email='codex@localhost' commit -m $Message
        if($LASTEXITCODE){throw 'Git commit failed'}
    }
    & git -C $root push origin main
    if($LASTEXITCODE){throw 'Push failed; do not report this update as synced'}
    'Tests and privacy gate passed; code synchronized to GitHub.'
} finally {Pop-Location}
