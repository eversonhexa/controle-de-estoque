const { body } = require('express-validator');
const { textoObrigatorio, idOpcional } = require('./comuns');

const base = [
  textoObrigatorio('nome', 120, 'o nome'),
  body('login').isString().trim().toLowerCase()
    .matches(/^[a-z0-9._-]{3,60}$/).withMessage('Login inválido: de 3 a 60 caracteres (letras, números, ponto, hífen ou sublinhado).'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('E-mail inválido.').normalizeEmail({ gmail_remove_dots: false }),
  body('perfil_id').isInt({ min: 1 }).withMessage('Selecione o perfil.').toInt(),
  idOpcional('setor_id')
];

const criar = [...base, body('senha').isString().withMessage('Informe a senha.')];
const atualizar = [...base, body('senha').optional({ values: 'falsy' }).isString()];

const login = [
  body('login').isString().trim().notEmpty().withMessage('Informe o login.').isLength({ max: 60 }),
  body('senha').isString().notEmpty().withMessage('Informe a senha.').isLength({ max: 72 })
];

const alterarSenha = [
  body('senhaAtual').isString().notEmpty().withMessage('Informe a senha atual.'),
  body('novaSenha').isString().notEmpty().withMessage('Informe a nova senha.')
];

const perfil = [
  textoObrigatorio('nome', 60, 'o nome do perfil'),
  body('descricao').optional({ values: 'null' }).isString().trim().isLength({ max: 255 }),
  body('ativo').isBoolean().toBoolean()
];

module.exports = { criar, atualizar, login, alterarSenha, perfil };
