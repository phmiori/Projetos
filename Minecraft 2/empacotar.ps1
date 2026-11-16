# Gera dist\MundoDeBlocos.zip: o jogo pronto para enviar a um amigo, com o Java embutido.
# Uso: clique com o botão direito > "Executar com o PowerShell", ou rode empacotar.bat.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# acha um JDK (precisa do javac, jar e jlink)
$jdk = $null
foreach ($c in @((Get-ChildItem "$env:ProgramFiles\Microsoft\jdk-*" -Directory -ErrorAction SilentlyContinue),
                 (Get-ChildItem "$env:LOCALAPPDATA\Programs\jdk21\jdk-*" -Directory -ErrorAction SilentlyContinue),
                 (Get-ChildItem "$env:ProgramFiles\Java\jdk-*" -Directory -ErrorAction SilentlyContinue))) {
    foreach ($d in $c) { if (Test-Path "$($d.FullName)\bin\jlink.exe") { $jdk = "$($d.FullName)\bin"; break } }
    if ($jdk) { break }
}
if (-not $jdk) { throw "Não encontrei um JDK com jlink. Instale o JDK 21." }
Write-Host "JDK: $jdk"

$dist = "dist\MundoDeBlocos"
# Apaga só o que este script gera. Sons, texturas, mundos e configurações que você tiver
# colocado em dist\MundoDeBlocos continuam lá.
foreach ($old in @("$dist\jogo.jar", "$dist\lib", "$dist\runtime", "$dist\Jogar.bat", "$dist\Jogar (com mensagens).bat",
                   "$dist\Mundo de Blocos.exe", "dist\MundoDeBlocos.zip")) {
    Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory "$dist\lib" -Force | Out-Null

Write-Host "Compilando..."
Remove-Item "out" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "out" | Out-Null
& "$jdk\javac.exe" -encoding UTF-8 --release 8 -Xlint:-options -cp "lib\*" -d out (Get-ChildItem "src\*.java").FullName
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar" }
& "$jdk\jar.exe" --create --file "$dist\jogo.jar" -C out .
Copy-Item "lib\*.jar" "$dist\lib\"

Write-Host "Copiando o Java embutido (JDK completo, sem jmods)..."
$jdkRoot = Split-Path $jdk -Parent
New-Item -ItemType Directory "$dist\runtime" -Force | Out-Null
foreach ($item in @("bin","lib","conf","legal","release")) {
    if (Test-Path "$jdkRoot\$item") { Copy-Item "$jdkRoot\$item" "$dist\runtime\$item" -Recurse -Force }
}
if (-not (Test-Path "$dist\runtime\bin\javaw.exe")) { throw "Falha ao copiar o Java" }

Write-Host "Criando o launcher (Mundo de Blocos.exe)..."
& "launcher\compilar-launcher.bat" (Resolve-Path $dist).Path
if (-not (Test-Path "$dist\Mundo de Blocos.exe")) { throw "Falha ao criar o launcher" }

@'
MUNDO DE BLOCOS
===============

Para jogar: descompacte esta pasta e dê dois cliques em "Mundo de Blocos.exe".
Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" e depois em
"Executar assim mesmo" (o aviso aparece porque o launcher não tem assinatura digital).
Se o jogo não abrir, marque "Abrir com janela de mensagens" no launcher para ver o erro.
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
# O zip leva sons e texturas personalizados, mas não os seus mundos nem as suas configurações.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = (Resolve-Path "dist").Path
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path $root "MundoDeBlocos.zip"), 'Create')
try {
    foreach ($f in Get-ChildItem $dist -Recurse -File) {
        $rel = $f.FullName.Substring($root.Length + 1)
        if ($rel -like "MundoDeBlocos\worlds\*" -or $rel -eq "MundoDeBlocos\settings.properties") { continue }
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel.Replace('\', '/'), 'Optimal')
    }
} finally { $zip.Dispose() }
$size = [math]::Round((Get-Item "dist\MundoDeBlocos.zip").Length / 1MB, 1)
Write-Host "Pronto: dist\MundoDeBlocos.zip ($size MB)"
