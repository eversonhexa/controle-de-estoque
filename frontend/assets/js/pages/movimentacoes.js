(function () {
  'use strict';
  const raiz = document.getElementById('conteudo');

  async function iniciar() {
    raiz.innerHTML = `
      <h1 class="titulo-pagina mb-3"><i class="bi bi-journal-text me-2"></i>Histórico de entradas e saídas</h1>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-3"><label class="form-label">Número, NF ou requisição</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-3"><label class="form-label">Tipo</label><select class="form-select form-select-sm" name="tipos">
          <option value="">Todos</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Saídas</option>
          <option value="AJUSTE_ENTRADA,AJUSTE_SAIDA">Ajustes</option><option value="ESTORNO_ENTRADA,ESTORNO_SAIDA,ESTORNO_AJUSTE">Estornos</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
          <option value="">Todas</option><option value="EFETIVADO">Efetivado</option><option value="ESTORNADO">Estornado</option><option value="RASCUNHO">Rascunho</option></select></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover table-clicavel mb-0">
        <thead>${Documentos.cabecalhoLista}</thead><tbody id="tbLista"></tbody></table></div>
        <div class="card-footer bg-white small text-muted" id="rodape"></div></div>`;
    const f = document.getElementById('fFiltro');
    f.addEventListener('change', carregar);
    f.addEventListener('input', Util.debounce(carregar, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('tbLista').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (tr) Documentos.abrir(tr.dataset.id, { aoAlterar: carregar });
    });
    await carregar();
  }

  async function carregar() {
    try {
      const lista = await Api.get('/api/documentos', Util.form(document.getElementById('fFiltro')));
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map(Documentos.linhaLista).join('') : Util.vazio('Nenhum documento encontrado.', 7);
      document.getElementById('rodape').textContent = `${lista.length} documento(s)${lista.length >= 500 ? ' — exibindo os 500 mais recentes; refine os filtros' : ''}`;
    } catch (e) { Util.erro(e); }
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
