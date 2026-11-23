const authService = require('../services/authService');
const { gerarTokenCsrf } = require('../middlewares/csrf');
const { registrarAuditoria } = require('../utils/auditoria');
const { permissoesDoPerfil } = require('../utils/permissoes');

async function login(req, res) {
  const usuarioId = await authService.autenticar(req.body.login, req.body.senha, req.ip);
  // Regenera a sessão para evitar fixação de sessão
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.usuarioId = usuarioId;
  const csrfToken = gerarTokenCsrf(req);
  await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
  res.json({ ok: true, csrfToken });
}

async function logout(req, res) {
  if (req.session && req.session.usuarioId) {
    await registrarAuditoria(null, { usuarioId: req.session.usuarioId, acao: 'LOGOUT', tabela: 'usuarios', registroId: req.session.usuarioId, ip: req.ip });
  }
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('estoque.sid');
  res.json({ ok: true });
}

async function me(req, res) {
  const csrfToken = req.session.csrfToken || gerarTokenCsrf(req);
  res.json({
    usuario: req.usuario,
    permissoes: permissoesDoPerfil(req.usuario.perfil),
    csrfToken
  });
}

async function alterarSenha(req, res) {
  await authService.alterarPropriaSenha(req.usuario.id, req.body.senhaAtual, req.body.novaSenha, req.ip);
  res.json({ ok: true });
}

module.exports = { login, logout, me, alterarSenha };
