Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ===============================
# CONFIGURAÇÕES
# ===============================
$port    = 5000
$openUrl = "http://localhost:5000"

$iconGreenPath = "C:\madfolio\madfolio\icon-green.ico"
$iconRedPath   = "C:\madfolio\madfolio\icon-red.ico"

# ===============================
# CARREGA ÍCONES
# ===============================
$green = New-Object System.Drawing.Icon($iconGreenPath)
$red   = New-Object System.Drawing.Icon($iconRedPath)

# ===============================
# CRIA ÍCONE NA BARRA DO SISTEMA
# ===============================
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Visible = $true
$notify.Icon = $red
$notify.Text = "MadFolio - Verificando..."

# ===============================
# MENU DO BOTÃO DIREITO
# ===============================
$menu = New-Object System.Windows.Forms.ContextMenu
$menu.MenuItems.Add("Abrir MadFolio", { Start-Process $openUrl }) | Out-Null
$menu.MenuItems.Add("Sair", {
    $notify.Visible = $false
    $notify.Dispose()
    Stop-Process -Id $PID
}) | Out-Null
$notify.ContextMenu = $menu

# ===============================
# LOOP DE VERIFICAÇÃO (CORRETO)
# ===============================
while ($true) {
    try {
        $test = Test-NetConnection -ComputerName "127.0.0.1" -Port $port -InformationLevel Quiet

        if ($test) {
            $notify.Icon = $green
            $notify.Text = "MadFolio - Online"
        }
        else {
            throw
        }

    } catch {
        $notify.Icon = $red
        $notify.Text = "MadFolio - Offline"
    }

    Start-Sleep -Seconds 5
}
