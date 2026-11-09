<#
.SYNOPSIS
  修复本机无法 git push GitHub 的问题（改用 SSH key，一次配置长期有效）。

.DESCRIPTION
  本机推不动 GitHub 的常见原因有四个，脚本按顺序处理：
    1. 全局配置 url.https://github.com/.insteadof=git@github.com: 会把 SSH 地址
       强制改写成 HTTPS，导致本机可用的 SSH key 永远用不上；
    2. ~/.ssh/config 里没有 github.com 的 IdentityFile 条目，ssh 不知道用哪把 key；
    3. origin 远端是 HTTPS 地址，需要 token / GCM 弹窗，非交互场景会失败；
    4. 网络拦截 github.com:22——TCP 能连上，但 SSH banner 永远等不到，报错是
       「Connection closed by ... port 22」或「timed out during banner exchange」。
       注意 git 的 http.proxy 只作用于 HTTPS 拉取，SSH 远端完全不经过它。
       GitHub 官方提供 ssh.github.com:443 作为备用通道，脚本固定走 443。

  脚本做的事：
    - 移除第 1 条全局改写（有多条也会一并移除）；
    - 在 ~/.ssh/config 写入/更新 Host github.com 条目，固定走 ssh.github.com:443
      （已有但仍是 22 的旧条目会就地改写，改动前备份）；
    - 把 origin 改成 SSH 地址；
    - 用 ssh -T 与 git ls-remote 验证。

.PARAMETER DryRun
  只打印将要执行的操作，不写任何文件、不改任何配置。

.PARAMETER RemoteUrl
  origin 要改成的 SSH 地址，默认 git@github.com:zmaolong/dsh-plugins.git。

.EXAMPLE
  pwsh -File scripts\fix-github-push.ps1 -DryRun
  pwsh -File scripts\fix-github-push.ps1
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [string]$RemoteUrl = 'git@github.com:zmaolong/dsh-plugins.git'
)

$ErrorActionPreference = 'Continue'

function Say([string]$Message) { Write-Host "[fix-github-push] $Message" }

# 仓库根目录 = 本脚本所在目录的上一级
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# ── 1. 选择 SSH key ────────────────────────────────────────────────
$sshDir = Join-Path $env:USERPROFILE '.ssh'
$candidates = @('id_rsa_github', 'id_ed25519', 'id_rsa')
$keyName = $null
foreach ($name in $candidates) {
  if (Test-Path (Join-Path $sshDir $name)) { $keyName = $name; break }
}
if (-not $keyName) {
  Say "在 $sshDir 下没找到可用的私钥（尝试过：$($candidates -join ', ')）。"
  Say '请先生成并上传 SSH key：ssh-keygen -t ed25519，然后把 .pub 内容加到 GitHub → Settings → SSH keys。'
  exit 1
}
$keyPath = Join-Path $sshDir $keyName
Say "使用 SSH key：$keyPath"

# ── 2. 移除会把 SSH 改写成 HTTPS 的全局配置 ───────────────────────
$rewriteKey = 'url.https://github.com/.insteadof'
$rewrites = @()
try { $rewrites = @(& git config --global --get-all $rewriteKey 2>$null) } catch { }
if ($rewrites.Count -gt 0) {
  Say "移除全局改写 $rewriteKey = '$($rewrites -join ', ')'"
  if (-not $DryRun) { & git config --global --unset-all $rewriteKey 2>$null | Out-Null }
} else {
  Say "全局 $rewriteKey 不存在，跳过"
}

# ── 3. 写入/更新 ~/.ssh/config 的 Host github.com 条目 ────────────
# 固定用 ssh.github.com:443：本机网络会拦截 github.com:22，TCP 握手后
# SSH banner 等不到，git 报「Connection closed by ... port 22」。
$configPath = Join-Path $sshDir 'config'
# 必须按 UTF-8 读：Windows PowerShell 5.1 的 Get-Content 默认按 ANSI 解码，
# 会把中文注释后面的换行吞掉，导致 Host github.com 行识别不出来。
$configText = ''
if (Test-Path $configPath) { $configText = [System.IO.File]::ReadAllText($configPath) }
if ($keyPath.ToLower().StartsWith($sshDir.ToLower())) {
  $relativeKey = '~/.ssh/' + $keyPath.Substring($sshDir.Length).TrimStart('\', '/')
} else {
  $relativeKey = $keyPath -replace '\\', '/'
}
$block = @(
  ''
  '# GitHub（由 scripts/fix-github-push.ps1 写入）'
  '# 固定走 ssh.github.com:443：本机网络拦截 github.com:22'
  'Host github.com'
  '    HostName ssh.github.com'
  '    Port 443'
  '    User git'
  "    IdentityFile $relativeKey"
  '    IdentitiesOnly yes'
  '    StrictHostKeyChecking accept-new'
  ''
) -join "`n"

$blockPattern = '(?ms)^[ \t]*Host\s+github\.com\s*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*'
$existingBlock = [regex]::Match($configText, $blockPattern)
if (-not $existingBlock.Success) {
  if ($DryRun) {
    Say "将向 $configPath 追加：`n$block"
  } else {
    if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }
    if (Test-Path $configPath) {
      $backup = "$configPath.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
      Copy-Item -Path $configPath -Destination $backup -Force
      Say "已备份原配置到 $backup"
    }
    [System.IO.File]::AppendAllText($configPath, $block, (New-Object System.Text.UTF8Encoding($false)))
    if ([System.IO.File]::ReadAllText($configPath) -notmatch '(?m)^\s*Port\s+443\s*$') {
      Say "写入 $configPath 失败（权限不足或被沙箱拦截），请确认后重试。"
      exit 1
    }
    Say '已写入 Host github.com 条目（走 ssh.github.com:443）'
  }
} elseif ($existingBlock.Value -match 'Port\s+443' -and $existingBlock.Value -match 'ssh\.github\.com') {
  Say '~/.ssh/config 已有走 443 的 Host github.com 条目，跳过'
} else {
  $updated = $configText.Substring(0, $existingBlock.Index) + $block + $configText.Substring($existingBlock.Index + $existingBlock.Length)
  if ($DryRun) {
    Say "将把现有 Host github.com 条目改写为 443 通道：`n$($existingBlock.Value)->`n$block"
  } else {
    $backup = "$configPath.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -Path $configPath -Destination $backup -Force
    Say "已备份原配置到 $backup"
    [System.IO.File]::WriteAllText($configPath, $updated, (New-Object System.Text.UTF8Encoding($false)))
    if ([System.IO.File]::ReadAllText($configPath) -notmatch '(?m)^\s*Port\s+443\s*$') {
      Say "写入 $configPath 失败（权限不足或被沙箱拦截），请确认后重试。"
      exit 1
    }
    Say '已把 Host github.com 条目改写为 ssh.github.com:443'
  }
}

# ── 4. 把 origin 改成 SSH 地址 ────────────────────────────────────
if (Test-Path (Join-Path $repoRoot '.git')) {
  Push-Location $repoRoot
  try {
    $currentUrl = & git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentUrl)) {
      Say "仓库没有 origin，将添加：$RemoteUrl"
      if (-not $DryRun) { & git remote add origin $RemoteUrl | Out-Null }
    } elseif ($currentUrl -ne $RemoteUrl) {
      Say "origin：$currentUrl  ->  $RemoteUrl"
      if (-not $DryRun) { & git remote set-url origin $RemoteUrl | Out-Null }
    } else {
      Say "origin 已经是 $RemoteUrl，跳过"
    }
  } finally {
    Pop-Location
  }
} else {
  Say "$repoRoot 不是 git 仓库，跳过 origin 设置"
}

# ── 5. 验证 ──────────────────────────────────────────────────────
if ($DryRun) {
  Say 'DryRun 结束：未修改任何配置。去掉 -DryRun 再执行一次即可生效。'
  exit 0
}

Say '验证 SSH 认证（GitHub 不提供 shell，退出码 1 属正常）…'
$sshOut = (& ssh -T -o BatchMode=yes git@github.com 2>&1) -join "`n"
if ($sshOut -match 'successfully authenticated|Hi ') {
  Say 'SSH 认证成功'
} else {
  Say "SSH 认证可能失败：`n$sshOut"
  if ($sshOut -match 'banner exchange|Connection closed|timed out') {
    Say '连 ssh.github.com:443 都握不上手：代理/VPN 没有覆盖 443，先确认规则里放行了 443。'
  } else {
    Say '如果提示 Permission denied，请确认该公钥已加到 GitHub → Settings → SSH and GPG keys。'
  }
  Say '兜底方案：把 origin 换成 HTTPS（git 已配的 http.proxy 会生效）：'
  Say '  git remote set-url origin https://github.com/zmaolong/dsh-plugins.git'
  Say '已配置 credential.helper manager，首次 push 弹窗用户名填 GitHub 用户名、密码填 PAT。'
  exit 1
}

Say '验证远端可读…'
$ls = (& git ls-remote --heads origin 2>&1) -join "`n"
if ($LASTEXITCODE -eq 0) { Say "远端可读：`n$ls" } else { Say "远端读取失败：`n$ls" }

Say '完成。现在在本机运行 git push 即可（不会再要求 token）。'