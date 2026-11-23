/**
 * Preparação dos testes: recria o banco de TESTE (DB_NAME_TEST) do zero
 * e cadastra os dados mínimos. Nunca aponta para o banco de produção.
 */
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS_TEST || '4';

const bcrypt = require('bcrypt');
const env = require('../src/config/env');
const { pool, query } = require('../src/config/database');
const { inicializarBanco } = require('../src/scripts/db-init');
const mercadoriaService = require('../src/services/mercadoriaService');

if (!/teste|test/i.test(env.db.database)) {
  throw new Error(`Por segurança, os testes só rodam em bancos cujo nome contenha "teste" (atual: ${env.db.database}).`);
}

async function prepararBanco() {
  await inicializarBanco({ database: env.db.database, force: true, silencioso: true });
  await query('DELETE FROM sessoes').catch(() => {});

  const perfis = Object.fromEntries((await query('SELECT id, codigo FROM perfis')).map((p) => [p.codigo, p.id]));
  const [{ id: setorAlmox }] = await query("SELECT id FROM setores WHERE sigla = 'ALMOX'");
  const rSetor = await pool.query("INSERT INTO setores (nome, sigla, responsavel) VALUES ('Secretaria de Educação', 'SEDUC', 'Maria')");
  const setorId = rSetor[0].insertId;
  const hash = await bcrypt.hash('Senha123', 4);

  const criarUsuario = async (login, perfil, setor) => {
    const [r] = await pool.query('INSERT INTO usuarios (nome, login, senha, perfil_id, setor_id) VALUES (?, ?, ?, ?, ?)', [`Usuário ${login}`, login, hash, perfis[perfil], setor]);
    return { id: r.insertId, nome: `Usuário ${login}`, login, perfil, setorId: setor };
  };

  const admin = await criarUsuario('admin', 'ADMINISTRADOR', null);
  const almox = await criarUsuario('almox', 'ALMOXARIFE', setorAlmox);
  const solicitante = await criarUsuario('solic', 'SOLICITANTE', setorId);
  const consulta = await criarUsuario('consulta', 'CONSULTA', null);

  const [cat] = await pool.query("INSERT INTO categorias (nome) VALUES ('Material de expediente')");
  const [[un]] = await pool.query("SELECT id FROM unidades_medida WHERE sigla = 'UN'");
  const mercadoria = await mercadoriaService.criar({ codigo: 'MAT001', descricao: 'Caneta esferográfica azul', categoria_id: cat.insertId, unidade_id: un.id, estoque_minimo: 10 }, admin, '127.0.0.1');

  return { admin, almox, solicitante, consulta, setorId, categoriaId: cat.insertId, unidadeId: un.id, mercadoria };
}

async function saldo(mercadoriaId) {
  const [r] = await query('SELECT quantidade_atual FROM estoque_saldos WHERE mercadoria_id = ?', [mercadoriaId]);
  return r ? Number(r.quantidade_atual) : 0;
}

async function encerrar() {
  await pool.end();
}

module.exports = { prepararBanco, saldo, encerrar, pool, query };
