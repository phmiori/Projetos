# Progresso e Lista de Tarefas do Sistema

## 📋 Módulos Gerais e Infraestrutura
- [ ] Criar arquivo global de conexão segura com o MySQL (`PHP/config/conexao.php`)
- [x] Criar e testar arquivo de tokens visuais com Dark e Light Mode (`CSS/Global/global_tokens.css`)

## 🏠 Módulo 01: Index (Página Inicial)
- [ ] Criar estrutura de banco de dados para a Home (`SQL/Index/001_criacao_index.sql`)
- [ ] Desenvolver a estrutura HTML do painel inicial (`HTML/Index/index.html`)
- [ ] Aplicar estilo, responsividade e variáveis semânticas (`CSS/Index/index.css`)
- [ ] Criar interações de carregamento da página com JS (`JS/Index/index.js`)
- [ ] Estruturar o ponto de entrada e validações do backend (`PHP/Index/index.php`)

## 📅 Módulo 02: Calendário
- [ ] Criar tabela principal de eventos no banco de dados (`SQL/Calendario/001_criacao_calendario.sql`)
- [ ] Desenvolver interface visual do grid do calendário (`HTML/Calendario/calendario.html`)
- [ ] Estilizar o grid e cards de eventos com as variáveis globais (`CSS/Calendario/calendario.css`)
- [ ] Implementar a lógica JS para renderizar dias do mês e abrir formulários (`JS/Calendario/calendario.js`)
- [ ] **Backend Especializado em PHP:**
    - [ ] Criar script de listagem de eventos (`PHP/Calendario/buscar_eventos.php`)
    - [ ] Criar script para salvar novos compromissos (`PHP/Calendario/salvar_evento.php`)
    - [ ] Criar script para atualização de datas/textos (`PHP/Calendario/atualizar_evento.php`)
    - [ ] Criar script para remoção de eventos (`PHP/Calendario/deletar_evento.php`)
    - [ ] Criar funções de ajuda para tratamento de datas (`PHP/Calendario/helpers_data.php`)
