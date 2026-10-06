@echo off
title Radar de Leiloes Judiciais
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

python -c "import flask, requests, openpyxl, pypdf" 2>nul
if errorlevel 1 (
    echo Instalando dependencias pela primeira vez...
    python -m pip install -r requirements.txt
)

echo.
echo  Abrindo o Radar no navegador: http://127.0.0.1:8787
echo  Deixe esta janela aberta enquanto usa. Feche-a para desligar.
echo.
python app.py
pause
