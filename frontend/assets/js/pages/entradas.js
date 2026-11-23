(function () {
  'use strict';
  const { esc } = Util;
  const raiz = document.getElementById('conteudo');
  const TIPOS_REF = ['NF-e', 'Nota fiscal', 'Recibo', 'Doação', 'Transferência', 'Outro'];
  let fornecedores = [];

  async function iniciar() {
    const pode = App.pode('entradas.gerenciar');
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-box-arrow-in-down me-2"></i>Entrada de mercadorias</h1>
        ${pode ? '<button class="btn btn-primary" id="btnNova"><i class="bi bi-plus-lg me-1"></i>Nova entrada</button>' : ''}
      </div>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-4"><label class="form-label">Número, NF ou referência</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
          <option value="">Todas</option><option value="RASCUNHO">Rascunho</option><option value="EFETIVADO">Efetivada</option><option value="ESTORNADO">Estornada</option></select></div>
        <div class="col-6 col-md-3"><label class="form-label">Fornecedor</label><select class="form-select form-select-sm" name="fornecedorId" id="filtroForn"></select></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover table-clicavel mb-0">
        <thead>${Documentos.cabecalhoLista}</thead><tbody id="tbLista"></tbody></table></div></div>`;

    fornecedores = await Api.get('/api/fornecedores');
    document.getElementById('filtroForn').innerHTML = Util.opcoes(fornecedores, 'id', 'nome', '', 'Todos');
    const f = document.getElementById('fFiltro');
    f.addEventListener('change', carregar);
    f.addEventListener('input', Util.debounce(carregar, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    if (pode) document.getElementById('btnNova').addEventListener('click', () => abrirForm(null));
    document.getElementById('tbLista').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (tr) Documentos.abrir(tr.dataset.id, { aoAlterar: carregar, aoEditar: abrirForm });
    });
    await carregar();
    if (Util.param('id')) Documentos.abrir(Util.param('id'), { aoAlterar: carregar, aoEditar: abrirForm });
  }

  async function carregar() {
    try {
      const lista = await Api.get('/api/entradas', Util.form(document.getElementById('fFiltro')));
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map(Documentos.linhaLista).join('') : Util.vazio('Nenhuma entrada encontrada.', 7);
    } catch (e) { Util.erro(e); }
  }

  async function abrirForm(doc) {
    const ativos = fornecedores.filter((x) => x.ativo || (doc && x.id === doc.fornecedor_id));
    const { el, fechar } = Modal.abrir({
      titulo: doc ? `Editar entrada ${esc(doc.numero)}` : 'Nova entrada de mercadorias', tamanho: 'xl', estatico: true,
      corpo: `<form id="fEnt" class="row g-3" novalidate>
        <div class="col-6 col-md-3"><label class="form-label">Data da entrada *</label>
          <input type="date" class="form-control" name="data_movimentacao" required max="${Util.hojeISO()}" value="${esc(doc ? String(doc.data_movimentacao).slice(0, 10) : Util.hojeISO())}"></div>
        <div class="col-6 col-md-3"><label class="form-label">Tipo de documento</label>
          <select class="form-select" name="tipo_documento_referencia">${Util.opcoes(TIPOS_REF.map((t) => ({ t })), 't', 't', doc ? doc.tipo_documento_referencia : 'NF-e', '—')}</select></div>
        <div class="col-6 col-md-3"><label class="form-label">Número do documento</label>
          <input class="form-control" name="documento_referencia" maxlength="60" value="${esc(doc ? doc.documento_referencia : '')}"></div>
        <div class="col-6 col-md-3"><label class="form-label">Fornecedor</label>
          <select class="form-select" name="fornecedor_id">${Util.opcoes(ativos, 'id', 'nome', doc ? doc.fornecedor_id : '', 'Não informado')}</select></div>
        <div class="col-12"><label class="form-label">Observações</label>
          <textarea class="form-control" name="observacoes" rows="2" maxlength="500">${esc(doc ? doc.observacoes : '')}</textarea></div>
        <div class="col-12"><h6 class="mb-2">Itens recebidos</h6><div id="editorItens"></div></div>
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
        const dados = Util.form(el.querySelector('#fEnt'));
        if (!dados.data_movimentacao) throw new Error('Informe a data da entrada.');
        dados.itens = editor.valor();
        dados.fornecedor_id = dados.fornecedor_id || null;
        const salvo = doc ? await Api.put(`/api/entradas/${doc.id}`, dados) : await Api.post('/api/entradas', dados);
        if (b.dataset.acao === 'efetivar') {
          try {
            await Api.post(`/api/entradas/${salvo.id}/efetivar`);
            Util.toast(`Entrada ${salvo.numero} efetivada. Saldos atualizados.`);
          } catch (e) {
            Util.toast(`Rascunho ${salvo.numero} salvo, mas não efetivado: ${e.message}`, 'warning');
          }
        } else {
          Util.toast(`Rascunho ${salvo.numero} salvo.`);
        }
        EditorItens._mercadorias = null;
        fechar();
        carregar();
      });
    });
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
