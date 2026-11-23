# Analisador de leilões judiciais (BuscaAii)

Baixa todos os veículos de leilão **judicial** abertos no BuscaAii, lê a descrição e o edital de cada lote, compara com a FIPE e gera um Excel com o ranking dos que valem a pena.

## Instalação (uma vez)

```
pip install -r requirements.txt
```

Copie `.env.example` para `.env` e coloque seu e-mail e senha do BuscaAii.

## Uso

Dê dois cliques em `rodar.bat`, ou rode no terminal:

| Comando | O que faz |
|---|---|
| `python analisar.py` | análise completa |
| `python analisar.py --editais 40` | também abre a página/PDF do edital dos 40 melhores |
| `python analisar.py --uf SP,MG,PR` | só esses estados |
| `python analisar.py --lance-max 50000` | só lances até R$ 50 mil |
| `python analisar.py --margem 0.3` | exige 30% de margem para "VALE A PENA" |
| `python analisar.py --offline` | reusa os lotes baixados por último (sem login) |

O relatório sai em `relatorios/leiloes_judiciais_DATA.xlsx`, com as abas **Vale a pena**, **Talvez**, **Todos** e **Parâmetros**.

## Como o cálculo funciona

- **Lance considerado**: lance atual (se já houver lances); senão, o da 2ª praça (se for menor); senão, o da 1ª praça.
- **Investimento** = lance + comissão (5%) + débitos/taxas do edital + documentação (R$ 1.500) + remoção (R$ 800) + reparo.
- **Reparo** = % da FIPE conforme o estado descrito: bom 5%, regular 12%, desconhecido 15%, ruim 25%, +15% se não funciona.
- **Revenda** = FIPE − 10%.
- **Margem** = (revenda − investimento) / investimento. "VALE A PENA" ≥ 25%; "TALVEZ" ≥ 12,5%.
- **Débitos** (IPVA, multas, licenciamento) só entram se o edital *não* falar em sub-rogação ou "livre de ônus" (CTN art. 130). Taxas cobradas do arrematante sempre entram.
- **Descartados na hora**: sucata, veículo não localizado, perda total, incendiado, só lataria, só para peças.

Os valores ficam no dicionário `CONFIG` no topo de `analisar.py`.

## Limites

- A API FIPE gratuita permite cerca de 1.000 consultas por dia. Tudo vai para o cache (`cache/fipe_cache.json`), então quem ficar como "FIPE pendente" é resolvido na próxima execução. Com um `FIPE_TOKEN` o limite sobe.
- A leitura de edital é por palavras-chave. Ela pega o principal (estado, funcionamento, débitos, alienação, restrições), mas **sempre leia o edital antes de dar lance**.
- Alguns sites de leiloeiro só carregam com JavaScript. Nesses casos aparece "PDF não encontrado" e vale a descrição do BuscaAii.
