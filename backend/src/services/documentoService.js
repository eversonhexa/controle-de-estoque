/**
 * Documentos de estoque: entradas, saídas, ajustes e estornos.
 *
 * Ciclo de vida: RASCUNHO -> EFETIVADO -> (ESTORNADO, quando estornado).
 * - Rascunhos podem ser editados e excluídos; não alteram saldo.
 * - A efetivação altera o saldo, dentro de transação, com bloqueio de linhas.
 * - Documentos efetivados nunca são alterados ou excluídos (RN10); correções
 *   são feitas por estorno, que gera um novo documento com movimento inverso (RN13).
 */
const { query, transacao } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');
const { proximoNumero } = require('../utils/numerador');
const { paraMilesimos, formatar } = require('../utils/quantidade');
const { aplicarMovimentos } = require('./movimentacaoService');
const { itensComQuantidades, recalcularStatus } = require('../repositories/requisicaoRepository');

const SENTIDO = { ENTRADA: 1, AJUSTE_ENTRADA: 1, SAIDA: -1, AJUSTE_SAIDA: -1 };
const TIPO_ESTORNO = { ENTRADA: 'ESTORNO_ENTRADA', SAIDA: 'ESTORNO_SAIDA', AJUSTE_ENTRADA: 'ESTORNO_AJUSTE', AJUSTE_SAIDA: 'ESTORNO_AJUSTE' };
const ROTULO = {
  ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE_ENTRADA: 'Ajuste de entrada', AJUSTE_SAIDA: 'Ajuste de saída',
  ESTORNO_ENTRADA: 'Estorno de entrada', ESTORNO_SAIDA: 'Estorno de saída', ESTORNO_AJUSTE: 'Estorno de ajuste'
};
const TIPOS_AJUSTE = ['AJUSTE_ENTRADA', 'AJUSTE_SAIDA'];

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------
const SELECT_CABECALHO = `
  SELECT d.id, d.numero, d.tipo, d.sentido, d.status, d.data_movimentacao,
         d.tipo_documento_referencia, d.documento_referencia,
         d.fornecedor_id, f.nome AS fornecedor_nome,
         d.requisicao_id, r.numero AS requisicao_numero, r.status AS requisicao_status,
         r.setor_id, st.nome AS setor_nome, st.sigla AS setor_sigla,
         d.documento_origem_id, o.numero AS documento_origem_numero, o.tipo AS documento_origem_tipo,
         (SELECT e.id FROM documentos_estoque e WHERE e.documento_origem_id = d.id) AS estorno_id,
         (SELECT e.numero FROM documentos_estoque e WHERE e.documento_origem_id = d.id) AS estorno_numero,
         d.usuario_id, us.nome AS usuario_nome,
         d.efetivado_por, ue.nome AS efetivado_por_nome, d.efetivado_em,
         d.recebedor, d.observacoes, d.justificativa, d.criado_em, d.atualizado_em,
         (SELECT COUNT(*) FROM documento_itens i WHERE i.documento_id = d.id) AS total_itens
    FROM documentos_estoque d
    JOIN usuarios us ON us.id = d.usuario_id
    LEFT JOIN usuarios ue ON ue.id = d.efetivado_por
    LEFT JOIN fornecedores f ON f.id = d.fornecedor_id
    LEFT JOIN requisicoes r ON r.id = d.requisicao_id
    LEFT JOIN setores st ON st.id = r.setor_id
    LEFT JOIN documentos_estoque o ON o.id = d.documento_origem_id`;

async function listar(filtros = {}) {
  const where = [];
  const params = [];
  if (filtros.tipos && filtros.tipos.length) { where.push(`d.tipo IN (${filtros.tipos.map(() => '?').join(',')})`); params.push(...filtros.tipos); }
  if (filtros.status) { where.push('d.status = ?'); params.push(filtros.status); }
  if (filtros.de) { where.push('d.data_movimentacao >= ?'); params.push(`${filtros.de} 00:00:00`); }
  if (filtros.ate) { where.push('d.data_movimentacao <= ?'); params.push(`${filtros.ate} 23:59:59`); }
  if (filtros.q) { where.push('(d.numero LIKE ? OR d.documento_referencia LIKE ? OR r.numero LIKE ?)'); params.push(`%${filtros.q}%`, `%${filtros.q}%`, `%${filtros.q}%`); }
  if (filtros.fornecedorId) { where.push('d.fornecedor_id = ?'); params.push(filtros.fornecedorId); }
  if (filtros.requisicaoId) { where.push('d.requisicao_id = ?'); params.push(filtros.requisicaoId); }
  if (filtros.setorId) { where.push('r.setor_id = ?'); params.push(filtros.setorId); }
  if (filtros.mercadoriaId) { where.push('EXISTS (SELECT 1 FROM documento_itens i WHERE i.documento_id = d.id AND i.mercadoria_id = ?)'); params.push(filtros.mercadoriaId); }
  const limite = Math.min(Math.max(Number(filtros.limite) || 500, 1), 2000);
  return query(`${SELECT_CABECALHO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.id DESC LIMIT ${limite}`, params);
}

async function obter(id, tiposPermitidos) {
  const [doc] = await query(`${SELECT_CABECALHO} WHERE d.id = ?`, [id]);
  if (!doc || (tiposPermitidos && !tiposPermitidos.includes(doc.tipo))) throw AppError.naoEncontrado('Documento não encontrado.');
  doc.itens = await query(
    `SELECT i.id, i.mercadoria_id, m.codigo, m.descricao, m.ativo AS mercadoria_ativa,
            i.unidade_medida_id, u.sigla AS unidade_sigla, i.quantidade, i.saldo_apos,
            i.requisicao_item_id, ri.quantidade_solicitada, COALESCE(s.quantidade_atual, 0) AS saldo_atual
       FROM documento_itens i
       JOIN mercadorias m ON m.id = i.mercadoria_id
       JOIN unidades_medida u ON u.id = i.unidade_medida_id
       LEFT JOIN requisicao_itens ri ON ri.id = i.requisicao_item_id
       LEFT JOIN estoque_saldos s ON s.mercadoria_id = i.mercadoria_id
      WHERE i.documento_id = ? ORDER BY i.id`,
    [id]
  );
  return doc;
}

// ---------------------------------------------------------------------
// Auxiliares internos
// ---------------------------------------------------------------------
async function bloquearDocumento(conn, id, tiposPermitidos) {
  const [[doc]] = await conn.query('SELECT * FROM documentos_estoque WHERE id = ? FOR UPDATE', [id]);
  if (!doc || (tiposPermitidos && !tiposPermitidos.includes(doc.tipo))) throw AppError.naoEncontrado('Documento não encontrado.');
  return doc;
}

function exigirRascunho(doc) {
  if (doc.status !== 'RASCUNHO') {
    // Também protege contra efetivação duplicada (duplo clique, reenvio da requisição)
    throw AppError.conflito(`O documento ${doc.numero} já está ${doc.status === 'EFETIVADO' ? 'efetivado' : 'estornado'} e não pode ser alterado.`);
  }
}

/** Valida itens com mercadoria e quantidade (entradas e ajustes). */
async function prepararItensSimples(conn, itens) {
  if (!Array.isArray(itens) || !itens.length) throw AppError.regra('Inclua pelo menos um item no documento.');
  const vistos = new Set();
  const resultado = [];
  for (const [idx, item] of itens.entries()) {
    const mercadoriaId = Number(item.mercadoria_id);
    if (vistos.has(mercadoriaId)) throw AppError.regra(`A mercadoria do item ${idx + 1} está repetida. Some as quantidades em um único item.`);
    vistos.add(mercadoriaId);
    if (!(paraMilesimos(item.quantidade) > 0)) throw AppError.regra(`A quantidade do item ${idx + 1} deve ser maior que zero.`);  // RN14

    const [[m]] = await conn.query('SELECT id, codigo, descricao, unidade_id, ativo FROM mercadorias WHERE id = ?', [mercadoriaId]);
    if (!m) throw AppError.regra(`Mercadoria do item ${idx + 1} não encontrada.`);
    if (!m.ativo) throw AppError.regra(`A mercadoria ${m.codigo} - ${m.descricao} está inativa.`);  // RN09
    resultado.push({ mercadoria_id: m.id, unidade_medida_id: m.unidade_id, quantidade: Number(item.quantidade), requisicao_item_id: null });
  }
  return resultado;
}

async function inserirItens(conn, documentoId, itens) {
  for (const i of itens) {
    await conn.query(
      'INSERT INTO documento_itens (documento_id, mercadoria_id, requisicao_item_id, unidade_medida_id, quantidade) VALUES (?, ?, ?, ?, ?)',
      [documentoId, i.mercadoria_id, i.requisicao_item_id || null, i.unidade_medida_id, i.quantidade]
    );
  }
}

async function validarFornecedor(conn, fornecedorId) {
  if (!fornecedorId) return null;
  const [[f]] = await conn.query('SELECT id, ativo FROM fornecedores WHERE id = ?', [fornecedorId]);
  if (!f || !f.ativo) throw AppError.regra('Fornecedor inválido ou inativo.');
  return f.id;
}

/** Aplica os movimentos do documento e grava o saldo após a operação em cada item. */
async function movimentarItens(conn, documentoId, sentido) {
  const [itens] = await conn.query('SELECT id, mercadoria_id, quantidade FROM documento_itens WHERE documento_id = ?', [documentoId]);
  if (!itens.length) throw AppError.regra('Não é possível efetivar um documento sem itens.');
  const saldos = await aplicarMovimentos(conn, itens.map((i) => ({ mercadoriaId: i.mercadoria_id, delta: sentido * i.quantidade })));
  for (const i of itens) {
    await conn.query('UPDATE documento_itens SET saldo_apos = ? WHERE id = ?', [saldos.get(i.mercadoria_id), i.id]);
  }
  return itens;
}

// ---------------------------------------------------------------------
// Entradas e ajustes (rascunho)
// ---------------------------------------------------------------------
async function criarSimples(tipo, dados, ator, ip) {
  const id = await transacao(async (conn) => {
    const itens = await prepararItensSimples(conn, dados.itens);
    const fornecedorId = tipo === 'ENTRADA' ? await validarFornecedor(conn, dados.fornecedor_id) : null;
    const numero = await proximoNumero(conn, tipo);
    const [r] = await conn.query(
      `INSERT INTO documentos_estoque
         (numero, tipo, sentido, data_movimentacao, tipo_documento_referencia, documento_referencia,
          fornecedor_id, usuario_id, status, observacoes, justificativa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?)`,
      [
        numero, tipo, SENTIDO[tipo],
        tipo === 'ENTRADA' && dados.data_movimentacao ? dados.data_movimentacao : new Date(),
        tipo === 'ENTRADA' ? dados.tipo_documento_referencia || null : null,
        tipo === 'ENTRADA' ? dados.documento_referencia || null : null,
        fornecedorId, ator.id, dados.observacoes || null, dados.justificativa || null
      ]
    );
    await inserirItens(conn, r.insertId, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: 'documentos_estoque', registroId: r.insertId, descricao: `${ROTULO[tipo]} ${numero} registrada em rascunho com ${itens.length} item(ns)`, ip });
    return r.insertId;
  });
  return obter(id);
}

async function atualizarSimples(id, tiposPermitidos, dados, ator, ip) {
  await transacao(async (conn) => {
    const doc = await bloquearDocumento(conn, id, tiposPermitidos);
    exigirRascunho(doc);
    let tipo = doc.tipo;
    if (TIPOS_AJUSTE.includes(doc.tipo) && dados.natureza) tipo = `AJUSTE_${dados.natureza}`;
    const itens = await prepararItensSimples(conn, dados.itens);
    const fornecedorId = tipo === 'ENTRADA' ? await validarFornecedor(conn, dados.fornecedor_id) : null;
    await conn.query(
      `UPDATE documentos_estoque
          SET tipo = ?, sentido = ?, data_movimentacao = ?, tipo_documento_referencia = ?, documento_referencia = ?,
              fornecedor_id = ?, observacoes = ?, justificativa = ?
        WHERE id = ?`,
      [
        tipo, SENTIDO[tipo],
        tipo === 'ENTRADA' && dados.data_movimentacao ? dados.data_movimentacao : doc.data_movimentacao,
        tipo === 'ENTRADA' ? dados.tipo_documento_referencia || null : null,
        tipo === 'ENTRADA' ? dados.documento_referencia || null : null,
        fornecedorId, dados.observacoes || null, dados.justificativa || null, id
      ]
    );
    await conn.query('DELETE FROM documento_itens WHERE documento_id = ?', [id]);
    await inserirItens(conn, id, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: 'documentos_estoque', registroId: Number(id), descricao: `${ROTULO[tipo]} ${doc.numero} alterada (rascunho)`, ip });
  });
  return obter(id);
}

async function excluirRascunho(id, tiposPermitidos, ator, ip) {
  await transacao(async (conn) => {
    const doc = await bloquearDocumento(conn, id, tiposPermitidos);
    exigirRascunho(doc);  // RN10
    await conn.query('DELETE FROM documento_itens WHERE documento_id = ?', [id]);
    await conn.query('DELETE FROM documentos_estoque WHERE id = ?', [id]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'EXCLUIR_RASCUNHO', tabela: 'documentos_estoque', registroId: Number(id), descricao: `${ROTULO[doc.tipo]} ${doc.numero} (rascunho) excluída`, ip });
  });
}

async function efetivarSimples(id, tiposPermitidos, ator, ip) {
  await transacao(async (conn) => {
    const doc = await bloquearDocumento(conn, id, tiposPermitidos);
    exigirRascunho(doc);
    if (TIPOS_AJUSTE.includes(doc.tipo) && !(doc.justificativa || '').trim()) {
      throw AppError.regra('Ajustes de estoque exigem justificativa.');
    }
    const itens = await movimentarItens(conn, id, doc.sentido);
    await conn.query(
      `UPDATE documentos_estoque
          SET status = 'EFETIVADO', efetivado_por = ?, efetivado_em = NOW()${doc.tipo === 'ENTRADA' ? '' : ', data_movimentacao = NOW()'}
        WHERE id = ?`,
      [ator.id, id]
    );
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'EFETIVAR', tabela: 'documentos_estoque', registroId: Number(id), descricao: `${ROTULO[doc.tipo]} ${doc.numero} efetivada com ${itens.length} item(ns)`, ip });
  });
  return obter(id);
}

// ---------------------------------------------------------------------
// Saídas (vinculadas a requisições)
// ---------------------------------------------------------------------
async function bloquearRequisicaoParaAtendimento(conn, requisicaoId) {
  const [[req]] = await conn.query('SELECT id, numero, status FROM requisicoes WHERE id = ? FOR UPDATE', [requisicaoId]);
  if (!req) throw AppError.regra('Requisição não encontrada.');
  if (!['APROVADA', 'PARCIAL'].includes(req.status)) {  // RN03
    throw AppError.regra(`A requisição ${req.numero} está ${req.status} e não pode ser atendida. Somente requisições aprovadas ou parcialmente atendidas geram saídas.`);
  }
  return req;
}

/** Valida os itens da saída contra a requisição (RN05, RN09, RN14). */
async function prepararItensSaida(conn, requisicao, itens) {
  if (!Array.isArray(itens) || !itens.length) throw AppError.regra('Inclua pelo menos um item na saída.');
  const itensReq = await itensComQuantidades(conn, requisicao.id);
  const porId = new Map(itensReq.map((i) => [i.id, i]));
  const vistos = new Set();
  const resultado = [];

  for (const [idx, item] of itens.entries()) {
    const ri = porId.get(Number(item.requisicao_item_id));
    if (!ri) throw AppError.regra(`O item ${idx + 1} não pertence à requisição ${requisicao.numero}.`);
    if (vistos.has(ri.id)) throw AppError.regra(`O item ${ri.codigo} foi informado mais de uma vez.`);
    vistos.add(ri.id);
    if (!(paraMilesimos(item.quantidade) > 0)) throw AppError.regra(`A quantidade de ${ri.codigo} deve ser maior que zero.`);
    if (!ri.mercadoria_ativa) throw AppError.regra(`A mercadoria ${ri.codigo} - ${ri.descricao} está inativa.`);
    if (paraMilesimos(item.quantidade) > paraMilesimos(ri.pendente)) {
      throw AppError.regra(
        `Quantidade de ${ri.codigo} superior à pendente na requisição: solicitado ${formatar(ri.quantidade_solicitada)}, ` +
        `já entregue ${formatar(ri.entregue)}, pendente ${formatar(ri.pendente)}.`
      );
    }
    resultado.push({ mercadoria_id: ri.mercadoria_id, unidade_medida_id: ri.unidade_id, quantidade: Number(item.quantidade), requisicao_item_id: ri.id });
  }
  return resultado;
}

async function criarSaida(dados, ator, ip) {
  const id = await transacao(async (conn) => {
    const req = await bloquearRequisicaoParaAtendimento(conn, dados.requisicao_id);
    const itens = await prepararItensSaida(conn, req, dados.itens);
    const numero = await proximoNumero(conn, 'SAIDA');
    const [r] = await conn.query(
      `INSERT INTO documentos_estoque (numero, tipo, sentido, data_movimentacao, requisicao_id, usuario_id, recebedor, status, observacoes)
       VALUES (?, 'SAIDA', -1, NOW(), ?, ?, ?, 'RASCUNHO', ?)`,
      [numero, req.id, ator.id, dados.recebedor || null, dados.observacoes || null]
    );
    await inserirItens(conn, r.insertId, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: 'documentos_estoque', registroId: r.insertId, descricao: `Saída ${numero} em rascunho para a requisição ${req.numero}`, ip });
    return r.insertId;
  });
  return obter(id);
}

async function atualizarSaida(id, dados, ator, ip) {
  await transacao(async (conn) => {
    const doc = await bloquearDocumento(conn, id, ['SAIDA']);
    exigirRascunho(doc);
    const req = await bloquearRequisicaoParaAtendimento(conn, doc.requisicao_id);
    const itens = await prepararItensSaida(conn, req, dados.itens);
    await conn.query('UPDATE documentos_estoque SET recebedor = ?, observacoes = ? WHERE id = ?', [dados.recebedor || null, dados.observacoes || null, id]);
    await conn.query('DELETE FROM documento_itens WHERE documento_id = ?', [id]);
    await inserirItens(conn, id, itens);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: 'documentos_estoque', registroId: Number(id), descricao: `Saída ${doc.numero} alterada (rascunho)`, ip });
  });
  return obter(id);
}

/**
 * Efetivação da saída, conforme a sequência da spec 12.1:
 * transação -> bloqueio do documento -> bloqueio da requisição -> conferência das
 * quantidades pendentes -> bloqueio e baixa dos saldos -> atualização da
 * requisição -> auditoria -> COMMIT (ou ROLLBACK em qualquer falha).
 */
async function efetivarSaida(id, ator, ip) {
  await transacao(async (conn) => {
    const doc = await bloquearDocumento(conn, id, ['SAIDA']);
    exigirRascunho(doc);
    const req = await bloquearRequisicaoParaAtendimento(conn, doc.requisicao_id);

    // Reconfere os itens com as quantidades atualizadas (outras saídas podem ter sido efetivadas)
    const [itensDoc] = await conn.query('SELECT requisicao_item_id, quantidade FROM documento_itens WHERE documento_id = ?', [id]);
    if (!itensDoc.length) throw AppError.regra('Não é possível efetivar um documento sem itens.');
    if (itensDoc.some((i) => !i.requisicao_item_id)) throw AppError.regra('Todo item de saída deve estar vinculado a um item da requisição.');  // RN16
    await prepararItensSaida(conn, req, itensDoc);

    const itens = await movimentarItens(conn, id, -1);
    await conn.query(
      "UPDATE documentos_estoque SET status = 'EFETIVADO', efetivado_por = ?, efetivado_em = NOW(), data_movimentacao = NOW() WHERE id = ?",
      [ator.id, id]
    );
    const novoStatus = await recalcularStatus(conn, req.id);
    await registrarAuditoria(conn, {
      usuarioId: ator.id, acao: 'EFETIVAR', tabela: 'documentos_estoque', registroId: Number(id),
      descricao: `Saída ${doc.numero} efetivada (${itens.length} item(ns)) para a requisição ${req.numero}; requisição agora ${novoStatus}`, ip
    });
  });
  return obter(id);
}

// ---------------------------------------------------------------------
// Estorno
// ---------------------------------------------------------------------
async function estornar(id, justificativa, ator, ip) {
  if (!justificativa || !String(justificativa).trim()) throw AppError.regra('Informe a justificativa do estorno.');

  const estornoId = await transacao(async (conn) => {
    const original = await bloquearDocumento(conn, id);
    if (original.tipo.startsWith('ESTORNO')) throw AppError.regra('Um documento de estorno não pode ser estornado.');
    if (original.status === 'RASCUNHO') throw AppError.regra('Documentos em rascunho não precisam de estorno: edite ou exclua o rascunho.');
    if (original.status === 'ESTORNADO') throw AppError.conflito(`O documento ${original.numero} já foi estornado.`);

    let req = null;
    if (original.tipo === 'SAIDA') {
      const [[r]] = await conn.query('SELECT id, numero, status FROM requisicoes WHERE id = ? FOR UPDATE', [original.requisicao_id]);
      req = r;
    }

    const tipo = TIPO_ESTORNO[original.tipo];
    const sentido = -original.sentido;
    const numero = await proximoNumero(conn, tipo);
    const [r] = await conn.query(
      `INSERT INTO documentos_estoque
         (numero, tipo, sentido, data_movimentacao, tipo_documento_referencia, documento_referencia, fornecedor_id,
          requisicao_id, documento_origem_id, usuario_id, status, justificativa, efetivado_por, efetivado_em)
       VALUES (?, ?, ?, NOW(), 'ESTORNO', ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?, NOW())`,
      [numero, tipo, sentido, original.numero, original.fornecedor_id, original.requisicao_id, original.id, ator.id, String(justificativa).trim(), ator.id]
    );
    const [itensOriginais] = await conn.query(
      'SELECT mercadoria_id, requisicao_item_id, unidade_medida_id, quantidade FROM documento_itens WHERE documento_id = ?', [original.id]
    );
    await inserirItens(conn, r.insertId, itensOriginais);
    // Movimento inverso, respeitando saldo e situação das mercadorias
    await movimentarItens(conn, r.insertId, sentido);
    await conn.query("UPDATE documentos_estoque SET status = 'EFETIVADO' WHERE id = ?", [r.insertId]);
    // O original permanece preservado no histórico, apenas marcado como estornado
    await conn.query("UPDATE documentos_estoque SET status = 'ESTORNADO' WHERE id = ?", [original.id]);

    let complemento = '';
    if (req) {
      const novoStatus = await recalcularStatus(conn, req.id);
      complemento = `; requisição ${req.numero} agora ${novoStatus}`;
    }
    await registrarAuditoria(conn, {
      usuarioId: ator.id, acao: 'ESTORNAR', tabela: 'documentos_estoque', registroId: original.id,
      descricao: `${ROTULO[original.tipo]} ${original.numero} estornada pelo documento ${numero}${complemento}. Justificativa: ${justificativa}`, ip
    });
    return r.insertId;
  });
  return obter(estornoId);
}

module.exports = {
  SENTIDO, ROTULO, TIPOS_AJUSTE,
  listar, obter,
  criarEntrada: (dados, ator, ip) => criarSimples('ENTRADA', dados, ator, ip),
  atualizarEntrada: (id, dados, ator, ip) => atualizarSimples(id, ['ENTRADA'], dados, ator, ip),
  excluirEntrada: (id, ator, ip) => excluirRascunho(id, ['ENTRADA'], ator, ip),
  efetivarEntrada: (id, ator, ip) => efetivarSimples(id, ['ENTRADA'], ator, ip),
  criarAjuste: (dados, ator, ip) => criarSimples(`AJUSTE_${dados.natureza}`, dados, ator, ip),
  atualizarAjuste: (id, dados, ator, ip) => atualizarSimples(id, TIPOS_AJUSTE, dados, ator, ip),
  excluirAjuste: (id, ator, ip) => excluirRascunho(id, TIPOS_AJUSTE, ator, ip),
  efetivarAjuste: (id, ator, ip) => efetivarSimples(id, TIPOS_AJUSTE, ator, ip),
  criarSaida, atualizarSaida, efetivarSaida,
  excluirSaida: (id, ator, ip) => excluirRascunho(id, ['SAIDA'], ator, ip),
  estornar
};
