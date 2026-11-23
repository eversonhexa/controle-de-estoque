/**
 * Gera números sequenciais por prefixo e ano (ex.: ENT-2026-000001).
 * O INSERT ... ON DUPLICATE KEY UPDATE bloqueia a linha do numerador até o fim
 * da transação, garantindo que dois usuários nunca recebam o mesmo número.
 */
const PREFIXOS = {
  ENTRADA: 'ENT',
  SAIDA: 'SAI',
  AJUSTE_ENTRADA: 'AJU',
  AJUSTE_SAIDA: 'AJU',
  ESTORNO_ENTRADA: 'EST',
  ESTORNO_SAIDA: 'EST',
  ESTORNO_AJUSTE: 'EST',
  REQUISICAO: 'REQ'
};

async function proximoNumero(conn, tipo) {
  const prefixo = PREFIXOS[tipo];
  if (!prefixo) throw new Error(`Tipo de numeração desconhecido: ${tipo}`);
  const [[{ ano }]] = await conn.query('SELECT YEAR(NOW()) AS ano');
  await conn.query(
    `INSERT INTO numeradores (prefixo, ano, ultimo) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)`,
    [prefixo, ano]
  );
  const [[{ seq }]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
  return `${prefixo}-${ano}-${String(seq).padStart(6, '0')}`;
}

module.exports = { proximoNumero };
