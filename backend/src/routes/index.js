/**
 * Rotas da API REST. Toda rota (exceto login) exige autenticação (RN01)
 * e cada uma declara a permissão necessária (RN02).
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const validar = require('../middlewares/validar');
const { autenticado, autorizar } = require('../middlewares/auth');
const v = require('../validators/comuns');
const vCad = require('../validators/cadastros');
const vMov = require('../validators/movimentos');
const vUsu = require('../validators/usuarios');
const auth = require('../controllers/authController');
const cad = require('../controllers/cadastroController');
const mov = require('../controllers/movimentoController');
const con = require('../controllers/consultaController');

const router = express.Router();

/** Declara uma rota protegida: router[metodo](caminho, auth, permissão, validação, handler) */
function rota(metodo, caminho, permissao, validacoes, handler) {
  router[metodo](caminho, autenticado, autorizar(permissao), ...(validacoes.length ? validar(validacoes) : []), asyncHandler(handler));
}

// ---- Autenticação --------------------------------------------------------
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10000 : env.loginMaxTentativas,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: { mensagem: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' } }
});
router.post('/auth/login', limiteLogin, validar(vUsu.login), asyncHandler(auth.login));
router.post('/auth/logout', asyncHandler(auth.logout));
router.get('/auth/me', autenticado, asyncHandler(auth.me));
router.put('/auth/senha', autenticado, validar(vUsu.alterarSenha), asyncHandler(auth.alterarSenha));

// ---- Usuários e perfis ---------------------------------------------------
rota('get', '/usuarios', 'usuarios.gerenciar', [], cad.usuarios.listar);
rota('post', '/usuarios', 'usuarios.gerenciar', vUsu.criar, cad.usuarios.criar);
rota('get', '/usuarios/:id', 'usuarios.gerenciar', [v.id()], cad.usuarios.obter);
rota('put', '/usuarios/:id', 'usuarios.gerenciar', [v.id(), ...vUsu.atualizar], cad.usuarios.atualizar);
rota('patch', '/usuarios/:id/status', 'usuarios.gerenciar', [v.id(), v.status], cad.usuarios.alterarStatus);
rota('get', '/perfis', 'usuarios.gerenciar', [], cad.usuarios.listarPerfis);
rota('put', '/perfis/:id', 'usuarios.gerenciar', [v.id(), ...vUsu.perfil], cad.usuarios.atualizarPerfil);

// ---- Cadastros básicos ---------------------------------------------------
const CADASTROS = { setores: 'setores', categorias: 'categorias', 'unidades-medida': 'unidades', fornecedores: 'fornecedores' };
for (const [caminho, chave] of Object.entries(CADASTROS)) {
  const c = cad[chave];
  rota('get', `/${caminho}`, 'cadastros.consultar', [], c.listar);
  rota('get', `/${caminho}/:id`, 'cadastros.consultar', [v.id()], c.obter);
  rota('post', `/${caminho}`, 'cadastros.gerenciar', vCad.VALIDADORES[chave], c.criar);
  rota('put', `/${caminho}/:id`, 'cadastros.gerenciar', [v.id(), ...vCad.VALIDADORES[chave]], c.atualizar);
  rota('patch', `/${caminho}/:id/status`, 'cadastros.gerenciar', [v.id(), v.status], c.alterarStatus);
}

rota('get', '/mercadorias', 'cadastros.consultar', [], cad.mercadorias.listar);
rota('get', '/mercadorias/:id', 'cadastros.consultar', [v.id()], cad.mercadorias.obter);
rota('post', '/mercadorias', 'cadastros.gerenciar', vCad.mercadoria, cad.mercadorias.criar);
rota('put', '/mercadorias/:id', 'cadastros.gerenciar', [v.id(), ...vCad.mercadoria], cad.mercadorias.atualizar);
rota('patch', '/mercadorias/:id/status', 'cadastros.gerenciar', [v.id(), v.status], cad.mercadorias.alterarStatus);
// Não há DELETE de mercadorias: registros sem uso futuro devem ser inativados.

// ---- Entradas ------------------------------------------------------------
rota('get', '/entradas', 'entradas.consultar', v.periodo, mov.entradas.listar);
rota('post', '/entradas', 'entradas.gerenciar', vMov.entrada, mov.entradas.criar);
rota('get', '/entradas/:id', 'entradas.consultar', [v.id()], mov.entradas.obter);
rota('put', '/entradas/:id', 'entradas.gerenciar', [v.id(), ...vMov.entrada], mov.entradas.atualizar);
rota('delete', '/entradas/:id', 'entradas.gerenciar', [v.id()], mov.entradas.excluir);
rota('post', '/entradas/:id/efetivar', 'entradas.gerenciar', [v.id()], mov.entradas.efetivar);

// ---- Requisições ---------------------------------------------------------
rota('get', '/requisicoes', 'requisicoes.consultar', v.periodo, mov.requisicoes.listar);
rota('post', '/requisicoes', 'requisicoes.criar', vMov.requisicao, mov.requisicoes.criar);
rota('get', '/requisicoes/:id', 'requisicoes.consultar', [v.id()], mov.requisicoes.obter);
rota('put', '/requisicoes/:id', 'requisicoes.criar', [v.id(), ...vMov.requisicao], mov.requisicoes.atualizar);
rota('post', '/requisicoes/:id/aprovar', 'requisicoes.analisar', [v.id()], mov.requisicoes.aprovar);
rota('post', '/requisicoes/:id/rejeitar', 'requisicoes.analisar', [v.id(), ...vMov.motivo], mov.requisicoes.rejeitar);
rota('post', '/requisicoes/:id/encerrar', 'requisicoes.analisar', [v.id(), ...vMov.motivo], mov.requisicoes.encerrar);
rota('post', '/requisicoes/:id/cancelar', 'requisicoes.criar', [v.id(), ...vMov.motivo], mov.requisicoes.cancelar);

// ---- Saídas --------------------------------------------------------------
rota('get', '/saidas', 'saidas.consultar', v.periodo, mov.saidas.listar);
rota('post', '/saidas', 'saidas.gerenciar', vMov.saida, mov.saidas.criar);
rota('get', '/saidas/:id', 'saidas.consultar', [v.id()], mov.saidas.obter);
rota('put', '/saidas/:id', 'saidas.gerenciar', [v.id(), ...vMov.saidaEdicao], mov.saidas.atualizar);
rota('delete', '/saidas/:id', 'saidas.gerenciar', [v.id()], mov.saidas.excluir);
rota('post', '/saidas/:id/efetivar', 'saidas.gerenciar', [v.id()], mov.saidas.efetivar);

// ---- Ajustes e estornos --------------------------------------------------
rota('get', '/ajustes', 'saidas.consultar', v.periodo, mov.ajustes.listar);
rota('post', '/ajustes', 'ajustes.gerenciar', vMov.ajuste, mov.ajustes.criar);
rota('get', '/ajustes/:id', 'saidas.consultar', [v.id()], mov.ajustes.obter);
rota('put', '/ajustes/:id', 'ajustes.gerenciar', [v.id(), ...vMov.ajuste], mov.ajustes.atualizar);
rota('delete', '/ajustes/:id', 'ajustes.gerenciar', [v.id()], mov.ajustes.excluir);
rota('post', '/ajustes/:id/efetivar', 'ajustes.gerenciar', [v.id()], mov.ajustes.efetivar);
rota('get', '/documentos', 'saidas.consultar', v.periodo, mov.documentos.listar);
rota('get', '/documentos/:id', 'saidas.consultar', [v.id()], mov.documentos.obter);
rota('post', '/documentos/:id/estornar', 'ajustes.gerenciar', [v.id(), ...vMov.justificativa], mov.documentos.estornar);

// ---- Estoque, dashboard, relatórios e auditoria --------------------------
router.get('/dashboard', autenticado, asyncHandler(con.estoque.dashboard));
rota('get', '/estoque', 'estoque.consultar', [], con.estoque.posicao);
rota('get', '/estoque/:mercadoriaId', 'estoque.consultar', [v.id('mercadoriaId')], con.estoque.porMercadoria);
rota('get', '/estoque/:mercadoriaId/extrato', 'estoque.consultar', [v.id('mercadoriaId'), ...v.periodo], con.estoque.extrato);
rota('get', '/relatorios/:tipo', 'relatorios.consultar', v.periodo, con.relatorios.gerar);
rota('get', '/auditoria', 'auditoria.consultar', v.periodo, con.auditoria.listar);
rota('get', '/auditoria/acoes', 'auditoria.consultar', [], con.auditoria.acoes);

module.exports = router;
