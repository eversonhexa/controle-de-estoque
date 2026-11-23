const { query, transacao } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');

const SELECT = `
  SELECT m.id, m.codigo, m.descricao, m.categoria_id, c.nome AS categoria_nome,
         m.unidade_id, u.sigla AS unidade_sigla, u.descricao AS unidade_descricao,
         m.estoque_minimo, m.observacoes, m.ativo, m.criado_em,
         COALESCE(s.quantidade_atual, 0) AS saldo
    FROM mercadorias m
    JOIN categorias c ON c.id = m.categoria_id
    JOIN unidades_medida u ON u.id = m.unidade_id
    LEFT JOIN estoque_saldos s ON s.mercadoria_id = m.id`;

async function listar({ q, ativo, categoriaId }) {
  const where = [];
  const params = [];
  if (q) { where.push('(m.codigo LIKE ? OR m.descricao LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (ativo === '1' || ativo === '0') { where.push('m.ativo = ?'); params.push(Number(ativo)); }
  if (categoriaId) { where.push('m.categoria_id = ?'); params.push(categoriaId); }
  return query(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.descricao LIMIT 2000`, params);
}

async function obter(id) {
  const rows = await query(`${SELECT} WHERE m.id = ?`, [id]);
  if (!rows[0]) throw AppError.naoEncontrado('Mercadoria não encontrada.');
  return rows[0];
}

async function validarReferencias(conn, { categoria_id: categoriaId, unidade_id: unidadeId }) {
  const [[cat]] = await conn.query('SELECT ativo FROM categorias WHERE id = ?', [categoriaId]);
  if (!cat || !cat.ativo) throw AppError.regra('Categoria inválida ou inativa.');
  const [[un]] = await conn.query('SELECT ativo FROM unidades_medida WHERE id = ?', [unidadeId]);
  if (!un || !un.ativo) throw AppError.regra('Unidade de medida inválida ou inativa.');
}

async function criar(dados, ator, ip) {
  const id = await transacao(async (conn) => {
    await validarReferencias(conn, dados);
    const [r] = await conn.query(
      `INSERT INTO mercadorias (codigo, descricao, categoria_id, unidade_id, estoque_minimo, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dados.codigo, dados.descricao, dados.categoria_id, dados.unidade_id, dados.estoque_minimo || 0, dados.observacoes || null]
    );
    // Todo saldo nasce zerado e só muda por documentos efetivados
    await conn.query('INSERT INTO estoque_saldos (mercadoria_id, quantidade_atual) VALUES (?, 0)', [r.insertId]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: 'mercadorias', registroId: r.insertId, descricao: `Mercadoria ${dados.codigo} - ${dados.descricao}`, ip });
    return r.insertId;
  });
  return obter(id);
}

async function atualizar(id, dados, ator, ip) {
  await transacao(async (conn) => {
    const [[atual]] = await conn.query('SELECT id, codigo, unidade_id FROM mercadorias WHERE id = ? FOR UPDATE', [id]);
    if (!atual) throw AppError.naoEncontrado('Mercadoria não encontrada.');
    await validarReferencias(conn, dados);

    // A unidade é usada em todas as operações; trocar depois de movimentar distorceria o histórico
    if (Number(dados.unidade_id) !== atual.unidade_id) {
      const [[uso]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM documento_itens WHERE mercadoria_id = ?) +
                (SELECT COUNT(*) FROM requisicao_itens WHERE mercadoria_id = ?) AS total`, [id, id]
      );
      if (uso.total > 0) throw AppError.regra('A unidade de medida não pode ser alterada porque a mercadoria já possui documentos ou requisições.');
    }

    await conn.query(
      `UPDATE mercadorias SET codigo = ?, descricao = ?, categoria_id = ?, unidade_id = ?, estoque_minimo = ?, observacoes = ?
        WHERE id = ?`,
      [dados.codigo, dados.descricao, dados.categoria_id, dados.unidade_id, dados.estoque_minimo || 0, dados.observacoes || null, id]
    );
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: 'mercadorias', registroId: Number(id), descricao: `Mercadoria ${atual.codigo} alterada (código atual: ${dados.codigo})`, ip });
  });
  return obter(id);
}

async function alterarStatus(id, ativo, ator, ip) {
  await transacao(async (conn) => {
    const [[atual]] = await conn.query('SELECT codigo FROM mercadorias WHERE id = ? FOR UPDATE', [id]);
    if (!atual) throw AppError.naoEncontrado('Mercadoria não encontrada.');
    await conn.query('UPDATE mercadorias SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', tabela: 'mercadorias', registroId: Number(id), descricao: `Mercadoria ${atual.codigo}`, ip });
  });
  return obter(id);
}

module.exports = { listar, obter, criar, atualizar, alterarStatus };
