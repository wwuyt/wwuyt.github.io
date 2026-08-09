# 本地开发服务器（PowerShell）：从 .env.local 读取 Token 后启动 Hugo
if (Test-Path .env.local) {
  Get-Content .env.local | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)\s*$') {
      [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
  }
}
$env:HUGO_PARAMS_NEODBTOKEN = $env:NEODB_TOKEN
$env:HUGO_PARAMS_BANGUMITOKEN = $env:BANGUMI_TOKEN
hugo server @args
