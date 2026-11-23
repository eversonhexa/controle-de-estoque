const crypto = require('crypto');
const AppError = require('../utils/AppError');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function gerarTokenCsrf(req) {
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

/**
 * Proteção CSRF (synchronizer token): toda requisição que altera dados
 * deve enviar o cabeçalho X-CSRF-Token igual ao token da sessão.
 * O login fica de fora porque ainda não há sessão; ele é protegido pelo
 * cookie SameSite=Strict e pela limitação de tentativas.
 */
function verificarCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  if (req.path === '/auth/login') return next();

  const esperado = req.session && req.session.csrfToken;
  const recebido = req.get('X-CSRF-Token');
  if (!esperado || !recebido || esperado.length !== recebido.length ||
      !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))) {
    return next(new AppError(403, 'Token de segurança inválido ou ausente. Recarregue a página.'));
  }
  next();
}

module.exports = { gerarTokenCsrf, verificarCsrf };
