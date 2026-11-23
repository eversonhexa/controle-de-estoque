/* Tela genérica de cadastros: mercadorias, categorias, unidades, setores,
 * fornecedores, usuários e perfis. Configurada pelo parâmetro ?c= */
(function () {
  'use strict';
  const { esc, qtd, badge } = Util;

  const ativoBadge = (r) => (r.ativo ? badge('NORMAL', 'Ativo') : badge('CANCELADA', 'Inativo'));
  const formatarDoc = (d) => (!d ? '' : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'));

  const CONFIG = {
    mercadorias: {
      titulo: 'Mercadorias', singular: 'mercadoria', endpoint: '/api/mercadorias', icone: 'box-seam',
      colunas: [
        { titulo: 'Código', html: (r) => `<strong>${esc(r.codigo)}</strong>` },
        { titulo: 'Descrição', html: (r) => esc(r.descricao) },
        { titulo: 'Categoria', html: (r) => esc(r.categoria_nome) },
        { titulo: 'Un.', html: (r) => esc(r.unidade_sigla) },
        { titulo: 'Saldo', classe: 'num', html: (r) => qtd(r.saldo) },
        { titulo: 'Mínimo', classe: 'num', html: (r) => qtd(r.estoque_minimo) }
      ],
      campos: [
        { nome: 'codigo', rotulo: 'Código interno', obrigatorio: true, max: 30, col: 4 },
        { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, max: 200, col: 8 },
        { nome: 'categoria_id', rotulo: 'Categoria', tipo: 'select', obrigatorio: true, col: 4, opcoes: { url: '/api/categorias', texto: 'nome' } },
        { nome: 'unidade_id', rotulo: 'Unidade de medida', tipo: 'select', obrigatorio: true, col: 4, opcoes: { url: '/api/unidades-medida', texto: (u) => `${u.sigla} - ${u.descricao}` },
          dica: 'Usada em todas as operações; não pode ser trocada após movimentações.' },
        { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'decimal', col: 4 },
        { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', max: 500, col: 12 }
      ],
      filtroCategoria: true
    },
    categorias: {
      titulo: 'Categorias', singular: 'categoria', endpoint: '/api/categorias', icone: 'tags',
      colunas: [{ titulo: 'Nome', html: (r) => `<strong>${esc(r.nome)}</strong>` }, { titulo: 'Descrição', html: (r) => esc(r.descricao) }],
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 100, col: 12 },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 255, col: 12 }
      ]
    },
    unidades: {
      titulo: 'Unidades de medida', singular: 'unidade de medida', endpoint: '/api/unidades-medida', icone: 'rulers',
      colunas: [{ titulo: 'Sigla', html: (r) => `<strong>${esc(r.sigla)}</strong>` }, { titulo: 'Descrição', html: (r) => esc(r.descricao) }],
      campos: [
        { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, max: 60, col: 8 },
        { nome: 'sigla', rotulo: 'Sigla', obrigatorio: true, max: 10, col: 4 }
      ]
    },
    setores: {
      titulo: 'Setores', singular: 'setor', endpoint: '/api/setores', icone: 'building',
      colunas: [{ titulo: 'Sigla', html: (r) => `<strong>${esc(r.sigla)}</strong>` }, { titulo: 'Nome', html: (r) => esc(r.nome) }, { titulo: 'Responsável', html: (r) => esc(r.responsavel) }],
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 120, col: 8 },
        { nome: 'sigla', rotulo: 'Sigla', obrigatorio: true, max: 20, col: 4 },
        { nome: 'responsavel', rotulo: 'Responsável', max: 120, col: 12 }
      ]
    },
    fornecedores: {
      titulo: 'Fornecedores', singular: 'fornecedor', endpoint: '/api/fornecedores', icone: 'truck',
      colunas: [
        { titulo: 'Nome / razão social', html: (r) => `<strong>${esc(r.nome)}</strong>` },
        { titulo: 'CPF/CNPJ', html: (r) => esc(formatarDoc(r.documento)) },
        { titulo: 'Contato', html: (r) => esc(r.contato) },
        { titulo: 'Telefone', html: (r) => esc(r.telefone) },
        { titulo: 'E-mail', html: (r) => esc(r.email) }
      ],
      campos: [
        { nome: 'nome', rotulo: 'Razão social ou nome', obrigatorio: true, max: 150, col: 8 },
        { nome: 'documento', rotulo: 'CPF/CNPJ', max: 18, col: 4, dica: 'Opcional. Somente números ou formatado.' },
        { nome: 'contato', rotulo: 'Contato', max: 120, col: 6 },
        { nome: 'telefone', rotulo: 'Telefone', max: 20, col: 6 },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 150, col: 12 }
      ]
    },
    usuarios: {
      titulo: 'Usuários', singular: 'usuário', endpoint: '/api/usuarios', icone: 'people',
      colunas: [
        { titulo: 'Nome', html: (r) => `<strong>${esc(r.nome)}</strong>` },
        { titulo: 'Login', html: (r) => esc(r.login) },
        { titulo: 'Perfil', html: (r) => esc(r.perfil_nome) },
        { titulo: 'Setor', html: (r) => esc(r.setor_sigla) },
        { titulo: 'Último acesso', html: (r) => Util.dataHora(r.ultimo_acesso) }
      ],
      campos: [
        { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, max: 120, col: 8 },
        { nome: 'login', rotulo: 'Login', obrigatorio: true, max: 60, col: 4 },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 150, col: 6 },
        { nome: 'perfil_id', rotulo: 'Perfil', tipo: 'select', obrigatorio: true, col: 6, opcoes: { url: '/api/perfis', texto: 'nome' } },
        { nome: 'setor_id', rotulo: 'Setor', tipo: 'select', col: 6, opcoes: { url: '/api/setores', texto: (s) => `${s.sigla} - ${s.nome}` }, dica: 'Obrigatório para o perfil Solicitante.' },
        { nome: 'senha', rotulo: 'Senha', tipo: 'password', col: 6, obrigatorioNaCriacao: true, dica: 'Mínimo de 8 caracteres, com letras e números. Na edição, deixe em branco para manter.' }
      ]
    },
    perfis: {
      titulo: 'Perfis de acesso', singular: 'perfil', endpoint: '/api/perfis', icone: 'shield-lock', semCriar: true, semStatus: true, semFiltros: true,
      aviso: 'As permissões de cada perfil são definidas pelo sistema (veja docs/decisoes.md). Aqui é possível ajustar nome, descrição e situação.',
      colunas: [
        { titulo: 'Código', html: (r) => `<code>${esc(r.codigo)}</code>` },
        { titulo: 'Nome', html: (r) => `<strong>${esc(r.nome)}</strong>` },
        { titulo: 'Descrição', html: (r) => esc(r.descricao) },
        { titulo: 'Usuários', classe: 'num', html: (r) => r.total_usuarios }
      ],
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 60, col: 12 },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 255, col: 12 },
        { nome: 'ativo', rotulo: 'Perfil ativo', tipo: 'checkbox', col: 12 }
      ]
    }
  };

  const chave = Util.param('c');
  const cfg = CONFIG[chave];
  const raiz = document.getElementById('conteudo');
  document.body.dataset.pagina = chave;
  document.body.dataset.permissao = chave === 'usuarios' || chave === 'perfis' ? 'usuarios.gerenciar' : 'cadastros.gerenciar';
  if (!cfg) { raiz.innerHTML = '<div class="alert alert-danger">Cadastro inválido.</div>'; raiz.classList.remove('d-none'); return; }
  document.title = `${cfg.titulo} · Controle de Estoque`;

  let registros = [];
  const cacheOpcoes = {};
  async function opcoes(campo) {
    if (!cacheOpcoes[campo.nome]) cacheOpcoes[campo.nome] = await Api.get(campo.opcoes.url);
    return cacheOpcoes[campo.nome];
  }

  async function iniciar() {
    raiz.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 class="titulo-pagina"><i class="bi bi-${cfg.icone} me-2"></i>${esc(cfg.titulo)}</h1>
        ${cfg.semCriar ? '' : `<button class="btn btn-primary" id="btnNovo"><i class="bi bi-plus-lg me-1"></i>Novo(a) ${esc(cfg.singular)}</button>`}
      </div>
      ${cfg.aviso ? `<div class="alert alert-info small">${esc(cfg.aviso)}</div>` : ''}
      ${cfg.semFiltros ? '' : `
      <div class="card mb-3"><div class="card-body py-2"><form class="row g-2 align-items-end filtros" id="fFiltro">
        <div class="col-12 col-md-5"><label class="form-label">Pesquisar</label><input class="form-control form-control-sm" name="q" placeholder="Digite para filtrar"></div>
        ${cfg.filtroCategoria ? '<div class="col-6 col-md-3"><label class="form-label">Categoria</label><select class="form-select form-select-sm" name="categoriaId" id="filtroCategoria"></select></div>' : ''}
        <div class="col-6 col-md-2"><label class="form-label">Situação</label><select class="form-select form-select-sm" name="ativo">
          <option value="1">Ativos</option><option value="0">Inativos</option><option value="">Todos</option></select></div>
      </form></div></div>`}
      <div class="card"><div class="table-responsive"><table class="table table-hover mb-0">
        <thead><tr>${cfg.colunas.map((c) => `<th class="${c.classe || ''}">${esc(c.titulo)}</th>`).join('')}<th>Situação</th><th class="text-end">Ações</th></tr></thead>
        <tbody id="tbLista"></tbody></table></div>
        <div class="card-footer bg-white small text-muted" id="rodape"></div></div>`;

    const fFiltro = document.getElementById('fFiltro');
    if (fFiltro) {
      if (cfg.filtroCategoria) {
        const cats = await Api.get('/api/categorias', { ativo: '1' });
        document.getElementById('filtroCategoria').innerHTML = Util.opcoes(cats, 'id', 'nome', '', 'Todas');
      }
      fFiltro.addEventListener('input', Util.debounce(carregar));
      fFiltro.addEventListener('change', carregar);
      fFiltro.addEventListener('submit', (e) => e.preventDefault());
    }
    const btnNovo = document.getElementById('btnNovo');
    if (btnNovo) btnNovo.addEventListener('click', () => abrirForm(null));

    document.getElementById('tbLista').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      const r = registros.find((x) => String(x.id) === b.dataset.id);
      if (b.dataset.acao === 'editar') abrirForm(r);
      if (b.dataset.acao === 'status') alterarStatus(r, b);
    });
    await carregar();
  }

  async function carregar() {
    const fFiltro = document.getElementById('fFiltro');
    const filtros = fFiltro ? Util.form(fFiltro) : {};
    const tb = document.getElementById('tbLista');
    try {
      registros = await Api.get(cfg.endpoint, filtros);
      const ncol = cfg.colunas.length + 2;
      tb.innerHTML = registros.length ? registros.map((r) => `
        <tr>${cfg.colunas.map((c) => `<td class="${c.classe || ''}">${c.html(r) ?? ''}</td>`).join('')}
          <td>${ativoBadge(r)}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${r.id}" title="Editar"><i class="bi bi-pencil"></i></button>
            ${cfg.semStatus ? '' : `<button class="btn btn-sm ${r.ativo ? 'btn-outline-danger' : 'btn-outline-success'}" data-acao="status" data-id="${r.id}" title="${r.ativo ? 'Inativar' : 'Ativar'}">
              <i class="bi bi-${r.ativo ? 'slash-circle' : 'check-circle'}"></i></button>`}
          </td></tr>`).join('') : Util.vazio('Nenhum registro encontrado.', ncol);
      document.getElementById('rodape').textContent = `${registros.length} registro(s)`;
    } catch (e) { Util.erro(e); }
  }

  async function campoHtml(campo, valor, novo) {
    const id = 'cp_' + campo.nome;
    const obrig = campo.obrigatorio || (novo && campo.obrigatorioNaCriacao);
    const rot = `<label class="form-label" for="${id}">${esc(campo.rotulo)}${obrig ? ' *' : ''}</label>`;
    const dica = campo.dica ? `<div class="form-text">${esc(campo.dica)}</div>` : '';
    const v = valor === null || valor === undefined ? '' : valor;
    let input;
    switch (campo.tipo) {
      case 'select': {
        // Inclui o valor atual mesmo se estiver inativo
        const lista = (await opcoes(campo)).filter((o) => o.ativo || String(o.id) === String(v));
        input = `<select class="form-select" id="${id}" name="${campo.nome}" ${obrig ? 'required' : ''}>${Util.opcoes(lista, 'id', campo.opcoes.texto, v)}</select>`;
        break;
      }
      case 'textarea':
        input = `<textarea class="form-control" id="${id}" name="${campo.nome}" rows="2" maxlength="${campo.max || 500}">${esc(v)}</textarea>`; break;
      case 'checkbox':
        return `<div class="col-${campo.col || 12}"><div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="${id}" name="${campo.nome}" ${v ? 'checked' : ''}>
          <label class="form-check-label" for="${id}">${esc(campo.rotulo)}</label></div></div>`;
      case 'decimal':
        input = `<input class="form-control text-end" id="${id}" name="${campo.nome}" inputmode="decimal" value="${esc(String(v).replace('.', ','))}">`; break;
      case 'password':
        input = `<input class="form-control" type="password" id="${id}" name="${campo.nome}" autocomplete="new-password" maxlength="72">`; break;
      default:
        input = `<input class="form-control" type="${campo.tipo || 'text'}" id="${id}" name="${campo.nome}" value="${esc(v)}" maxlength="${campo.max || 255}" ${obrig ? 'required' : ''}>`;
    }
    return `<div class="col-12 col-md-${campo.col || 12}">${rot}${input}${dica}</div>`;
  }

  async function abrirForm(registro) {
    const novo = !registro;
    const campos = (await Promise.all(cfg.campos.map((c) => campoHtml(c, registro ? registro[c.nome] : (c.tipo === 'checkbox' ? true : ''), novo)))).join('');
    const { el, fechar } = Modal.abrir({
      titulo: `${novo ? 'Novo(a)' : 'Editar'} ${esc(cfg.singular)}`,
      corpo: `<form id="fCad" class="row g-3" novalidate>${campos}</form>`,
      rodape: '<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="btnSalvar"><i class="bi bi-check-lg me-1"></i>Salvar</button>'
    });
    const form = el.querySelector('#fCad');
    form.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('#btnSalvar').click(); });
    el.querySelector('#btnSalvar').addEventListener('click', (ev) => Util.comBotao(ev.currentTarget, async () => {
      const dados = Util.form(form);
      for (const c of cfg.campos) {
        if (c.tipo === 'checkbox') dados[c.nome] = form.querySelector(`[name="${c.nome}"]`).checked;
        if (c.tipo === 'decimal') dados[c.nome] = Util.numero(dados[c.nome]) || 0;
        if ((c.obrigatorio || (novo && c.obrigatorioNaCriacao)) && c.tipo !== 'checkbox' && !dados[c.nome]) {
          form.querySelector(`[name="${c.nome}"]`).focus();
          throw new Error(`Preencha o campo "${c.rotulo}".`);
        }
        if (dados[c.nome] === '') dados[c.nome] = null;
      }
      if (novo) await Api.post(cfg.endpoint, dados);
      else await Api.put(`${cfg.endpoint}/${registro.id}`, dados);
      Object.keys(cacheOpcoes).forEach((k) => delete cacheOpcoes[k]);
      Util.toast('Registro salvo com sucesso.');
      fechar();
      carregar();
    }));
  }

  async function alterarStatus(r, botao) {
    const ativar = !r.ativo;
    const ok = await Modal.confirmar({
      titulo: ativar ? 'Ativar registro' : 'Inativar registro',
      mensagem: ativar ? 'Deseja ativar este registro?' : 'Registros inativos não podem ser usados em novas operações, mas o histórico é preservado. Deseja inativar?',
      botao: ativar ? 'Ativar' : 'Inativar', cor: ativar ? 'success' : 'danger'
    });
    if (!ok) return;
    await Util.comBotao(botao, async () => {
      await Api.patch(`${cfg.endpoint}/${r.id}/status`, { ativo: ativar });
      Util.toast(ativar ? 'Registro ativado.' : 'Registro inativado.');
      carregar();
    });
  }

  App.iniciar().then(iniciar).catch((e) => { if (e.message !== 'sem-permissao') Util.erro(e); });
})();
