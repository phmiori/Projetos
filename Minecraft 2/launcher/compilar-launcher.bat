@echo off
rem Gera "Mundo de Blocos.exe" (o launcher) na pasta do jogo, com o compilador C# que ja vem no Windows.
rem Uso: compilar-launcher.bat [pasta de saida]
cd /d "%~dp0"
set "OUTDIR=%~1"
if "%OUTDIR%"=="" set "OUTDIR=%~dp0.."
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo Nao encontrei o compilador C# do Windows ^(.NET Framework 4^).
  exit /b 1
)
"%CSC%" /nologo /target:winexe /optimize+ /codepage:65001 /win32icon:"..\favicon.ico" /resource:fundo.jpg,fundo.jpg ^
  /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"%OUTDIR%\Mundo de Blocos.exe" Launcher.cs
