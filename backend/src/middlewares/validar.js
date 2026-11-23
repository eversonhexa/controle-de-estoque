const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/** Executa as cadeias do express-validator e responde 422 com os erros encontrados. */
function validar(cadeias) {
  return [
    ...cadeias,
    (req, res, next) => {
      const erros = validationResult(req);
      if (erros.isEmpty()) return next();
      const detalhes = erros.array().map((e) => ({ campo: e.path, mensagem: e.msg }));
      next(AppError.regra(detalhes[0].mensagem, detalhes));
    }
  ];
}

module.exports = validar;
