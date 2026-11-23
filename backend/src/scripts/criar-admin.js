/**
 * Cria o primeiro usuário administrador.
 *
 * Uso interativo:   npm run criar-admin
 * Uso não interativo (ex.: implantação automatizada):
 *   ADMIN_NOME="Fulano" ADMIN_LOGIN=admin ADMIN_SENHA="Senha@Forte1" npm run criar-admin
 */
const readline = require('readline');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { pool } = require('../config/database');
const { validarForcaSenha } = require('../utils/senha');

function perguntar(rl, texto, oculto = false) {
  return new Promise((resolve) => {
    if (oculto) {
      const escrever = rl._writeToOutput;
      rl._writeToOutput = (s) => { if (s.includes(texto)) escrever.call(rl, s); else escrever.call(rl, '*'); };
      rl.question(texto, (r) => { rl._writeToOutput = escrever; rl.output.write('\n'); resolve(r); });
    } else {
      rl.question(texto, resolve);
    }
  });
}

async function main() {
  let { ADMIN_NOME: nome, ADMIN_LOGIN: login, ADMIN_SENHA: senha, ADMIN_EMAIL: email } = process.env;

  if (!nome || !login || !senha) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    nome = nome || await perguntar(rl, 'Nome completo do administrador: ');
    login = login || await perguntar(rl, 'Login: ');
    email = email || await perguntar(rl, 'E-mail (opcional): ');
    senha = senha || await perguntar(rl, 'Senha: ', true);
    const confirmacao = process.env.ADMIN_SENHA ? senha : await perguntar(rl, 'Confirme a senha: ', true);
    rl.close();
    if (senha !== confirmacao) throw new Error('As senhas não conferem.');
  }

  nome = (nome || '').trim();
  login = (login || '').trim().toLowerCase();
  if (nome.length < 3) throw new Error('Informe o nome do administrador.');
  if (!/^[a-z0-9._-]{3,60}$/.test(login)) throw new Error('Login inválido: use de 3 a 60 caracteres (letras, números, ponto, hífen ou sublinhado).');
  const erroSenha = validarForcaSenha(senha);
  if (erroSenha) throw new Error(erroSenha);

  const [[perfil]] = await pool.query("SELECT id FROM perfis WHERE codigo = 'ADMINISTRADOR'");
  if (!perfil) throw new Error('Perfil ADMINISTRADOR não encontrado. Execute "npm run db:init" antes.');

  const [existe] = await pool.query('SELECT id FROM usuarios WHERE login = ?', [login]);
  if (existe.length) throw new Error(`Já existe um usuário com o login "${login}".`);

  const hash = await bcrypt.hash(senha, env.bcryptRounds);
  const [r] = await pool.query(
    'INSERT INTO usuarios (nome, login, senha, email, perfil_id) VALUES (?, ?, ?, ?, ?)',
    [nome, login, hash, email || null, perfil.id]
  );
  await pool.query(
    "INSERT INTO auditoria (usuario_id, acao, tabela_referencia, registro_id, descricao) VALUES (?, 'CRIAR_ADMIN', 'usuarios', ?, 'Administrador inicial criado pelo script de implantação')",
    [r.insertId, r.insertId]
  );
  console.log(`Administrador "${login}" criado com sucesso.`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Erro:', err.message);
    await pool.end();
    process.exit(1);
  });
