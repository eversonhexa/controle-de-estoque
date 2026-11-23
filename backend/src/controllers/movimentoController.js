const documentoService = require('../services/documentoService');
const requisicaoService = require('../services/requisicaoService');

const listaTipos = (valor, permitidos) => {
  const tipos = String(valor || '').split(',').filter((t) => permitidos.includes(t));
  return tipos.length ? tipos : permitidos;
};
const TODOS = ['ENTRADA', 'SAIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'ESTORNO_ENTRADA', 'ESTORNO_SAIDA', 'ESTORNO_AJUSTE'];

const entradas = {
  listar: async (req, res) => res.json(await documentoService.listar({ ...req.query, tipos: ['ENTRADA'] })),
  obter: async (req, res) => res.json(await documentoService.obter(req.params.id, ['ENTRADA'])),
  criar: async (req, res) => res.status(201).json(await documentoService.criarEntrada(req.body, req.usuario, req.ip)),
  atualizar: async (req, res) => res.json(await documentoService.atualizarEntrada(req.params.id, req.body, req.usuario, req.ip)),
  excluir: async (req, res) => { await documentoService.excluirEntrada(req.params.id, req.usuario, req.ip); res.status(204).end(); },
  efetivar: async (req, res) => res.json(await documentoService.efetivarEntrada(req.params.id, req.usuario, req.ip))
};

const saidas = {
  listar: async (req, res) => res.json(await documentoService.listar({ ...req.query, tipos: ['SAIDA'] })),
  obter: async (req, res) => res.json(await documentoService.obter(req.params.id, ['SAIDA'])),
  criar: async (req, res) => res.status(201).json(await documentoService.criarSaida(req.body, req.usuario, req.ip)),
  atualizar: async (req, res) => res.json(await documentoService.atualizarSaida(req.params.id, req.body, req.usuario, req.ip)),
  excluir: async (req, res) => { await documentoService.excluirSaida(req.params.id, req.usuario, req.ip); res.status(204).end(); },
  efetivar: async (req, res) => res.json(await documentoService.efetivarSaida(req.params.id, req.usuario, req.ip))
};

const ajustes = {
  listar: async (req, res) => res.json(await documentoService.listar({ ...req.query, tipos: listaTipos(req.query.tipos, documentoService.TIPOS_AJUSTE) })),
  obter: async (req, res) => res.json(await documentoService.obter(req.params.id, documentoService.TIPOS_AJUSTE)),
  criar: async (req, res) => res.status(201).json(await documentoService.criarAjuste(req.body, req.usuario, req.ip)),
  atualizar: async (req, res) => res.json(await documentoService.atualizarAjuste(req.params.id, req.body, req.usuario, req.ip)),
  excluir: async (req, res) => { await documentoService.excluirAjuste(req.params.id, req.usuario, req.ip); res.status(204).end(); },
  efetivar: async (req, res) => res.json(await documentoService.efetivarAjuste(req.params.id, req.usuario, req.ip))
};

const documentos = {
  listar: async (req, res) => res.json(await documentoService.listar({ ...req.query, tipos: listaTipos(req.query.tipos, TODOS) })),
  obter: async (req, res) => res.json(await documentoService.obter(req.params.id)),
  estornar: async (req, res) => res.status(201).json(await documentoService.estornar(req.params.id, req.body.justificativa, req.usuario, req.ip))
};

const requisicoes = {
  listar: async (req, res) => res.json(await requisicaoService.listar(req.query, req.usuario)),
  obter: async (req, res) => res.json(await requisicaoService.obter(req.params.id, req.usuario)),
  criar: async (req, res) => res.status(201).json(await requisicaoService.criar(req.body, req.usuario, req.ip)),
  atualizar: async (req, res) => res.json(await requisicaoService.atualizar(req.params.id, req.body, req.usuario, req.ip)),
  aprovar: async (req, res) => res.json(await requisicaoService.aprovar(req.params.id, req.usuario, req.ip)),
  rejeitar: async (req, res) => res.json(await requisicaoService.rejeitar(req.params.id, req.body.motivo, req.usuario, req.ip)),
  cancelar: async (req, res) => res.json(await requisicaoService.cancelar(req.params.id, req.body.motivo, req.usuario, req.ip)),
  encerrar: async (req, res) => res.json(await requisicaoService.encerrar(req.params.id, req.body.motivo, req.usuario, req.ip))
};

module.exports = { entradas, saidas, ajustes, documentos, requisicoes };
