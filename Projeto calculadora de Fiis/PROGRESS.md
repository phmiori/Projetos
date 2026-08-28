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

