@echo off
rem Atualiza rust\dados\blocos.txt a partir do Block.java (rode depois de criar ou mudar blocos no Java).
cd /d "%~dp0.."
set "JDK="
for /d %%d in ("%ProgramFiles%\Microsoft\jdk-*") do set "JDK=%%d\bin\"
if not exist out\Block.class "%JDK%javac" -encoding UTF-8 --release 8 -cp "lib\*" -d out src\*.java
"%JDK%javac" -encoding UTF-8 -cp "out;lib\*" -d rust\ferramentas\classes rust\ferramentas\ExportarBlocos.java || exit /b 1
"%JDK%java" -cp "rust\ferramentas\classes;out;lib\*" ExportarBlocos rust\dados\blocos.txt
