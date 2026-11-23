const { body } = require('express-validator');
const { quantidade, textoOpcional, textoObrigatorio, idOpcional } = require('./comuns');

const itensArray = (max = 200) => body('itens')
  .isArray({ min: 1, max }).withMessage('Inclua pelo menos um item.');

const entrada = [
  body('data_movimentacao')
    .exists({ values: 'falsy' }).withMessage('Informe a data da entrada.')
    .isISO8601({ strict: true }).withMessage('Data da entrada inválida.')
    .custom((v) => new Date(v) <= new Date(Date.now() + 24 * 3600 * 1000)).withMessage('A data da entrada não pode estar no futuro.'),
  textoOpcional('tipo_documento_referencia', 30, 'Tipo de documento'),
  textoOpcional('documento_referencia', 60, 'Número do documento'),
  idOpcional('fornecedor_id'),
  textoOpcional('observacoes', 500, 'Observações'),
  itensArray(),
  body('itens.*.mercadoria_id').isInt({ min: 1 }).withMessage('Selecione a mercadoria de todos os itens.').toInt(),
  quantidade('itens.*.quantidade')
];

const ajuste = [
  body('natureza').isIn(['ENTRADA', 'SAIDA']).withMessage('Informe a natureza do ajuste (ENTRADA ou SAIDA).'),
  textoObrigatorio('justificativa', 500, 'a justificativa do ajuste'),
  textoOpcional('observacoes', 500, 'Observações'),
  itensArray(),
  body('itens.*.mercadoria_id').isInt({ min: 1 }).withMessage('Selecione a mercadoria de todos os itens.').toInt(),
  quantidade('itens.*.quantidade')
];

const saida = [
  body('requisicao_id').isInt({ min: 1 }).withMessage('Informe a requisição.').toInt(),
  textoOpcional('recebedor', 120, 'Responsável pelo recebimento'),
  textoOpcional('observacoes', 500, 'Observações'),
  itensArray(),
  body('itens.*.requisicao_item_id').isInt({ min: 1 }).withMessage('Item da requisição inválido.').toInt(),
  quantidade('itens.*.quantidade')
];

const saidaEdicao = saida.slice(1);

const requisicao = [
  idOpcional('setor_id'),
  textoOpcional('observacoes', 500, 'Observações'),
  itensArray(),
  body('itens.*.mercadoria_id').isInt({ min: 1 }).withMessage('Selecione a mercadoria de todos os itens.').toInt(),
  quantidade('itens.*.quantidade_solicitada'),
  textoOpcional('itens.*.observacoes', 255, 'Observação do item')
];

const motivo = [textoObrigatorio('motivo', 500, 'o motivo')];
const justificativa = [textoObrigatorio('justificativa', 500, 'a justificativa')];

module.exports = { entrada, ajuste, saida, saidaEdicao, requisicao, motivo, justificativa };
