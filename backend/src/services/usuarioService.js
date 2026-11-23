const bcrypt = require('bcrypt');
const env = require('../config/env');
const { query, transacao } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');
const { validarForcaSenha } = require('../utils/senha');

const CAMPOS = `u.id, u.nome, u.login, u.email, u.perfil_id, p.codigo AS perfil_codigo, p.nome AS perfil_nome,
                u.setor_id, s.nome AS setor_nome, s.sigla AS setor_sigla, u.ativo, u.ultimo_acesso, u.criado_em`;
const FROM = 'FROM usuarios u JOIN perfis p ON p.id = u.perfil_id LEFT JOIN setores s ON s.id = u.setor_id';

async function listar({ q, ativo, perfilId }) {
  const where = [];
  const params = [];
  if (q) { where.push('(u.nome LIKE ? OR u.login LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (ativo === '1' || ativo === '0') { where.push('u.ativo = ?'); params.push(Number(ativo)); }
  if (perfilId) { where.push('u.perfil_id = ?'); params.push(perfilId); }
  return query(`SELECT ${CAMPOS} ${FROM} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.nome`, params);
}

async function obter(id) {
  const rows = await query(`SELECT ${CAMPOS} ${FROM} WHERE u.id = ?`, [id]);
  if (!rows[0]) throw AppError.naoEncontrado('Usuário não encontrado.');
  return rows[0];
}

async function validarPerfilSetor(conn, perfilId, setorId) {
  const [[perfil]] = await conn.query('SELECT id, codigo, ativo FROM perfis WHERE id = ?', [perfilId]);
  if (!perfil || !perfil.ativo) throw AppError.regra('Perfil inválido ou inativo.');
  if (setorId) {
    const [[setor]] = await conn.query('SELECT id, ativo FROM setores WHERE id = ?', [setorId]);
    if (!setor || !setor.ativo) throw AppError.regra('Setor inválido ou inativo.');
  }
  if (perfil.codigo === 'SOLICITANTE' && !setorId) {
    throw AppError.regra('Usuários com perfil Solicitante devem estar vinculados a um setor.');
  }
  return perfil;
}

/** Impede que o sistema fique sem nenhum administrador ativo. */
async function garantirOutroAdmin(conn, usuarioId) {
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM usuarios u JOIN perfis p ON p.id = u.perfil_id
      WHERE p.codigo = 'ADMINISTRADOR' AND u.ativo = 1 AND u.id <> ? FOR UPDATE`,
    [usuarioId]
  );
  if (total === 0) throw AppError.regra('Operação recusada: o sistema precisa de pelo menos um administrador ativo.');
}

async function criar(dados, ator, ip) {
  const erroSenha = validarForcaSenha(dados.senha);
  if (erroSenha) throw AppError.regra(erroSenha);
  const hash = await bcrypt.hash(dados.senha, env.bcryptRounds);

  return transacao(async (conn) => {
    await validarPerfilSetor(conn, dados.perfil_id, dados.setor_id);
    const [r] = await conn.query(
      'INSERT INTO usuarios (nome, login, senha, email, perfil_id, setor_id, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [dados.nome, dados.login, hash, dados.email || null, dados.perfil_id, dados.setor_id || null]
    );
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: 'usuarios', registroId: r.insertId, descricao: `Usuário "${dados.login}" criado`, ip });
    return r.insertId;
  }).then(obter);
}

async function atualizar(id, dados, ator, ip) {
  let hash = null;
  if (dados.senha) {
    const erroSenha = validarForcaSenha(dados.senha);
    if (erroSenha) throw AppError.regra(erroSenha);
    hash = await bcrypt.hash(dados.senha, env.bcryptRounds);
  }

  await transacao(async (conn) => {
    const [[atual]] = await conn.query(
      'SELECT u.id, u.login, p.codigo AS perfil FROM usuarios u JOIN perfis p ON p.id = u.perfil_id WHERE u.id = ? FOR UPDATE', [id]
    );
    if (!atual) throw AppError.naoEncontrado('Usuário não encontrado.');
    const novoPerfil = await validarPerfilSetor(conn, dados.perfil_id, dados.setor_id);
    if (atual.perfil === 'ADMINISTRADOR' && novoPerfil.codigo !== 'ADMINISTRADOR') {
      await garantirOutroAdmin(conn, id);
    }
    await conn.query(
      'UPDATE usuarios SET nome = ?, login = ?, email = ?, perfil_id = ?, setor_id = ? WHERE id = ?',
      [dados.nome, dados.login, dados.email || null, dados.perfil_id, dados.setor_id || null, id]
    );
    if (hash) await conn.query('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, id]);
    await registrarAuditoria(conn, {
      usuarioId: ator.id, acao: 'ALTERAR', tabela: 'usuarios', registroId: id,
      descricao: `Usuário "${dados.login}" alterado${hash ? ' (senha redefinida)' : ''}`, ip
    });
  });
  return obter(id);
}

async function alterarStatus(id, ativo, ator, ip) {
  if (Number(id) === ator.id && !ativo) throw AppError.regra('Você não pode inativar o seu próprio usuário.');
  await transacao(async (conn) => {
    const [[atual]] = await conn.query(
      'SELECT u.id, u.login, p.codigo AS perfil FROM usuarios u JOIN perfis p ON p.id = u.perfil_id WHERE u.id = ? FOR UPDATE', [id]
    );
    if (!atual) throw AppError.naoEncontrado('Usuário não encontrado.');
    if (!ativo && atual.perfil === 'ADMINISTRADOR') await garantirOutroAdmin(conn, id);
    await conn.query('UPDATE usuarios SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', tabela: 'usuarios', registroId: id, descricao: `Usuário "${atual.login}"`, ip });
  });
  return obter(id);
}

// ---- Perfis --------------------------------------------------------
async function listarPerfis() {
  return query(
    `SELECT p.id, p.codigo, p.nome, p.descricao, p.ativo,
            (SELECT COUNT(*) FROM usuarios u WHERE u.perfil_id = p.id) AS total_usuarios
       FROM perfis p ORDER BY p.id`
  );
}

async function atualizarPerfil(id, dados, ator, ip) {
  await transacao(async (conn) => {
    const [[perfil]] = await conn.query('SELECT id, codigo FROM perfis WHERE id = ? FOR UPDATE', [id]);
    if (!perfil) throw AppError.naoEncontrado('Perfil não encontrado.');
    if (perfil.codigo === 'ADMINISTRADOR' && !dados.ativo) throw AppError.regra('O perfil Administrador não pode ser inativado.');
    await conn.query('UPDATE perfis SET nome = ?, descricao = ?, ativo = ? WHERE id = ?', [dados.nome, dados.descricao || null, dados.ativo ? 1 : 0, id]);
    await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: 'perfis', registroId: id, descricao: `Perfil ${perfil.codigo} alterado`, ip });
  });
  const perfis = await listarPerfis();
  return perfis.find((p) => p.id === Number(id));
}

module.exports = { listar, obter, criar, atualizar, alterarStatus, listarPerfis, atualizarPerfil };
