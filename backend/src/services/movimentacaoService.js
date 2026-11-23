/**
 * ÚNICO ponto do sistema que altera a tabela estoque_saldos (spec 10.4 e 19.9).
 * Deve ser chamado sempre dentro de uma transação, pelos serviços de
 * entrada, saída, ajuste e estorno.
 */
const AppError = require('../utils/AppError');
const { paraMilesimos, deMilesimos, formatar } = require('../utils/quantidade');

/**
 * Aplica variações de saldo com bloqueio pessimista (SELECT ... FOR UPDATE).
 * As linhas são bloqueadas em ordem crescente de mercadoria para evitar deadlocks
 * entre transações concorrentes.
 *
 * @param {import('mysql2/promise').PoolConnection} conn conexão com transação aberta
 * @param {{mercadoriaId:number, delta:number}[]} movimentos delta positivo = entrada, negativo = saída
 * @returns {Promise<Map<number, number>>} saldo após a operação, por mercadoria
 */
async function aplicarMovimentos(conn, movimentos) {
  if (!movimentos.length) throw AppError.regra('O documento não possui itens.');

  // Consolida por mercadoria (defensivo: documentos não repetem mercadoria)
  const porMercadoria = new Map();
  for (const m of movimentos) {
    const mil = paraMilesimos(m.delta);
    if (mil === 0) throw AppError.regra('As quantidades devem ser maiores que zero.');
    porMercadoria.set(m.mercadoriaId, (porMercadoria.get(m.mercadoriaId) || 0) + mil);
  }
  const ids = [...porMercadoria.keys()].sort((a, b) => a - b);
  const saldos = new Map();

  for (const mercadoriaId of ids) {
    // Garante a existência da linha de saldo (mercadorias antigas/importadas)
    await conn.query('INSERT IGNORE INTO estoque_saldos (mercadoria_id, quantidade_atual) VALUES (?, 0)', [mercadoriaId]);

    const [[linha]] = await conn.query(
      `SELECT s.quantidade_atual, m.codigo, m.descricao, m.ativo
         FROM estoque_saldos s JOIN mercadorias m ON m.id = s.mercadoria_id
        WHERE s.mercadoria_id = ? FOR UPDATE`,
      [mercadoriaId]
    );
    if (!linha) throw AppError.regra(`Mercadoria ${mercadoriaId} não encontrada.`);

    // RN09: não movimentar mercadorias inativas
    if (!linha.ativo) {
      throw AppError.regra(`A mercadoria ${linha.codigo} - ${linha.descricao} está inativa e não pode ser movimentada.`);
    }

    const atualMil = paraMilesimos(linha.quantidade_atual);
    const deltaMil = porMercadoria.get(mercadoriaId);
    const novoMil = atualMil + deltaMil;

    // RN04 / RN07: nunca permitir saldo negativo
    if (novoMil < 0) {
      throw AppError.regra(
        `Saldo insuficiente para ${linha.codigo} - ${linha.descricao}: disponível ${formatar(deMilesimos(atualMil))}, ` +
        `necessário ${formatar(deMilesimos(-deltaMil))}.`,
        [{ mercadoriaId, disponivel: deMilesimos(atualMil), solicitado: deMilesimos(-deltaMil) }]
      );
    }

    const novo = deMilesimos(novoMil);
    await conn.query('UPDATE estoque_saldos SET quantidade_atual = ? WHERE mercadoria_id = ?', [novo, mercadoriaId]);
    saldos.set(mercadoriaId, novo);
  }

  return saldos;
}

module.exports = { aplicarMovimentos };
