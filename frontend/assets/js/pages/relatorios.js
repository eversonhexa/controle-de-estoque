(function () {
  'use strict';
  const { esc, qtd, data, dataHora } = Util;
  const raiz = document.getElementById('conteudo');

  // Filtros disponíveis por relatório
  const RELATORIOS = {
    estoque: { titulo: 'Estoque atual', filtros: ['categoria', 'situacao'] },
    entradas: { titulo: 'Entradas por período', filtros: ['periodo', 'fornecedor', 'mercadoria'] },
    saidas: { titulo: 'Saídas por período', filtros: ['periodo', 'setor', 'mercadoria'] },
    'consumo-setor': { titulo: 'Consumo por setor', filtros: ['periodo', 'setor', 'categoria'] },
    'estoque-minimo': { titulo: 'Estoque mínimo', filtros: ['categoria'] },
    requisicoes: { titulo: 'Requisições por situação', filtros: ['periodo', 'status', 'setor'] },
    extrato: { titulo: 'Extrato por mercadoria', filtros: ['mercadoriaObrigatoria', 'periodo'] }
  };

  let tipo = RELATORIOS[Util.param('r')] ? Util.param('r') : 'estoque';
  document.body.dataset.pagina = `rel-${tipo}`;
  const listas = {};

  function primeiroDiaMes() { const h = Util.hojeISO(); return h.slice(0, 8) + '01'; }

  function htmlFiltros() {
    const f = RELATORIOS[tipo].filtros;
    const partes = [];
    if (f.includes('periodo')) {
      partes.push(`<div class="col-6 col-md-2"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de" value="${primeiroDiaMes()}"></div>`);
      partes.push(`<div class="col-6 col-md-2"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate" value="${Util.hojeISO()}"></div>`);
    }
    if (f.includes('categoria')) partes.push(`<div class="col-6 col-md-3"><label class="form-label">Categoria</label><select class="form-select form-select-sm" name="categoriaId">${Util.opcoes(listas.categorias, 'id', 'nome', '', 'Todas')}</select></div>`);
    if (f.includes('setor')) partes.push(`<div class="col-6 col-md-3"><label class="form-label">Setor</label><select class="form-select form-select-sm" name="setorId">${Util.opcoes(listas.setores, 'id', (s) => `${s.sigla} - ${s.nome}`, '', 'Todos')}</select></div>`);
    if (f.includes('fornecedor')) partes.push(`<div class="col-6 col-md-3"><label class="form-label">Fornecedor</label><select class="form-select form-select-sm" name="fornecedorId">${Util.opcoes(listas.fornecedores, 'id', 'nome', '', 'Todos')}</select></div>`);
    if (f.includes('mercadoria') || f.includes('mercadoriaObrigatoria')) {
      partes.push(`<div class="col-12 col-md-4"><label class="form-label">Mercadoria${f.includes('mercadoriaObrigatoria') ? ' *' : ''}</label>
        <select class="form-select form-select-sm" name="mercadoriaId">${Util.opcoes(listas.mercadorias, 'id', (m) => `${m.codigo} - ${m.descricao}`, '', f.includes('mercadoriaObrigatoria') ? 'Selecione...' : 'Todas')}</select></div>`);
    }
    if (f.includes('situacao')) partes.push(`<div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="situacao">
      <option value="">Todas</option><option value="NORMAL">Normal</option><option value="BAIXO">Baixo</option><option value="ZERADO">Zerado</option></select></div>`);
    if (f.includes('status')) partes.push(`<div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
      <option value="">Todas</option>${['PENDENTE', 'APROVADA', 'PARCIAL', 'ATENDIDA', 'REJEITADA', 'CANCELADA', 'ENCERRADA'].map((s) => `<option>${s}</option>`).join('')}</select></div>`);
    return partes.join('');
  }

  async function iniciar() {
    [listas.categorias, listas.setores, listas.fornecedores, listas.mercadorias] = await Promise.all([
      Api.get('/api/categorias'), Api.get('/api/setores'), Api.get('/api/fornecedores'), Api.get('/api/mercadorias')
    ]);
    raiz.innerHTML = `
      <h1 class="titulo-pagina mb-3"><i class="bi bi-file-earmark-bar-graph me-2"></i>Relatórios</h1>
      <ul class="nav nav-pills mb-3 small flex-nowrap overflow-auto no-print" id="abas">
        ${Object.entries(RELATORIOS).map(([k, r]) => `<li class="nav-item"><a class="nav-link text-nowrap ${k === tipo ? 'active' : ''}" href="?r=${k}">${esc(r.titulo)}</a></li>`).join('')}
      </ul>
      <div class="card mb-3 no-print"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        ${htmlFiltros()}
        <div class="col-12 col-md-auto ms-md-auto d-flex gap-2">
          <button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-play-fill me-1"></i>Gerar</button>
          <button class="btn btn-outline-success btn-sm" type="button" data-formato="xlsx"><i class="bi bi-file-earmark-excel me-1"></i>Excel</button>
          <button class="btn btn-outline-danger btn-sm" type="button" data-formato="pdf"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
        </div>
      </form></div></div>
      <div id="resultado"></div>`;

    const f = document.getElementById('fFiltro');
    f.addEventListener('submit', (e) => { e.preventDefault(); gerar(); });
    f.querySelectorAll('[data-formato]').forEach((b) => b.addEventListener('click', () => {
      const filtros = Util.form(f);
      if (tipo === 'extrato' && !filtros.mercadoriaId) { Util.toast('Selecione a mercadoria.', 'warning'); return; }
      // Download direto (GET autenticado pelo cookie de sessão)
      location.href = `/api/relatorios/${tipo}${Util.qs({ ...filtros, formato: b.dataset.formato })}`;
    }));
    if (tipo !== 'extrato') gerar();
  }

  function celula(valor, col) {
    if (col.tipo === 'numero') return `<td class="num">${qtd(valor)}</td>`;
    if (col.tipo === 'inteiro') return `<td class="num">${esc(valor)}</td>`;
    if (col.tipo === 'data') return `<td>${data(valor)}</td>`;
    if (col.tipo === 'datahora') return `<td class="text-nowrap">${dataHora(valor)}</td>`;
    return `<td>${esc(valor)}</td>`;
  }

  async function gerar() {
    const filtros = Util.form(document.getElementById('fFiltro'));
    if (tipo === 'extrato' && !filtros.mercadoriaId) { Util.toast('Selecione a mercadoria.', 'warning'); return; }
    const area = document.getElementById('resultado');
    area.innerHTML = '<div class="text-muted"><span class="spinner-border spinner-border-sm me-1"></span>Gerando...</div>';
    try {
      const rel = await Api.get(`/api/relatorios/${tipo}`, filtros);
      const totais = rel.totais ? `<tr class="fw-semibold table-light">${rel.colunas.map((c, i) => (i === 0 ? `<td colspan="1">${esc(rel.totais.descricao)}</td>` : (rel.totais[c.chave] !== undefined ? celula(rel.totais[c.chave], c) : '<td></td>'))).join('')}</tr>` : '';
      area.innerHTML = `
        <div class="card"><div class="card-header bg-white"><div class="fw-semibold">${esc(rel.titulo)}</div>
          <div class="small text-muted">${rel.filtrosAplicados.map(esc).join(' · ')}</div></div>
        <div class="table-responsive"><table class="table table-sm table-striped mb-0">
          <thead><tr>${rel.colunas.map((c) => `<th class="${['numero', 'inteiro'].includes(c.tipo) ? 'num' : ''}">${esc(c.titulo)}</th>`).join('')}</tr></thead>
          <tbody>${rel.linhas.length ? rel.linhas.map((l) => `<tr>${rel.colunas.map((c) => celula(l[c.chave], c)).join('')}</tr>`).join('') : Util.vazio('Nenhum registro para os filtros informados.', rel.colunas.length)}</tbody>
          <tfoot>${totais}</tfoot></table></div></div>`;
    } catch (e) { area.innerHTML = ''; Util.erro(e); }
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
