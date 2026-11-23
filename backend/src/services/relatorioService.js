/**
 * Relatórios gerenciais e operacionais (spec 15). Cada relatório devolve
 * uma estrutura neutra { titulo, filtrosAplicados, colunas, linhas, totais }
 * usada tanto pela tela quanto pela exportação em Excel e PDF.
 */
const { query } = require('../config/database');
const AppError = require('../utils/AppError');
const estoqueService = require('./estoqueService');
const { ROTULO } = require('./documentoService');

const fmtData = (d) => (d ? d.split('-').reverse().join('/') : '');
function descreverPeriodo(f) {
  if (f.de && f.ate) return `Período: ${fmtData(f.de)} a ${fmtData(f.ate)}`;
  if (f.de) return `A partir de ${fmtData(f.de)}`;
  if (f.ate) return `Até ${fmtData(f.ate)}`;
  return 'Período: todos';
}
function filtroPeriodo(campo, f, where, params) {
  if (f.de) { where.push(`${campo} >= ?`); params.push(`${f.de} 00:00:00`); }
  if (f.ate) { where.push(`${campo} <= ?`); params.push(`${f.ate} 23:59:59`); }
}
async function nomeDe(tabela, id, campo = 'nome') {
  if (!id) return null;
  const tabelas = { setores: 'setores', fornecedores: 'fornecedores', mercadorias: 'mercadorias', categorias: 'categorias' };
  const [r] = await query(`SELECT ${campo} AS nome FROM ${tabelas[tabela]} WHERE id = ?`, [id]);
  return r ? r.nome : null;
}
const soma = (linhas, campo) => Math.round(linhas.reduce((t, l) => t + Number(l[campo] || 0), 0) * 1000) / 1000;

const RELATORIOS = {
  async estoque(f) {
    const linhas = await estoqueService.posicao({ categoriaId: f.categoriaId, situacao: f.situacao, ativo: f.ativo === undefined ? '1' : f.ativo, q: f.q });
    return {
      titulo: 'Posição atual do estoque',
      filtrosAplicados: [f.categoriaId && `Categoria: ${await nomeDe('categorias', f.categoriaId)}`, f.situacao && `Situação: ${f.situacao}`].filter(Boolean),
      colunas: [
        { chave: 'codigo', titulo: 'Código', largura: 12 },
        { chave: 'descricao', titulo: 'Descrição', largura: 40 },
        { chave: 'categoria_nome', titulo: 'Categoria', largura: 20 },
        { chave: 'unidade_sigla', titulo: 'Un.', largura: 7 },
        { chave: 'quantidade_atual', titulo: 'Saldo', tipo: 'numero', largura: 12 },
        { chave: 'estoque_minimo', titulo: 'Mínimo', tipo: 'numero', largura: 12 },
        { chave: 'situacao_estoque', titulo: 'Situação', largura: 10 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} mercadoria(s)` }
    };
  },

  async 'estoque-minimo'(f) {
    const linhas = (await estoqueService.posicao({ categoriaId: f.categoriaId, situacao: 'BAIXO,ZERADO', ativo: '1' }))
      .map((l) => ({ ...l, necessidade: Math.max(0, Math.round((l.estoque_minimo - l.quantidade_atual) * 1000) / 1000) }));
    return {
      titulo: 'Mercadorias abaixo do estoque mínimo',
      filtrosAplicados: [f.categoriaId && `Categoria: ${await nomeDe('categorias', f.categoriaId)}`].filter(Boolean),
      colunas: [
        { chave: 'codigo', titulo: 'Código', largura: 12 },
        { chave: 'descricao', titulo: 'Descrição', largura: 40 },
        { chave: 'categoria_nome', titulo: 'Categoria', largura: 20 },
        { chave: 'unidade_sigla', titulo: 'Un.', largura: 7 },
        { chave: 'quantidade_atual', titulo: 'Saldo', tipo: 'numero', largura: 12 },
        { chave: 'estoque_minimo', titulo: 'Mínimo', tipo: 'numero', largura: 12 },
        { chave: 'necessidade', titulo: 'Para atingir o mínimo', tipo: 'numero', largura: 14 },
        { chave: 'situacao_estoque', titulo: 'Situação', largura: 10 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} mercadoria(s)` }
    };
  },

  async entradas(f) {
    const where = ["d.tipo = 'ENTRADA'", "d.status IN ('EFETIVADO','ESTORNADO')"];
    const params = [];
    filtroPeriodo('d.data_movimentacao', f, where, params);
    if (f.fornecedorId) { where.push('d.fornecedor_id = ?'); params.push(f.fornecedorId); }
    if (f.mercadoriaId) { where.push('i.mercadoria_id = ?'); params.push(f.mercadoriaId); }
    const linhas = await query(
      `SELECT d.data_movimentacao, d.numero, CONCAT_WS(' ', d.tipo_documento_referencia, d.documento_referencia) AS referencia,
              f.nome AS fornecedor_nome, m.codigo, m.descricao, u.sigla AS unidade_sigla, i.quantidade,
              CASE d.status WHEN 'ESTORNADO' THEN 'Estornada' ELSE 'Efetivada' END AS situacao
         FROM documento_itens i
         JOIN documentos_estoque d ON d.id = i.documento_id
         JOIN mercadorias m ON m.id = i.mercadoria_id
         JOIN unidades_medida u ON u.id = i.unidade_medida_id
         LEFT JOIN fornecedores f ON f.id = d.fornecedor_id
        WHERE ${where.join(' AND ')} ORDER BY d.data_movimentacao, d.id, m.descricao`, params
    );
    return {
      titulo: 'Entradas por período',
      filtrosAplicados: [descreverPeriodo(f), f.fornecedorId && `Fornecedor: ${await nomeDe('fornecedores', f.fornecedorId)}`, f.mercadoriaId && `Mercadoria: ${await nomeDe('mercadorias', f.mercadoriaId, 'descricao')}`].filter(Boolean),
      colunas: [
        { chave: 'data_movimentacao', titulo: 'Data', tipo: 'data', largura: 11 },
        { chave: 'numero', titulo: 'Documento', largura: 16 },
        { chave: 'referencia', titulo: 'Referência', largura: 16 },
        { chave: 'fornecedor_nome', titulo: 'Fornecedor', largura: 22 },
        { chave: 'codigo', titulo: 'Código', largura: 11 },
        { chave: 'descricao', titulo: 'Mercadoria', largura: 30 },
        { chave: 'unidade_sigla', titulo: 'Un.', largura: 6 },
        { chave: 'quantidade', titulo: 'Quantidade', tipo: 'numero', largura: 11 },
        { chave: 'situacao', titulo: 'Situação', largura: 10 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} item(ns)`, quantidade: f.mercadoriaId ? soma(linhas.filter((l) => l.situacao === 'Efetivada'), 'quantidade') : undefined }
    };
  },

  async saidas(f) {
    const where = ["d.tipo = 'SAIDA'", "d.status IN ('EFETIVADO','ESTORNADO')"];
    const params = [];
    filtroPeriodo('d.efetivado_em', f, where, params);
    if (f.setorId) { where.push('r.setor_id = ?'); params.push(f.setorId); }
    if (f.mercadoriaId) { where.push('i.mercadoria_id = ?'); params.push(f.mercadoriaId); }
    const linhas = await query(
      `SELECT d.efetivado_em, d.numero, r.numero AS requisicao_numero, st.sigla AS setor_sigla,
              m.codigo, m.descricao, u.sigla AS unidade_sigla, i.quantidade, d.recebedor,
              CASE d.status WHEN 'ESTORNADO' THEN 'Estornada' ELSE 'Efetivada' END AS situacao
         FROM documento_itens i
         JOIN documentos_estoque d ON d.id = i.documento_id
         JOIN requisicoes r ON r.id = d.requisicao_id
         JOIN setores st ON st.id = r.setor_id
         JOIN mercadorias m ON m.id = i.mercadoria_id
         JOIN unidades_medida u ON u.id = i.unidade_medida_id
        WHERE ${where.join(' AND ')} ORDER BY d.efetivado_em, d.id, m.descricao`, params
    );
    return {
      titulo: 'Saídas por período',
      filtrosAplicados: [descreverPeriodo(f), f.setorId && `Setor: ${await nomeDe('setores', f.setorId)}`, f.mercadoriaId && `Mercadoria: ${await nomeDe('mercadorias', f.mercadoriaId, 'descricao')}`].filter(Boolean),
      colunas: [
        { chave: 'efetivado_em', titulo: 'Data/hora', tipo: 'datahora', largura: 15 },
        { chave: 'numero', titulo: 'Documento', largura: 16 },
        { chave: 'requisicao_numero', titulo: 'Requisição', largura: 16 },
        { chave: 'setor_sigla', titulo: 'Setor', largura: 10 },
        { chave: 'codigo', titulo: 'Código', largura: 11 },
        { chave: 'descricao', titulo: 'Mercadoria', largura: 30 },
        { chave: 'unidade_sigla', titulo: 'Un.', largura: 6 },
        { chave: 'quantidade', titulo: 'Quantidade', tipo: 'numero', largura: 11 },
        { chave: 'recebedor', titulo: 'Recebido por', largura: 16 },
        { chave: 'situacao', titulo: 'Situação', largura: 10 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} item(ns)`, quantidade: f.mercadoriaId ? soma(linhas.filter((l) => l.situacao === 'Efetivada'), 'quantidade') : undefined }
    };
  },

  async 'consumo-setor'(f) {
    // Saídas estornadas não contam como consumo
    const where = ["d.tipo = 'SAIDA'", "d.status = 'EFETIVADO'"];
    const params = [];
    filtroPeriodo('d.efetivado_em', f, where, params);
    if (f.setorId) { where.push('r.setor_id = ?'); params.push(f.setorId); }
    if (f.categoriaId) { where.push('m.categoria_id = ?'); params.push(f.categoriaId); }
    const linhas = await query(
      `SELECT st.sigla AS setor_sigla, st.nome AS setor_nome, m.codigo, m.descricao, u.sigla AS unidade_sigla,
              SUM(i.quantidade) AS quantidade, COUNT(DISTINCT d.id) AS entregas
         FROM documento_itens i
         JOIN documentos_estoque d ON d.id = i.documento_id
         JOIN requisicoes r ON r.id = d.requisicao_id
         JOIN setores st ON st.id = r.setor_id
         JOIN mercadorias m ON m.id = i.mercadoria_id
         JOIN unidades_medida u ON u.id = m.unidade_id
        WHERE ${where.join(' AND ')}
        GROUP BY st.id, st.sigla, st.nome, m.id, m.codigo, m.descricao, u.sigla
        ORDER BY st.nome, m.descricao`, params
    );
    return {
      titulo: 'Consumo por setor',
      filtrosAplicados: [descreverPeriodo(f), f.setorId && `Setor: ${await nomeDe('setores', f.setorId)}`, f.categoriaId && `Categoria: ${await nomeDe('categorias', f.categoriaId)}`].filter(Boolean),
      colunas: [
        { chave: 'setor_sigla', titulo: 'Sigla', largura: 10 },
        { chave: 'setor_nome', titulo: 'Setor', largura: 26 },
        { chave: 'codigo', titulo: 'Código', largura: 12 },
        { chave: 'descricao', titulo: 'Mercadoria', largura: 36 },
        { chave: 'unidade_sigla', titulo: 'Un.', largura: 7 },
        { chave: 'quantidade', titulo: 'Quantidade', tipo: 'numero', largura: 12 },
        { chave: 'entregas', titulo: 'Entregas', tipo: 'inteiro', largura: 9 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} linha(s)` }
    };
  },

  async extrato(f) {
    if (!f.mercadoriaId) throw AppError.regra('Selecione a mercadoria do extrato.');
    const { mercadoria, movimentos } = await estoqueService.extrato(f.mercadoriaId, f);
    const linhas = movimentos.map((m) => ({ ...m, tipo_rotulo: ROTULO[m.tipo] + (m.status === 'ESTORNADO' ? ' (estornada)' : '') }));
    return {
      titulo: `Extrato de movimentações - ${mercadoria.codigo} - ${mercadoria.descricao}`,
      filtrosAplicados: [descreverPeriodo(f), `Unidade: ${mercadoria.unidade_sigla}`, `Saldo atual: ${mercadoria.quantidade_atual}`],
      colunas: [
        { chave: 'data_hora', titulo: 'Data/hora', tipo: 'datahora', largura: 15 },
        { chave: 'numero', titulo: 'Documento', largura: 16 },
        { chave: 'tipo_rotulo', titulo: 'Tipo', largura: 18 },
        { chave: 'referencia', titulo: 'Referência', largura: 16 },
        { chave: 'origem_destino', titulo: 'Origem / destino', largura: 32 },
        { chave: 'quantidade_entrada', titulo: 'Entrada', tipo: 'numero', largura: 10 },
        { chave: 'quantidade_saida', titulo: 'Saída', tipo: 'numero', largura: 10 },
        { chave: 'saldo_apos', titulo: 'Saldo', tipo: 'numero', largura: 10 },
        { chave: 'usuario_nome', titulo: 'Responsável', largura: 18 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} movimento(s)`, quantidade_entrada: soma(linhas, 'quantidade_entrada'), quantidade_saida: soma(linhas, 'quantidade_saida') }
    };
  },

  async requisicoes(f) {
    const where = [];
    const params = [];
    filtroPeriodo('r.data_requisicao', f, where, params);
    if (f.status) { const l = String(f.status).split(','); where.push(`r.status IN (${l.map(() => '?').join(',')})`); params.push(...l); }
    if (f.setorId) { where.push('r.setor_id = ?'); params.push(f.setorId); }
    const linhas = await query(
      `SELECT r.numero, r.data_requisicao, st.sigla AS setor_sigla, u.nome AS usuario_nome, r.status,
              (SELECT COUNT(*) FROM requisicao_itens ri WHERE ri.requisicao_id = r.id) AS itens,
              ua.nome AS aprovado_por_nome, r.aprovado_em, r.motivo_finalizacao
         FROM requisicoes r
         JOIN setores st ON st.id = r.setor_id
         JOIN usuarios u ON u.id = r.usuario_id
         LEFT JOIN usuarios ua ON ua.id = r.aprovado_por
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.data_requisicao, r.id`, params
    );
    const porStatus = linhas.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});
    return {
      titulo: 'Requisições por situação',
      filtrosAplicados: [descreverPeriodo(f), f.status && `Situação: ${f.status}`, f.setorId && `Setor: ${await nomeDe('setores', f.setorId)}`].filter(Boolean),
      colunas: [
        { chave: 'numero', titulo: 'Número', largura: 16 },
        { chave: 'data_requisicao', titulo: 'Data/hora', tipo: 'datahora', largura: 15 },
        { chave: 'setor_sigla', titulo: 'Setor', largura: 10 },
        { chave: 'usuario_nome', titulo: 'Solicitante', largura: 22 },
        { chave: 'status', titulo: 'Situação', largura: 11 },
        { chave: 'itens', titulo: 'Itens', tipo: 'inteiro', largura: 7 },
        { chave: 'aprovado_por_nome', titulo: 'Aprovado por', largura: 20 },
        { chave: 'motivo_finalizacao', titulo: 'Motivo (rejeição/cancelamento/encerramento)', largura: 32 }
      ],
      linhas,
      totais: { descricao: `${linhas.length} requisição(ões) — ` + Object.entries(porStatus).map(([s, n]) => `${s}: ${n}`).join(', ') }
    };
  }
};

async function gerar(tipo, filtros) {
  const fn = RELATORIOS[tipo];
  if (!fn) throw AppError.naoEncontrado('Relatório não encontrado.');
  return fn(filtros);
}

module.exports = { gerar, TIPOS: Object.keys(RELATORIOS) };
