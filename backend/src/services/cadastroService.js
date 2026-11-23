const { pool, transacao } = require('../config/database');
const AppError = require('../utils/AppError');
const { registrarAuditoria } = require('../utils/auditoria');
const { criarRepositorio } = require('../repositories/cadastroRepository');

/** Configuração dos cadastros simples. */
const CADASTROS = {
  setores: {
    tabela: 'setores', rotulo: 'Setor', campos: ['nome', 'sigla', 'responsavel'], ordem: 'nome', busca: ['nome', 'sigla', 'responsavel'], descricao: (r) => `${r.sigla} - ${r.nome}`
  },
  categorias: {
    tabela: 'categorias', rotulo: 'Categoria', campos: ['nome', 'descricao'], ordem: 'nome', busca: ['nome', 'descricao'], descricao: (r) => r.nome
  },
  unidades: {
    tabela: 'unidades_medida', rotulo: 'Unidade de medida', campos: ['descricao', 'sigla'], ordem: 'descricao', busca: ['descricao', 'sigla'], descricao: (r) => `${r.sigla} - ${r.descricao}`
  },
  fornecedores: {
    tabela: 'fornecedores', rotulo: 'Fornecedor', campos: ['nome', 'documento', 'contato', 'telefone', 'email'], ordem: 'nome', busca: ['nome', 'documento', 'contato'], descricao: (r) => r.nome
  }
};

function criarServico(chave) {
  const cfg = CADASTROS[chave];
  const repo = criarRepositorio(cfg);

  async function obter(id) {
    const r = await repo.obter(pool, id);
    if (!r) throw AppError.naoEncontrado(`${cfg.rotulo} não encontrado(a).`);
    return r;
  }

  return {
    listar: (filtros) => repo.listar(pool, filtros),
    obter,

    async criar(dados, ator, ip) {
      const id = await transacao(async (conn) => {
        const novoId = await repo.inserir(conn, dados);
        await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'CRIAR', tabela: cfg.tabela, registroId: novoId, descricao: `${cfg.rotulo} "${cfg.descricao(dados)}" criado(a)`, ip });
        return novoId;
      });
      return obter(id);
    },

    async atualizar(id, dados, ator, ip) {
      await transacao(async (conn) => {
        const atual = await repo.obter(conn, id, true);
        if (!atual) throw AppError.naoEncontrado(`${cfg.rotulo} não encontrado(a).`);
        await repo.atualizar(conn, id, dados);
        await registrarAuditoria(conn, { usuarioId: ator.id, acao: 'ALTERAR', tabela: cfg.tabela, registroId: Number(id), descricao: `${cfg.rotulo} "${cfg.descricao(atual)}" alterado(a) para "${cfg.descricao(dados)}"`, ip });
      });
      return obter(id);
    },

    async alterarStatus(id, ativo, ator, ip) {
      await transacao(async (conn) => {
        const atual = await repo.obter(conn, id, true);
        if (!atual) throw AppError.naoEncontrado(`${cfg.rotulo} não encontrado(a).`);
        await repo.alterarStatus(conn, id, ativo);
        await registrarAuditoria(conn, { usuarioId: ator.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', tabela: cfg.tabela, registroId: Number(id), descricao: `${cfg.rotulo} "${cfg.descricao(atual)}"`, ip });
      });
      return obter(id);
    }
  };
}

const servicos = Object.fromEntries(Object.keys(CADASTROS).map((k) => [k, criarServico(k)]));

module.exports = { servicos, CADASTROS };
