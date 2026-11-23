@echo off
rem Confere se a versao Rust gera o mundo igualzinho ao Java (semente 2024, biomas grandes, e uma semente negativa com biomas antigos).
cd /d "%~dp0.."
set "JDK="
for /d %%d in ("%ProgramFiles%\Microsoft\jdk-*") do set "JDK=%%d\bin\"
"%JDK%javac" -encoding UTF-8 -cp "out;lib\*" -d rust\ferramentas\classes rust\ferramentas\CompararGeracao.java || exit /b 1
pushd rust && cargo build --release || exit /b 1
popd
"%JDK%java" -cp "rust\ferramentas\classes;out;lib\*" CompararGeracao "%TEMP%\mdb_java.bin" 2024 2.0 6 && rust\target\release\mundo-de-blocos.exe --comparar "%TEMP%\mdb_java.bin"
"%JDK%java" -cp "rust\ferramentas\classes;out;lib\*" CompararGeracao "%TEMP%\mdb_java.bin" -123456 1.0 4 && rust\target\release\mundo-de-blocos.exe --comparar "%TEMP%\mdb_java.bin"
