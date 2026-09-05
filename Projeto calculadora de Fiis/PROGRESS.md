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
- [x] Campo **Método de Arrematação** (À Vista / Parcelado) no cadastro do veículo: quando Parcelado, calcula automaticamente a **entrada de 25% sobre o valor do lance (desconsiderando a comissão do leiloeiro)** e o saldo restante de 75%, com campo de **Quantidade de Parcelas Combinadas** e cálculo automático do valor de cada parcela (saldo ÷ quantidade), com preview em tempo real, exibição no card (tag) e no Extrato Analítico

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

> ⚠️ Pendência manual: rodar `npm run prisma:push` (com o servidor Node parado, para evitar o erro EPERM de arquivo em uso no Windows) para criar as tabelas `Evento`, `LocalClimaSalvo`, `GastoCasa`, `ItemDespensa`, `TarefaCasa`, `BlocoTreino`, `ExercicioTreino`, `RegistroSaude`, `VeiculoGaragem` e `ManutencaoGaragem` no banco SQLite local antes de usar os módulos Calendário/Notificação, Locais Salvos do Clima, Finanças & Casa, Treinos & Saúde e Garagem.
>
> ⚠️ Pendência manual: rodar `npm run prisma:push` novamente para adicionar as novas colunas `metodoPagamento`, `valorEntrada`, `valorParcelado`, `qtdParcelas` e `valorParcela` na tabela `Veiculo` (módulo Leilão) antes de cadastrar/editar veículos com o novo campo Método de Arrematação.
>
> ⚠️ Pendência manual: rodar `npm run prisma:push` novamente (com o servidor Node parado) para adicionar a nova coluna `favoritoHeader` na tabela `LocalClimaSalvo` antes de usar o botão de "pin" que define o local exibido no Widget de Clima do Cabeçalho.

## 🌤️ Módulo Clima (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/Clima/clima.html`, `CSS/Clima/clima.css` e `JS/Clima/clima.js` — sem necessidade de tabela no banco (dados sempre em tempo real via APIs públicas e gratuitas, sem chave de API)
- [x] Detecção automática da localização atual via geolocalização do navegador, com identificação do nome do local pela API BigDataCloud (`GET /api/clima/local-atual`)
- [x] Busca manual de qualquer cidade ou bairro via Open-Meteo Geocoding (`GET /api/clima/buscar-local`), com dropdown de resultados e chips de locais buscados recentemente (salvos no navegador)
- [x] Clima atual (temperatura, sensação térmica, umidade, vento, mín/máx do dia) e previsões horária (24h) e diária (7 dias) via Open-Meteo (`GET /api/clima/previsao`)
- [x] Fallback automático para o último local buscado quando a geolocalização é negada ou indisponível
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos
- [x] Locais Salvos persistentes: modelo `LocalClimaSalvo` no Prisma vinculado ao usuário, com API REST própria (`GET/POST/DELETE /api/clima/salvos`) — botão de estrela no card do clima atual para salvar/remover, e seção "Meus Locais Salvos" (com mini-previsão de cada um) sempre visível ao entrar no módulo
- [x] **Widget de Clima no Cabeçalho** (ícone + temperatura, presente em todos os módulos): campo `favoritoHeader` no modelo `LocalClimaSalvo`, com botão de "pin" em cada card de Local Salvo para escolher qual local aparece no cabeçalho (`PUT /api/clima/salvos/:id/favorito`, apenas um favorito por vez) e rota combinada `GET /api/clima/favorito` que já retorna o clima atual do local marcado — tabela de códigos/ícones extraída para `JS/Clima/clima-codigos.js` (compartilhada entre o módulo Clima e o widget) e widget em `JS/Clima/clima-header-widget.js` + `CSS/Clima/clima-header-widget.css`, incluído no cabeçalho de todos os módulos do Hub

## 🏠 Módulo Finanças & Casa (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/FinancasCasa/financascasa.html`, `CSS/FinancasCasa/financascasa.css` e `JS/FinancasCasa/financascasa.js`, com 3 sub-abas (padrão de sub-navegação já usado no módulo FII)
- [x] **Aba Gastos da Casa**: modelo `GastoCasa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/gastos`), categorias (Manutenção, Energia Elétrica, Água, Internet, Compra do Mês, Outros), filtro por categoria, marcação de gasto recorrente e KPIs (gasto no mês, categoria com maior gasto, total acumulado)
- [x] **Aba Despensa**: modelo `ItemDespensa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/despensa`), controle de quantidade/unidade/quantidade mínima com destaque visual e KPI de itens em **Estoque Baixo**
- [x] **Aba Tarefas & Manutenção**: modelo `TarefaCasa` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/casa/tarefas`), com categoria, prioridade, status (Pendente/Em Andamento/Concluída), data prevista, custo estimado/real e descrição — cobre casos como "conserto de ar-condicionado"
- [x] Integração entre Tarefas e Gastos: ao concluir uma tarefa com a opção "lançar como gasto" marcada, o custo real é automaticamente registrado em Gastos da Casa (rota `PUT /api/casa/tarefas/:id`)
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos

## 💪 Módulo Treinos & Saúde (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/TreinosSaude/treinossaude.html`, `CSS/TreinosSaude/treinossaude.css` e `JS/TreinosSaude/treinossaude.js`, com 2 sub-abas
- [x] **Aba Treinos**: organização por blocos (ex: "Treino A - Peito e Tríceps"), cada um com sua lista de exercícios (séries, repetições, carga, observações) — modelos `BlocoTreino` e `ExercicioTreino` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/treinos/blocos` e `/api/treinos/exercicios`)
- [x] Campo **Dia da Semana** no bloco (Segunda a Domingo, ou sem dia definido), com os blocos agrupados por dia na tela (permite adicionar quantos blocos quiser por dia, ex: "Segunda: Treino de Superior")
- [x] **Aba Saúde**: registros diários opcionais de peso, cintura, água ingerida e horas de sono — modelo `RegistroSaude` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/saude/registros`), com KPIs de peso atual (variação desde o último registro) e médias de água/sono dos últimos 7 dias
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos

## 🚘 Módulo Garagem (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/Garagem/garagem.html`, `CSS/Garagem/garagem.css` e `JS/Garagem/garagem.js`, com 2 sub-abas — distinto do módulo de negócio "Carros de Leilão" (Hub Financeiro), aqui é para os veículos pessoais do usuário
- [x] **Aba Minha Garagem**: ficha completa de cada veículo ativo (marca, modelo, ano, placa, cor, quilometragem, data e valor de compra) — modelo `VeiculoGaragem` no Prisma, API REST própria (`GET/POST/PUT/DELETE /api/garagem/veiculos`), com busca por marca/modelo/placa e KPIs (veículos ativos, valor total em compras, investido em manutenção)
- [x] **Ficha do Veículo** (modal): histórico completo de manutenções (troca de óleo, pneu, revisão, freios, funilaria, documentação, etc.) — modelo `ManutencaoGaragem` no Prisma vinculado ao veículo, API REST própria (`POST/PUT/DELETE /api/garagem/manutencoes`), com custo total (compra + manutenções) calculado automaticamente
- [x] **Aba Histórico de Vendidos**: veículos com status "Vendido" saem da garagem ativa e entram numa tabela histórica mostrando data/valor de compra, data/valor de venda, gasto total em manutenção e o resultado financeiro (venda − custo total) de cada um, com KPI de resultado total acumulado
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos

## ⚙️ Módulo Configurações (Conta do Usuário)
- [x] Novo módulo dedicado: `HTML/Configuracoes/configuracoes.html`, `CSS/Configuracoes/configuracoes.css` e `JS/Configuracoes/configuracoes.js`, acessível pelo novo link "Configurações" no menu de conta do cabeçalho (todas as páginas)
- [x] **Cartão Perfil**: alteração do nome de exibição (`PUT /api/auth/perfil`) e upload de foto de perfil (redimensionada no navegador via `<canvas>` e salva como Data URL Base64 no campo `Usuario.fotoUrl`), com botão de remover foto — avatar exibido em tempo real no botão de conta do cabeçalho em todas as páginas
- [x] **Cartão Negócios do Hub Financeiro**: lista com interruptor (toggle) para cada negócio (Fundos Imobiliários, Cripto, Carros de Leilão, Casas de Leilão, Cofrinho) — ao desativar, o modelo `ModuloOculto` grava a preferência (`POST/DELETE /api/auth/modulos-ocultos/:modulo`) e o item some da sidebar e dos cards da Visão Geral em todas as páginas (via atributo `data-modulo` + `aplicarModulosOcultos()` em `JS/Global/auth.js`)

> ⚠️ Pendência manual: rodar `npm run prisma:push` (com o servidor Node parado, para evitar o erro EPERM de arquivo em uso no Windows) para criar a tabela `ModuloOculto` e a coluna `fotoUrl` em `Usuario` antes de usar o módulo Configurações.

## 🛡️ Administração de Usuários (Cartão dentro de Configurações, apenas Davi_olp/PhMiori)
- [x] Novo campo `role` no modelo `Usuario` do Prisma (`"admin"` ou `"usuario"`, padrão `"usuario"`) — coluna criada automaticamente no banco Neon ao subir o servidor (`garantirColunaRole()` em `server.js`, que também promove `Davi_olp` e `PhMiori` a `role: "admin"`)
- [x] Novo Cartão **"Administração de Usuários"** em `HTML/Configuracoes/configuracoes.html`, visível apenas quando o usuário logado tem `role: "admin"`: lista todos os usuários do sistema, botão **"+ Novo Usuário"** (cria conta Administrador ou Usuário Comum com login/nome/senha) e **"Editar"** por usuário (altera nome, login, cargo e redefine a senha)
- [x] Botão **"Gerenciar Usuários"** no menu de conta do cabeçalho (`JS/Global/auth.js`), visível apenas para administradores, levando direto ao cartão em Configurações
- [x] Novas rotas protegidas por `requireAdmin` em `server.js`: `GET/POST /api/auth/usuarios`, `PUT /api/auth/usuarios/:id` e `PUT /api/auth/usuarios/:id/senha`
- [x] Proteções: um administrador não pode remover o próprio cargo de admin, e o sistema impede que o último administrador restante seja rebaixado

## 🔧 Segurança, Refatoração, Testes e Melhorias Transversais
- [x] **Segurança**: `helmet` (com CSP customizada para liberar o Chart.js via CDN), `express-rate-limit` no login (10 tentativas / 15 min), cookie de sessão `secure` condicionado a `NODE_ENV=production`, aviso no console se `SESSION_SECRET` não estiver configurado em produção
- [x] **Correção de doc**: `README.md` e `ARCHITECTURE.md` atualizados para refletir a stack real (Node/Express + Prisma/PostgreSQL), que havia divergido do texto original (SQLite/PHP)
- [x] **Refatoração do `server.js`** (antes um único arquivo com ~3100 linhas): dividido em `lib/` (módulos compartilhados: `prisma`, `auth-middleware`, `leilao-shared`, `calc`, `fii-alerts`, `cripto-alerts`, `cripto-shared`, `notificacoes-shared`, `bootstrap`) e `routes/` (um router Express por módulo). `server.js` agora é só o entrypoint (setup, montagem dos routers, cron, bootstrap)
- [x] **Testes automatizados** (`node --test`, sem dependência nova): `tests/calc-veiculo.test.js`, `tests/calc-imovel.test.js` e `tests/calc-cofrinho.test.js` (cobrindo o ROI de Veículo/Imóvel e a ordem correta IOF-antes-do-IR do Cofrinho, usando `node:test`'s `mock.timers` para fixar a data)
- [x] **Alerta de preço por e-mail estendido para Cripto**: novos campos `alertaPrecoAbaixoDe`/`alertaDisparado` em `InvestimentoCripto`, cron próprio a cada 5 min (`verificarAlertasPrecoCripto`), função de e-mail generalizada (`enviarEmailAlertaPrecoAtivo`, reaproveitada por FII/Cripto/Watchlist)
- [x] **Sino de notificações estendido**: além dos lembretes de Calendário, agora também mostra itens da Despensa com estoque abaixo do mínimo e Tarefas & Manutenção da Casa vencidas — usando uma tabela genérica `NotificacaoDispensada` (tipo + entidadeId) para "apagar" essas notificações sem mexer no registro original
- [x] **Alerta de FII fora da carteira (Lista de Observação)**: novo modelo `FiiWatchlist`, 4ª aba "Lista de Observação" no módulo FII com modal de cadastro (ticker + preço de alerta), rotas `GET/POST/PUT/DELETE /api/fii/watchlist`, reaproveitando o mesmo cron/e-mail do FII da carteira
- [x] **Exportar/backup de dados**: `GET /api/backup/export` reúne todos os dados do usuário logado (veículos, imóveis, FIIs, watchlist, cripto, cofrinhos, eventos, casa, treinos, saúde, garagem, clima) em um único JSON para download; botão "Baixar meus dados" no Cartão "Meus Dados" em Configurações
- [x] **PWA**: `manifest.json`, `service-worker.js` (cache-first para estáticos, bypass total para `/api/*`) e `JS/Global/pwa-register.js`, incluídos nas 14 páginas HTML; ícones placeholder gerados em `icons/icon-192.png` e `icons/icon-512.png` (trocar por uma marca real quando quiser)

> ⚠️ Pendência manual: rodar `npm run prisma:push` (com o servidor Node parado) para criar as tabelas `NotificacaoDispensada` e `FiiWatchlist` no banco — até lá, as notificações de Despensa/Tarefas e a Lista de Observação de FIIs ficam inativas (sem erro para o resto do sistema, só essas duas funcionalidades não funcionam ainda).

