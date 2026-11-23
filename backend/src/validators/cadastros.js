const { body } = require('express-validator');
const { textoObrigatorio, textoOpcional } = require('./comuns');

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(cpf[9]) && dig(10) === Number(cpf[10]);
}

function cnpjValido(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((t, p, i) => t + Number(cnpj[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

const VALIDADORES = {
  setores: [
    textoObrigatorio('nome', 120, 'o nome do setor'),
    textoObrigatorio('sigla', 20, 'a sigla').customSanitizer((v) => String(v ?? '').toUpperCase()),
    textoOpcional('responsavel', 120, 'Responsável')
  ],
  categorias: [
    textoObrigatorio('nome', 100, 'o nome da categoria'),
    textoOpcional('descricao', 255, 'Descrição')
  ],
  unidades: [
    textoObrigatorio('descricao', 60, 'a descrição da unidade'),
    textoObrigatorio('sigla', 10, 'a sigla').customSanitizer((v) => String(v ?? '').toUpperCase())
  ],
  fornecedores: [
    textoObrigatorio('nome', 150, 'a razão social ou nome'),
    body('documento').optional({ values: 'falsy' }).customSanitizer((v) => String(v).replace(/\D/g, ''))
      .custom((v) => (v.length === 11 ? cpfValido(v) : v.length === 14 ? cnpjValido(v) : false))
      .withMessage('CPF ou CNPJ inválido.'),
    textoOpcional('contato', 120, 'Contato'),
    textoOpcional('telefone', 20, 'Telefone'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('E-mail inválido.').normalizeEmail({ gmail_remove_dots: false })
  ]
};

const mercadoria = [
  textoObrigatorio('codigo', 30, 'o código interno').customSanitizer((v) => String(v ?? '').toUpperCase()),
  textoObrigatorio('descricao', 200, 'a descrição'),
  body('categoria_id').isInt({ min: 1 }).withMessage('Selecione a categoria.').toInt(),
  body('unidade_id').isInt({ min: 1 }).withMessage('Selecione a unidade de medida.').toInt(),
  body('estoque_minimo').optional({ values: 'falsy' }).isFloat({ min: 0, max: 999999999 }).withMessage('Estoque mínimo inválido.').toFloat(),
  textoOpcional('observacoes', 500, 'Observações')
];

module.exports = { VALIDADORES, mercadoria, cpfValido, cnpjValido };
