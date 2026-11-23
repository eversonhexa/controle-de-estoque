const { pool } = require('../config/database');

/**
 * Registra uma operação na auditoria (RN12).
 * Quando chamado com uma conexão de transação, o registro só é gravado
 * se a operação for confirmada (COMMIT).
 *
 * @param {object|null} conn conexão da transação (ou null para usar o pool)
 * @param {{usuarioId:number|null, acao:string, tabela?:string, registroId?:number, descricao?:string, ip?:string}} dados
 */
async function registrarAuditoria(conn, { usuarioId, acao, tabela = null, registroId = null, descricao = null, ip = null }) {
  const executor = conn || pool;
  await executor.query(
    'INSERT INTO auditoria (usuario_id, acao, tabela_referencia, registro_id, descricao, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [usuarioId || null, acao, tabela, registroId, descricao ? String(descricao).slice(0, 1000) : null, ip]
  );
}

module.exports = { registrarAuditoria };
