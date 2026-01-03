Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\madfolio\madfolio\madfolio-tray.ps1""", 0
Set WshShell = Nothing
