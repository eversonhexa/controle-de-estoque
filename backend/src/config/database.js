const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  decimalNumbers: true,   // DECIMAL retornado como number
  dateStrings: true,      // DATETIME retornado como 'YYYY-MM-DD HH:mm:ss', sem conversão de fuso
  namedPlaceholders: false
});

/**
 * Executa a função dentro de uma transação. Em caso de erro, faz ROLLBACK
 * e propaga o erro; em caso de sucesso, faz COMMIT.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 */
async function transacao(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* conexão pode ter caído */ }
    throw err;
  } finally {
    conn.release();
  }
}

/** Consulta simples fora de transação. Sempre parametrizada. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, transacao, query };
