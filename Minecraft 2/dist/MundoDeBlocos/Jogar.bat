@echo off
cd /d "%~dp0"
start "" "runtime\bin\javaw.exe" -XX:+UseParallelGC -cp "jogo.jar;lib\*" BlockGame
