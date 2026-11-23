const { servicos } = require('../services/cadastroService');
const mercadoriaService = require('../services/mercadoriaService');
const usuarioService = require('../services/usuarioService');

/** Controladores CRUD padronizados: listar, obter, criar, atualizar, alterar status. */
function crud(servico) {
  return {
    listar: async (req, res) => res.json(await servico.listar(req.query)),
    obter: async (req, res) => res.json(await servico.obter(req.params.id)),
    criar: async (req, res) => res.status(201).json(await servico.criar(req.body, req.usuario, req.ip)),
    atualizar: async (req, res) => res.json(await servico.atualizar(req.params.id, req.body, req.usuario, req.ip)),
    alterarStatus: async (req, res) => res.json(await servico.alterarStatus(req.params.id, req.body.ativo, req.usuario, req.ip))
  };
}

const controllers = Object.fromEntries(Object.entries(servicos).map(([k, s]) => [k, crud(s)]));
controllers.mercadorias = crud(mercadoriaService);
controllers.usuarios = crud(usuarioService);
controllers.usuarios.listarPerfis = async (req, res) => res.json(await usuarioService.listarPerfis());
controllers.usuarios.atualizarPerfil = async (req, res) => res.json(await usuarioService.atualizarPerfil(req.params.id, req.body, req.usuario, req.ip));

module.exports = controllers;
