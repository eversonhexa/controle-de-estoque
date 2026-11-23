/** Consultas de estoque (somente leitura). */
const { query } = require('../config/database');
const AppError = require('../utils/AppError');

// Classificação visual da spec 8: NORMAL, BAIXO, ZERADO
const EXPR_SITUACAO = `CASE
    WHEN COALESCE(s.quantidade_atual, 0) = 0 THEN 'ZERADO'
    WHEN COALESCE(s.quantidade_atual, 0) <= m.estoque_minimo THEN 'BAIXO'
    ELSE 'NORMAL' END`;

const SELECT_POSICAO = `
  SELECT m.id AS mercadoria_id, m.codigo, m.descricao, m.categoria_id, c.nome AS categoria_nome,
         u.sigla AS unidade_sigla, COALESCE(s.quantidade_atual, 0) AS quantidade_atual,
         m.estoque_minimo, m.ativo, s.atualizado_em, ${EXPR_SITUACAO} AS situacao_estoque
    FROM mercadorias m
    JOIN categorias c ON c.id = m.categoria_id
    JOIN unidades_medida u ON u.id = m.unidade_id
    LEFT JOIN estoque_saldos s ON s.mercadoria_id = m.id`;

async function posicao(filtros = {}) {
  const where = [];
  const params = [];
  if (filtros.codigo) { where.push('m.codigo LIKE ?'); params.push(`%${filtros.codigo}%`); }
  if (filtros.descricao) { where.push('m.descricao LIKE ?'); params.push(`%${filtros.descricao}%`); }
  if (filtros.q) { where.push('(m.codigo LIKE ? OR m.descricao LIKE ?)'); params.push(`%${filtros.q}%`, `%${filtros.q}%`); }
  if (filtros.categoriaId) { where.push('m.categoria_id = ?'); params.push(filtros.categoriaId); }
  if (filtros.ativo === '1' || filtros.ativo === '0') { where.push('m.ativo = ?'); params.push(Number(filtros.ativo)); }
  if (filtros.situacao) {
    const lista = String(filtros.situacao).split(',').filter((s) => ['NORMAL', 'BAIXO', 'ZERADO'].includes(s));
    if (lista.length) { where.push(`${EXPR_SITUACAO} IN (${lista.map(() => '?').join(',')})`); params.push(...lista); }
  }
  return query(`${SELECT_POSICAO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.descricao LIMIT 5000`, params);
}

async function porMercadoria(mercadoriaId) {
  const [linha] = await query(`${SELECT_POSICAO} WHERE m.id = ?`, [mercadoriaId]);
  if (!linha) throw AppError.naoEncontrado('Mercadoria não encontrada.');
  return linha;
}

/**
 * Extrato de movimentações (spec 8.1). Considera documentos que alteraram o saldo:
 * EFETIVADOS e ESTORNADOS (os estornados permanecem no histórico, seguidos do estorno).
 */
async function extrato(mercadoriaId, { de, ate } = {}) {
  const mercadoria = await porMercadoria(mercadoriaId);
  const where = ['i.mercadoria_id = ?', "d.status IN ('EFETIVADO', 'ESTORNADO')"];
  const params = [mercadoriaId];
  if (de) { where.push('d.efetivado_em >= ?'); params.push(`${de} 00:00:00`); }
  if (ate) { where.push('d.efetivado_em <= ?'); params.push(`${ate} 23:59:59`); }

  const movimentos = await query(
    `SELECT d.id AS documento_id, d.numero, d.tipo, d.status, d.efetivado_em AS data_hora, d.data_movimentacao,
            d.tipo_documento_referencia, d.documento_referencia,
            CASE WHEN d.sentido = 1 THEN i.quantidade ELSE 0 END AS quantidade_entrada,
            CASE WHEN d.sentido = -1 THEN i.quantidade ELSE 0 END AS quantidade_saida,
            i.saldo_apos, u.nome AS usuario_nome,
            f.nome AS fornecedor_nome, r.numero AS requisicao_numero, st.sigla AS setor_sigla, st.nome AS setor_nome,
            o.numero AS documento_origem_numero, d.justificativa, d.recebedor
       FROM documento_itens i
       JOIN documentos_estoque d ON d.id = i.documento_id
       JOIN usuarios u ON u.id = COALESCE(d.efetivado_por, d.usuario_id)
       LEFT JOIN fornecedores f ON f.id = d.fornecedor_id
       LEFT JOIN requisicoes r ON r.id = d.requisicao_id
       LEFT JOIN setores st ON st.id = r.setor_id
       LEFT JOIN documentos_estoque o ON o.id = d.documento_origem_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.efetivado_em, d.id`,
    params
  );

  // Origem/destino legível para o extrato
  for (const m of movimentos) {
    if (m.tipo === 'ENTRADA') m.origem_destino = m.fornecedor_nome ? `Fornecedor: ${m.fornecedor_nome}` : 'Entrada no almoxarifado';
    else if (m.tipo === 'SAIDA' || m.tipo === 'ESTORNO_SAIDA') m.origem_destino = `Setor: ${m.setor_sigla} - ${m.setor_nome} (req. ${m.requisicao_numero})`;
    else if (m.tipo.startsWith('AJUSTE')) m.origem_destino = `Ajuste: ${m.justificativa || ''}`;
    else m.origem_destino = `Estorno do documento ${m.documento_origem_numero}`;
    m.referencia = [m.tipo_documento_referencia, m.documento_referencia].filter(Boolean).join(' ') || m.requisicao_numero || '';
  }

  return { mercadoria, movimentos };
}

async function dashboard(ator) {
  if (ator.perfil === 'SOLICITANTE') {
    const [c] = await query(
      `SELECT SUM(status = 'PENDENTE') AS pendentes, SUM(status = 'APROVADA') AS aprovadas,
              SUM(status = 'PARCIAL') AS parciais, SUM(status = 'ATENDIDA') AS atendidas, COUNT(*) AS total
         FROM requisicoes WHERE setor_id = ?`, [ator.setorId || 0]
    );
    const recentes = await query(
      `SELECT r.id, r.numero, r.status, r.data_requisicao, u.nome AS usuario_nome
         FROM requisicoes r JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.setor_id = ? ORDER BY r.id DESC LIMIT 8`, [ator.setorId || 0]
    );
    return { tipo: 'SOLICITANTE', requisicoes: c, recentes };
  }

  const [ind] = await query(
    `SELECT COUNT(*) AS mercadorias_cadastradas,
            SUM(m.ativo = 1) AS mercadorias_ativas,
            SUM(COALESCE(s.quantidade_atual, 0) > 0) AS com_saldo,
            SUM(m.ativo = 1 AND COALESCE(s.quantidade_atual, 0) > 0 AND COALESCE(s.quantidade_atual, 0) <= m.estoque_minimo) AS abaixo_minimo,
            SUM(m.ativo = 1 AND COALESCE(s.quantidade_atual, 0) = 0) AS sem_estoque
       FROM mercadorias m LEFT JOIN estoque_saldos s ON s.mercadoria_id = m.id`
  );
  const [req] = await query(
    "SELECT SUM(status = 'PENDENTE') AS pendentes, SUM(status = 'PARCIAL') AS parciais, SUM(status = 'APROVADA') AS aprovadas FROM requisicoes"
  );
  const ultimos = (tipos) => query(
    `SELECT d.id, d.numero, d.tipo, d.efetivado_em, u.nome AS usuario_nome, f.nome AS fornecedor_nome,
            r.numero AS requisicao_numero, st.sigla AS setor_sigla,
            (SELECT COUNT(*) FROM documento_itens i WHERE i.documento_id = d.id) AS total_itens
       FROM documentos_estoque d JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN fornecedores f ON f.id = d.fornecedor_id
       LEFT JOIN requisicoes r ON r.id = d.requisicao_id
       LEFT JOIN setores st ON st.id = r.setor_id
      WHERE d.tipo IN (${tipos.map(() => '?').join(',')}) AND d.status IN ('EFETIVADO','ESTORNADO')
      ORDER BY d.efetivado_em DESC, d.id DESC LIMIT 6`, tipos
  );
  const criticos = await query(
    `${SELECT_POSICAO} WHERE m.ativo = 1 AND COALESCE(s.quantidade_atual, 0) <= m.estoque_minimo
      ORDER BY (COALESCE(s.quantidade_atual, 0) = 0) DESC, m.descricao LIMIT 10`
  );

  const n = (v) => Number(v || 0);
  return {
    tipo: 'ALMOXARIFADO',
    indicadores: {
      mercadorias_cadastradas: n(ind.mercadorias_cadastradas),
      mercadorias_ativas: n(ind.mercadorias_ativas),
      com_saldo: n(ind.com_saldo),
      abaixo_minimo: n(ind.abaixo_minimo),
      sem_estoque: n(ind.sem_estoque),
      requisicoes_pendentes: n(req.pendentes),
      requisicoes_aprovadas: n(req.aprovadas),
      requisicoes_parciais: n(req.parciais)
    },
    entradas_recentes: await ultimos(['ENTRADA']),
    saidas_recentes: await ultimos(['SAIDA']),
    criticos
  };
}

module.exports = { posicao, porMercadoria, extrato, dashboard };
