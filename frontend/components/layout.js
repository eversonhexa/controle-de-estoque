/* =====================================================================
 * Layout principal: menu lateral conforme permissões, barra superior,
 * troca de senha e encerramento de sessão.
 * Cada página declara no <body>: data-pagina="..." data-permissao="..."
 * ===================================================================== */
(function () {
  'use strict';
  const { esc } = Util;

  const MENU = [
    { grupo: 'Painel', itens: [
      { pagina: 'dashboard', rotulo: 'Dashboard', icone: 'speedometer2', href: '/index.html' }
    ] },
    { grupo: 'Cadastros', itens: [
      { pagina: 'mercadorias', rotulo: 'Mercadorias', icone: 'box-seam', href: '/pages/cadastro.html?c=mercadorias', perm: 'cadastros.gerenciar' },
      { pagina: 'categorias', rotulo: 'Categorias', icone: 'tags', href: '/pages/cadastro.html?c=categorias', perm: 'cadastros.gerenciar' },
      { pagina: 'unidades', rotulo: 'Unidades de medida', icone: 'rulers', href: '/pages/cadastro.html?c=unidades', perm: 'cadastros.gerenciar' },
      { pagina: 'setores', rotulo: 'Setores', icone: 'building', href: '/pages/cadastro.html?c=setores', perm: 'cadastros.gerenciar' },
      { pagina: 'fornecedores', rotulo: 'Fornecedores', icone: 'truck', href: '/pages/cadastro.html?c=fornecedores', perm: 'cadastros.gerenciar' },
      { pagina: 'usuarios', rotulo: 'Usuários', icone: 'people', href: '/pages/cadastro.html?c=usuarios', perm: 'usuarios.gerenciar' },
      { pagina: 'perfis', rotulo: 'Perfis de acesso', icone: 'shield-lock', href: '/pages/cadastro.html?c=perfis', perm: 'usuarios.gerenciar' }
    ] },
    { grupo: 'Movimentações', itens: [
      { pagina: 'entradas', rotulo: 'Entrada de mercadorias', icone: 'box-arrow-in-down', href: '/pages/entradas.html', perm: 'entradas.consultar' },
      { pagina: 'requisicoes', rotulo: 'Requisições', icone: 'clipboard-check', href: '/pages/requisicoes.html', perm: 'requisicoes.consultar' },
      { pagina: 'aprovacao', rotulo: 'Aprovação de requisições', icone: 'check2-square', href: '/pages/requisicoes.html?modo=aprovacao', perm: 'requisicoes.analisar' },
      { pagina: 'saidas', rotulo: 'Saída de mercadorias', icone: 'box-arrow-up', href: '/pages/saidas.html', perm: 'saidas.consultar' },
      { pagina: 'ajustes', rotulo: 'Ajustes e estornos', icone: 'arrow-left-right', href: '/pages/ajustes.html', perm: 'saidas.consultar' }
    ] },
    { grupo: 'Consultas', itens: [
      { pagina: 'estoque', rotulo: 'Posição do estoque', icone: 'clipboard-data', href: '/pages/estoque.html', perm: 'estoque.consultar' },
      { pagina: 'extrato', rotulo: 'Extrato de movimentações', icone: 'list-columns-reverse', href: '/pages/extrato.html', perm: 'estoque.consultar' },
      { pagina: 'hist-requisicoes', rotulo: 'Histórico de requisições', icone: 'clock-history', href: '/pages/requisicoes.html?modo=historico', perm: 'requisicoes.consultar' },
      { pagina: 'movimentacoes', rotulo: 'Histórico de entradas e saídas', icone: 'journal-text', href: '/pages/movimentacoes.html', perm: 'saidas.consultar' }
    ] },
    { grupo: 'Relatórios', itens: [
      { pagina: 'rel-estoque', rotulo: 'Estoque atual', icone: 'file-earmark-bar-graph', href: '/pages/relatorios.html?r=estoque', perm: 'relatorios.consultar' },
      { pagina: 'rel-entradas', rotulo: 'Entradas por período', icone: 'file-earmark-arrow-down', href: '/pages/relatorios.html?r=entradas', perm: 'relatorios.consultar' },
      { pagina: 'rel-saidas', rotulo: 'Saídas por período', icone: 'file-earmark-arrow-up', href: '/pages/relatorios.html?r=saidas', perm: 'relatorios.consultar' },
      { pagina: 'rel-consumo-setor', rotulo: 'Consumo por setor', icone: 'pie-chart', href: '/pages/relatorios.html?r=consumo-setor', perm: 'relatorios.consultar' },
      { pagina: 'rel-estoque-minimo', rotulo: 'Estoque mínimo', icone: 'exclamation-triangle', href: '/pages/relatorios.html?r=estoque-minimo', perm: 'relatorios.consultar' },
      { pagina: 'rel-requisicoes', rotulo: 'Requisições por situação', icone: 'file-earmark-text', href: '/pages/relatorios.html?r=requisicoes', perm: 'relatorios.consultar' }
    ] },
    { grupo: 'Administração', itens: [
      { pagina: 'auditoria', rotulo: 'Auditoria', icone: 'shield-check', href: '/pages/auditoria.html', perm: 'auditoria.consultar' }
    ] }
  ];

  const App = {
    usuario: null,
    permissoes: [],
    pode: (perm) => App.permissoes.includes(perm),

    async iniciar() {
      const sessao = await Api.get('/api/auth/me');
      Api.csrf = sessao.csrfToken;
      App.usuario = sessao.usuario;
      App.permissoes = sessao.permissoes;
      montarLayout();
      const perm = document.body.dataset.permissao;
      if (perm && !App.pode(perm)) {
        document.getElementById('conteudo').innerHTML =
          '<div class="alert alert-warning mt-3"><i class="bi bi-lock me-2"></i>Você não tem permissão para acessar esta página.</div>';
        throw new Error('sem-permissao');
      }
      return sessao;
    }
  };

  function montarLayout() {
    const conteudo = document.getElementById('conteudo');
    const paginaAtual = document.body.dataset.pagina;
    const u = App.usuario;

    const menuHtml = MENU.map((g) => {
      const itens = g.itens.filter((i) => !i.perm || App.pode(i.perm));
      if (!itens.length) return '';
      return `<div class="sidebar-grupo">${esc(g.grupo)}</div>` + itens.map((i) =>
        `<a class="sidebar-link ${i.pagina === paginaAtual ? 'ativo' : ''}" href="${i.href}"><i class="bi bi-${i.icone}"></i><span>${esc(i.rotulo)}</span></a>`
      ).join('');
    }).join('');

    const shell = document.createElement('div');
    shell.className = 'app-shell';
    shell.innerHTML = `
      <aside class="app-sidebar" id="sidebar">
        <div class="sidebar-marca"><i class="bi bi-boxes"></i><span>Controle de Estoque</span></div>
        <nav class="pb-4">${menuHtml}</nav>
      </aside>
      <div class="app-backdrop" id="backdrop"></div>
      <div class="app-main">
        <header class="app-topbar">
          <button class="btn btn-sm btn-outline-secondary d-lg-none" id="btnMenu" aria-label="Abrir menu"><i class="bi bi-list"></i></button>
          <div class="ms-auto dropdown">
            <button class="btn btn-sm btn-light dropdown-toggle d-flex align-items-center gap-2" data-bs-toggle="dropdown">
              <i class="bi bi-person-circle fs-5"></i>
              <span class="text-start lh-sm"><strong class="d-block">${esc(u.nome)}</strong>
                <small class="text-muted">${esc(u.perfilNome)}${u.setorSigla ? ' · ' + esc(u.setorSigla) : ''}</small></span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><button class="dropdown-item" id="btnSenha"><i class="bi bi-key me-2"></i>Alterar senha</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger" id="btnSair"><i class="bi bi-box-arrow-right me-2"></i>Sair</button></li>
            </ul>
          </div>
        </header>
        <div class="app-conteudo" id="areaConteudo"></div>
      </div>`;
    conteudo.parentNode.insertBefore(shell, conteudo);
    shell.querySelector('#areaConteudo').appendChild(conteudo);
    conteudo.classList.remove('d-none');

    const sidebar = shell.querySelector('#sidebar');
    const backdrop = shell.querySelector('#backdrop');
    const alternar = (abrir) => { sidebar.classList.toggle('aberta', abrir); backdrop.classList.toggle('ativa', abrir); };
    shell.querySelector('#btnMenu').addEventListener('click', () => alternar(!sidebar.classList.contains('aberta')));
    backdrop.addEventListener('click', () => alternar(false));

    shell.querySelector('#btnSair').addEventListener('click', async () => {
      try { await Api.post('/api/auth/logout'); } catch (_) { /* segue para o login */ }
      location.href = '/login.html';
    });
    shell.querySelector('#btnSenha').addEventListener('click', abrirTrocaSenha);
  }

  function abrirTrocaSenha() {
    const { el, fechar } = Modal.abrir({
      titulo: 'Alterar senha', tamanho: 'md',
      corpo: `<form id="fSenha" novalidate>
        <div class="mb-2"><label class="form-label">Senha atual</label><input type="password" name="senhaAtual" class="form-control" autocomplete="current-password" required></div>
        <div class="mb-2"><label class="form-label">Nova senha</label><input type="password" name="novaSenha" class="form-control" autocomplete="new-password" required>
          <div class="form-text">Mínimo de 8 caracteres, com letras e números.</div></div>
        <div class="mb-2"><label class="form-label">Confirme a nova senha</label><input type="password" name="confirmacao" class="form-control" autocomplete="new-password" required></div>
      </form>`,
      rodape: '<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="btnSalvarSenha">Salvar</button>'
    });
    el.querySelector('#btnSalvarSenha').addEventListener('click', (ev) => Util.comBotao(ev.currentTarget, async () => {
      const d = Util.form(el.querySelector('#fSenha'));
      if (d.novaSenha !== d.confirmacao) throw new Error('A confirmação não confere com a nova senha.');
      await Api.put('/api/auth/senha', { senhaAtual: d.senhaAtual, novaSenha: d.novaSenha });
      Util.toast('Senha alterada com sucesso.');
      fechar();
    }));
  }

  window.App = App;
})();
