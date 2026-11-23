const { body, param, query } = require('express-validator');

const id = (nome = 'id') => param(nome).isInt({ min: 1 }).withMessage('Identificador inválido.').toInt();

const status = body('ativo').isBoolean().withMessage('Informe a situação (ativo: true ou false).').toBoolean();

/** Quantidade DECIMAL(12,3): maior que zero, até 3 casas decimais. */
const quantidade = (campo) => body(campo)
  .exists({ values: 'falsy' }).withMessage('Informe a quantidade.')
  .isFloat({ gt: 0, max: 999999999.999 }).withMessage('A quantidade deve ser um número maior que zero.')
  .custom((v) => /^\d+(\.\d{1,3})?$/.test(String(v))).withMessage('A quantidade deve ter no máximo 3 casas decimais.')
  .toFloat();

const textoOpcional = (campo, max, rotulo = campo) => body(campo)
  .optional({ values: 'null' }).isString().withMessage(`${rotulo} inválido(a).`)
  .trim().isLength({ max }).withMessage(`${rotulo} deve ter no máximo ${max} caracteres.`);

const textoObrigatorio = (campo, max, rotulo = campo) => body(campo)
  .exists({ values: 'falsy' }).withMessage(`Informe ${rotulo}.`)
  .isString().trim().notEmpty().withMessage(`Informe ${rotulo}.`)
  .isLength({ max }).withMessage(`${rotulo} deve ter no máximo ${max} caracteres.`);

const idOpcional = (campo) => body(campo)
  .optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage(`${campo} inválido.`).toInt();

const data = (campo) => query(campo).optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('Data inválida (use AAAA-MM-DD).');
const periodo = [data('de'), data('ate')];

module.exports = { id, status, quantidade, textoOpcional, textoObrigatorio, idOpcional, periodo };
