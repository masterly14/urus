# Lanzador local del Market Worker.
# - Carga todas las variables de .env (root) en la sesión.
# - Mapea MARKET_WORKER_SHARED_SECRET → WORKER_SHARED_SECRET (que es el nombre que espera el worker).
# - Lanza `npm run dev` desde workers/market-worker.
#
# Uso:
#   pwsh ./scripts/start-market-worker-local.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "No se encontró .env en $envFile"
}

Write-Host "[start-market-worker-local] cargando $envFile" -ForegroundColor Cyan
$loaded = 0
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.StartsWith("#")) { return }
    $eqIdx = $line.IndexOf("=")
    if ($eqIdx -lt 1) { return }
    $name = $line.Substring(0, $eqIdx).Trim()
    $rawValue = $line.Substring($eqIdx + 1).Trim()
    if ($rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) {
        $rawValue = $rawValue.Substring(1, $rawValue.Length - 2)
    } elseif ($rawValue.StartsWith("'") -and $rawValue.EndsWith("'")) {
        $rawValue = $rawValue.Substring(1, $rawValue.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $rawValue
    $loaded++
}
Write-Host "[start-market-worker-local] $loaded vars cargadas" -ForegroundColor Cyan

if (-not $env:MARKET_WORKER_SHARED_SECRET) {
    throw "MARKET_WORKER_SHARED_SECRET ausente en .env"
}
$env:WORKER_SHARED_SECRET = $env:MARKET_WORKER_SHARED_SECRET

if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL ausente en .env"
}

Write-Host "[start-market-worker-local] WORKER_SHARED_SECRET=set DATABASE_URL=set IDEALISTA_ENABLED=$($env:MARKET_IDEALISTA_ENABLED) BRIGHTDATA_API_TOKEN=$([bool]$env:BRIGHTDATA_API_TOKEN) BRIGHTDATA_WEB_UNLOCKER_ZONE=$($env:BRIGHTDATA_WEB_UNLOCKER_ZONE)" -ForegroundColor Cyan

Push-Location (Join-Path $repoRoot "workers\market-worker")
try {
    npm run dev
} finally {
    Pop-Location
}
