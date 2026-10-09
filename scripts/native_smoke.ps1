param([string]$Payload,[ValidateSet('all','purchases','shell','performance')][string]$Scope='all')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixture=Join-Path $repo 'build\native-test'
$electron=Join-Path $repo 'node_modules\electron\dist\electron.exe'
$python=if($Payload){Join-Path ([IO.Path]::GetFullPath($Payload)) 'resources\runtime\python.exe'}else{Join-Path $repo 'build\runtime\python.exe'}
foreach($file in @($electron,$python)){if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing test runtime: $file"}}
if(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'electron.exe' -and $_.CommandLine -like ('*'+(Join-Path $repo 'scripts\native_smoke.cjs')+'*')}){throw 'The owned native test is already running; do not reset its fixture'}
$names=@('WORKDESK_HOME','WORKDESK_PYTHON','WORKDESK_TEST_PAYLOAD','WORKDESK_SMOKE_SCOPE','PYTHONDONTWRITEBYTECODE','PYTHONUTF8','PYTHONIOENCODING')
$previous=@{};foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:WORKDESK_HOME=$fixture;$env:WORKDESK_PYTHON=$python
 $env:WORKDESK_TEST_PAYLOAD=if($Payload){[IO.Path]::GetFullPath($Payload)}else{$null}
 $env:WORKDESK_SMOKE_SCOPE=$Scope
 $env:PYTHONDONTWRITEBYTECODE='1';$env:PYTHONUTF8='1';$env:PYTHONIOENCODING='utf-8'
 & $python (Join-Path $repo 'scripts\make_fixture.py')
 if($LASTEXITCODE){throw 'Synthetic fixture preparation failed'}
 $stdout=Join-Path $fixture 'native-smoke.stdout.log';$stderr=Join-Path $fixture 'native-smoke.stderr.log'
 $started=Get-Date
 $argument='"'+(Join-Path $repo 'scripts\native_smoke.cjs')+'"'
 $process=Start-Process -FilePath $electron -ArgumentList $argument -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
 $process.WaitForExit()
 if($process.ExitCode -ne 0){throw "Native checks failed ($($process.ExitCode)); inspect $stderr and native-smoke-checks.log"}
 $resultFile=Join-Path $fixture 'native-smoke.json'
 if(-not (Test-Path -LiteralPath $resultFile) -or (Get-Item -LiteralPath $resultFile).LastWriteTime -lt $started){throw 'Missing fresh native result; an old result is not a pass'}
 $result=Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
 if(-not $result.ok){throw 'Native checks reported failure'}
 'Native smoke: '+$result.checks.Count+' checks passed; durable logs saved in the isolated fixture.'
}finally{foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
