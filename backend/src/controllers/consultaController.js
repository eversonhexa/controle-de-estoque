const dayjs = require('dayjs');
const estoqueService = require('../services/estoqueService');
const relatorioService = require('../services/relatorioService');
const auditoriaService = require('../services/auditoriaService');
const { paraExcel, paraPdf } = require('../utils/exportador');
const { registrarAuditoria } = require('../utils/auditoria');

const estoque = {
  posicao: async (req, res) => res.json(await estoqueService.posicao(req.query)),
  porMercadoria: async (req, res) => res.json(await estoqueService.porMercadoria(req.params.mercadoriaId)),
  extrato: async (req, res) => res.json(await estoqueService.extrato(req.params.mercadoriaId, req.query)),
  dashboard: async (req, res) => res.json(await estoqueService.dashboard(req.usuario))
};

const relatorios = {
  gerar: async (req, res) => {
    const rel = await relatorioService.gerar(req.params.tipo, req.query);
    const formato = req.query.formato;
    if (formato !== 'xlsx' && formato !== 'pdf') return res.json(rel);

    const nome = `${req.params.tipo}_${dayjs().format('YYYYMMDD_HHmm')}.${formato}`;
    const conteudo = formato === 'xlsx' ? await paraExcel(rel, req.usuario) : await paraPdf(rel, req.usuario);
    await registrarAuditoria(null, { usuarioId: req.usuario.id, acao: 'EXPORTAR', tabela: 'relatorios', descricao: `${rel.titulo} (${formato.toUpperCase()})`, ip: req.ip });
    res.set('Content-Type', formato === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(Buffer.from(conteudo));
  }
};

const auditoria = {
  listar: async (req, res) => res.json(await auditoriaService.listar(req.query)),
  acoes: async (req, res) => res.json(await auditoriaService.acoes())
};

module.exports = { estoque, relatorios, auditoria };
