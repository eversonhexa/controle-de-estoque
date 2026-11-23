const { query } = require('../config/database');

async function listar(f) {
  const where = [];
  const params = [];
  if (f.usuarioId) { where.push('a.usuario_id = ?'); params.push(f.usuarioId); }
  if (f.acao) { where.push('a.acao = ?'); params.push(f.acao); }
  if (f.tabela) { where.push('a.tabela_referencia = ?'); params.push(f.tabela); }
  if (f.registroId) { where.push('a.registro_id = ?'); params.push(f.registroId); }
  if (f.de) { where.push('a.data_hora >= ?'); params.push(`${f.de} 00:00:00`); }
  if (f.ate) { where.push('a.data_hora <= ?'); params.push(`${f.ate} 23:59:59`); }
  if (f.q) { where.push('a.descricao LIKE ?'); params.push(`%${f.q}%`); }

  const pagina = Math.max(1, Number(f.pagina) || 1);
  const porPagina = Math.min(200, Math.max(10, Number(f.porPagina) || 50));
  const filtro = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM auditoria a ${filtro}`, params);
  const registros = await query(
    `SELECT a.id, a.data_hora, a.usuario_id, u.nome AS usuario_nome, u.login AS usuario_login,
            a.acao, a.tabela_referencia, a.registro_id, a.descricao, a.ip
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
       ${filtro} ORDER BY a.id DESC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
    params
  );
  return { total, pagina, porPagina, registros };
}

async function acoes() {
  const rows = await query('SELECT DISTINCT acao FROM auditoria ORDER BY acao');
  return rows.map((r) => r.acao);
}

module.exports = { listar, acoes };
