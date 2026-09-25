# 🎓 Gestão de Leads & Matrículas Escolares

Solução web *stateless* projetada para o gerenciamento comercial e acompanhamento do funil de conversão (Lead → Visita → Matrícula) de instituições de ensino. A aplicação adota uma arquitetura desacoplada, separando a camada de processamento de requisições HTTP do armazenamento relacional persistente.

## 📑 Sumário

* [Visão Geral da Arquitetura](#-visão-geral-da-arquitetura)

* [Stack Tecnológica](#-stack-tecnológica)

* [Design de Software & Segurança](#-design-de-software--segurança)

* [Estrutura do Projeto](#-estrutura-do-projeto)

* [Ambiente de Desenvolvimento (Local)](#-ambiente-de-desenvolvimento-local)

* [Guia de Deploy em Produção](#-guia-de-deploy-em-produção)

  * [1. Provisionamento da Instância PostgreSQL (Supabase)](#1-provisionamento-da-instância-postgresql-supabase)

  * [2. Implantação do Web Service (Render)](#2-implantação-do-web-service-render)

* [Manutenção e Monitoramento](#-manutenção-e-monitoramento)

## 📐 Visão Geral da Arquitetura

O sistema foi arquitetado para operar sob o paradigma de **Aplicações Stateless (Factor XII)**. A camada de aplicação Node.js/Express lida exclusivamente com a lógica de negócios, validações de entrada e renderização do frontend de página única (SPA). A persistência dos dados e a concorrência transacional são delegadas a um cluster gerenciado de PostgreSQL hospedado no Supabase.

```
┌─────────────────────────┐       HTTPS       ┌─────────────────────────┐
│     Client Browser      │ ────────────────> │    Render Web Service   │
│  (Vanilla JS / Tailwind)│                   │     (Node.js / Express) │
└─────────────────────────┘                   └────────────┬────────────┘
                                                           │
                                                           │ TCP / TLS (Pooler: 6543)
                                                           ▼
                                              ┌─────────────────────────┐
                                              │   Supabase PostgreSQL   │
                                              │   (Managed DB Cluster)  │
                                              └─────────────────────────┘

```

### Vantagens da Abordagem Decoupled:

* **Zero Perda de Estado:** O contêiner de execução pode sofrer reinicializações, *cold starts* ou *re-deploys* sem que haja degradação ou perda de integridade dos dados cadastrais.

* **Escalabilidade Horizontal:** A aplicação web pode ser dimensionada de forma independente da camada de banco de dados.

* **Alta Disponibilidade (HA):** Utilização de connection pooling via PgBouncer/Supabase Transaction Pooler para mitigação de exaustão de conexões HTTP paralelas.

## 🛠 Stack Tecnológica

* **Runtime:** Node.js (v18+ LTS)

* **Web Framework:** Express.js 4.x

* **Database Driver:** `pg` (node-postgres) integrado com SSL/TLS ativo

* **Database Engine:** PostgreSQL 15+ (Hosted via Supabase)

* **Frontend:** HTML5, Vanilla JavaScript ES6+, Tailwind CSS (CDN Engine), FontAwesome 6

* **Infraestrutura PaaS:** Render (Application Hosting) + Supabase (DBaaS)

## 🔒 Design de Software & Segurança

* **Prevenção de SQL Injection:** Todas as operações de leitura e escrita utilizam *Parameterized Queries* (`$1`, `$2`, ...), garantindo o *escaping* rigoroso na camada de driver.

* **Mitigação de XSS (Cross-Site Scripting):** Sanitização de entrada com `express-validator` e enconding contextual (`escapeHtml`) no ciclo de renderização DOM do cliente.

* **Rate Limiting & DDoS Prevention:** Middleware `express-rate-limit` restringindo o fluxo de requisições por IP na sub-rota `/api/*` a 200 req / 15 min.

* **Hardening de Cabeçalhos HTTP:** Implementação do `helmet` para aplicação de diretivas de segurança HTTP (Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options).

* **Exportação Otimizada (UTF-8 BOM):** Geração de relatórios CSV via stream HTTP injetando o byte order mark (`\uFEFF`) e delimitador `;` para compatibilidade determinística com instâncias do Microsoft Excel e Google Sheets.

## 📁 Estrutura do Projeto

```
gerenciador-leads/
├── .env.example          # Template de variáveis de ambiente do sistema
├── .gitignore             # Regras de exclusão para o versionamento Git
├── package.json          # Manifesto de dependências e scripts de automação
├── database.js           # Inicialização do Pool PostgreSQL e Auto-DDL
├── server.js             # Endpoints RESTful, Middlewares e Injeção de Dependências
└── public/
    └── index.html        # SPA Client-side com painel retrátil e manipuladores DOM

```

## 💻 Ambiente de Desenvolvimento (Local)

### Pré-requisitos

* Node.js LTS instalado (`>= 18.0.0`)

* Npm ou Yarn

* Instância do PostgreSQL em execução local ou string de conexão remota

### Instruções

1. Clone o repositório:

   ```
   git clone https://github.com/seu-usuario/gestao-leads-escola.git
   cd gestao-leads-escola
   
   ```

2. Instale as dependências:

   ```
   npm install
   
   ```

3. Configure o arquivo de ambiente:
   Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

   ```
   PORT=3000
   DATABASE_URL=postgres://usuario:senha@localhost:5432/gestao_leads
   
   ```

4. Execute a aplicação em modo de desenvolvimento:

   ```
   npm run dev
   
   ```

   Acesse a aplicação em `http://localhost:3000`.

## ☁️ Guia de Deploy em Produção

### 1. Provisionamento da Instância PostgreSQL (Supabase)

1. Acesse o [Supabase Dashboard](https://supabase.com/?utm_source=gemini) e crie um novo projeto denominado `gestao-leads-escola`.

2. Defina uma senha mestre segura para o banco de dados e selecione a região mais próxima (ex: `South America / São Paulo`).

3. Navegue em **Project Settings** → **Database** → **Connection String** → **URI** (ou Transaction Pooler - Porta `6543`).

4. Copie a String de Conexão e substitua o *placeholder* `[YOUR-PASSWORD]` pela senha configurada.

> **Nota de Schema:** A criação automática da tabela `leads` e dos índices necessários é executada no bootstrapping da aplicação Node.js (`database.js`), dispensando a execução manual de scripts DDL via console SQL.

### 2. Implantação do Web Service (Render)

1. Faça o *push* do seu código para o repositório GitHub.

2. Acesse o [Render Dashboard](https://dashboard.render.com/?utm_source=gemini) e clique em **New +** → **Web Service**.

3. Vincule o repositório GitHub e configure os parâmetros de build:

   * **Name:** `gestao-leads-escola`

   * **Environment:** `Node`

   * **Branch:** `main`

   * **Build Command:** `npm install`

   * **Start Command:** `node server.js`

   * **Instance Type:** `Free`

4. Em **Environment Variables**, adicione a chave de conexão:

   * **Key:** `DATABASE_URL`

   * **Value:** `<Sua-String-De-Conexão-URI-Do-Supabase>`

5. Clique em **Create Web Service**.

Após o término da rotina de build, a URL HTTPS pública estará disponível para tráfego operacional (ex: `https://gestao-leads-escola.onrender.com`).

## 🛠 Manutenção e Monitoramento

* **Logs de Produção:** Acesse a aba *Logs* no painel do Render para inspecionar saídas do `console.error` ou rastrear exceções em tempo real.

* **Auditoria de Dados:** Utilize o **Table Editor** integrado no painel do Supabase para realizar inspeções de dados, edições diretas ou queries *ad-hoc*.

* **Cold Start Latency:** No plano gratuito do Render, o serviço entra em suspensão após 15 minutos de inatividade. O primeiro acesso subsequente levará aproximadamente \~30 segundos para a inicialização da VM (comportamento esperado).