# Sistema Web de Controle de Estoque e Distribuição de Materiais

Aplicação web para controlar o recebimento, a armazenagem, as requisições dos setores, a distribuição e os saldos de um almoxarifado central.

**Stack:** Node.js + Express, MySQL 8 (mysql2), HTML5/CSS3/JavaScript com Bootstrap 5, sessões com `express-session` + `express-mysql-session`, senhas com bcrypt.

## Estrutura

```
Controle Estoque/
├── backend/
│   ├── src/
│   │   ├── config/        env, conexão MySQL (pool + transações), sessão
│   │   ├── controllers/   camada HTTP (finas)
│   │   ├── services/      regras de negócio (todas as validações importantes estão aqui)
│   │   ├── repositories/  consultas reutilizáveis
│   │   ├── routes/        rotas REST com autenticação e autorização por perfil
│   │   ├── middlewares/   auth, CSRF, validação, tratamento de erros
│   │   ├── validators/    express-validator
│   │   ├── utils/         numeração, auditoria, permissões, exportação Excel/PDF
│   │   ├── scripts/       db-init, criar-admin, backup
│   │   ├── app.js         montagem do Express
│   │   └── server.js      inicialização
│   ├── database/          schema.sql, seeds/, migrations/
│   ├── tests/             testes automatizados (node:test + supertest)
│   └── .env.example
├── frontend/              páginas HTML, CSS e JS (servidos pelo próprio Express)
└── docs/                  API.md (rotas) e decisoes.md (decisões técnicas)
```

## Requisitos

- Node.js 18 ou superior (recomendado 20/22 LTS)
- MySQL **8.0.16 ou superior** (o banco usa CHECK constraints)

## Instalação

1. **Crie um usuário no MySQL** (recomendado; não use root em produção):

   ```sql
   CREATE USER 'estoque_app'@'localhost' IDENTIFIED BY 'uma-senha-forte';
   GRANT ALL PRIVILEGES ON controle_estoque.* TO 'estoque_app'@'localhost';
   GRANT ALL PRIVILEGES ON controle_estoque_teste.* TO 'estoque_app'@'localhost';
   ```

2. **Instale as dependências:**

   ```bash
   cd backend
   npm install
   ```

   No Windows, o `bcrypt` usa binários pré-compilados. Se a instalação falhar, instale as "Build Tools" do Visual Studio ou rode `npm install --build-from-source`.

3. **Configure o ambiente:** copie `backend/.env.example` para `backend/.env` e ajuste usuário, senha e `SESSION_SECRET`. Para gerar um segredo:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. **Crie o banco e os dados iniciais** (perfis, unidades de medida, setor do almoxarifado):

   ```bash
   npm run db:init
   ```

   `npm run db:init -- --force` **apaga** e recria todas as tabelas.

5. **Crie o primeiro administrador:**

   ```bash
   npm run criar-admin
   ```

6. **Inicie o sistema:**

   ```bash
   npm start          # ou: npm run dev (reinicia ao salvar arquivos)
   ```

   Acesse `http://localhost:3000` e entre com o administrador criado.

## Primeiros passos no sistema

1. Cadastre **setores**, **categorias** e **fornecedores**. As unidades de medida mais comuns já vêm cadastradas.
2. Cadastre as **mercadorias**. O saldo de cada uma começa zerado.
3. Cadastre os **usuários**. Todo usuário com perfil *Solicitante* precisa estar vinculado a um setor.
4. Registre e efetive as **entradas** (notas fiscais, doações etc.).
5. Os setores registram **requisições**. O almoxarifado aprova a requisição e registra as **saídas**, com entrega integral ou parcial.

## Perfis e permissões

| Permissão | Admin | Almoxarife | Solicitante | Consulta |
|---|:-:|:-:|:-:|:-:|
| Usuários, perfis e auditoria | ✔ | | | |
| Cadastros (incluir, alterar, inativar) | ✔ | ✔ | | |
| Entradas, saídas, ajustes e estornos | ✔ | ✔ | | |
| Aprovar, rejeitar e encerrar requisições | ✔ | ✔ | | |
| Registrar requisições | ✔ | ✔ | ✔ (só do próprio setor) | |
| Consultar requisições | todas | todas | só do próprio setor | todas |
| Estoque, extrato e relatórios | ✔ | ✔ | | ✔ |

A matriz completa está em `backend/src/utils/permissoes.js`. O menu exibido em cada tela segue a mesma matriz.

## Testes automatizados

Os testes usam um **banco separado** (`DB_NAME_TEST`), que é apagado e recriado a cada execução. Por segurança, o nome desse banco precisa conter "teste".

```bash
cd backend
npm test
```

Os testes cobrem os 10 cenários de aceitação da especificação (entrada, saída, atendimento parcial e integral, saldo insuficiente, quantidade acima da pendente, requisição não aprovada, estorno, concorrência e auditoria). Também testam efetivação duplicada, mercadoria inativa, ajustes, isolamento por setor, cancelamento e encerramento, CSRF, autorização por perfil, a inexistência de rota para alterar saldo diretamente, a consistência entre saldo e documentos e a exportação para Excel e PDF.

## Produção

- Use `NODE_ENV=production`. Nesse modo, o cookie de sessão exige HTTPS, o HSTS fica ativo e o sistema recusa um `SESSION_SECRET` fraco.
- Coloque o sistema atrás de um proxy reverso com HTTPS (nginx, IIS/ARR ou Apache) e defina `TRUST_PROXY=1`.
- Para manter o processo rodando, use um gerenciador como `pm2` ou um serviço do Windows (NSSM).
- **Backup:** `npm run backup` gera um dump com `mysqldump` na pasta `BACKUP_DIR`. Agende a execução diária no Agendador de Tarefas do Windows ou no cron, e guarde cópias fora do servidor.
- **Sessões:** expiram após `SESSION_MINUTES` de inatividade (padrão: 30).
- **Login:** cada IP tem no máximo `LOGIN_MAX_TENTATIVAS` tentativas a cada 15 minutos.

## Documentação

- [`docs/API.md`](docs/API.md): rotas da API, formato das respostas e códigos de erro.
- [`docs/decisoes.md`](docs/decisoes.md): inconsistências encontradas na especificação e decisões tomadas.
