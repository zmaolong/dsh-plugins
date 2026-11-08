#Requires -Version 5.1

<#
.SYNOPSIS
  DSH 插件开发调试一条龙：质量门 → 构建 → 装进调试 profile → 启动并打印入口。

.DESCRIPTION
  面向本仓库的组合包（package.json 带 dsh.bundle.patch）。
  默认装进 zdebug profile：首次按官方 web 模板创建，随后启动一个独立的 Web 宿主，
  浏览器调试和宿主终端日志都可用，不干扰桌面端正在使用的会话。

  装进 desktop 时只安装、不启动，由桌面应用在下次重组合时加载；官方 CLI 建议先退出桌面应用。

  需要桌面安装自带的 CLI（resources/runtime/cli/bin/dsh.cmd），它允许管理 desktop profile；
  普通 dsh CLI 会拒绝。可用 DSH_CLI 覆盖。

  注意：link 安装要创建 junction，DSH 自己的沙箱 shell 会拒绝（EPERM / Access is denied），
  请在 ZCode 等普通终端里运行本脚本。

.PARAMETER PackageDir
  插件包目录，可相对仓库根目录。

.PARAMETER Profile
  调试 profile，默认 zdebug；desktop 表示桌面应用自己的 profile。

.PARAMETER Port
  调试 Web 宿主的监听端口，默认 3081。

.PARAMETER SkipTests
  跳过 vitest，只跑 tsc 与构建。

.PARAMETER NoBoot
  只安装，不启动调试宿主（装 desktop 时自动如此）。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-plugin-hub

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-plugin-hub -Profile desktop -NoBoot

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-plugin-hub -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory, Position = 0)]
  [string] $PackageDir,

  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string] $Profile = 'zdebug',

  [ValidateRange(1, 65535)]
  [int] $Port = 3081,

  [switch] $SkipTests,

  [switch] $NoBoot
)

$ErrorActionPreference = 'Stop'
$esc = [char]27

function Write-Step {
  param([string] $Text)
  Write-Host "-> $Text" -ForegroundColor Cyan
}

function Write-Ok {
  param([string] $Text)
  Write-Host "[ok] $Text" -ForegroundColor Green
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string] $FilePath,
    [string[]] $Arguments = @(),
    [Parameter(Mandatory)][string] $Label,
    [switch] $Quiet
  )
  Write-Step $Label
  if ($Quiet) {
    & $FilePath @Arguments | Out-Null
  }
  else {
    & $FilePath @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 失败（退出码 $LASTEXITCODE）"
  }
}

function Find-DshCli {
  $candidates = @()
  if ($env:DSH_CLI) { $candidates += $env:DSH_CLI }
  if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' }
  if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw '找不到桌面自带的 dsh CLI：请设置 $env:DSH_CLI 指向 resources\runtime\cli\bin\dsh.cmd。'
}

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $PackageDir)) {
  $candidate = Join-Path $repoRoot $PackageDir
  if (-not (Test-Path -LiteralPath $candidate)) {
    throw "找不到插件包目录：$PackageDir（相对仓库根：$repoRoot）"
  }
  $PackageDir = $candidate
}
$packageDir = (Resolve-Path -LiteralPath $PackageDir).Path
$manifestPath = Join-Path $packageDir 'package.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "不是插件包：$packageDir 下没有 package.json"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$bundlePatch = $manifest.dsh.bundle.patch
if (-not $manifest.name -or -not $bundlePatch) {
  throw "不是组合包：$manifestPath 缺 name 或 dsh.bundle.patch，安装会报 not-a-bundle。"
}
if (-not (Test-Path -LiteralPath (Join-Path $packageDir $bundlePatch))) {
  throw "dsh.bundle.patch 指向的 $bundlePatch 不存在。"
}
$needsClient = $null -ne $manifest.dsh.client

$dshCli = Find-DshCli

if ($env:DSH_DEV_PM) {
  $packageManager = $env:DSH_DEV_PM
}
else {
  $command = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $command) {
    $command = Get-Command pnpm -ErrorAction SilentlyContinue
  }
  if (-not $command) {
    throw '找不到 npm 或 pnpm：请把包管理器加入 PATH，或用 DSH_DEV_PM 指定。'
  }
  $packageManager = $command.Source
  if (-not $packageManager) { $packageManager = $command.Path }
  if (-not $packageManager) { $packageManager = $command.Name }
}

Push-Location -LiteralPath $packageDir
try {
  Invoke-Native $packageManager @('run', 'check') 'tsc 双程序类型检查'
  if (-not $SkipTests) {
    Invoke-Native $packageManager @('run', 'test') 'vitest 离线测试'
  }
  Invoke-Native $packageManager @('run', 'build') 'tsdown 构建 lib/'
}
finally {
  Pop-Location
}

$libIndex = Join-Path $packageDir 'lib\index.js'
if (-not (Test-Path -LiteralPath $libIndex)) {
  throw "构建产物缺失：$libIndex"
}
if ($needsClient) {
  $libClient = Join-Path $packageDir 'lib\client.js'
  if (-not (Test-Path -LiteralPath $libClient)) {
    throw "声明了 dsh.client，但构建产物缺失：$libClient"
  }
}
Write-Ok "构建产物就绪：$($manifest.name)@$($manifest.version)"

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshHome (Join-Path 'profiles' $Profile)
$profileManifestPath = Join-Path $profileDir 'package.json'

if (-not (Test-Path -LiteralPath $profileManifestPath)) {
  if ($Profile -eq 'desktop') {
    throw '桌面 profile 尚未初始化：先打开一次 DeepSeek Harness，再重跑本脚本。'
  }
  if ($PSCmdlet.ShouldProcess($profileDir, "按 web 模板创建 profile '$Profile'")) {
    Invoke-Native $dshCli @('--profile', $Profile, '--from-default-profile', 'web', '--dump-config') "创建调试 profile $Profile（web 模板）" -Quiet
  }
  if (-not $WhatIfPreference -and -not (Test-Path -LiteralPath $profileManifestPath)) {
    throw "创建 profile 失败：$profileManifestPath 仍不存在。"
  }
}

if ($Profile -eq 'desktop') {
  $desktop = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
  if ($desktop) {
    Write-Warning '桌面应用正在运行：官方 CLI 建议先退出应用再安装；也可以改用应用内「设置 -> 插件」安装。'
  }
}

if ($PSCmdlet.ShouldProcess($profileDir, "把 $($manifest.name)@$($manifest.version) 以 link 方式装进 $Profile")) {
  Invoke-Native $dshCli @('plugin', '--profile', $Profile, 'add', $packageDir) "安装 $($manifest.name) -> $Profile"
}

if (-not $WhatIfPreference) {
  Write-Step '校验最终组合'
  $dump = & $dshCli --profile $Profile --dump-config
  if ($LASTEXITCODE -ne 0) {
    throw "读取组合失败（退出码 $LASTEXITCODE）"
  }
  if ($dump -match [regex]::Escape($manifest.name)) {
    Write-Ok "组合已包含 $($manifest.name)"
  }
  else {
    Write-Warning "组合里没有找到 $($manifest.name)：检查 cordis.patch.yml 的行名是否等于包名。"
  }
}

Write-Host ''
Write-Host '=== 调试交接 ===' -ForegroundColor Green
Write-Host ("包     : {0}@{1}" -f $manifest.name, $manifest.version)
Write-Host ("目录   : {0}" -f $packageDir)
Write-Host ("profile: {0}" -f $Profile)

if ($Profile -eq 'desktop') {
  Write-Host '下一步 : 刷新桌面端页面；必要时在插件页关/开一次本插件。'
  Write-Host ("日志   : {0}" -f (Join-Path $profileDir '.plugin-manager\logs'))
  return
}

if ($NoBoot) {
  Write-Host ("下一步 : 启动调试宿主：& '{0}' --profile {1} --no-open --port {2}" -f $dshCli, $Profile, $Port)
  return
}

if ($WhatIfPreference) {
  Write-Host '（-WhatIf：跳过启动）'
  return
}

$profileManifest = Get-Content -LiteralPath $profileManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$bundles = @($profileManifest.dsh.profile.bundles)
if ($bundles -notcontains '@deepseek-ai/dsh-web-app') {
  throw "profile '$Profile' 不含 @deepseek-ai/dsh-web-app，无法提供浏览器界面；换一个 profile 名或删除该 profile 后重跑。"
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "端口 $Port 已被占用：换 -Port，或先停掉旧的调试实例。"
}

$logDir = Join-Path $dshHome (Join-Path 'logs' 'dev-debug')
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $logDir "$Profile-$stamp.out.log"
$stderrLog = Join-Path $logDir "$Profile-$stamp.err.log"

if (-not $PSCmdlet.ShouldProcess("http://127.0.0.1:$Port", '启动调试宿主')) {
  return
}

$process = Start-Process -FilePath $dshCli `
  -ArgumentList @('--profile', $Profile, '--no-open', '--port', $Port) `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru -WindowStyle Hidden

$url = $null
$deadline = (Get-Date).AddSeconds(45)
while (-not $url -and (Get-Date) -lt $deadline) {
  if ($process.HasExited) { break }
  if (Test-Path -LiteralPath $stdoutLog) {
    $match = Select-String -LiteralPath $stdoutLog -Pattern 'dsh web:' -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($match) {
      $plain = $match.Line -replace "$esc\[[0-9;]*m", ''
      $urlMatch = [regex]::Match($plain, 'https?://\S+')
      if ($urlMatch.Success) { $url = $urlMatch.Value }
    }
  }
  if (-not $url) { Start-Sleep -Milliseconds 500 }
}

if ($process.HasExited) {
  $stderrText = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Raw -Encoding UTF8 } else { '' }
  throw "调试宿主启动失败。stderr：`n$stderrText"
}

if ($url) {
  Write-Host ("浏览器 : {0}" -f $url)
}
else {
  Write-Warning "45 秒内没看到 dsh web: 行，请查看 $stdoutLog"
}
Write-Host ("宿主输出: {0}" -f $stdoutLog)
Write-Host ("宿主错误: {0}" -f $stderrLog)
Write-Host ("停止   : taskkill /PID {0} /T /F" -f $process.Id)
Write-Host '改动后 : npm run build，再刷新页面；或重跑本脚本。'