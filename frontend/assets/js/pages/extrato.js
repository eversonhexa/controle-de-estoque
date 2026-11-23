(function () {
  'use strict';
  const { esc, qtd, dataHora, badge, tipoDoc } = Util;
  const raiz = document.getElementById('conteudo');
  let mercadorias = [];

  async function iniciar() {
    mercadorias = await Api.get('/api/mercadorias');
    raiz.innerHTML = `
      <h1 class="titulo-pagina mb-3"><i class="bi bi-list-columns-reverse me-2"></i>Extrato de movimentações</h1>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-6"><label class="form-label">Mercadoria</label>
          <input class="form-control form-control-sm" id="campoMerc" list="listaMerc" placeholder="Digite código ou descrição" autocomplete="off">
          <datalist id="listaMerc">${mercadorias.map((m) => `<option value="${esc(`${m.codigo} - ${m.descricao}`)}">`).join('')}</datalist></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
        <div class="col-12 col-md-auto ms-md-auto no-print" id="areaExport"></div>
      </form></div></div>
      <div id="resultado"><div class="card"><div class="card-body vazio"><i class="bi bi-search"></i>Selecione uma mercadoria para consultar o histórico.</div></div></div>`;

    const campo = document.getElementById('campoMerc');
    const f = document.getElementById('fFiltro');
    const idInicial = Number(Util.param('mercadoria'));
    if (idInicial) {
      const m = mercadorias.find((x) => x.id === idInicial);
      if (m) campo.value = `${m.codigo} - ${m.descricao}`;
    }
    f.addEventListener('change', carregar);
    f.addEventListener('submit', (e) => { e.preventDefault(); carregar(); });
    if (idInicial) carregar();
  }

  function mercadoriaSelecionada() {
    const v = document.getElementById('campoMerc').value;
    return mercadorias.find((m) => `${m.codigo} - ${m.descricao}` === v);
  }

  async function carregar() {
    const m = mercadoriaSelecionada();
    const area = document.getElementById('resultado');
    if (!m) return;
    const filtros = Util.form(document.getElementById('fFiltro'));
    history.replaceState(null, '', `?mercadoria=${m.id}`);
    try {
      const { mercadoria: s, movimentos } = await Api.get(`/api/estoque/${m.id}/extrato`, filtros);
      const base = `/api/relatorios/extrato${Util.qs({ mercadoriaId: m.id, de: filtros.de, ate: filtros.ate })}`;
      document.getElementById('areaExport').innerHTML = App.pode('relatorios.consultar') ? `<div class="btn-group">
        <a class="btn btn-outline-success btn-sm" href="${base}&formato=xlsx"><i class="bi bi-file-earmark-excel me-1"></i>Excel</a>
        <a class="btn btn-outline-danger btn-sm" href="${base}&formato=pdf"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</a></div>` : '';
      area.innerHTML = `
        <div class="row g-3 mb-3">
          <div class="col-md-6"><div class="card h-100"><div class="card-body">
            <div class="text-muted small">${esc(s.codigo)} · ${esc(s.categoria_nome)}</div>
            <div class="fs-5 fw-semibold">${esc(s.descricao)}</div>
            <div class="small">${s.ativo ? '' : '<span class="badge text-bg-secondary">inativa</span>'}</div></div></div></div>
          <div class="col-6 col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Saldo atual</div>
            <div class="fs-4 fw-bold">${qtd(s.quantidade_atual)} <small class="fs-6 text-muted">${esc(s.unidade_sigla)}</small></div></div></div></div>
          <div class="col-6 col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Mínimo / situação</div>
            <div class="fs-5">${qtd(s.estoque_minimo)} ${badge(s.situacao_estoque)}</div></div></div></div>
        </div>
        <div class="card"><div class="table-responsive"><table class="table table-sm table-hover mb-0">
          <thead><tr><th>Data/hora</th><th>Documento</th><th>Tipo</th><th>Referência</th><th>Origem / destino</th>
            <th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th><th>Responsável</th></tr></thead>
          <tbody>${movimentos.length ? movimentos.map((x) => `<tr class="${x.status === 'ESTORNADO' ? 'text-decoration-line-through text-muted' : ''}">
            <td class="text-nowrap">${dataHora(x.data_hora)}</td><td><strong>${esc(x.numero)}</strong></td>
            <td>${esc(tipoDoc(x.tipo))}${x.status === 'ESTORNADO' ? ' <span class="badge text-bg-secondary">estornado</span>' : ''}</td>
            <td class="small">${esc(x.referencia)}</td><td class="small">${esc(x.origem_destino)}</td>
            <td class="num text-success">${x.quantidade_entrada ? qtd(x.quantidade_entrada) : ''}</td>
            <td class="num text-danger">${x.quantidade_saida ? qtd(x.quantidade_saida) : ''}</td>
            <td class="num fw-semibold">${qtd(x.saldo_apos)}</td><td class="small">${esc(x.usuario_nome)}</td></tr>`).join('')
            : Util.vazio('Nenhuma movimentação no período.', 9)}</tbody></table></div></div>
        <p class="small text-muted mt-2">Documentos estornados aparecem riscados: o movimento original é mantido no histórico e o estorno aparece como movimento inverso.</p>`;
    } catch (e) { Util.erro(e); }
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
