@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
python analisar.py --editais 40 %*
pause
