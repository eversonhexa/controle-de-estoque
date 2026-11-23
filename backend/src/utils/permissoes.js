/**
 * Matriz de permissões por perfil. É a fonte única usada pelo backend
 * (middleware autorizar) e enviada ao frontend para montar o menu.
 */
const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  ALMOXARIFE: 'ALMOXARIFE',
  SOLICITANTE: 'SOLICITANTE',
  CONSULTA: 'CONSULTA'
};

const { ADMINISTRADOR: ADM, ALMOXARIFE: ALM, SOLICITANTE: SOL, CONSULTA: CON } = PERFIS;

const PERMISSOES = {
  'usuarios.gerenciar':       [ADM],
  'auditoria.consultar':      [ADM],
  'cadastros.consultar':      [ADM, ALM, SOL, CON],
  'cadastros.gerenciar':      [ADM, ALM],
  'entradas.consultar':       [ADM, ALM, CON],
  'entradas.gerenciar':       [ADM, ALM],
  'requisicoes.consultar':    [ADM, ALM, SOL, CON],
  'requisicoes.criar':        [ADM, ALM, SOL],
  'requisicoes.analisar':     [ADM, ALM],   // aprovar, rejeitar, encerrar
  'saidas.consultar':         [ADM, ALM, CON],
  'saidas.gerenciar':         [ADM, ALM],
  'ajustes.gerenciar':        [ADM, ALM],   // inclui estornos
  'estoque.consultar':        [ADM, ALM, CON],
  'relatorios.consultar':     [ADM, ALM, CON]
};

function temPermissao(perfilCodigo, permissao) {
  const perfis = PERMISSOES[permissao];
  if (!perfis) throw new Error(`Permissão desconhecida: ${permissao}`);
  return perfis.includes(perfilCodigo);
}

function permissoesDoPerfil(perfilCodigo) {
  return Object.keys(PERMISSOES).filter((p) => PERMISSOES[p].includes(perfilCodigo));
}

module.exports = { PERFIS, PERMISSOES, temPermissao, permissoesDoPerfil };
