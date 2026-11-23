(function () {
  'use strict';
  const { esc, dataHora } = Util;
  const raiz = document.getElementById('conteudo');
  let pagina = 1;

  async function iniciar() {
    const [usuarios, acoes] = await Promise.all([Api.get('/api/usuarios'), Api.get('/api/auditoria/acoes')]);
    raiz.innerHTML = `
      <h1 class="titulo-pagina mb-3"><i class="bi bi-shield-check me-2"></i>Auditoria</h1>
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-6 col-md-3"><label class="form-label">Usuário</label><select class="form-select form-select-sm" name="usuarioId">${Util.opcoes(usuarios, 'id', (u) => `${u.nome} (${u.login})`, '', 'Todos')}</select></div>
        <div class="col-6 col-md-2"><label class="form-label">Ação</label><select class="form-select form-select-sm" name="acao">${Util.opcoes(acoes.map((a) => ({ a })), 'a', 'a', '', 'Todas')}</select></div>
        <div class="col-6 col-md-2"><label class="form-label">Tabela</label><select class="form-select form-select-sm" name="tabela">
          ${Util.opcoes(['documentos_estoque', 'requisicoes', 'mercadorias', 'usuarios', 'perfis', 'setores', 'categorias', 'unidades_medida', 'fornecedores', 'relatorios'].map((t) => ({ t })), 't', 't', '', 'Todas')}</select></div>
        <div class="col-6 col-md-2"><label class="form-label">Texto</label><input class="form-control form-control-sm" name="q"></div>
        <div class="col-6 col-md-auto"><label class="form-label">De</label><input type="date" class="form-control form-control-sm" name="de"></div>
        <div class="col-6 col-md-auto"><label class="form-label">Até</label><input type="date" class="form-control form-control-sm" name="ate"></div>
      </form></div></div>
      <div class="card"><div class="table-responsive"><table class="table table-sm table-hover mb-0">
        <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Tabela</th><th class="num">Registro</th><th>Descrição</th><th>IP</th></tr></thead>
        <tbody id="tbLista"></tbody></table></div>
        <div class="card-footer bg-white d-flex justify-content-between align-items-center small">
          <span id="rodape" class="text-muted"></span>
          <div class="btn-group"><button class="btn btn-sm btn-outline-secondary" id="btnAnt"><i class="bi bi-chevron-left"></i></button>
            <button class="btn btn-sm btn-outline-secondary" id="btnProx"><i class="bi bi-chevron-right"></i></button></div></div></div>`;
    const f = document.getElementById('fFiltro');
    f.addEventListener('change', () => { pagina = 1; carregar(); });
    f.addEventListener('input', Util.debounce(() => { pagina = 1; carregar(); }, 400));
    f.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('btnAnt').addEventListener('click', () => { if (pagina > 1) { pagina--; carregar(); } });
    document.getElementById('btnProx').addEventListener('click', () => { pagina++; carregar(); });
    await carregar();
  }

  async function carregar() {
    try {
      const r = await Api.get('/api/auditoria', { ...Util.form(document.getElementById('fFiltro')), pagina, porPagina: 50 });
      const totalPaginas = Math.max(1, Math.ceil(r.total / r.porPagina));
      if (pagina > totalPaginas) { pagina = totalPaginas; }
      document.getElementById('tbLista').innerHTML = r.registros.length ? r.registros.map((a) => `
        <tr><td class="text-nowrap">${dataHora(a.data_hora)}</td><td>${esc(a.usuario_nome || '—')}</td><td><code>${esc(a.acao)}</code></td>
          <td class="small">${esc(a.tabela_referencia)}</td><td class="num">${esc(a.registro_id)}</td><td class="small">${esc(a.descricao)}</td>
          <td class="small text-muted">${esc(a.ip)}</td></tr>`).join('') : Util.vazio('Nenhum registro.', 7);
      document.getElementById('rodape').textContent = `${r.total} registro(s) · página ${r.pagina} de ${totalPaginas}`;
      document.getElementById('btnAnt').disabled = r.pagina <= 1;
      document.getElementById('btnProx').disabled = r.pagina >= totalPaginas;
    } catch (e) { Util.erro(e); }
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
