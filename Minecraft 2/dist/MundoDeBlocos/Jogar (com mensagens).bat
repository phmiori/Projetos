@echo off
rem Igual ao Jogar.bat, mas mostra uma janela com mensagens (??til se o jogo n??o abrir).
cd /d "%~dp0"
"runtime\bin\java.exe" -XX:+UseParallelGC -cp "jogo.jar;lib\*" BlockGame
pause
