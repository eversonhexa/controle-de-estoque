const { query } = require('../config/database');
const AppError = require('../utils/AppError');
const { temPermissao } = require('../utils/permissoes');

/**
 * RN01: exige sessão válida. Recarrega o usuário do banco a cada requisição
 * para que inativações e trocas de perfil tenham efeito imediato.
 */
async function autenticado(req, res, next) {
  try {
    const id = req.session && req.session.usuarioId;
    if (!id) throw AppError.naoAutenticado();

    const rows = await query(
      `SELECT u.id, u.nome, u.login, u.email, u.setor_id, u.ativo,
              p.codigo AS perfil, p.nome AS perfil_nome, p.ativo AS perfil_ativo,
              s.nome AS setor_nome, s.sigla AS setor_sigla
         FROM usuarios u
         JOIN perfis p ON p.id = u.perfil_id
         LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.id = ?`,
      [id]
    );
    const u = rows[0];
    if (!u || !u.ativo || !u.perfil_ativo) {
      req.session.destroy(() => {});
      throw AppError.naoAutenticado('Usuário inativo ou removido. Faça login novamente.');
    }
    req.usuario = {
      id: u.id,
      nome: u.nome,
      login: u.login,
      email: u.email,
      perfil: u.perfil,
      perfilNome: u.perfil_nome,
      setorId: u.setor_id,
      setorNome: u.setor_nome,
      setorSigla: u.setor_sigla
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** RN02: autoriza conforme a matriz de permissões. */
function autorizar(permissao) {
  return (req, res, next) => {
    if (!req.usuario) return next(AppError.naoAutenticado());
    if (!temPermissao(req.usuario.perfil, permissao)) return next(AppError.proibido());
    next();
  };
}

module.exports = { autenticado, autorizar };
