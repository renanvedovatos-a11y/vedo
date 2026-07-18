@echo off
title VEDO - servidor
cd /d "%~dp0"

:: Mantem o VEDO no ar: se o processo cair por qualquer motivo, reinicia sozinho.
:loop
echo.
echo [%date% %time%] Iniciando VEDO em http://localhost:5173
call npm run dev
echo.
echo [%date% %time%] O servidor parou. Reiniciando em 5 segundos... (feche esta janela para encerrar de vez)
timeout /t 5 /nobreak >nul
goto loop
