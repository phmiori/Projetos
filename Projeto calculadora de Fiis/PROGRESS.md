# Progresso e Lista de Tarefas do Sistema (AutoLeilão Hub)

## 📋 Infraestrutura e Banco de Dados (Prisma ORM)
- [x] Configurar esquema Prisma para SQLite em `SQL/schema.prisma`
- [x] Gerar tabelas e sincronizar banco de dados SQLite (`SQL/dev.db`)
- [x] Desenvolver API REST Node.js/Express (`server.js`) com Prisma Client
- [x] Criar tokens semânticos e suporte a Dark/Light Mode (`CSS/Global/global_tokens.css`)

## 🚗 Módulo Principal: Gestão de Carros de Leilão
- [x] Atualizar navegação da Sidebar (Visão Geral, Estoque, Histórico de Vendidos)
- [x] Implementar KPIs analíticos no topo (Lucro Total Acumulado, Capital Investido em Estoque, ROI Médio %)
- [x] Criar barra de filtros por Status (Em Trânsito, Em Preparação, Regularização, Anunciado, Vendido) e Busca em tempo real
- [x] Desenvolver cards ricos de veículos com indicadores de custos e margens
- [x] Desenvolver Modal de Cadastro/Edição de Veículos com cálculo automático instantâneo (Aquisição, Preparação, Custo Total, Lucro e ROI)
- [x] Desenvolver Modal de Extrato Analítico Completo de Custos e Resultados
- [x] Implementar persistência dupla (Prisma ORM com fallback de LocalStorage)
- [x] Documentar execução e arquitetura no `README.md`
- [x] Modal de edição de veículos 100% opaca e com backdrop blur
- [x] Módulo completo de Lançador de Gastos & Planilha de Serviços do Veículo (design analítico, exportação CSV e venda rápida)

## 🏢 Módulo de Fundos Imobiliários (FIIs Hub)
- [x] Criada estrutura modular: `HTML/FII/FundoImobiliário.html`, `CSS/FII/fii.css` e `JS/FII/fii.js`
- [x] Sub-aba 1: **Minha Carteira de FIIs** com 4 KPIs analíticos, gráficos Chart.js (Distribuição por Segmento e Renda Mensal por FII), tabela dinâmica de cotas, Yield on Cost e exportação CSV
- [x] Sub-aba 2: **Calculadora & Efeito Bola de Neve** com projeção de juros compostos, reinvestimento automático de dividendos e sobras, gráfico interativo de patrimônio acumulado vs aportado e tabela mês a mês
- [x] Sub-aba 3: **Radar Funds Explorer** com cards dos principais FIIs/Fiagros (SNAG11, KNSC11, GARE11, BTCI11, MXRF11, HGLG11, XPML11), links oficiais e botão de adicionar direto à carteira
- [x] Modal de **Adicionar/Editar FII** e Modal de **Novo Aporte / Comprar Mais Cotas** com simulação do novo Preço Médio em tempo real
- [x] Integração da navegação e cards nos módulos do Hub Global (`HTML/Index/index.html` e `HTML/Leilao/leilao.html`)
- [x] Migrada a carteira de FIIs do localStorage para o banco de dados (modelo `InvestimentoFII` no Prisma, vinculado ao usuário logado) com API REST própria (`GET/POST/PUT/DELETE /api/fii`)
- [x] Criado botão **"Atualizar Cotações"** que busca o preço de mercado atual de cada FII via Yahoo Finance (`POST /api/fii/atualizar-precos`, sem necessidade de chave de API) e grava `precoAtual`/`precoAtualizadoEm` no banco
- [x] Adicionadas colunas **Preço Atual** e **Valorização (%)** na tabela da carteira e o KPI **Valorização de Mercado** (ganho/perda em R$ e % vs. preço médio, com cor semântica verde/vermelho)
- [x] KPI "Patrimônio Investido" renomeado para **"Patrimônio Atual"**, passando a somar a valorização/queda de preço (valor de mercado), com o custo de aquisição original exibido como legenda secundária

## 🐷 Módulo Cofrinho (Renda Diária)
- [x] Novo módulo dedicado: `HTML/Cofrinho/cofrinho.html`, `CSS/Cofrinho/cofrinho.css` e `JS/Cofrinho/cofrinho.js`, com modelo `Cofrinho` no Prisma vinculado ao usuário e API REST própria (`GET/POST/PUT/DELETE /api/cofrinhos`)
- [x] Cadastro de múltiplos cofrinhos (nome, valor investido, renda recebida no dia 1, data de início) com juros simples: a renda do dia 1 se repete todos os dias seguintes
- [x] Cálculo automático diário de rendimento acumulado, aplicando a **tabela oficial de IOF regressivo** (Decreto 6.306/2007, 96% no dia 1 até isento no dia 30) e a **tabela regressiva de Imposto de Renda** (22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% acima) sobre o rendimento bruto
- [x] Ordem de apuração corrigida e validada contra extrato real (PicPay): o **IOF é descontado primeiro** sobre o rendimento bruto, e o **IR incide depois sobre o restante** (rendimento já líquido de IOF) — não sobre o bruto
- [x] Renda só é creditada em **dias úteis**: calendário próprio de feriados nacionais (fixos + móveis calculados pela fórmula da Páscoa: Carnaval, Sexta-Feira Santa, Corpus Christi) além de sábados/domingos, com correção de bug de fuso horário na conversão de datas
- [x] Aviso visual (destaque vermelho) para os casos raros em que o saldo líquido projetado fica **abaixo do valor investido**
- [x] KPIs consolidados (Total Guardado, Renda Diária Atual, Rendimento Acumulado, Saldo Líquido Hoje) e modal de **Projeção automática de 30 dias** (saldo bruto, IOF e IR em % e R$, saldo líquido por dia, com destaque no dia atual e nos dias sem renda)
- [x] Integração da navegação (sidebar) nos módulos Index, FII e Leilão, e badge de contagem na Visão Geral

## 🧭 Hub Pessoal (novo agrupamento na Sidebar, separado do Hub Financeiro)
- [x] Criada a seção "Hub Pessoal" na barra lateral de todos os módulos, abaixo do Hub Financeiro (sem módulo de Visão Geral próprio)

## 📅 Módulo Calendário (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/Calendario/calendario.html`, `CSS/Calendario/calendario.css` e `JS/Calendario/calendario.js`, com modelo `Evento` no Prisma vinculado ao usuário e API REST própria (`GET/POST/PUT/DELETE /api/eventos`)
- [x] Visões interativas de Mês, Semana e Dia (estilo Google Calendar), com navegação Hoje/Anterior/Próximo
- [x] Criação de evento por clique no dia (mês) ou no horário (semana/dia), edição/exclusão ao clicar em um evento existente
- [x] Suporte a eventos de dia inteiro, local, descrição, cor personalizável e linha indicadora do horário atual na grade
- [x] Campo de lembrete (nenhum, no horário, 10min/30min/1h/1dia antes) usado pelo sino de notificações

## 🔔 Módulo Notificação (sino do cabeçalho, compartilhado por todos os módulos)
- [x] Novo módulo dedicado: `HTML/Notificacao/notificacao.html` (Central de Notificações), `CSS/Notificacao/notificacao.css` e `JS/Notificacao/notificacao.js`
- [x] Endpoint próprio no backend (`GET /api/notificacoes`) que calcula os lembretes de eventos do Calendário já dentro da janela de aviso configurada
- [x] Sino no cabeçalho com contador de não vistas (persistido no navegador) presente em todos os módulos do Hub, com dropdown de notificações recentes e link para a Central de Notificações
- [x] Verificação automática a cada 60 segundos

> ⚠️ Pendência manual: rodar `npm run prisma:push` (com o servidor Node parado, para evitar o erro EPERM de arquivo em uso no Windows) para criar as tabelas `Evento`, `LocalClimaSalvo`, `GastoCasa`, `ItemDespensa` e `TarefaCasa` no banco SQLite local antes de usar os módulos Calendário/Notificação, Locais Salvos do Clima e Finanças & Casa.

## 🌤️ Módulo Clima (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/Clima/clima.html`, `CSS/Clima/clima.css` e `JS/Clima/clima.js` — sem necessidade de tabela no banco (dados sempre em tempo real via APIs públicas e gratuitas, sem chave de API)
- [x] Detecção automática da localização atual via geolocalização do navegador, com identificação do nome do local pela API BigDataCloud (`GET /api/clima/local-atual`)
- [x] Busca manual de qualquer cidade ou bairro via Open-Meteo Geocoding (`GET /api/clima/buscar-local`), com dropdown de resultados e chips de locais buscados recentemente (salvos no navegador)
- [x] Clima atual (temperatura, sensação térmica, umidade, vento, mín/máx do dia) e previsões horária (24h) e diária (7 dias) via Open-Meteo (`GET /api/clima/previsao`)
- [x] Fallback automático para o último local buscado quando a geolocalização é negada ou indisponível
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos
- [x] Locais Salvos persistentes: modelo `LocalClimaSalvo` no Prisma vinculado ao usuário, com API REST própria (`GET/POST/DELETE /api/clima/salvos`) — botão de estrela no card do clima atual para salvar/remover, e seção "Meus Locais Salvos" (com mini-previsão de cada um) sempre visível ao entrar no módulo

## 🏠 Módulo Finanças & Casa (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/FinancasCasa/financascasa.html`, `CSS/FinancasCasa/financascasa.css` e `JS/FinancasCasa/financascasa.js`, com 3 sub-abas (padrão de sub-navegação já usado no módulo FII)
- [x] **Aba Gastos da Casa**: modelo `GastoCasa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/gastos`), categorias (Manutenção, Energia Elétrica, Água, Internet, Compra do Mês, Outros), filtro por categoria, marcação de gasto recorrente e KPIs (gasto no mês, categoria com maior gasto, total acumulado)
- [x] **Aba Despensa**: modelo `ItemDespensa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/despensa`), controle de quantidade/unidade/quantidade mínima com destaque visual e KPI de itens em **Estoque Baixo**
- [x] **Aba Tarefas & Manutenção**: modelo `TarefaCasa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/tarefas`), com categoria, prioridade, status (Pendente/Em Andamento/Concluída), data prevista, custo estimado/real e descrição — cobre casos como "conserto de ar-condicionado"
- [x] Integração entre Tarefas e Gastos: ao concluir uma tarefa com a opção "lançar como gasto" marcada, o custo real é automaticamente registrado em Gastos da Casa (rota `PUT /api/casa/tarefas/:id`)
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos

