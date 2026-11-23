const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const env = require('./env');

function criarSessao() {
  const store = new MySQLStore({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: env.sessionMinutes * 60 * 1000,
    schema: {
      tableName: 'sessoes',
      columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
    }
  });

  const middleware = session({
    name: 'estoque.sid',
    secret: env.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,                 // expiração por inatividade
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.isProduction,    // exige HTTPS em produção
      maxAge: env.sessionMinutes * 60 * 1000
    }
  });

  return { middleware, store };
}

module.exports = { criarSessao };
