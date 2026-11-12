@echo off
cd /d "%~dp0"
setlocal
set "JDKBIN="

rem Usa o java que fica ao lado do javac (JDK 21), e nao o Java 8 antigo que aparece primeiro no PATH.
for /f "delims=" %%I in ('where javac 2^>nul') do if not defined JDKBIN set "JDKBIN=%%~dpI"
if not defined JDKBIN (
  for /d %%D in ("%ProgramFiles%\Microsoft\jdk-*") do set "JDKBIN=%%D\bin\"
)
if not defined JDKBIN (
  for /d %%D in ("%LOCALAPPDATA%\Programs\jdk21\jdk-*") do set "JDKBIN=%%D\bin\"
)
if not defined JDKBIN (
  echo Nao encontrei um JDK ^(javac^). Instale o JDK 21.
  pause
  exit /b 1
)

rem lib\ tem o LWJGL (OpenGL + GLFW), que liga o Java a placa de video.
if not exist out mkdir out
"%JDKBIN%javac.exe" -encoding UTF-8 --release 8 -Xlint:-options -cp "lib\*" -d out src\*.java
if errorlevel 1 (
  echo.
  echo Falha ao compilar.
  pause
  exit /b 1
)
"%JDKBIN%java.exe" -XX:+UseParallelGC -cp "out;lib\*" BlockGame %*
if errorlevel 1 pause
