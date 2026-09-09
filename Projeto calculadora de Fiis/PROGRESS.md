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

> ✅ Migração aplicada em 05/09/2026 (`npm run prisma:push`).

## 🌤️ Módulo Clima (Hub Pessoal)
- [x] Novo módulo dedicado: `HTML/Clima/clima.html`, `CSS/Clima/clima.css` e `JS/Clima/clima.js` — sem necessidade de tabela no banco (dados sempre em tempo real via APIs públicas e gratuitas, sem chave de API)
- [x] Detecção automática da localização atual via geolocalização do navegador, com identificação do nome do local pela API BigDataCloud (`GET /api/clima/local-atual`)
- [x] Busca manual de qualquer cidade ou bairro via Open-Meteo Geocoding (`GET /api/clima/buscar-local`), com dropdown de resultados e chips de locais buscados recentemente (salvos no navegador)
- [x] Clima atual (temperatura, sensação térmica, umidade, vento, mín/máx do dia) e previsões horária (24h) e diária (7 dias) via Open-Meteo (`GET /api/clima/previsao`)
- [x] Fallback automático para o último local buscado quando a geolocalização é negada ou indisponível
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos
- [x] Locais Salvos persistentes: modelo `LocalClimaSalvo` no Prisma vinculado ao usuário, com API REST própria (`GET/POST/DELETE /api/clima/salvos`) — botão de estrela no card do clima atual para salvar/remover, e seção "Meus Locais Salvos" (com mini-previsão de cada um) sempre visível ao entrar no módulo
- [x] **Widget de Clima no Cabeçalho** (ícone + temperatura, presente em todos os módulos): campo `favoritoHeader` no modelo `LocalClimaSalvo`, com botão de "pin" em cada card de Local Salvo para escolher qual local aparece no cabeçalho (`PUT /api/clima/salvos/:id/favorito`, apenas um favorito por vez) e rota combinada `GET /api/clima/favorito` que já retorna o clima atual do local marcado — tabela de códigos/ícones extraída para `JS/Clima/clima-codigos.js` (compartilhada entre o módulo Clima e o widget) e widget em `JS/Clima/clima-header-widget.js` + `CSS/Clima/clima-header-widget.css`, incluído no cabeçalho de todos os módulos do Hub

## 🏦 Módulo Finanças (Hub Pessoal)
> Substitui integralmente o antigo módulo "Finanças & Casa" (removido, junto com Despensa e Tarefas & Manutenção) por um controle bancário completo.
- [x] Novo módulo dedicado: `HTML/Financas/financas.html`, `CSS/Financas/financas.css` e `JS/Financas/financas.js`, com 5 sub-abas: Visão Geral, Transações, Cartões & Faturas, Contas e Categorias
- [x] **Contas Bancárias**: modelo `ContaBancaria` no Prisma (nome, banco, tipo, saldo inicial, cor), API REST própria (`GET/POST/PUT/DELETE /api/financas/contas`), com saldo atual calculado a partir das transações pagas
- [x] **Cartões de Crédito**: modelo `CartaoCredito` (banco, bandeira, limite, dia de fechamento, dia de vencimento, conta vinculada para pagamento da fatura), API REST própria (`GET/POST/PUT/DELETE /api/financas/cartoes`), com limite usado/disponível calculado a partir das faturas em aberto
- [x] **Categorias**: modelo `CategoriaFinanceira` (nome, tipo, cor, orçamento mensal opcional), API REST própria (`GET/POST/PUT/DELETE /api/financas/categorias`)
- [x] **Transações**: modelo `Transacao` unificando Receita/Despesa/Transferência, com forma de pagamento (Débito/Crédito/Pix/Dinheiro/Boleto), status (Pago/Pendente/Agendado) e suporte a **parcelamento** (gera N transações vinculadas por `grupoParcelamentoId`, cada uma já atribuída à fatura correspondente) — API REST própria (`GET/POST/PUT/DELETE /api/financas/transacoes`)
- [x] **Faturas de Cartão**: modelo `FaturaCartao`, gerada automaticamente por competência (mês/ano) a partir do dia de fechamento do cartão — compras após o fechamento caem na fatura seguinte; rota de pagamento (`POST /api/financas/faturas/:id/pagar`) que marca a fatura como paga e pode lançar automaticamente a despesa em débito na conta vinculada
- [x] **Dashboard (Visão Geral)**: saldo total, receita/despesa/resultado do mês, gráfico de gastos por categoria e evolução mensal (Chart.js), faturas em aberto por cartão e barra de progresso de orçamento por categoria (`GET /api/financas/resumo`)
- [x] Alerta de **fatura vencendo** integrado ao sino de notificações (substituindo os alertas de estoque baixo/tarefa vencida do módulo antigo)
- [x] Integração da navegação (sidebar) no Hub Pessoal de todos os módulos

> ✅ Migração aplicada em 05/09/2026 (`npm run prisma:push`) — as 3 tabelas antigas foram removidas (a `GastoCasa` tinha 3 registros órfãos do módulo já substituído, removidos com autorização do usuário).

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

> ✅ Migração aplicada em 05/09/2026 (`npm run prisma:push`).

## 🛡️ Administração de Usuários (Cartão dentro de Configurações, apenas Davi_olp/PhMiori)
- [x] Novo campo `role` no modelo `Usuario` do Prisma (`"admin"` ou `"usuario"`, padrão `"usuario"`) — coluna criada automaticamente no banco Neon ao subir o servidor (`garantirColunaRole()` em `server.js`, que também promove `Davi_olp` e `PhMiori` a `role: "admin"`)
- [x] Novo Cartão **"Administração de Usuários"** em `HTML/Configuracoes/configuracoes.html`, visível apenas quando o usuário logado tem `role: "admin"`: lista todos os usuários do sistema, botão **"+ Novo Usuário"** (cria conta Administrador ou Usuário Comum com login/nome/senha) e **"Editar"** por usuário (altera nome, login, cargo e redefine a senha)
- [x] Botão **"Gerenciar Usuários"** no menu de conta do cabeçalho (`JS/Global/auth.js`), visível apenas para administradores, levando direto ao cartão em Configurações
- [x] Novas rotas protegidas por `requireAdmin` em `server.js`: `GET/POST /api/auth/usuarios`, `PUT /api/auth/usuarios/:id` e `PUT /api/auth/usuarios/:id/senha`
- [x] Proteções: um administrador não pode remover o próprio cargo de admin, e o sistema impede que o último administrador restante seja rebaixado

## 🔐 Sessão de Login Persistida no Banco (não perde mais o login)
- [x] **Causa raiz do "pede login toda hora"**: as sessões ficavam só na memória do processo Node (`MemoryStore`, padrão do `express-session`) — qualquer reinício do servidor derrubava todo mundo logado, e o plano gratuito do Render hiberna o serviço por inatividade e reinicia o processo a cada novo acesso, então praticamente todo retorno ao site pedia login de novo
- [x] **Corrigido**: `server.js` agora usa `connect-pg-simple` para guardar as sessões numa tabela própria (`sessao_usuario`) no mesmo Postgres/Neon já usado pelo resto do app — sobrevive a reinícios/hibernação do servidor. A tabela é criada sozinha na primeira sessão salva (`createTableIfMissing`), não depende de `prisma db push` (não faz parte do `schema.prisma`, é gerenciada pelo próprio pacote)
- [x] Tempo de sessão aumentado de 8 horas para 30 dias (seguro agora que fica persistida no banco em vez de memória)
- [x] Testado localmente contra o banco Neon: gravação, leitura e expiração de sessão na tabela `sessao_usuario` funcionando corretamente
- [x] Nova dependência: `connect-pg-simple` (`package.json`)

## 💬 Modal de Confirmação Componentizado (substitui o `confirm()` nativo em todo o app)
- [x] Novo componente global: `CSS/Global/confirm-dialog.css` + `JS/Global/confirm-dialog.js`, injetado dinamicamente no DOM (sem precisar de markup fixo em cada página) — função `confirmarAcao(mensagem, opcoes)`, retorna uma Promise, com a identidade visual do FinanceHub (Modo Claro/Escuro automático)
- [x] Suporta o caso simples de 2 botões (Cancelar/Confirmar, com variante `perigo` em vermelho para ações destrutivas) e também decisões de múltiplos caminhos via `botoes: [...]` customizados (ex.: excluir evento recorrente "esta e as futuras" / "somente esta" / "cancelar")
- [x] Fecha por clique no botão, no backdrop ou tecla Esc
- [x] Substituídos **todos os 25 usos** de `window.confirm()` do app (FII, Cripto, Cofrinho, Financas, Calendário, Garagem, Carros/Casas de Leilão, Treinos & Saúde, Notificação, Configurações e Assistente de IA) por `await confirmarAcao(...)`
- [x] Testado no navegador: diálogo de 2 botões, diálogo de 3 botões (recorrência) e fechamento por Esc — todos resolvendo o valor correto
- [x] Incluído (CSS + JS) no cabeçalho de todos os módulos, junto com o Assistente de IA

## 📱 App Mobile (React Native / Expo) — pasta `App/`
- [x] Novo projeto Expo (SDK 57, React Native 0.86, React 19.2) em `App/`, **sem banco próprio**: fala com a mesma API REST (`server.js`) e o mesmo Postgres/Neon do site — o que é cadastrado em um aparece no outro
- [x] Login de verdade (`POST /api/auth/login`, sessão por cookie — o fetch nativo do React Native mantém o cookie sozinho, igual a um navegador) e aba **FIIs** listando a carteira real do usuário logado (`GET /api/fii`)
- [x] Paleta de cores espelhando `CSS/Global/global_tokens.css` (Modo Escuro)
- [x] `app.json` já aponta para a produção no Render por padrão — funciona sem precisar rodar nada no computador
- [x] Testado: `npm install` (499 pacotes, sem conflito) e `expo export --platform android` compilando os 835 módulos sem erro (bundle JS validado sem precisar de emulador)
- [x] Escolha do usuário: React Native/Expo (UI nativa "de verdade", em vez de empacotar o site com Capacitor) e só Android por enquanto — ver `App/README.md` para como rodar (Expo Go) e gerar um `.apk` (EAS Build)
- [x] Documentado em `App/README.md` o mesmo bug de `'"node"' não reconhecido` do npm/npx em pastas com espaço no caminho (já visto com `prisma`) e o workaround de chamar `node node_modules/expo/bin/cli ...` direto

> ⚠️ Pendente (próximos módulos, um por vez — mesmo padrão do site): Cripto, Cofrinho, Finanças, Calendário, Clima, Garagem, Treinos & Saúde, Carros/Casas de Leilão, Notificações, Assistente de IA e Configurações ainda só existem no site, não no app.

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

> ✅ Migração aplicada em 05/09/2026 (`npm run prisma:push`).

## 🎨 Rodada de Melhorias de UX (Visão Geral)
- [x] **Skeleton loaders**: classe global `.is-loading` (`CSS/Global/global_tokens.css`) com efeito shimmer, aplicada aos valores dos KPIs e mini-stats da Visão Geral (`HTML/Index/index.html` + `JS/Index/index.js`) enquanto os dados dos módulos ainda não chegaram da API
- [x] **Página offline do PWA**: `offline.html` na raiz, pré-cacheada e servida pelo `service-worker.js` (agora `financehub-v3`) como fallback quando uma navegação falha por falta de conexão
- [x] **Painel "Resumo do Dia"**: novo card no topo da Visão Geral combinando o próximo evento do Calendário (`/api/eventos`), o clima do local favorito (`/api/clima/favorito`) e a fatura de cartão mais próxima do vencimento (`/api/financas/resumo`) — cada bloco só aparece quando há dado disponível

> ⚠️ Nota: `GET /api/financas/resumo` retornou 404 no servidor local durante o teste desta rodada — a rota existe em `routes/financas.js`, então provavelmente é só o processo Node local (rodando via `npm run dev`) estar com uma versão antiga em memória. Reinicie o servidor local para o card de "Fatura Mais Próxima" funcionar.
- [x] **Empty states ilustrados**: telas de "nenhum registro ainda" da Garagem (`JS/Garagem/garagem.js`), Cofrinho (`JS/Cofrinho/cofrinho.js`) e Treinos & Saúde (`JS/TreinosSaude/treinossaude.js`) agora usam o componente global `.empty-state` (ícone + título + texto + botão de ação que já abre o modal de cadastro correspondente), em vez de só uma frase
- [x] **4º KPI "Patrimônio Líquido Total"** na Visão Geral: soma o capital já alocado em investimentos/negócios (FII, Cripto, Cofrinho, Casas e Carros de Leilão) com o saldo das Contas Bancárias e subtrai as Faturas de Cartão em aberto (via `/api/financas/resumo`), com fallback gracioso caso a rota de Finanças não responda
- [x] **Favicon de marca**: `icons/favicon.svg` (o mesmo símbolo "$" usado no logo do cabeçalho, em dourado sobre fundo escuro) referenciado via `<link rel="icon">` nas 14 páginas HTML — os ícones PWA (`icon-192.png`/`icon-512.png`) continuam placeholder (não há como gerar PNG de qualidade sem uma ferramenta de imagem; troque quando tiver uma marca definitiva)

## ⚙️ Automações e Histórico (2ª rodada — mexe no `schema.prisma`)
- [x] **Transações recorrentes de verdade** (Finanças): o checkbox "Lançamento recorrente" já existia mas não fazia nada — agora um cron diário (`lib/financas-shared.js` → `gerarTransacoesRecorrentesPendentes`, chamado em `server.js` 1x/dia às 3h e 1x ao iniciar o servidor) gera a ocorrência do mês seguinte assim que a atual vence, reaproveitando a mesma lógica de fatura de cartão (`calcularCompetencia`/`obterOuCriarFatura`, extraída de `routes/financas.js` para o novo `lib/financas-shared.js`). Campos novos em `Transacao`: `recorrenciaOrigemId`, `recorrenciaProximaGerada`. Para parar a recorrência, exclua ou desmarque a ocorrência mais recente da série (aviso explicado no formulário)
- [x] **Recorrência de eventos** (Calendário): campo "Repetir" (semanal/mensal + quantidade, máx. 52) no modal de novo evento — `POST /api/eventos` já cria todas as ocorrências de uma vez, compartilhando `serieRecorrenciaId`. Excluir um evento de uma série pergunta se é só aquela ocorrência ou "esta e as futuras" (`DELETE /api/eventos/:id?serie=futuras`). Edição não recria a série (só a ocorrência clicada)
- [x] **Histórico de Preço de FII** (gráfico de evolução da cota): novo modelo `HistoricoPrecoFii` (1 snapshot por FII por dia). Toda atualização de cotação (botão "Atualizar Cotações", cron de alerta de 5 min, ou o novo cron diário `snapshotHistoricoTodosFiis` às 19h que atualiza TODOS os FIIs, não só os com alerta) grava o snapshot do dia. Botão "📈" na tabela da carteira abre modal com gráfico de linha (Chart.js) via `GET /api/fii/:id/historico`
- [x] **Notificações Push reais**: infraestrutura completa de Web Push — modelos `PushSubscription` e `PushNotificacaoEnviada`, `lib/push-shared.js` (envio via `web-push`, cron a cada 5 min que notifica lembretes de evento e faturas vencendo, sem repetir a mesma notificação), rotas `GET /api/notificacoes/push/chave-publica` + `POST/DELETE /api/notificacoes/push/inscrever`, `service-worker.js` com handlers de `push`/`notificationclick`, e botão "Ativar notificações push" em Configurações. Chaves VAPID já geradas e configuradas no `.env` local (`.env.example` documentado com placeholder)

> ✅ Migração aplicada em 05/09/2026 (`npm run prisma:push` + `npm install` + reinício do servidor). Todas as tabelas/colunas novas foram criadas e testadas (recorrência de transação, recorrência de evento, push, histórico de FII — ver nota abaixo sobre a rodada de testes e correção de bug).

## 🐛 Correção Crítica: Módulo Finanças Não Salvava Nada (Produção e Local)
- [x] **Causa raiz encontrada**: as tabelas do módulo Finanças (`ContaBancaria`, `CartaoCredito`, `CategoriaFinanceira`, `Transacao`, `FaturaCartao`) nunca haviam sido criadas no banco Neon — a migração ficou pendente desde a criação do módulo (antes desta sessão) e só foi notada quando o usuário tentou cadastrar uma conta em produção (Render) e recebeu "Falha ao salvar conta"
- [x] **Corrigido**: rodado `npm run prisma:push --accept-data-loss` (com autorização do usuário, que confirmou que os 3 registros da tabela órfã `GastoCasa` podiam ser descartados) — banco local/produção (mesmo Neon) sincronizado com o schema atual
- [x] **Testado de ponta a ponta** (via API, com limpeza dos dados de teste ao final): criação de Conta Bancária, Categoria, Transação recorrente (confirmado que a próxima ocorrência é gerada automaticamente), Evento recorrente (3 ocorrências semanais geradas corretamente), FII, Cripto, Cofrinho, Veículo de Garagem, Veículo de Leilão, Imóvel de Leilão, Bloco de Treino, Registro de Saúde, chave pública de Push, Dashboard e Backup/Export — todos funcionando
- [x] **Corrigido `.claude/launch.json`**: `runtimeExecutable` apontava para `npm`, que não está no PATH do ambiente de execução de comandos deste projeto — trocado para o caminho completo do `node.exe` com os mesmos argumentos, para o preview local conseguir iniciar o servidor

## 🤖 Assistente de IA (janela flutuante no cabeçalho, todos os módulos)
- [x] Backend dedicado: `lib/assistente-shared.js` + `routes/assistente.js` — chat com o assistente, histórico persistido no modelo `MensagemAssistente` (Prisma), API REST própria (`GET/DELETE /api/assistente/historico`, `POST /api/assistente/chat`)
- [x] **IA gratuita (Google Gemini)**: `lib/assistente-shared.js` chama a API do Gemini (`gemini-3.6-flash`) via `fetch`, sem SDK novo — chave gratuita configurada em `GEMINI_API_KEY` no `.env` (instruções em `.env.example`); sem a chave, o chat responde avisando que a IA não foi configurada
- [x] **Contexto financeiro real**: antes de cada resposta, o backend monta um resumo da carteira de FIIs, Cripto, Cofrinho e do Patrimônio Líquido Total (mesma fórmula do KPI da Visão Geral) e envia como contexto ao Gemini, para sugestões de investimento personalizadas (sempre com aviso de que não é recomendação profissional)
- [x] **Envio de e-mail pelo chat**: o assistente usa Function Calling do Gemini (ferramenta `enviar_email`) para redigir e enviar e-mails de verdade quando o usuário pede diretamente na conversa (ex.: "manda um resumo pro meu e-mail") — reaproveita o mesmo transportador SMTP (`mailTransporter`, `lib/fii-alerts.js`) dos alertas de preço, enviando por padrão para o e-mail cadastrado do usuário em Configurações
- [x] **Adicionar FII pelo chat**: nova ferramenta `adicionar_fii` (mesmo mecanismo de Function Calling) — ex.: "adicione 1234 cotas de SNAG11 a 9,73, último rendimento 0,12". Se o ticker já existir na carteira, soma as cotas e recalcula o preço médio ponderado (mesma fórmula do modal "Novo Aporte" de `JS/FII/fii.js`); se não existir, cria uma posição nova. Confirmação (ticker, cotas totais, preço médio) aparece como tag na mensagem, igual à de e-mail enviado
- [x] **Correção**: a segunda chamada ao Gemini (só para gerar o texto de confirmação em linguagem natural, depois de já ter enviado o e-mail ou gravado o FII no banco) podia falhar e derrubar a rota inteira com erro 500 — escondendo do usuário que a ação já tinha sido executada com sucesso. Agora cada ferramenta monta uma resposta padrão antes dessa segunda chamada e usa ela como fallback se a chamada falhar
- [x] **Atualização automática da tela**: quando o assistente adiciona/atualiza um FII, dispara um evento (`financehub:fii-atualizado`) que a página do módulo FII escuta para recarregar a tabela sozinha, sem precisar de F5 (só funciona se a aba do FII já estiver aberta ao mesmo tempo que o chat)
- [x] **UX em janela flutuante (não é mais página própria)**: por pedido do usuário, o Assistente saiu do sidebar do Hub Pessoal e virou um botão de robô no cabeçalho (`CSS/Assistente/assistente.css`, `JS/Assistente/assistente.js`), presente em todos os módulos — ao clicar, abre uma janelinha de chat flutuante e arrastável (`position: fixed` + Pointer Events, mantida dentro dos limites da tela), sem navegar para outra página. `HTML/Assistente/assistente.html` (a página dedicada da versão anterior) foi removida
- [x] Testado o abrir/arrastar/fechar da janela flutuante em ambiente local (harness descartável fora do controle de versão)

> ✅ Migração aplicada e testada em produção (Render/Neon) nesta sessão: tabela `MensagemAssistente` criada com sucesso via `node.exe node_modules/prisma/build/index.js db push` (workaround usado porque `npm`/`node` não estavam no PATH do terminal do usuário — resolvido depois ajustando o PATH do Windows). `GEMINI_API_KEY` configurada e testada em produção.

