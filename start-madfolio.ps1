# ================================
# START MADFOLIO (PowerShell)
# ================================

$projectPath = "C:\madfolio\madfolio"
$npmPath = "C:\Program Files\nodejs\npm.cmd"

if (!(Test-Path $projectPath)) {
    exit
}

# Verifica se a porta 5000 já está em uso
$portInUse = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($portInUse) {
    exit
}

Set-Location $projectPath

Start-Process `
    -FilePath $npmPath `
    -ArgumentList "run dev" `
    -WorkingDirectory $projectPath `
    -WindowStyle Hidden
