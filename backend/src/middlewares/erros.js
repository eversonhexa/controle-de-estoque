const AppError = require('../utils/AppError');
const env = require('../config/env');

function rotaNaoEncontrada(req, res, next) {
  next(AppError.naoEncontrado(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

/**
 * Tratamento padronizado de erros. Formato da resposta:
 * { "erro": { "mensagem": "...", "detalhes": [...] } }
 */
// eslint-disable-next-line no-unused-vars
function tratadorErros(err, req, res, next) {
  let status = 500;
  let mensagem = 'Erro interno do servidor. Tente novamente ou contate o suporte.';
  let detalhes;

  if (err instanceof AppError) {
    status = err.status;
    mensagem = err.message;
    detalhes = err.detalhes;
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    mensagem = 'JSON inválido no corpo da requisição.';
  } else if (err && err.type === 'entity.too.large') {
    status = 413;
    mensagem = 'Requisição grande demais.';
  } else if (err && err.code === 'ER_DUP_ENTRY') {
    status = 409;
    mensagem = 'Já existe um registro com esses dados (valor duplicado).';
  } else if (err && (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED')) {
    status = 409;
    mensagem = 'O registro está vinculado a outros dados e não pode ser removido. Inative-o.';
  } else if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 422;
    mensagem = 'Referência inválida: um dos registros informados não existe.';
  } else if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    status = 422;
    mensagem = 'Operação recusada por regra de integridade do banco de dados.';
  } else if (err && err.code === 'ER_LOCK_DEADLOCK') {
    status = 409;
    mensagem = 'Conflito com outra operação simultânea. Tente novamente.';
  } else if (err && err.code === 'ER_LOCK_WAIT_TIMEOUT') {
    status = 409;
    mensagem = 'O registro está sendo usado por outra operação. Tente novamente em instantes.';
  }

  if (status >= 500 && !env.isTest) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json({ erro: { mensagem, ...(detalhes ? { detalhes } : {}) } });
}

module.exports = { rotaNaoEncontrada, tratadorErros };
