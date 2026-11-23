@echo off
rem Gera dist\MundoDeBlocos.zip para enviar a um amigo (com o Java embutido).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0empacotar.ps1"
pause
