# Gera dist\MundoDeBlocos.zip: o jogo pronto para enviar a um amigo, com o Java embutido.
# Uso: clique com o botão direito > "Executar com o PowerShell", ou rode empacotar.bat.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# acha um JDK (precisa do javac, jar e jlink)
$jdk = $null
foreach ($c in @((Get-ChildItem "$env:ProgramFiles\Microsoft\jdk-*" -Directory -ErrorAction SilentlyContinue),
                 (Get-ChildItem "$env:LOCALAPPDATA\Programs\jdk21\jdk-*" -Directory -ErrorAction SilentlyContinue))) {
    foreach ($d in $c) { if (Test-Path "$($d.FullName)\bin\jlink.exe") { $jdk = "$($d.FullName)\bin"; break } }
    if ($jdk) { break }
}
if (-not $jdk) { throw "Não encontrei um JDK com jlink. Instale o JDK 21." }
Write-Host "JDK: $jdk"

$dist = "dist\MundoDeBlocos"
Remove-Item "dist" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$dist\lib" -Force | Out-Null

Write-Host "Compilando..."
Remove-Item "out" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "out" | Out-Null
& "$jdk\javac.exe" -encoding UTF-8 --release 8 -Xlint:-options -cp "lib\*" -d out (Get-ChildItem "src\*.java").FullName
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar" }
& "$jdk\jar.exe" --create --file "$dist\jogo.jar" -C out .
Copy-Item "lib\*.jar" "$dist\lib\"

Write-Host "Criando o Java embutido (só os módulos que o jogo usa)..."
& "$jdk\jlink.exe" --add-modules java.base,java.desktop,jdk.unsupported --strip-debug --no-man-pages `
    --no-header-files --compress zip-6 --output "$dist\runtime"
if ($LASTEXITCODE -ne 0) { throw "Falha no jlink" }

@'
@echo off
cd /d "%~dp0"
start "" "runtime\bin\javaw.exe" -XX:+UseParallelGC -cp "jogo.jar;lib\*" BlockGame
'@ | Set-Content "$dist\Jogar.bat" -Encoding ASCII

@'
@echo off
rem Igual ao Jogar.bat, mas mostra uma janela com mensagens (útil se o jogo não abrir).
cd /d "%~dp0"
"runtime\bin\java.exe" -XX:+UseParallelGC -cp "jogo.jar;lib\*" BlockGame
pause
'@ | Set-Content "$dist\Jogar (com mensagens).bat" -Encoding ASCII

@'
MUNDO DE BLOCOS
===============

Para jogar: descompacte esta pasta e dê dois cliques em "Jogar.bat".
Não precisa instalar nada (o Java já vem dentro, na pasta runtime).
Precisa de Windows 64 bits e placa de vídeo com OpenGL 3.3 (quase todas de 2012 para cá).

JOGAR JUNTO PELO RADMIN VPN
---------------------------
1. Os dois instalam o Radmin VPN e entram na mesma rede (um cria, o outro entra com nome e senha).

2. Quem vai hospedar (o anfitrião):
   - abre o próprio mundo, aperta Esc e clica em "Abrir para LAN (multijogador)";
   - o menu mostra o IP para passar ao amigo: use o que começa com 26. (é o do Radmin);
   - se o Windows perguntar sobre o firewall, marque REDES PRIVADAS E PÚBLICAS e clique em Permitir
     (a rede do Radmin costuma ser tratada como pública).

3. Quem vai entrar (o amigo):
   - no lobby, clica em "Jogar em LAN";
   - digita o IP do anfitrião (26.x.x.x), escolhe nome e personagem e clica em "Entrar".

- O mundo fica salvo no computador do anfitrião, inclusive o inventário e a posição do amigo.
- O anfitrião precisa estar com o mundo aberto para o amigo entrar.
- Os dois precisam estar com a MESMA versão do jogo.
- Porta usada: 25600 (TCP). Se não conectar: confira o IP, se os dois estão na rede do Radmin,
  e se o firewall do anfitrião permitiu o Java.

TEXTURAS E SONS
---------------
Depois da primeira execução aparecem as pastas "textures" e "sounds" com um LEIA-ME em cada uma
explicando como trocar pelos seus.
'@ | Set-Content "$dist\LEIA-ME.txt" -Encoding UTF8

Write-Host "Compactando..."
Compress-Archive -Path $dist -DestinationPath "dist\MundoDeBlocos.zip" -Force
$size = [math]::Round((Get-Item "dist\MundoDeBlocos.zip").Length / 1MB, 1)
Write-Host "Pronto: dist\MundoDeBlocos.zip ($size MB)"
