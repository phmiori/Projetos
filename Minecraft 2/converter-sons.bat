@echo off
rem Converte para WAV de verdade os sons que sao MP3/M4A com a extensao trocada para .wav.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0converter-sons.ps1"
pause
