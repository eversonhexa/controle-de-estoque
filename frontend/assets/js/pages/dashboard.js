(function () {
  'use strict';
  const { esc, qtd, dataHora, badge } = Util;
  const raiz = document.getElementById('conteudo');

  const card = (titulo, valor, icone, cor, href) => `
    <div class="col-6 col-md-4 col-xl-3">
      <a class="text-decoration-none text-reset" href="${href || '#'}">
      <div class="card card-indicador h-100"><div class="card-body d-flex align-items-center gap-3">
        <div class="icone bg-${cor}-subtle text-${cor}"><i class="bi bi-${icone}"></i></div>
        <div><div class="valor">${esc(valor)}</div><div class="text-muted small">${esc(titulo)}</div></div>
      </div></div></a>
    </div>`;

  function renderSolicitante(d) {
    const r = d.requisicoes || {};
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <h1 class="titulo-pagina">Olá, ${esc(App.usuario.nome.split(' ')[0])}</h1>
        ${App.pode('requisicoes.criar') ? '<a class="btn btn-primary" href="/pages/requisicoes.html?nova=1"><i class="bi bi-plus-lg me-1"></i>Nova requisição</a>' : ''}
      </div>
      <p class="text-muted">Requisições do setor ${esc(App.usuario.setorSigla || '')} — ${esc(App.usuario.setorNome || '')}</p>
      <div class="row g-3 mb-4">
        ${card('Pendentes de análise', Number(r.pendentes || 0), 'hourglass-split', 'warning', '/pages/requisicoes.html?status=PENDENTE')}
        ${card('Aprovadas', Number(r.aprovadas || 0), 'check2-circle', 'primary', '/pages/requisicoes.html?status=APROVADA')}
        ${card('Parcialmente atendidas', Number(r.parciais || 0), 'circle-half', 'info', '/pages/requisicoes.html?status=PARCIAL')}
        ${card('Atendidas', Number(r.atendidas || 0), 'bag-check', 'success', '/pages/requisicoes.html?status=ATENDIDA')}
      </div>
      <div class="card"><div class="card-header bg-white fw-semibold">Últimas requisições</div>
        <div class="table-responsive"><table class="table table-hover mb-0">
          <thead><tr><th>Número</th><th>Data</th><th>Solicitante</th><th>Situação</th></tr></thead>
          <tbody>${d.recentes.length ? d.recentes.map((x) => `<tr><td><a href="/pages/requisicoes.html?id=${x.id}">${esc(x.numero)}</a></td>
            <td>${dataHora(x.data_requisicao)}</td><td>${esc(x.usuario_nome)}</td><td>${badge(x.status)}</td></tr>`).join('') : Util.vazio('Nenhuma requisição registrada.', 4)}</tbody>
        </table></div></div>`;
  }

  function renderAlmox(d) {
    const i = d.indicadores;
    const linhaDoc = (x, destino) => `<tr><td>${esc(x.numero)}</td><td>${dataHora(x.efetivado_em)}</td><td>${esc(destino)}</td><td class="num">${x.total_itens}</td></tr>`;
    raiz.innerHTML = `
      <h1 class="titulo-pagina mb-3">Painel</h1>
      <div class="row g-3 mb-4">
        ${card('Mercadorias cadastradas', i.mercadorias_cadastradas, 'box-seam', 'primary', '/pages/estoque.html?ativo=')}
        ${card('Com saldo positivo', i.com_saldo, 'boxes', 'success', '/pages/estoque.html?situacao=NORMAL,BAIXO')}
        ${card('Abaixo do mínimo', i.abaixo_minimo, 'exclamation-triangle', 'warning', '/pages/estoque.html?situacao=BAIXO')}
        ${card('Sem estoque', i.sem_estoque, 'x-octagon', 'danger', '/pages/estoque.html?situacao=ZERADO')}
        ${card('Requisições pendentes', i.requisicoes_pendentes, 'hourglass-split', 'warning', '/pages/requisicoes.html?modo=aprovacao')}
        ${card('Aprovadas aguardando entrega', i.requisicoes_aprovadas, 'check2-circle', 'primary', '/pages/requisicoes.html?status=APROVADA')}
        ${card('Parcialmente atendidas', i.requisicoes_parciais, 'circle-half', 'info', '/pages/requisicoes.html?status=PARCIAL')}
        ${card('Mercadorias ativas', i.mercadorias_ativas, 'check-circle', 'secondary', '/pages/estoque.html')}
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><div class="card h-100"><div class="card-header bg-white fw-semibold"><i class="bi bi-box-arrow-in-down me-1"></i>Entradas recentes</div>
          <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Documento</th><th>Data</th><th>Fornecedor</th><th class="num">Itens</th></tr></thead>
          <tbody>${d.entradas_recentes.length ? d.entradas_recentes.map((x) => linhaDoc(x, x.fornecedor_nome || '—')).join('') : Util.vazio('Nenhuma entrada efetivada.', 4)}</tbody></table></div></div></div>
        <div class="col-lg-6"><div class="card h-100"><div class="card-header bg-white fw-semibold"><i class="bi bi-box-arrow-up me-1"></i>Saídas recentes</div>
          <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Documento</th><th>Data</th><th>Setor</th><th class="num">Itens</th></tr></thead>
          <tbody>${d.saidas_recentes.length ? d.saidas_recentes.map((x) => linhaDoc(x, `${x.setor_sigla} (${x.requisicao_numero})`)).join('') : Util.vazio('Nenhuma saída efetivada.', 4)}</tbody></table></div></div></div>
        <div class="col-12"><div class="card"><div class="card-header bg-white fw-semibold"><i class="bi bi-exclamation-triangle me-1 text-warning"></i>Mercadorias em nível crítico</div>
          <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th class="num">Saldo</th><th class="num">Mínimo</th><th>Situação</th></tr></thead>
          <tbody>${d.criticos.length ? d.criticos.map((m) => `<tr><td>${esc(m.codigo)}</td><td>${esc(m.descricao)}</td><td>${esc(m.unidade_sigla)}</td>
            <td class="num">${qtd(m.quantidade_atual)}</td><td class="num">${qtd(m.estoque_minimo)}</td><td>${badge(m.situacao_estoque)}</td></tr>`).join('') : Util.vazio('Nenhuma mercadoria abaixo do mínimo.', 6)}</tbody></table></div></div></div>
      </div>`;
  }

  App.iniciar()
    .then(() => Api.get('/api/dashboard'))
    .then((d) => (d.tipo === 'SOLICITANTE' ? renderSolicitante(d) : renderAlmox(d)))
    .catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
