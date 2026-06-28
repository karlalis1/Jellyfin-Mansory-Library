$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Building JellyfinMasonry..." -ForegroundColor Cyan

$dotnet = $null
try { $dotnet = (Get-Command dotnet -ErrorAction Stop).Source } catch {}
if (!$dotnet) {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "dotnet\dotnet.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $dotnet = $candidate
            break
        }
    }
}

if (!$dotnet) {
    throw "dotnet.exe nicht gefunden. Installiere das .NET SDK oder setze dotnet in den PATH."
}

& $dotnet --info | Out-Host

& $dotnet restore ".\JellyfinMasonry.csproj"
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed ($LASTEXITCODE)" }

& $dotnet build ".\JellyfinMasonry.csproj" -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed ($LASTEXITCODE)" }

$outDir = Join-Path $root "out"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$dll = ".\bin\Release\net9.0\JellyfinMasonry.dll"
$pdb = ".\bin\Release\net9.0\JellyfinMasonry.pdb"
$deps = ".\bin\Release\net9.0\JellyfinMasonry.deps.json"

foreach ($file in @($dll, $pdb, $deps, ".\masonry.js")) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $outDir -Force
    }
}

Write-Host ""
Write-Host "Done. Output files:" -ForegroundColor Green
Get-ChildItem $outDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

