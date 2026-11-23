/**
 * Cenários de aceitação da especificação (seção 18) e regras de negócio principais.
 * Requer MySQL acessível com as credenciais do .env; usa o banco DB_NAME_TEST.
 * Execução: npm test
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBanco, saldo, encerrar, query } = require('./helpers');
const doc = require('../src/services/documentoService');
const req = require('../src/services/requisicaoService');
const mercadoriaService = require('../src/services/mercadoriaService');

const IP = '127.0.0.1';
let ctx;

after(encerrar);

async function entradaEfetivada(mercadoriaId, quantidade) {
  const e = await doc.criarEntrada({ data_movimentacao: '2026-01-10', tipo_documento_referencia: 'NF-e', documento_referencia: '123', itens: [{ mercadoria_id: mercadoriaId, quantidade }] }, ctx.almox, IP);
  return doc.efetivarEntrada(e.id, ctx.almox, IP);
}

async function requisicaoAprovada(mercadoriaId, quantidade) {
  const r = await req.criar({ itens: [{ mercadoria_id: mercadoriaId, quantidade_solicitada: quantidade }] }, ctx.solicitante, IP);
  await req.aprovar(r.id, ctx.almox, IP);
  return req.obter(r.id, ctx.almox);
}

async function entregar(requisicao, quantidade) {
  const s = await doc.criarSaida({ requisicao_id: requisicao.id, itens: [{ requisicao_item_id: requisicao.itens[0].id, quantidade }] }, ctx.almox, IP);
  return doc.efetivarSaida(s.id, ctx.almox, IP);
}

const rejeitaCom = (trecho) => (err) => { assert.match(err.message, trecho); return true; };

describe('Cenários de aceitação (spec 18)', () => {
  before(async () => { ctx = await prepararBanco(); });

  let reqParcial;

  it('Teste 1 – Entrada: saldo passa de 0 para 100', async () => {
    assert.equal(await saldo(ctx.mercadoria.id), 0);
    const e = await entradaEfetivada(ctx.mercadoria.id, 100);
    assert.equal(e.status, 'EFETIVADO');
    assert.equal(await saldo(ctx.mercadoria.id), 100);
    assert.equal(Number(e.itens[0].saldo_apos), 100);
  });

  it('Teste 2 – Saída: requisição aprovada de 20 baixa o saldo de 100 para 80', async () => {
    const r = await requisicaoAprovada(ctx.mercadoria.id, 20);
    assert.equal(r.status, 'APROVADA');
    assert.equal(await saldo(ctx.mercadoria.id), 100, 'a aprovação não pode baixar o estoque');
    await entregar(r, 20);
    assert.equal(await saldo(ctx.mercadoria.id), 80);
    assert.equal((await req.obter(r.id, ctx.almox)).status, 'ATENDIDA');
  });

  it('Teste 3 – Atendimento parcial: 50 solicitadas, entregas de 20 e 15 deixam 15 pendentes', async () => {
    reqParcial = await requisicaoAprovada(ctx.mercadoria.id, 50);
    await entregar(reqParcial, 20);
    await entregar(reqParcial, 15);
    const r = await req.obter(reqParcial.id, ctx.almox);
    assert.equal(r.status, 'PARCIAL');
    assert.equal(Number(r.itens[0].entregue), 35);
    assert.equal(Number(r.itens[0].pendente), 15);
    assert.equal(await saldo(ctx.mercadoria.id), 45);
  });

  it('Teste 4 – Atendimento integral: entregar as 15 restantes muda para ATENDIDA', async () => {
    await entregar(reqParcial, 15);
    const r = await req.obter(reqParcial.id, ctx.almox);
    assert.equal(r.status, 'ATENDIDA');
    assert.equal(Number(r.itens[0].pendente), 0);
    assert.equal(await saldo(ctx.mercadoria.id), 30);
  });

  it('Teste 5 – Saldo insuficiente: impede a saída', async () => {
    const r = await requisicaoAprovada(ctx.mercadoria.id, 1000);
    await assert.rejects(entregar(r, 31), rejeitaCom(/Saldo insuficiente/));
    assert.equal(await saldo(ctx.mercadoria.id), 30, 'o rollback deve preservar o saldo');
    assert.equal((await req.obter(r.id, ctx.almox)).status, 'APROVADA');
  });

  it('Teste 6 – Quantidade superior à pendente: impede a saída', async () => {
    const r = await requisicaoAprovada(ctx.mercadoria.id, 5);
    await assert.rejects(
      doc.criarSaida({ requisicao_id: r.id, itens: [{ requisicao_item_id: r.itens[0].id, quantidade: 6 }] }, ctx.almox, IP),
      rejeitaCom(/superior à pendente/)
    );
    // Também na efetivação: dois rascunhos que somados excedem o pendente
    const s1 = await doc.criarSaida({ requisicao_id: r.id, itens: [{ requisicao_item_id: r.itens[0].id, quantidade: 3 }] }, ctx.almox, IP);
    const s2 = await doc.criarSaida({ requisicao_id: r.id, itens: [{ requisicao_item_id: r.itens[0].id, quantidade: 3 }] }, ctx.almox, IP);
    await doc.efetivarSaida(s1.id, ctx.almox, IP);
    await assert.rejects(doc.efetivarSaida(s2.id, ctx.almox, IP), rejeitaCom(/superior à pendente/));
    await doc.excluirSaida(s2.id, ctx.almox, IP);
  });

  it('Teste 7 – Requisição não aprovada: saída recusada', async () => {
    const r = await req.criar({ itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade_solicitada: 2 }] }, ctx.solicitante, IP);
    const completa = await req.obter(r.id, ctx.almox);
    assert.equal(completa.status, 'PENDENTE');
    await assert.rejects(
      doc.criarSaida({ requisicao_id: r.id, itens: [{ requisicao_item_id: completa.itens[0].id, quantidade: 1 }] }, ctx.almox, IP),
      rejeitaCom(/PENDENTE e não pode ser atendida/)
    );
  });

  it('Teste 8 – Estorno de saída recompõe o saldo e preserva o histórico', async () => {
    const antes = await saldo(ctx.mercadoria.id);
    const r = await requisicaoAprovada(ctx.mercadoria.id, 4);
    const saida = await entregar(r, 4);
    assert.equal(await saldo(ctx.mercadoria.id), antes - 4);
    assert.equal((await req.obter(r.id, ctx.almox)).status, 'ATENDIDA');

    const estorno = await doc.estornar(saida.id, 'Entrega registrada para o setor errado', ctx.almox, IP);
    assert.equal(estorno.tipo, 'ESTORNO_SAIDA');
    assert.equal(estorno.documento_origem_id, saida.id);
    assert.equal(await saldo(ctx.mercadoria.id), antes);

    const original = await doc.obter(saida.id);
    assert.equal(original.status, 'ESTORNADO', 'o original permanece, marcado como estornado');
    assert.equal(original.itens.length, 1);
    assert.equal((await req.obter(r.id, ctx.almox)).status, 'APROVADA', 'a requisição volta a ter saldo pendente');

    await assert.rejects(doc.estornar(saida.id, 'de novo', ctx.almox, IP), rejeitaCom(/já foi estornado/));
    await assert.rejects(doc.estornar(estorno.id, 'estorno do estorno', ctx.almox, IP), rejeitaCom(/não pode ser estornado/));
  });

  it('Teste 8b – Estorno de entrada sem saldo suficiente é recusado', async () => {
    const m = await mercadoriaService.criar({ codigo: 'MAT002', descricao: 'Papel A4', categoria_id: ctx.categoriaId, unidade_id: ctx.unidadeId }, ctx.admin, IP);
    const e = await entradaEfetivada(m.id, 10);
    const r = await requisicaoAprovada(m.id, 8);
    await entregar(r, 8);
    await assert.rejects(doc.estornar(e.id, 'NF lançada em duplicidade', ctx.almox, IP), rejeitaCom(/Saldo insuficiente/));
    assert.equal(await saldo(m.id), 2);
  });

  it('Teste 9 – Concorrência: saídas simultâneas nunca deixam saldo negativo', async () => {
    const m = await mercadoriaService.criar({ codigo: 'MAT003', descricao: 'Grampeador', categoria_id: ctx.categoriaId, unidade_id: ctx.unidadeId }, ctx.admin, IP);
    await entradaEfetivada(m.id, 10);
    const r1 = await requisicaoAprovada(m.id, 7);
    const r2 = await requisicaoAprovada(m.id, 7);
    const s1 = await doc.criarSaida({ requisicao_id: r1.id, itens: [{ requisicao_item_id: r1.itens[0].id, quantidade: 7 }] }, ctx.almox, IP);
    const s2 = await doc.criarSaida({ requisicao_id: r2.id, itens: [{ requisicao_item_id: r2.itens[0].id, quantidade: 7 }] }, ctx.admin, IP);

    const resultados = await Promise.allSettled([doc.efetivarSaida(s1.id, ctx.almox, IP), doc.efetivarSaida(s2.id, ctx.admin, IP)]);
    const ok = resultados.filter((x) => x.status === 'fulfilled');
    const falhas = resultados.filter((x) => x.status === 'rejected');
    assert.equal(ok.length, 1, 'apenas uma saída pode ser efetivada');
    assert.equal(falhas.length, 1);
    assert.match(falhas[0].reason.message, /Saldo insuficiente/);
    assert.equal(await saldo(m.id), 3);
  });

  it('Teste 9b – Efetivação duplicada do mesmo documento é bloqueada', async () => {
    const e = await doc.criarEntrada({ data_movimentacao: '2026-01-11', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: 5 }] }, ctx.almox, IP);
    const antes = await saldo(ctx.mercadoria.id);
    const resultados = await Promise.allSettled([doc.efetivarEntrada(e.id, ctx.almox, IP), doc.efetivarEntrada(e.id, ctx.almox, IP)]);
    assert.equal(resultados.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(await saldo(ctx.mercadoria.id), antes + 5, 'a entrada não pode ser somada duas vezes');
  });

  it('Teste 10 – Auditoria identifica usuário, data e ação', async () => {
    const linhas = await query(
      "SELECT a.acao, a.usuario_id, a.data_hora, a.descricao FROM auditoria a WHERE a.tabela_referencia = 'documentos_estoque' AND a.acao IN ('EFETIVAR','ESTORNAR') ORDER BY a.id"
    );
    assert.ok(linhas.length >= 5);
    for (const l of linhas) {
      assert.ok(l.usuario_id, 'toda operação registra o usuário');
      assert.match(l.data_hora, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
    assert.ok(linhas.some((l) => l.acao === 'ESTORNAR' && l.usuario_id === ctx.almox.id));
    // Operações que falharam não deixam rastro (rollback inclui a auditoria)
    const falhas = await query("SELECT COUNT(*) AS n FROM auditoria WHERE descricao LIKE '%Saldo insuficiente%'");
    assert.equal(falhas[0].n, 0);
  });
});

describe('Regras complementares', () => {
  before(async () => { ctx = await prepararBanco(); });

  it('RN09 – mercadoria inativa não pode ser movimentada', async () => {
    const m = await mercadoriaService.criar({ codigo: 'INA01', descricao: 'Item a inativar', categoria_id: ctx.categoriaId, unidade_id: ctx.unidadeId }, ctx.admin, IP);
    const e = await doc.criarEntrada({ data_movimentacao: '2026-01-10', itens: [{ mercadoria_id: m.id, quantidade: 5 }] }, ctx.almox, IP);
    await mercadoriaService.alterarStatus(m.id, false, ctx.admin, IP);
    await assert.rejects(doc.efetivarEntrada(e.id, ctx.almox, IP), rejeitaCom(/inativa/));
    await assert.rejects(doc.criarEntrada({ data_movimentacao: '2026-01-10', itens: [{ mercadoria_id: m.id, quantidade: 1 }] }, ctx.almox, IP), rejeitaCom(/inativa/));
  });

  it('RN10 – documento efetivado não pode ser alterado nem excluído', async () => {
    const e = await entradaEfetivada(ctx.mercadoria.id, 3);
    await assert.rejects(doc.excluirEntrada(e.id, ctx.almox, IP), rejeitaCom(/já está efetivado/));
    await assert.rejects(doc.atualizarEntrada(e.id, { data_movimentacao: '2026-01-01', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: 1 }] }, ctx.almox, IP), rejeitaCom(/já está efetivado/));
  });

  it('RN14 – não permite documento sem itens ou com quantidade zero', async () => {
    await assert.rejects(doc.criarEntrada({ data_movimentacao: '2026-01-10', itens: [] }, ctx.almox, IP), rejeitaCom(/pelo menos um item/));
    await assert.rejects(doc.criarEntrada({ data_movimentacao: '2026-01-10', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: 0 }] }, ctx.almox, IP), rejeitaCom(/maior que zero/));
  });

  it('Ajuste exige justificativa e respeita o saldo', async () => {
    const atual = await saldo(ctx.mercadoria.id);
    const a = await doc.criarAjuste({ natureza: 'SAIDA', justificativa: 'Avaria por umidade', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: atual + 1 }] }, ctx.almox, IP);
    await assert.rejects(doc.efetivarAjuste(a.id, ctx.almox, IP), rejeitaCom(/Saldo insuficiente/));
    const b = await doc.criarAjuste({ natureza: 'ENTRADA', justificativa: 'Inventário: sobra encontrada', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: 2 }] }, ctx.almox, IP);
    await doc.efetivarAjuste(b.id, ctx.almox, IP);
    assert.equal(await saldo(ctx.mercadoria.id), atual + 2);
    const est = await doc.estornar(b.id, 'Contagem refeita', ctx.almox, IP);
    assert.equal(est.tipo, 'ESTORNO_AJUSTE');
    assert.equal(est.sentido, -1);
    assert.equal(await saldo(ctx.mercadoria.id), atual);
  });

  it('Solicitante só vê requisições do próprio setor e não pode aprovar', async () => {
    const outra = await req.criar({ setor_id: (await query("SELECT id FROM setores WHERE sigla='ALMOX'"))[0].id, itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade_solicitada: 1 }] }, ctx.almox, IP);
    await assert.rejects(req.obter(outra.id, ctx.solicitante), rejeitaCom(/não encontrada/));
    const lista = await req.listar({}, ctx.solicitante);
    assert.ok(lista.every((r) => r.setor_id === ctx.setorId));
    // Solicitante criando requisição sempre usa o próprio setor
    const propria = await req.criar({ setor_id: outra.setor_id, itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade_solicitada: 1 }] }, ctx.solicitante, IP);
    assert.equal(propria.setor_id, ctx.setorId);
  });

  it('Cancelamento só sem entregas; encerramento de requisição parcial', async () => {
    await entradaEfetivada(ctx.mercadoria.id, 20);
    const r = await requisicaoAprovada(ctx.mercadoria.id, 10);
    await entregar(r, 4);
    await assert.rejects(req.cancelar(r.id, 'não precisa mais', ctx.almox, IP), rejeitaCom(/CANCELADA|PARCIAL/));
    const enc = await req.encerrar(r.id, 'Mercadoria descontinuada', ctx.almox, IP);
    assert.equal(enc.status, 'ENCERRADA');
    await assert.rejects(entregar(r, 1), rejeitaCom(/ENCERRADA/));

    const r2 = await requisicaoAprovada(ctx.mercadoria.id, 3);
    const c = await req.cancelar(r2.id, 'Pedido em duplicidade', ctx.almox, IP);
    assert.equal(c.status, 'CANCELADA');
  });

  it('Numeração sequencial por tipo e ano', async () => {
    const docs = await query("SELECT numero FROM documentos_estoque WHERE tipo = 'ENTRADA' ORDER BY id");
    assert.ok(docs.every((d) => /^ENT-\d{4}-\d{6}$/.test(d.numero)));
    const unicos = new Set(docs.map((d) => d.numero));
    assert.equal(unicos.size, docs.length);
  });

  it('Saldo em estoque_saldos é consistente com os documentos', async () => {
    const [r] = await query(
      `SELECT s.quantidade_atual AS saldo,
              COALESCE((SELECT SUM(d.sentido * i.quantidade) FROM documento_itens i JOIN documentos_estoque d ON d.id = i.documento_id
                         WHERE i.mercadoria_id = s.mercadoria_id AND d.status IN ('EFETIVADO','ESTORNADO')), 0) AS calculado
         FROM estoque_saldos s WHERE s.mercadoria_id = ?`, [ctx.mercadoria.id]
    );
    assert.equal(Number(r.saldo), Number(r.calculado));
  });
});
