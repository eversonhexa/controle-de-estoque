/**
 * Requisições de materiais (spec 6).
 * PENDENTE -> APROVADA -> PARCIAL -> ATENDIDA
 *          -> REJEITADA       (análise negativa)
 *          -> CANCELADA       (sem entregas efetivadas)
 * PARCIAL  -> ENCERRADA      (decisão do projeto: encerra o saldo pendente que não será atendido)
 */
const { pool, query, transacao } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');
const { proximoNumero } = require('../utils/numerador');
const { paraMilesimos } = require('../utils/quantidade');
const { PERFIS } = require('../utils/permissoes');
const { itensComQuantidades } = require('../repositories/requisicaoRepository');

const SELECT = `
  SELECT r.id, r.numero, r.setor_id, s.nome AS setor_nome, s.sigla AS setor_sigla,
         r.usuario_id, u.nome AS usuario_nome, r.data_requisicao, r.status, r.observacoes,
         r.aprovado_por, ua.nome AS aprovado_por_nome, r.aprovado_em,
         r.finalizado_por, uf.nome AS finalizado_por_nome, r.finalizado_em, r.motivo_finalizacao,
         r.criado_em, r.atualizado_em,
         (SELECT COUNT(*) FROM requisicao_itens ri WHERE ri.requisicao_id = r.id) AS total_itens
    FROM requisicoes r
    JOIN setores s ON s.id = r.setor_id
    JOIN usuarios u ON u.id = r.usuario_id
    LEFT JOIN usuarios ua ON ua.id = r.aprovado_por
    LEFT JOIN usuarios uf ON uf.id = r.finalizado_por`;

const ehSolicitante = (ator) => ator.perfil === PERFIS.SOLICITANTE;

/** Solicitantes só enxergam e operam requisições do próprio setor. */
function verificarAcesso(req, ator) {
  if (ehSolicitante(ator) && req.setor_id !== ator.setorId) {
    throw AppError.naoEncontrado('Requisição não encontrada.');
  }
}

async function listar(filtros, ator) {
  const where = [];
  const params = [];
  if (ehSolicitante(ator)) { where.push('r.setor_id = ?'); params.push(ator.setorId || 0); }
  else if (filtros.setorId) { where.push('r.setor_id = ?'); params.push(filtros.setorId); }
  if (filtros.status) {
    const lista = String(filtros.status).split(',').filter(Boolean);
    where.push(`r.status IN (${lista.map(() => '?').join(',')})`); params.push(...lista);
  }
  if (filtros.de) { where.push('r.data_requisicao >= ?'); params.push(`${filtros.de} 00:00:00`); }
  if (filtros.ate) { where.push('r.data_requisicao <= ?'); params.push(`${filtros.ate} 23:59:59`); }
  if (filtros.q) { where.push('(r.numero LIKE ? OR r.observacoes LIKE ?)'); params.push(`%${filtros.q}%`, `%${filtros.q}%`); }
  if (filtros.mercadoriaId) { where.push('EXISTS (SELECT 1 FROM requisicao_itens ri WHERE ri.requisicao_id = r.id AND ri.mercadoria_id = ?)'); params.push(filtros.mercadoriaId); }
  const limite = Math.min(Math.max(Number(filtros.limite) || 500, 1), 2000);
  return query(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.id DESC LIMIT ${limite}`, params);
}

async function obter(id, ator) {
  const [req] = await query(`${SELECT} WHERE r.id = ?`, [id]);
  if (!req) throw AppError.naoEncontrado('Requisição não encontrada.');
  verificarAcesso(req, ator);
  req.itens = await itensComQuantidades(pool, id);
  req.saidas = await query(
    `SELECT d.id, d.numero, d.tipo, d.status, d.data_movimentacao, d.efetivado_em, d.recebedor, u.nome AS usuario_nome
       FROM documentos_estoque d JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.requisicao_id = ? ORDER BY d.id`,
    [id]
  );
  return req;
}

async function prepararItens(conn, itens) {
  if (!Array.isArray(itens) || !itens.length) throw AppError.regra('Inclua pelo menos uma mercadoria na requisição.');
  const vistos = new Set();
  const resultado = [];
  for (const [idx, item] of itens.entries()) {
    const mercadoriaId = Number(item.mercadoria_id);
    if (vistos.has(mercadoriaId)) throw AppError.regra(`A mercadoria do item ${idx + 1} está repetida.`);
    vistos.add(mercadoriaId);
    if (!(paraMilesimos(item.quantidade_solicitada) > 0)) throw AppError.regra(`A quantidade do item ${idx + 1} deve ser maior que zero.`);
    const [[m]] = await conn.query('SELECT id, codigo, descricao, ativo FROM mercadorias WHERE id = ?', [mercadoriaId]);
    if (!m) throw AppError.regra(`Mercadoria do item ${idx + 1} não encontrada.`);
    if (!m.ativo) throw AppError.regra(`A mercadoria ${m.codigo} - ${m.descricao} está inativa e não pode ser requisitada.`);
    resultado.push({ mercadoria_id: m.id, quantidade_solicitada: Number(item.quantidade_solicitada), observacoes: item.observacoes || null });
  }
  return resultado;
}

async function inserirItens(conn, requisicaoId, itens) {
  for (const i of itens) {
    await conn.query(
      'INSERT INTO requisicao_itens (requisicao_id, mercadoria_id, quantidade_solicitada, observacoes) VALUES (?, ?, ?, ?)',
      [requisicaoId, i.mercadoria_id, i.quantidade_solicitada, i.observacoes]
    );
  }
}

/** RN15: toda requisição pertence a um setor. Solicitantes usam sempre o próprio setor. */
async function definirSetor(conn, dados, ator) {
  const setorId = ehSolicitante(ator) ? ator.setorId : Number(dados.setor_id);
  if (!setorId) throw AppError.regra(ehSolicitante(ator) ? 'Seu usuário não está vinculado a um setor. Procure o administrador.' : 'Informe o setor solicitante.');
  const [[setor]] = await conn.query('SELECT id, ativo FROM setores WHERE id = ?', [setorId]);
  if (!setor || !setor.ativo) throw AppError.regra('Setor inválido ou inativo.');
  return setorId;
}

async function bloquear(conn, id, ator) {
  const [[req]] = await conn.query('SELECT * FROM requisicoes WHERE id = ? FOR UPDATE', [id]);
  if (!req) throw AppError.naoEncontrado('Requisição não encontrada.');
  verificarAcesso(req, ator);
  return req;
}

function exigirStatus(req, permitidos, acao) {
  if (!permitidos.includes(req.status)) {
    throw AppError.conflito(`A requisição ${req.numero} está ${req.status} e não pode ser ${acao}.`);
  }
}

async function contarSaidas(conn, requisicaoId) {
  const [[c]] = await conn.query(
    `SELECT SUM(status = 'EFETIVADO') AS efetivadas, SUM(status = 'RASCUNHO') AS rascunhos
       FROM documentos_estoque WHERE requisicao_id = ? AND tipo = 'SAIDA'`,
    [requisicaoId]
  );
  return { efetivadas: Number(c.efetivadas || 0), rascunhos: Number(c.rascunhos || 0) };
}

async function criar(dados, ator, ip) {
  const id = await transacao(async (conn) => {
    const setorId = await definirSetor(conn, dados, ator);
    const itens = await prepararItens(conn, dados.itens);
    const numero = await proximoNumero(conn, 'REQUISICAO');
    const [r] = await conn.query(
      "INSERT INTO requisicoes (numero, setor_id, usuario_id, data_requisicao, status, observacoes) VALUES (?, ?, ?, NOW(), 'PENDENTE', ?)",
      [numero, setorId, ator.id, dados.observacoes || null]
    );
    await inserirItens(conn, r.insertId, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: 'requisicoes', registroId: r.insertId, descricao: `Requisição ${numero} registrada com ${itens.length} item(ns)`, ip });
    return r.insertId;
  });
  return obter(id, ator);
}

async function atualizar(id, dados, ator, ip) {
  await transacao(async (conn) => {
    const req = await bloquear(conn, id, ator);
    exigirStatus(req, ['PENDENTE'], 'alterada');
    const setorId = await definirSetor(conn, { setor_id: dados.setor_id || req.setor_id }, ator);
    const itens = await prepararItens(conn, dados.itens);
    await conn.query('UPDATE requisicoes SET setor_id = ?, observacoes = ? WHERE id = ?', [setorId, dados.observacoes || null, id]);
    await conn.query('DELETE FROM requisicao_itens WHERE requisicao_id = ?', [id]);
    await inserirItens(conn, id, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: 'requisicoes', registroId: Number(id), descricao: `Requisição ${req.numero} alterada`, ip });
  });
  return obter(id, ator);
}

async function aprovar(id, ator, ip) {
  await transacao(async (conn) => {
    const req = await bloquear(conn, id, ator);
    exigirStatus(req, ['PENDENTE'], 'aprovada');
    // A aprovação NÃO baixa o estoque (spec 6.4)
    await conn.query("UPDATE requisicoes SET status = 'APROVADA', aprovado_por = ?, aprovado_em = NOW() WHERE id = ?", [ator.id, id]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'APROVAR', tabela: 'requisicoes', registroId: Number(id), descricao: `Requisição ${req.numero} aprovada`, ip });
  });
  return obter(id, ator);
}

async function finalizar(id, { novoStatus, permitidos, acao, verbo, codigo, motivo }, ator, ip) {
  if (!motivo || !String(motivo).trim()) throw AppError.regra(`Informe o motivo para ${verbo} a requisição.`);
  await transacao(async (conn) => {
    const req = await bloquear(conn, id, ator);
    exigirStatus(req, permitidos, acao);
    const saidas = await contarSaidas(conn, id);
    if (novoStatus === 'CANCELADA' && saidas.efetivadas > 0) {
      throw AppError.regra('A requisição já possui entregas efetivadas e não pode ser cancelada. Estorne as saídas ou encerre a requisição.');
    }
    if (saidas.rascunhos > 0) {
      throw AppError.regra('Existem saídas em rascunho para esta requisição. Exclua ou efetive esses rascunhos antes.');
    }
    await conn.query(
      'UPDATE requisicoes SET status = ?, finalizado_por = ?, finalizado_em = NOW(), motivo_finalizacao = ? WHERE id = ?',
      [novoStatus, ator.id, String(motivo).trim(), id]
    );
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: codigo, tabela: 'requisicoes', registroId: Number(id), descricao: `Requisição ${req.numero} ${acao}. Motivo: ${motivo}`, ip });
  });
  return obter(id, ator);
}

const rejeitar = (id, motivo, ator, ip) =>
  finalizar(id, { novoStatus: 'REJEITADA', permitidos: ['PENDENTE'], acao: 'rejeitada', verbo: 'rejeitar', codigo: 'REJEITAR', motivo }, ator, ip);

const cancelar = (id, motivo, ator, ip) =>
  finalizar(id, {
    novoStatus: 'CANCELADA',
    // Solicitante só cancela enquanto não houve análise; almoxarifado cancela também aprovadas sem entrega
    permitidos: ehSolicitante(ator) ? ['PENDENTE'] : ['PENDENTE', 'APROVADA'],
    acao: 'cancelada', verbo: 'cancelar', codigo: 'CANCELAR', motivo
  }, ator, ip);

const encerrar = (id, motivo, ator, ip) =>
  finalizar(id, { novoStatus: 'ENCERRADA', permitidos: ['PARCIAL'], acao: 'encerrada', verbo: 'encerrar', codigo: 'ENCERRAR', motivo }, ator, ip);

module.exports = { listar, obter, criar, atualizar, aprovar, rejeitar, cancelar, encerrar };
