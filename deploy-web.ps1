$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$gh = Join-Path $env:LOCALAPPDATA "Programs\gh\bin\gh.exe"
if (-not (Test-Path $gh)) {
  throw "找不到 gh，请先安装 GitHub CLI"
}

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  throw "请先在这个终端完成 gh auth login"
}

if (-not (Test-Path ".git")) {
  git init -b main
}

git add .gitignore .github web/index.html web/styles.css web/app.js web/robots.txt web/selftest.html web/.gitignore
if (Test-Path "config") { git add config }
if (Test-Path "pages") { git add pages }
if (Test-Path "utils") { git add utils }
if (Test-Path "shared") { git add shared }
if (Test-Path "components") { git add components }
if (Test-Path "app.js") { git add app.js app.json app.wxss project.config.json sitemap.json }

$status = git status --porcelain
if ($status) {
  git -c user.name="bailiangang-617" -c user.email="bailiangang-617@users.noreply.github.com" commit -m "Publish memory library web preview"
}

$origin = git remote get-url origin 2>$null
if (-not $origin) {
  & $gh repo create memory-library-web --public --source=. --remote=origin --push
} else {
  git push -u origin main
}

& $gh api -X POST "repos/bailiangang-617/memory-library-web/pages" -f build_type=workflow 2>$null
& $gh workflow run pages.yml --repo bailiangang-617/memory-library-web 2>$null

Write-Host ""
Write-Host "仓库: https://github.com/bailiangang-617/memory-library-web"
Write-Host "网页大约 1-2 分钟后可用: https://bailiangang-617.github.io/memory-library-web/"
Write-Host "访问口令: huiyi"
