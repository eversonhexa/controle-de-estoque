/**
 * Testes de integração HTTP: autenticação, CSRF, autorização por perfil,
 * validação e fluxo completo pela API.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { prepararBanco, saldo, encerrar } = require('./helpers');
const { criarApp } = require('../src/app');

let app;
let ctx;

async function entrar(login, senha = 'Senha123') {
  const agente = request.agent(app);
  const r = await agente.post('/api/auth/login').send({ login, senha });
  assert.equal(r.status, 200, `login de ${login}: ${JSON.stringify(r.body)}`);
  agente.csrf = r.body.csrfToken;
  return agente;
}

describe('API', () => {
  before(async () => {
    ctx = await prepararBanco();
    app = criarApp();
  });
  after(async () => {
    await Promise.resolve(app.locals.sessionStore.close()).catch(() => {});
    await encerrar();
  });

  it('RN01 – rotas protegidas exigem autenticação', async () => {
    const r = await request(app).get('/api/mercadorias');
    assert.equal(r.status, 401);
    assert.ok(r.body.erro.mensagem);
  });

  it('login inválido é recusado sem revelar o motivo', async () => {
    const r1 = await request(app).post('/api/auth/login').send({ login: 'admin', senha: 'errada' });
    const r2 = await request(app).post('/api/auth/login').send({ login: 'naoexiste', senha: 'errada' });
    assert.equal(r1.status, 401);
    assert.equal(r1.body.erro.mensagem, r2.body.erro.mensagem);
  });

  it('CSRF – alteração sem token é recusada', async () => {
    const a = await entrar('almox');
    const sem = await a.post('/api/categorias').send({ nome: 'Limpeza' });
    assert.equal(sem.status, 403);
    const com = await a.post('/api/categorias').set('X-CSRF-Token', a.csrf).send({ nome: 'Limpeza' });
    assert.equal(com.status, 201);
  });

  it('RN02 – perfis sem permissão recebem 403', async () => {
    const s = await entrar('solic');
    assert.equal((await s.get('/api/estoque')).status, 403);
    assert.equal((await s.get('/api/usuarios')).status, 403);
    const c = await entrar('consulta');
    assert.equal((await c.get('/api/estoque')).status, 200);
    const r = await c.post('/api/entradas').set('X-CSRF-Token', c.csrf).send({});
    assert.equal(r.status, 403);
  });

  it('validação do backend independe do frontend', async () => {
    const a = await entrar('almox');
    const r = await a.post('/api/entradas').set('X-CSRF-Token', a.csrf)
      .send({ data_movimentacao: '2026-01-10', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: -5 }] });
    assert.equal(r.status, 422);
    const r2 = await a.post('/api/entradas').set('X-CSRF-Token', a.csrf)
      .send({ data_movimentacao: '2026-01-10', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: '1.23456' }] });
    assert.equal(r2.status, 422);
  });

  it('não existe endpoint para alterar saldo diretamente', async () => {
    const a = await entrar('admin');
    for (const [m, url] of [['put', `/api/estoque/${ctx.mercadoria.id}`], ['patch', `/api/estoque/${ctx.mercadoria.id}`], ['post', '/api/estoque']]) {
      const r = await a[m](url).set('X-CSRF-Token', a.csrf).send({ quantidade_atual: 999 });
      assert.equal(r.status, 404, `${m} ${url}`);
    }
    assert.equal((await a.delete(`/api/mercadorias/${ctx.mercadoria.id}`).set('X-CSRF-Token', a.csrf)).status, 404);
  });

  it('fluxo completo: entrada → requisição → aprovação → saída parcial → relatório', async () => {
    const almox = await entrar('almox');
    const solic = await entrar('solic');
    const H = (ag) => ({ 'X-CSRF-Token': ag.csrf });

    const ent = await almox.post('/api/entradas').set(H(almox)).send({ data_movimentacao: '2026-02-01', itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade: 100 }] });
    assert.equal(ent.status, 201);
    assert.equal((await almox.post(`/api/entradas/${ent.body.id}/efetivar`).set(H(almox))).status, 200);
    assert.equal((await almox.post(`/api/entradas/${ent.body.id}/efetivar`).set(H(almox))).status, 409, 'efetivação duplicada');

    const rq = await solic.post('/api/requisicoes').set(H(solic)).send({ itens: [{ mercadoria_id: ctx.mercadoria.id, quantidade_solicitada: 50 }] });
    assert.equal(rq.status, 201);
    assert.equal(rq.body.setor_id, ctx.setorId);
    assert.equal((await solic.post(`/api/requisicoes/${rq.body.id}/aprovar`).set(H(solic))).status, 403);
    assert.equal((await almox.post(`/api/requisicoes/${rq.body.id}/aprovar`).set(H(almox))).status, 200);

    const sai = await almox.post('/api/saidas').set(H(almox)).send({ requisicao_id: rq.body.id, recebedor: 'João', itens: [{ requisicao_item_id: rq.body.itens[0].id, quantidade: 20 }] });
    assert.equal(sai.status, 201);
    assert.equal((await almox.post(`/api/saidas/${sai.body.id}/efetivar`).set(H(almox))).status, 200);
    assert.equal(await saldo(ctx.mercadoria.id), 80);

    const det = await solic.get(`/api/requisicoes/${rq.body.id}`);
    assert.equal(det.body.status, 'PARCIAL');
    assert.equal(det.body.itens[0].pendente, 30);

    const extrato = await almox.get(`/api/estoque/${ctx.mercadoria.id}/extrato`);
    assert.equal(extrato.status, 200);
    assert.deepEqual(extrato.body.movimentos.map((m) => m.saldo_apos), [100, 80]);

    const rel = await almox.get('/api/relatorios/consumo-setor');
    assert.equal(rel.status, 200);
    assert.equal(rel.body.linhas[0].quantidade, 20);
    const xlsx = await almox.get('/api/relatorios/estoque?formato=xlsx');
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers['content-type'], /spreadsheetml/);
    const pdf = await almox.get('/api/relatorios/saidas?formato=pdf');
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers['content-type'], /pdf/);
  });

  it('logout encerra a sessão', async () => {
    const a = await entrar('almox');
    assert.equal((await a.get('/api/auth/me')).status, 200);
    await a.post('/api/auth/logout').set('X-CSRF-Token', a.csrf);
    assert.equal((await a.get('/api/auth/me')).status, 401);
  });
});
