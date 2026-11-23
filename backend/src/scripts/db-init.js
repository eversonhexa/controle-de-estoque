/**
 * Cria o banco de dados, as tabelas (schema.sql) e os dados iniciais (seeds/seed.sql).
 *
 * Uso:
 *   npm run db:init              -> cria o banco se ainda não houver tabelas
 *   npm run db:init -- --force   -> APAGA e recria todas as tabelas
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const DIR_DB = path.resolve(__dirname, '../../database');

function nomeSeguro(nome) {
  if (!/^[A-Za-z0-9_]+$/.test(nome)) {
    throw new Error(`Nome de banco inválido: ${nome}`);
  }
  return nome;
}

async function inicializarBanco({ database = env.db.database, force = false, silencioso = false } = {}) {
  const nome = nomeSeguro(database);
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${nome}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${nome}\``);

    const [tabelas] = await conn.query(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ? AND table_name = 'documentos_estoque'",
      [nome]
    );
    if (tabelas[0].total > 0 && !force) {
      if (!silencioso) {
        console.log(`O banco "${nome}" já possui as tabelas do sistema. Nada foi alterado.`);
        console.log('Para APAGAR todos os dados e recriar, use: npm run db:init -- --force');
      }
      return false;
    }

    const schema = fs.readFileSync(path.join(DIR_DB, 'schema.sql'), 'utf8');
    const seed = fs.readFileSync(path.join(DIR_DB, 'seeds', 'seed.sql'), 'utf8');
    await conn.query(schema);
    await conn.query(seed);
    if (!silencioso) {
      console.log(`Banco "${nome}" criado com sucesso.`);
      console.log('Próximo passo: crie o primeiro administrador com "npm run criar-admin".');
    }
    return true;
  } finally {
    await conn.end();
  }
}

module.exports = { inicializarBanco };

if (require.main === module) {
  const force = process.argv.includes('--force');
  inicializarBanco({ force })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Falha ao inicializar o banco:', err.message);
      process.exit(1);
    });
}
