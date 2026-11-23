/** Erro de negócio com código HTTP. Mensagens são exibidas ao usuário. */
class AppError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.name = 'AppError';
    this.status = status;
    this.detalhes = detalhes;
  }

  static requisicaoInvalida(msg, detalhes) { return new AppError(400, msg, detalhes); }
  static naoAutenticado(msg = 'Sessão expirada ou usuário não autenticado.') { return new AppError(401, msg); }
  static proibido(msg = 'Você não tem permissão para executar esta operação.') { return new AppError(403, msg); }
  static naoEncontrado(msg = 'Registro não encontrado.') { return new AppError(404, msg); }
  static conflito(msg, detalhes) { return new AppError(409, msg, detalhes); }
  static regra(msg, detalhes) { return new AppError(422, msg, detalhes); }
}

module.exports = AppError;
