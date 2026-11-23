(function () {
  'use strict';
  const { esc } = Util;
  const raiz = document.getElementById('conteudo');
  const MOTIVOS = ['Inventário físico', 'Perda', 'Avaria', 'Vencimento', 'Divergência de conferência', 'Outro'];

  async function iniciar() {
    const pode = App.pode('ajustes.gerenciar');
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-arrow-left-right me-2"></i>Ajustes e estornos</h1>
        ${pode ? '<button class="btn btn-primary" id="btnNovo"><i class="bi bi-plus-lg me-1"></i>Novo ajuste</button>' : ''}
      </div>
      <div class="alert alert-light border small">
        <i class="bi bi-info-circle me-1"></i><strong>Ajustes</strong> corrigem o saldo após inventários, perdas ou avarias e exigem justificativa.
        Para desfazer um documento efetivado (entrada, saída ou ajuste), abra-o e use <strong>Estornar</strong>: o original é preservado e um documento inverso é criado.
      </div>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-3"><label class="form-label">Número</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-3"><label class="form-label">Tipo</label><select class="form-select form-select-sm" name="tipos">
          <option value="AJUSTE_ENTRADA,AJUSTE_SAIDA,ESTORNO_ENTRADA,ESTORNO_SAIDA,ESTORNO_AJUSTE">Ajustes e estornos</option>
          <option value="AJUSTE_ENTRADA,AJUSTE_SAIDA">Somente ajustes</option>
          <option value="ESTORNO_ENTRADA,ESTORNO_SAIDA,ESTORNO_AJUSTE">Somente estornos</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
          <option value="">Todas</option><option value="RASCUNHO">Rascunho</option><option value="EFETIVADO">Efetivado</option><option value="ESTORNADO">Estornado</option></select></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover table-clicavel mb-0">
        <thead>${Documentos.cabecalhoLista}</thead><tbody id="tbLista"></tbody></table></div></div>`;

    const f = document.getElementById('fFiltro');
    f.addEventListener('change', carregar);
    f.addEventListener('input', Util.debounce(carregar, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    if (pode) document.getElementById('btnNovo').addEventListener('click', () => abrirForm(null));
    document.getElementById('tbLista').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (tr) Documentos.abrir(tr.dataset.id, { aoAlterar: carregar, aoEditar: abrirForm });
    });
    await carregar();
  }

  async function carregar() {
    try {
      // Estornos ficam em /api/documentos; ajustes também, então uma única consulta atende aos dois
      const lista = await Api.get('/api/documentos', Util.form(document.getElementById('fFiltro')));
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map(Documentos.linhaLista).join('') : Util.vazio('Nenhum ajuste ou estorno encontrado.', 7);
    } catch (e) { Util.erro(e); }
  }

  async function abrirForm(doc) {
    const natureza = doc ? (doc.tipo === 'AJUSTE_SAIDA' ? 'SAIDA' : 'ENTRADA') : 'SAIDA';
    const { el, fechar } = Modal.abrir({
      titulo: doc ? `Editar ajuste ${esc(doc.numero)}` : 'Novo ajuste de estoque', tamanho: 'xl', estatico: true,
      corpo: `<form id="fAju" class="row g-3" novalidate>
        <div class="col-md-4"><label class="form-label">Natureza do ajuste *</label>
          <div class="btn-group w-100" role="group">
            <input type="radio" class="btn-check" name="natureza" id="natE" value="ENTRADA" ${natureza === 'ENTRADA' ? 'checked' : ''}>
            <label class="btn btn-outline-success" for="natE"><i class="bi bi-plus-circle me-1"></i>Entrada (acréscimo)</label>
            <input type="radio" class="btn-check" name="natureza" id="natS" value="SAIDA" ${natureza === 'SAIDA' ? 'checked' : ''}>
            <label class="btn btn-outline-danger" for="natS"><i class="bi bi-dash-circle me-1"></i>Saída (redução)</label>
          </div></div>
        <div class="col-md-8"><label class="form-label">Justificativa *</label>
          <input class="form-control" name="justificativa" list="motivosAjuste" maxlength="500" required value="${esc(doc ? doc.justificativa : '')}"
            placeholder="Ex.: Inventário físico de novembro — divergência na contagem">
          <datalist id="motivosAjuste">${MOTIVOS.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
        <div class="col-12"><label class="form-label">Observações</label>
          <textarea class="form-control" name="observacoes" rows="2" maxlength="500">${esc(doc ? doc.observacoes : '')}</textarea></div>
        <div class="col-12"><h6 class="mb-2">Mercadorias ajustadas</h6><div id="editorItens"></div></div>
      </form>`,
      rodape: `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button class="btn btn-outline-primary" data-acao="salvar"><i class="bi bi-save me-1"></i>Salvar rascunho</button>
        <button class="btn btn-success" data-acao="efetivar"><i class="bi bi-check2-circle me-1"></i>Salvar e efetivar</button>`
    });
    const editor = await EditorItens.montar(el.querySelector('#editorItens'), { itens: doc ? doc.itens : [] });

    el.querySelector('.modal-footer').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      Util.comBotao(b, async () => {
        const dados = Util.form(el.querySelector('#fAju'));
        if (!dados.justificativa) throw new Error('Informe a justificativa do ajuste.');
        dados.itens = editor.valor();
        const salvo = doc ? await Api.put(`/api/ajustes/${doc.id}`, dados) : await Api.post('/api/ajustes', dados);
        if (b.dataset.acao === 'efetivar') {
          try {
            await Api.post(`/api/ajustes/${salvo.id}/efetivar`);
            Util.toast(`Ajuste ${salvo.numero} efetivado.`);
          } catch (e) {
            Util.toast(`Rascunho ${salvo.numero} salvo, mas não efetivado: ${e.message}`, 'warning');
          }
        } else Util.toast(`Rascunho ${salvo.numero} salvo.`);
        EditorItens._mercadorias = null;
        fechar();
        carregar();
      });
    });
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
