/** Política mínima de senha: 8+ caracteres, com letras e números. */
function validarForcaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'A senha deve ter no máximo 72 caracteres.';
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return 'A senha deve conter letras e números.';
  return null;
}

module.exports = { validarForcaSenha };
