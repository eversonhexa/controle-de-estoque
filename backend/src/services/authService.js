const bcrypt = require('bcrypt');
const env = require('../config/env');
const { query } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');
const { validarForcaSenha } = require('../utils/senha');

// Hash fixo usado quando o login não existe, para que o tempo de resposta
// não revele quais logins são válidos.
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', env.bcryptRounds);

async function autenticar(login, senha, ip) {
  const rows = await query(
    `SELECT u.id, u.senha, u.ativo, p.ativo AS perfil_ativo
       FROM usuarios u JOIN perfis p ON p.id = u.perfil_id
      WHERE u.login = ?`,
    [String(login).trim().toLowerCase()]
  );
  const usuario = rows[0];
  const senhaOk = await bcrypt.compare(String(senha), usuario ? usuario.senha : HASH_FICTICIO);

  if (!usuario || !senhaOk) {
    await registrarAuditoria(null, {
      usuarioId: usuario ? usuario.id : null,
      acao: 'LOGIN_FALHA', tabela: 'usuarios', registroId: usuario ? usuario.id : null,
      descricao: `Tentativa de login inválida para "${String(login).slice(0, 60)}"`, ip
    });
    throw new AppError(401, 'Login ou senha inválidos.');
  }
  if (!usuario.ativo || !usuario.perfil_ativo) {
    await registrarAuditoria(null, { usuarioId: usuario.id, acao: 'LOGIN_BLOQUEADO', tabela: 'usuarios', registroId: usuario.id, descricao: 'Usuário inativo', ip });
    throw new AppError(401, 'Usuário inativo. Procure o administrador do sistema.');
  }

  await query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [usuario.id]);
  await registrarAuditoria(null, { usuarioId: usuario.id, acao: 'LOGIN', tabela: 'usuarios', registroId: usuario.id, ip });
  return usuario.id;
}

async function alterarPropriaSenha(usuarioId, senhaAtual, novaSenha, ip) {
  const [u] = await query('SELECT senha FROM usuarios WHERE id = ?', [usuarioId]);
  if (!u || !(await bcrypt.compare(String(senhaAtual), u.senha))) {
    throw AppError.regra('A senha atual não confere.');
  }
  const erro = validarForcaSenha(novaSenha);
  if (erro) throw AppError.regra(erro);
  const hash = await bcrypt.hash(novaSenha, env.bcryptRounds);
  await query('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, usuarioId]);
  await registrarAuditoria(null, { usuarioId, acao: 'ALTERAR_SENHA', tabela: 'usuarios', registroId: usuarioId, ip });
}

module.exports = { autenticar, alterarPropriaSenha };
