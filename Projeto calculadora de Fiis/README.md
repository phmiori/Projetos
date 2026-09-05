# AutoLeilão Hub (FinanceHub) - Gestão de Carros de Leilão

Sistema Full-Stack completo e funcional para controle de **compra (arremate)**, **reforma/preparação**, **regularização** e **venda** de veículos de leilão, com cálculo automático em tempo real de despesas acumuladas, lucros brutos e ROI (Retorno sobre Investimento).

---

## 🚀 Tecnologias Utilizadas

- **Frontend:** HTML5 Semântico, CSS3 Modular (com variáveis semânticas para Dark/Light Mode) e JavaScript Puro (Vanilla JS).
- **Backend:** Node.js com Express e REST API.
- **Banco de Dados & ORM:** Prisma ORM com PostgreSQL (hospedado no Neon), via a variável de ambiente `DATABASE_URL`.

---

## 📁 Estrutura de Pastas

```text
Projeto calculadora de Fiis/
├── HTML/
│   └── Index/
│       └── index.html            # Interface do Dashboard e Modais
├── CSS/
│   ├── Global/
│   │   └── global_tokens.css     # Tokens de cores, tema Dark/Light e reset
│   └── Index/
│       └── index.css             # Estilos modulares do dashboard e cards
├── JS/
│   └── Index/
│       └── index.js              # Lógica de interface, cálculos em tempo real e API
├── SQL/
│   └── schema.prisma             # Schema do Prisma (PostgreSQL/Neon) com todos os modelos
├── server.js                     # Servidor Express com rotas de CRUD e métricas
├── package.json                  # Dependências e scripts do projeto
├── ARCHITECTURE.md               # Diretrizes de arquitetura
├── PROGRESS.md                   # Registro de progresso
└── README.md                     # Instruções de execução
```

---

## 🛠️ Como Executar o Projeto na sua Máquina

### 1. Pré-requisitos
- Ter o **Node.js** (versão 18+ ou superior) instalado no computador.

### 2. Instalar as Dependências
Abra o terminal na pasta do projeto e execute:
```bash
npm install
```

### 3. Inicializar o Banco de Dados (Prisma)
Configure a variável `DATABASE_URL` no `.env` (veja `.env.example`) apontando para uma instância PostgreSQL (ex.: Neon). Depois, para sincronizar as tabelas e gerar o cliente Prisma, execute:
```bash
npm run prisma:push
```

### 4. Iniciar o Servidor
Execute o comando:
```bash
npm start
```
*Ou para desenvolvimento com recarregamento automático:*
```bash
npm run dev
```

### 5. Acessar a Aplicação
Abra o navegador no endereço:
👉 **[http://localhost:3000/HTML/Index/index.html](http://localhost:3000/HTML/Index/index.html)** (ou diretamente **[http://localhost:3000](http://localhost:3000)**)

---

## 📊 Estrutura de Dados e Cálculos Automáticos

Cada veículo contempla os seguintes blocos:

1. **Dados Gerais:** Marca, Modelo, Ano, Placa, Chassi, Origem (Seguradora, Banco, Frota, etc.), Status e Observações.
2. **Custos de Aquisição (Calculado):**
   $$\text{Total Aquisição} = \text{Lance (Arremate)} + (\text{Lance} \times \frac{\text{Comissão \%}}{100}) + \text{Taxas Pátio} + \text{Guincho}$$
3. **Custos de Preparação (Calculado):**
   $$\text{Total Preparação} = \text{Oficina/Mecânica} + \text{Funilaria/Pintura} + \text{Estética/Higienização} + \text{Detran/Docs}$$
4. **Custo Total Acumulado:**
   $$\text{Custo Total} = \text{Total Aquisição} + \text{Total Preparação}$$
5. **Dados de Venda e Margem:**
   $$\text{Lucro Bruto} = \text{Valor Final de Venda} - \text{Custo Total}$$
   $$\text{ROI (\%)} = \left(\frac{\text{Lucro Bruto}}{\text{Custo Total}}\right) \times 100$$

---

## ⚙️ Visualizador do Banco de Dados (Prisma Studio)
Para visualizar e gerenciar os registros do banco de dados em uma interface gráfica web oficial do Prisma, execute:
```bash
npm run prisma:studio
```
E acesse `http://localhost:5555`.
