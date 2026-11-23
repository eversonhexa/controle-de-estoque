(function () {
  'use strict';
  const { esc, qtd, dataHora, badge } = Util;
  const raiz = document.getElementById('conteudo');
  const modo = Util.param('modo');
  const STATUS = ['PENDENTE', 'APROVADA', 'PARCIAL', 'ATENDIDA', 'REJEITADA', 'CANCELADA', 'ENCERRADA'];
  const ehSolicitante = () => App.usuario.perfil === 'SOLICITANTE';
  let setores = [];

  document.body.dataset.pagina = modo === 'aprovacao' ? 'aprovacao' : modo === 'historico' ? 'hist-requisicoes' : 'requisicoes';
  if (modo === 'aprovacao') document.body.dataset.permissao = 'requisicoes.analisar';

  async function iniciar() {
    const titulo = modo === 'aprovacao' ? 'Aprovação de requisições' : modo === 'historico' ? 'Histórico de requisições' : 'Requisições';
    const statusInicial = Util.param('status') || (modo === 'aprovacao' ? 'PENDENTE' : '');
    document.title = `${titulo} · Controle de Estoque`;
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-clipboard-check me-2"></i>${esc(titulo)}</h1>
        ${App.pode('requisicoes.criar') ? '<button class="btn btn-primary" id="btnNova"><i class="bi bi-plus-lg me-1"></i>Nova requisição</button>' : ''}
      </div>
      ${ehSolicitante() ? `<p class="text-muted small">Exibindo as requisições do setor <strong>${esc(App.usuario.setorSigla || '—')}</strong>.</p>` : ''}
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-3"><label class="form-label">Número ou observação</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="status">
          <option value="">Todas</option><option value="PENDENTE,APROVADA,PARCIAL">Em aberto</option>
          ${STATUS.map((s) => `<option value="${s}" ${s === statusInicial ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        ${ehSolicitante() ? '' : '<div class="col-6 col-md-3"><label class="form-label">Setor</label><select class="form-select form-select-sm" name="setorId" id="filtroSetor"></select></div>'}
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover table-clicavel mb-0">
        <thead><tr><th>Número</th><th>Data</th><th>Setor</th><th>Solicitante</th><th class="num">Itens</th><th>Situação</th><th>Aprovação</th></tr></thead>
        <tbody id="tbLista"></tbody></table></div><div class="card-footer bg-white small text-muted" id="rodape"></div></div>`;

    if (statusInicial === 'PENDENTE,APROVADA,PARCIAL') document.querySelector('[name="status"]').value = statusInicial;
    setores = await Api.get('/api/setores');
    const fs = document.getElementById('filtroSetor');
    if (fs) fs.innerHTML = Util.opcoes(setores, 'id', (s) => `${s.sigla} - ${s.nome}`, '', 'Todos');

    const f = document.getElementById('fFiltro');
    f.addEventListener('change', carregar);
    f.addEventListener('input', Util.debounce(carregar, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    const btnNova = document.getElementById('btnNova');
    if (btnNova) btnNova.addEventListener('click', () => abrirForm(null));
    document.getElementById('tbLista').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (tr) abrirDetalhe(tr.dataset.id);
    });
    await carregar();
    if (Util.param('id')) abrirDetalhe(Util.param('id'));
    if (Util.param('nova') && btnNova) abrirForm(null);
  }

  async function carregar() {
    try {
      const lista = await Api.get('/api/requisicoes', Util.form(document.getElementById('fFiltro')));
      document.getElementById('tbLista').innerHTML = lista.length ? lista.map((r) => `
        <tr data-id="${r.id}"><td><strong>${esc(r.numero)}</strong></td><td>${dataHora(r.data_requisicao)}</td>
          <td>${esc(r.setor_sigla)}</td><td>${esc(r.usuario_nome)}</td><td class="num">${r.total_itens}</td><td>${badge(r.status)}</td>
          <td class="small">${r.aprovado_por_nome ? `${esc(r.aprovado_por_nome)}<br><span class="text-muted">${dataHora(r.aprovado_em)}</span>` : ''}</td></tr>`).join('')
        : Util.vazio('Nenhuma requisição encontrada.', 7);
      document.getElementById('rodape').textContent = `${lista.length} requisição(ões)`;
    } catch (e) { Util.erro(e); }
  }

  async function abrirForm(req) {
    const setoresAtivos = setores.filter((s) => s.ativo);
    const { el, fechar } = Modal.abrir({
      titulo: req ? `Editar requisição ${esc(req.numero)}` : 'Nova requisição de materiais', tamanho: 'xl', estatico: true,
      corpo: `<form id="fReq" class="row g-3" novalidate>
        <div class="col-md-5"><label class="form-label">Setor solicitante *</label>
          ${ehSolicitante()
            ? `<input class="form-control" disabled value="${esc(App.usuario.setorSigla)} - ${esc(App.usuario.setorNome)}">`
            : `<select class="form-select" name="setor_id" required>${Util.opcoes(setoresAtivos, 'id', (s) => `${s.sigla} - ${s.nome}`, req ? req.setor_id : '')}</select>`}
        </div>
        <div class="col-md-7"><label class="form-label">Observações / justificativa</label>
          <input class="form-control" name="observacoes" maxlength="500" value="${esc(req ? req.observacoes : '')}"></div>
        <div class="col-12"><h6 class="mb-2">Mercadorias solicitadas</h6><div id="editorItens"></div>
          <div class="form-text">O saldo exibido é apenas informativo; a requisição pode ser registrada mesmo sem estoque disponível.</div></div>
      </form>`,
      rodape: `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button class="btn btn-primary" id="btnSalvar"><i class="bi bi-send me-1"></i>${req ? 'Salvar alterações' : 'Enviar requisição'}</button>`
    });
    const editor = await EditorItens.montar(el.querySelector('#editorItens'), {
      itens: req ? req.itens : [], campoQtd: 'quantidade_solicitada', comObservacao: true, mostrarSaldo: !ehSolicitante()
    });
    el.querySelector('#btnSalvar').addEventListener('click', (ev) => Util.comBotao(ev.currentTarget, async () => {
      const dados = Util.form(el.querySelector('#fReq'));
      if (!ehSolicitante() && !dados.setor_id) throw new Error('Selecione o setor solicitante.');
      dados.itens = editor.valor();
      const salvo = req ? await Api.put(`/api/requisicoes/${req.id}`, dados) : await Api.post('/api/requisicoes', dados);
      Util.toast(req ? 'Requisição alterada.' : `Requisição ${salvo.numero} registrada e aguardando análise.`);
      fechar();
      carregar();
    }));
  }

  async function abrirDetalhe(id) {
    let r;
    try { r = await Api.get(`/api/requisicoes/${id}`); } catch (e) { Util.erro(e); return; }

    const analisar = App.pode('requisicoes.analisar');
    const criar = App.pode('requisicoes.criar');
    const atender = App.pode('saidas.gerenciar') && ['APROVADA', 'PARCIAL'].includes(r.status);
    const podeCancelar = criar && (r.status === 'PENDENTE' || (analisar && r.status === 'APROVADA'));

    const info = [
      ['Situação', badge(r.status)],
      ['Setor', `${esc(r.setor_sigla)} - ${esc(r.setor_nome)}`],
      ['Solicitante', `${esc(r.usuario_nome)} <span class="text-muted small">${dataHora(r.data_requisicao)}</span>`],
      r.aprovado_por_nome && ['Aprovada por', `${esc(r.aprovado_por_nome)} <span class="text-muted small">${dataHora(r.aprovado_em)}</span>`],
      r.finalizado_por_nome && [r.status === 'REJEITADA' ? 'Rejeitada por' : r.status === 'ENCERRADA' ? 'Encerrada por' : 'Cancelada por', `${esc(r.finalizado_por_nome)} <span class="text-muted small">${dataHora(r.finalizado_em)}</span>`],
      r.motivo_finalizacao && ['Motivo', esc(r.motivo_finalizacao)],
      r.observacoes && ['Observações', esc(r.observacoes)]
    ].filter(Boolean);

    const corpo = `
      <dl class="row dl-compacto">${info.map(([k, v]) => `<div class="col-md-4"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="table-responsive"><table class="table table-sm">
        <thead><tr><th>Código</th><th>Mercadoria</th><th>Un.</th><th class="num">Solicitado</th><th class="num">Entregue</th><th class="num">Pendente</th>
          ${analisar ? '<th class="num">Saldo disponível</th>' : ''}<th>Observação</th></tr></thead>
        <tbody>${r.itens.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade_sigla)}</td>
          <td class="num">${qtd(i.quantidade_solicitada)}</td><td class="num">${qtd(i.entregue)}</td>
          <td class="num fw-semibold ${i.pendente > 0 ? 'text-warning-emphasis' : 'text-success'}">${qtd(i.pendente)}</td>
          ${analisar ? `<td class="num ${i.saldo_disponivel < i.pendente ? 'text-danger' : ''}">${qtd(i.saldo_disponivel)}</td>` : ''}
          <td class="small">${esc(i.observacoes)}</td></tr>`).join('')}</tbody></table></div>
      ${r.saidas.length ? `<h6 class="mt-3">Documentos de saída vinculados</h6>
        <ul class="list-group list-group-flush small">${r.saidas.map((s) => `<li class="list-group-item d-flex justify-content-between">
          <span><strong>${esc(s.numero)}</strong> — ${esc(Util.tipoDoc(s.tipo))} ${s.recebedor ? '· recebido por ' + esc(s.recebedor) : ''}</span>
          <span>${dataHora(s.efetivado_em || s.data_movimentacao)} ${badge(s.status)}</span></li>`).join('')}</ul>` : ''}`;

    const botoes = [];
    if (podeCancelar) botoes.push('<button class="btn btn-outline-danger me-auto" data-acao="cancelar"><i class="bi bi-x-circle me-1"></i>Cancelar requisição</button>');
    if (r.status === 'PENDENTE' && criar) botoes.push('<button class="btn btn-outline-primary" data-acao="editar"><i class="bi bi-pencil me-1"></i>Editar</button>');
    if (r.status === 'PENDENTE' && analisar) {
      botoes.push('<button class="btn btn-outline-danger" data-acao="rejeitar"><i class="bi bi-hand-thumbs-down me-1"></i>Rejeitar</button>');
      botoes.push('<button class="btn btn-success" data-acao="aprovar"><i class="bi bi-hand-thumbs-up me-1"></i>Aprovar</button>');
    }
    if (r.status === 'PARCIAL' && analisar) botoes.push('<button class="btn btn-outline-dark" data-acao="encerrar"><i class="bi bi-slash-circle me-1"></i>Encerrar pendências</button>');
    if (atender) botoes.push(`<a class="btn btn-primary" href="/pages/saidas.html?requisicao=${r.id}"><i class="bi bi-box-arrow-up me-1"></i>Registrar entrega</a>`);
    botoes.push('<button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>');

    const { el, fechar } = Modal.abrir({ titulo: `Requisição ${esc(r.numero)}`, corpo, rodape: botoes.join(''), tamanho: 'xl' });
    const concluir = (msg) => { Util.toast(msg); fechar(); carregar(); };

    el.querySelector('.modal-footer').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-acao]');
      if (!b) return;
      const acao = b.dataset.acao;
      if (acao === 'editar') { fechar(); abrirForm(r); return; }
      if (acao === 'aprovar') {
        const ok = await Modal.confirmar({ titulo: 'Aprovar requisição', mensagem: `Aprovar a requisição <strong>${esc(r.numero)}</strong>? A aprovação não baixa o estoque; a baixa ocorre nas entregas.`, botao: 'Aprovar', cor: 'success' });
        if (ok) Util.comBotao(b, async () => { await Api.post(`/api/requisicoes/${r.id}/aprovar`); concluir('Requisição aprovada.'); });
        return;
      }
      const textos = {
        rejeitar: ['Rejeitar requisição', 'A requisição será marcada como REJEITADA.', 'Rejeitar'],
        cancelar: ['Cancelar requisição', 'A requisição será marcada como CANCELADA.', 'Cancelar requisição'],
        encerrar: ['Encerrar pendências', 'As quantidades ainda pendentes não serão mais entregues e a requisição será marcada como ENCERRADA.', 'Encerrar']
      }[acao];
      if (!textos) return;
      const motivo = await Modal.confirmar({ titulo: textos[0], mensagem: textos[1], botao: textos[2], cor: 'danger', motivo: true });
      if (motivo) Util.comBotao(b, async () => { await Api.post(`/api/requisicoes/${r.id}/${acao}`, { motivo }); concluir('Requisição atualizada.'); });
    });
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
