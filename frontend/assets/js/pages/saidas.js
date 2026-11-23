(function () {
  'use strict';
  const { esc, qtd } = Util;
  const raiz = document.getElementById('conteudo');

  async function iniciar() {
    const pode = App.pode('saidas.gerenciar');
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-box-arrow-up me-2"></i>Saída de mercadorias</h1>
        ${pode ? '<button class="btn btn-primary" id="btnNova"><i class="bi bi-plus-lg me-1"></i>Nova saída</button>' : ''}
      </div>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-4"><label class="form-label">Número da saída ou requisição</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
          <option value="">Todas</option><option value="RASCUNHO">Rascunho</option><option value="EFETIVADO">Efetivada</option><option value="ESTORNADO">Estornada</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label">Setor</label><select class="form-select form-select-sm" name="setorId" id="filtroSetor"></select></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover table-clicavel mb-0">
        <thead>${Documentos.cabecalhoLista}</thead><tbody id="tbLista"></tbody></table></div></div>`;

    const setores = await Api.get('/api/setores');
    document.getElementById('filtroSetor').innerHTML = Util.opcoes(setores, 'id', 'sigla', '', 'Todos');
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
    if (pode && Util.param('requisicao')) abrirForm(null, Number(Util.param('requisicao')));
  }

  async function carregar() {
    try {
      const lista = await Api.get('/api/saidas', Util.form(document.getElementById('fFiltro')));
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map(Documentos.linhaLista).join('') : Util.vazio('Nenhuma saída encontrada.', 7);
    } catch (e) { Util.erro(e); }
  }

  /**
   * Formulário de saída. A saída sempre parte de uma requisição aprovada (RN03/RN16):
   * o almoxarife vê solicitado, já entregue, pendente e saldo disponível de cada item.
   */
  async function abrirForm(doc, requisicaoInicial) {
    const abertas = doc ? [] : await Api.get('/api/requisicoes', { status: 'APROVADA,PARCIAL' });
    const reqId = doc ? doc.requisicao_id : requisicaoInicial;
    const { el, fechar } = Modal.abrir({
      titulo: doc ? `Editar saída ${esc(doc.numero)}` : 'Nova saída (atendimento de requisição)', tamanho: 'xl', estatico: true,
      corpo: `<form id="fSai" class="row g-3" novalidate>
        <div class="col-md-6"><label class="form-label">Requisição aprovada *</label>
          ${doc ? `<input class="form-control" disabled value="${esc(doc.requisicao_numero)} — ${esc(doc.setor_sigla)}">`
            : `<select class="form-select" id="selReq">${Util.opcoes(abertas, 'id', (r) => `${r.numero} — ${r.setor_sigla} (${r.status})`, reqId, abertas.length ? 'Selecione...' : 'Nenhuma requisição aguardando entrega')}</select>`}
        </div>
        <div class="col-md-6"><label class="form-label">Responsável pelo recebimento</label>
          <input class="form-control" name="recebedor" maxlength="120" value="${esc(doc ? doc.recebedor : '')}" placeholder="Nome de quem recebeu o material"></div>
        <div class="col-12"><label class="form-label">Observações</label>
          <input class="form-control" name="observacoes" maxlength="500" value="${esc(doc ? doc.observacoes : '')}"></div>
        <div class="col-12" id="areaItens"><div class="text-muted small">Selecione a requisição para ver os itens.</div></div>
      </form>`,
      rodape: `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button class="btn btn-outline-primary" data-acao="salvar"><i class="bi bi-save me-1"></i>Salvar rascunho</button>
        <button class="btn btn-success" data-acao="efetivar"><i class="bi bi-check2-circle me-1"></i>Salvar e efetivar entrega</button>`
    });

    let requisicao = null;
    const area = el.querySelector('#areaItens');
    const qtdDoc = new Map(doc ? doc.itens.map((i) => [i.requisicao_item_id, i.quantidade]) : []);

    async function carregarRequisicao(id) {
      requisicao = null;
      if (!id) { area.innerHTML = '<div class="text-muted small">Selecione a requisição para ver os itens.</div>'; return; }
      area.innerHTML = '<div class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Carregando itens...</div>';
      try { requisicao = await Api.get(`/api/requisicoes/${id}`); } catch (e) { Util.erro(e); area.innerHTML = ''; return; }
      const linhas = requisicao.itens.map((i) => {
        const sugerido = doc ? (qtdDoc.get(i.id) || '') : (i.pendente > 0 ? Math.min(i.pendente, i.saldo_disponivel) : '');
        const bloqueado = i.pendente <= 0 || !i.mercadoria_ativa;
        return `<tr data-item="${i.id}">
          <td>${esc(i.codigo)}</td><td>${esc(i.descricao)}${i.mercadoria_ativa ? '' : ' <span class="badge text-bg-secondary">inativa</span>'}</td><td>${esc(i.unidade_sigla)}</td>
          <td class="num">${qtd(i.quantidade_solicitada)}</td><td class="num">${qtd(i.entregue)}</td>
          <td class="num fw-semibold">${qtd(i.pendente)}</td>
          <td class="num ${i.saldo_disponivel < i.pendente ? 'text-danger fw-semibold' : ''}">${qtd(i.saldo_disponivel)}</td>
          <td style="width:130px"><input class="form-control form-control-sm text-end" inputmode="decimal" data-campo="qtd"
            value="${sugerido === '' || sugerido <= 0 ? '' : esc(String(sugerido).replace('.', ','))}" ${bloqueado ? 'disabled' : ''}></td></tr>`;
      }).join('');
      area.innerHTML = `
        <div class="d-flex justify-content-between align-items-end mb-1"><h6 class="mb-0">Itens da requisição ${esc(requisicao.numero)} — ${esc(requisicao.setor_sigla)}</h6>
          <small class="text-muted">Deixe em branco os itens que não serão entregues agora.</small></div>
        <div class="table-responsive"><table class="table table-sm align-middle">
          <thead><tr><th>Código</th><th>Mercadoria</th><th>Un.</th><th class="num">Solicitado</th><th class="num">Já entregue</th>
            <th class="num">Pendente</th><th class="num">Saldo disponível</th><th>Entregar agora</th></tr></thead>
          <tbody>${linhas}</tbody></table></div>
        ${requisicao.itens.some((i) => i.em_rascunho > 0 && !doc) ? '<div class="alert alert-warning small py-2">Há outra saída em rascunho para esta requisição. Confira antes de efetivar.</div>' : ''}`;
    }

    const sel = el.querySelector('#selReq');
    if (sel) sel.addEventListener('change', () => carregarRequisicao(sel.value));
    if (reqId) await carregarRequisicao(reqId);

    el.querySelector('.modal-footer').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      Util.comBotao(b, async () => {
        if (!requisicao) throw new Error('Selecione a requisição.');
        const itens = [];
        area.querySelectorAll('tr[data-item]').forEach((tr) => {
          const campo = tr.querySelector('[data-campo="qtd"]');
          const v = Util.numero(campo.value);
          if (campo.disabled || !v) return;
          if (!(Number(v) > 0)) throw new Error('Quantidades devem ser maiores que zero.');
          itens.push({ requisicao_item_id: Number(tr.dataset.item), quantidade: v });
        });
        if (!itens.length) throw new Error('Informe a quantidade de pelo menos um item.');
        const dados = { ...Util.form(el.querySelector('#fSai')), itens };
        const salvo = doc ? await Api.put(`/api/saidas/${doc.id}`, dados) : await Api.post('/api/saidas', { ...dados, requisicao_id: requisicao.id });
        if (b.dataset.acao === 'efetivar') {
          try {
            await Api.post(`/api/saidas/${salvo.id}/efetivar`);
            Util.toast(`Saída ${salvo.numero} efetivada. Estoque baixado e requisição atualizada.`);
          } catch (e) {
            Util.toast(`Rascunho ${salvo.numero} salvo, mas não efetivado: ${e.message}`, 'warning');
          }
        } else Util.toast(`Rascunho ${salvo.numero} salvo.`);
        fechar();
        carregar();
        if (Util.param('requisicao')) history.replaceState(null, '', location.pathname);
      });
    });
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
