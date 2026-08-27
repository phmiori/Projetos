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

## 📈 Módulo Principal: Gestão e Cálculo de Investimentos
- [] Implementar serviços de sincronização de taxas oficiais (API Banco Central - Selic, CDI, IPCA e Dólar PTAX)
- [] Implementar ingestão de dados oficiais do Tesouro Transparente (Títulos públicos) e CVM (Dados de FIIs)
- [] Criar tabela/estrutura no banco de dados (taxas_mercado) com rotina agendada (Cron Job) para atualização diária
- [] Modelar banco de dados para Carteira de Usuários, Ativos e Transações (Aportes/Vendas/Proventos)
- [] Implementar KPIs analíticos no topo do Dashboard (Patrimônio Total, Lucro/Prejuízo Acumulado R$ e %, Proventos do Mês, Rentabilidade Real vs IPCA)
- [] Desenvolver motor de cálculo de Renda Fixa (Rentabilidade bruta/líquida com desconto regressivo de IR)
- [] Desenvolver motor de cálculo de Renda Variável, FIIs e Cripto (Preço Médio, Rentabilidade, Proventos e Dólar)
- [] Desenvolver painel de Rebalanceamento de Carteira (Alocação Meta % vs Alocação Atual %)
- [] Criar Modal de Cadastro/Edição de Transações com conversão e cálculos automáticos
- [] Implementar persistência de dados no banco de dados com tratamento de erros/fallback
- [] Documentar execução de cálculos, endpoints e arquitetura no README.md