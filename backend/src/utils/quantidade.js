/**
 * Quantidades usam DECIMAL(12,3). Para evitar erros de ponto flutuante,
 * comparações e somas são feitas em milésimos inteiros.
 */
const ESCALA = 1000;

const paraMilesimos = (valor) => Math.round(Number(valor) * ESCALA);
const deMilesimos = (mil) => mil / ESCALA;

function normalizar(valor) {
  return deMilesimos(paraMilesimos(valor));
}

/** Formata para exibição em mensagens: 1.5 -> "1,5" */
function formatar(valor) {
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

module.exports = { paraMilesimos, deMilesimos, normalizar, formatar };
