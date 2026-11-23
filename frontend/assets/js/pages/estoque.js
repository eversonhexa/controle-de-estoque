(function () {
  'use strict';
  const { esc, qtd, dataHora, badge } = Util;
  const raiz = document.getElementById('conteudo');

  async function iniciar() {
    const sit = Util.param('situacao') || '';
    const ativoParam = Util.param('ativo');
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-clipboard-data me-2"></i>Posição do estoque</h1>
        ${App.pode('relatorios.consultar') ? `<div class="btn-group no-print">
          <a class="btn btn-outline-success btn-sm" id="btnXlsx"><i class="bi bi-file-earmark-excel me-1"></i>Excel</a>
          <a class="btn btn-outline-danger btn-sm" id="btnPdf"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</a></div>` : ''}
      </div>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-6 col-md-2"><label class="form-label">Código</label><input class="form-control form-control-sm" name="codigo"></div>
        <div class="col-6 col-md-3"><label class="form-label">Descrição</label><input class="form-control form-control-sm" name="descricao"></div>
        <div class="col-6 col-md-3"><label class="form-label">Categoria</label><select class="form-select form-select-sm" name="categoriaId" id="filtroCat"></select></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação do estoque</label><select class="form-select form-select-sm" name="situacao">
          <option value="">Todas</option><option value="NORMAL">Normal</option><option value="BAIXO">Baixo (≤ mínimo)</option>
          <option value="ZERADO">Sem estoque</option><option value="BAIXO,ZERADO">Baixo ou sem estoque</option><option value="NORMAL,BAIXO">Com saldo</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label">Cadastro</label><select class="form-select form-select-sm" name="ativo">
          <option value="1">Ativas</option><option value="0">Inativas</option><option value="">Todas</option></select></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover mb-0">
        <thead><tr><th>Código</th><th>Descrição</th><th>Categoria</th><th>Un.</th><th class="num">Quantidade atual</th><th class="num">Estoque mínimo</th>
          <th>Situação</th><th>Última movimentação</th><th></th></tr></thead>
        <tbody id="tbLista"></tbody></table></div><div class="card-footer bg-white small text-muted" id="rodape"></div></div>`;

    const f = document.getElementById('fFiltro');
    f.situacao.value = sit;
    if (ativoParam !== null) f.ativo.value = ativoParam;
    const cats = await Api.get('/api/categorias');
    document.getElementById('filtroCat').innerHTML = Util.opcoes(cats, 'id', 'nome', '', 'Todas');
    f.addEventListener('change', carregar);
    f.addEventListener('input', Util.debounce(carregar, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    await carregar();
  }

  async function carregar() {
    const filtros = Util.form(document.getElementById('fFiltro'));
    try {
      const lista = await Api.get('/api/estoque', filtros);
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map((m) => `
        <tr class="${m.ativo ? '' : 'text-muted'}"><td><strong>${esc(m.codigo)}</strong></td><td>${esc(m.descricao)}${m.ativo ? '' : ' <span class="badge text-bg-secondary">inativa</span>'}</td>
          <td>${esc(m.categoria_nome)}</td><td>${esc(m.unidade_sigla)}</td>
          <td class="num fw-semibold">${qtd(m.quantidade_atual)}</td><td class="num">${qtd(m.estoque_minimo)}</td>
          <td>${badge(m.situacao_estoque)}</td><td class="small">${dataHora(m.atualizado_em)}</td>
          <td class="text-end"><a class="btn btn-sm btn-outline-secondary" href="/pages/extrato.html?mercadoria=${m.mercadoria_id}" title="Extrato"><i class="bi bi-list-columns-reverse"></i></a></td></tr>`).join('')
        : Util.vazio('Nenhuma mercadoria encontrada.', 9);
      document.getElementById('rodape').textContent = `${lista.length} mercadoria(s)`;
      const q = Util.qs({ q: [filtros.codigo, filtros.descricao].filter(Boolean).join(' ') || undefined, categoriaId: filtros.categoriaId, situacao: filtros.situacao, ativo: filtros.ativo });
      const x = document.getElementById('btnXlsx');
      if (x) {
        x.href = `/api/relatorios/estoque${q}${q ? '&' : '?'}formato=xlsx`;
        document.getElementById('btnPdf').href = `/api/relatorios/estoque${q}${q ? '&' : '?'}formato=pdf`;
      }
    } catch (e) { Util.erro(e); }
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
