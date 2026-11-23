const { paraMilesimos, deMilesimos } = require('../utils/quantidade');

/**
 * Quantidades de cada item da requisição:
 * - entregue: soma das saídas EFETIVADAS (saídas estornadas ficam com status ESTORNADO e não contam)
 * - em_rascunho: soma das saídas ainda em rascunho
 * - pendente = solicitada - entregue (spec 6.5)
 */
async function itensComQuantidades(executor, requisicaoId) {
  const [itens] = await executor.query(
    `SELECT ri.id, ri.requisicao_id, ri.mercadoria_id, ri.quantidade_solicitada, ri.observacoes,
            m.codigo, m.descricao, m.ativo AS mercadoria_ativa, m.unidade_id,
            u.sigla AS unidade_sigla, COALESCE(s.quantidade_atual, 0) AS saldo_disponivel,
            COALESCE((SELECT SUM(di.quantidade) FROM documento_itens di
                        JOIN documentos_estoque d ON d.id = di.documento_id
                       WHERE di.requisicao_item_id = ri.id AND d.tipo = 'SAIDA' AND d.status = 'EFETIVADO'), 0) AS entregue,
            COALESCE((SELECT SUM(di.quantidade) FROM documento_itens di
                        JOIN documentos_estoque d ON d.id = di.documento_id
                       WHERE di.requisicao_item_id = ri.id AND d.tipo = 'SAIDA' AND d.status = 'RASCUNHO'), 0) AS em_rascunho
       FROM requisicao_itens ri
       JOIN mercadorias m ON m.id = ri.mercadoria_id
       JOIN unidades_medida u ON u.id = m.unidade_id
       LEFT JOIN estoque_saldos s ON s.mercadoria_id = m.id
      WHERE ri.requisicao_id = ?
      ORDER BY ri.id`,
    [requisicaoId]
  );
  return itens.map((i) => ({
    ...i,
    pendente: deMilesimos(paraMilesimos(i.quantidade_solicitada) - paraMilesimos(i.entregue))
  }));
}

/**
 * Atualiza automaticamente a situação da requisição conforme as entregas (spec 6.5):
 * nenhuma entrega -> APROVADA; entregas parciais -> PARCIAL; tudo entregue -> ATENDIDA.
 * Requisições REJEITADAS, CANCELADAS, ENCERRADAS ou PENDENTES não são alteradas.
 */
async function recalcularStatus(conn, requisicaoId) {
  const [[req]] = await conn.query('SELECT status FROM requisicoes WHERE id = ?', [requisicaoId]);
  if (!req || !['APROVADA', 'PARCIAL', 'ATENDIDA'].includes(req.status)) return req ? req.status : null;

  const itens = await itensComQuantidades(conn, requisicaoId);
  const algumaEntrega = itens.some((i) => paraMilesimos(i.entregue) > 0);
  const tudoEntregue = itens.length > 0 && itens.every((i) => paraMilesimos(i.pendente) <= 0);

  let novo = 'APROVADA';
  if (tudoEntregue) novo = 'ATENDIDA';
  else if (algumaEntrega) novo = 'PARCIAL';

  if (novo !== req.status) await conn.query('UPDATE requisicoes SET status = ? WHERE id = ?', [novo, requisicaoId]);
  return novo;
}

module.exports = { itensComQuantidades, recalcularStatus };
