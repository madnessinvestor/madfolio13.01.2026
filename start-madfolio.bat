@echo off
REM ================================
REM MADFOLIO SAFE START (BAT)
REM ================================

REM Mata qualquer Node antigo (segurança extra)
taskkill /IM node.exe /F >nul 2>&1

REM Aguarda liberar a porta
timeout /t 2 >nul

REM Garante que a porta 5000 esteja livre
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

REM Aguarda novamente
timeout /t 2 >nul

REM Inicia o PowerShell invisível
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\madfolio\madfolio\start-madfolio.ps1"

exit
