# Radar de Leilões Judiciais (BuscaAii)

Baixa todos os veículos de leilão **judicial** abertos no BuscaAii, lê a descrição e o edital de cada lote, compara com a FIPE e mostra numa página web quais valem a pena.

## Como abrir

1. Dê dois cliques em **`Abrir Radar.bat`**. Na primeira vez ele instala o que falta.
2. O navegador abre sozinho em http://127.0.0.1:8787.
3. Clique em **⚙ Configurações**, coloque seu e-mail e sua senha do BuscaAii e clique em **Salvar e testar login**.
4. Clique em **⟳ Atualizar análise** e acompanhe o progresso na tela.

Deixe a janela preta aberta enquanto usa; fechar a janela desliga o Radar. A página roda só no seu computador.

## Na tela

- **Totais no topo** (Vale a pena, Talvez, Sem FIPE, Descartados): clique para mostrar ou esconder cada grupo.
- **Filtros**: busca, estado, lance máximo, prazo de encerramento, "só os que funcionam" e "sem alienação fiduciária". Também dá para ordenar e trocar entre cards e tabela.
- **Clique num carro** para ver a conta completa, os alertas, a descrição do edital, o trecho do PDF e o link para o lote no site do leiloeiro.
- **⭳ Excel** baixa a planilha da última análise.
- **Configurações → Parâmetros**: comissão, custos, margem mínima e % de reparo. Ao salvar, tudo é recalculado na hora.

## Como o cálculo funciona

- **Lance considerado**: o lance atual, se já houver lances; senão o da 2ª praça, se for menor; senão o da 1ª praça.
- **Investimento** = lance + comissão (5%) + débitos/taxas do edital + documentação (R$ 1.500) + remoção (R$ 800) + reparo.
- **Reparo** = % da FIPE conforme o estado descrito: bom 5%, regular 12%, desconhecido 15%, ruim 25%, mais 15% se não funciona.
- **Revenda** = FIPE − 10%. **Margem** = (revenda − investimento) / investimento.
- **Veredito**: "VALE A PENA" com margem ≥ 25%; "TALVEZ" com margem ≥ 12,5%.
- **Débitos** (IPVA, multas) só entram se o edital *não* falar em sub-rogação ou "livre de ônus" (CTN art. 130). Taxas cobradas do arrematante sempre entram.
- **Descartados automaticamente**: sucata, veículo não localizado, perda total, incendiado, só lataria, só para peças.
- **Sem foto real também é descartado**. Entra aqui o lote sem imagem, com imagem "sem foto"/"não disponível" do leiloeiro, com logo do tribunal, com a mesma foto usada em carros diferentes ou que o texto diz ser "foto ilustrativa". Isso pode ser desligado em Configurações; nesse caso o lote fica com alerta e o reparo é calculado como estado ruim.

## Limites

- A API FIPE gratuita permite cerca de 1.000 consultas por dia. O que já foi consultado fica no cache, e o que ficar como "FIPE pendente" se resolve na próxima atualização. Com um token FIPE (em Configurações) o limite sobe.
- A leitura do edital é por palavras-chave. **Leia sempre o edital completo antes de dar lance.**
- Alguns sites de leiloeiro só carregam com JavaScript. Nesses casos vale só a descrição do BuscaAii.

## Linha de comando (opcional)

`python analisar.py --editais 40` faz a mesma análise sem a interface e gera o Excel em `relatorios/`.
