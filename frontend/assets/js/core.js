/* =====================================================================
 * Núcleo do frontend: comunicação com a API, utilitários e modais.
 * Regra de segurança: todo texto vindo do servidor passa por esc()
 * antes de ser inserido no HTML (proteção contra XSS).
 * ===================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- API
  class ApiError extends Error {
    constructor(mensagem, status, detalhes) { super(mensagem); this.status = status; this.detalhes = detalhes; }
  }

  const Api = {
    csrf: null,

    async req(metodo, url, corpo) {
      const opcoes = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
      if (corpo !== undefined) { opcoes.headers['Content-Type'] = 'application/json'; opcoes.body = JSON.stringify(corpo); }
      if (metodo !== 'GET' && Api.csrf) opcoes.headers['X-CSRF-Token'] = Api.csrf;

      let resp;
      try { resp = await fetch(url, opcoes); } catch (_) { throw new ApiError('Não foi possível comunicar com o servidor. Verifique sua conexão.', 0); }

      if (resp.status === 204) return null;
      let dados = null;
      try { dados = await resp.json(); } catch (_) { /* resposta sem JSON */ }

      if (!resp.ok) {
        const msg = (dados && dados.erro && dados.erro.mensagem) || `Erro ${resp.status}`;
        if (resp.status === 401 && !location.pathname.startsWith('/login')) {
          sessionStorage.setItem('msgLogin', msg);
          location.href = '/login.html?voltar=' + encodeURIComponent(location.pathname + location.search);
        }
        throw new ApiError(msg, resp.status, dados && dados.erro && dados.erro.detalhes);
      }
      return dados;
    },
    get: (url, params) => Api.req('GET', url + Util.qs(params)),
    post: (url, corpo) => Api.req('POST', url, corpo || {}),
    put: (url, corpo) => Api.req('PUT', url, corpo),
    patch: (url, corpo) => Api.req('PATCH', url, corpo),
    del: (url) => Api.req('DELETE', url)
  };

  // ---------------------------------------------------------- Utilitários
  const STATUS_CORES = {
    PENDENTE: 'warning', APROVADA: 'primary', PARCIAL: 'info', ATENDIDA: 'success', REJEITADA: 'danger',
    CANCELADA: 'secondary', ENCERRADA: 'dark', RASCUNHO: 'warning', EFETIVADO: 'success', ESTORNADO: 'secondary',
    NORMAL: 'success', BAIXO: 'warning', ZERADO: 'danger'
  };
  const TIPOS_DOC = {
    ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE_ENTRADA: 'Ajuste (entrada)', AJUSTE_SAIDA: 'Ajuste (saída)',
    ESTORNO_ENTRADA: 'Estorno de entrada', ESTORNO_SAIDA: 'Estorno de saída', ESTORNO_AJUSTE: 'Estorno de ajuste'
  };

  const Util = {
    TIPOS_DOC,
    esc(v) {
      if (v === null || v === undefined) return '';
      return String(v).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
    },
    qs(params) {
      if (!params) return '';
      const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
      return p.length ? '?' + new URLSearchParams(p).toString() : '';
    },
    qtd(v) {
      if (v === null || v === undefined || v === '') return '';
      return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    },
    data(v) { if (!v) return ''; const [d] = String(v).split(' '); return d.split('-').reverse().join('/'); },
    dataHora(v) { if (!v) return ''; const [d, h] = String(v).split(' '); return `${Util.data(d)} ${(h || '').slice(0, 5)}`.trim(); },
    hojeISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
    badge(status, rotulo) { return `<span class="badge badge-status text-bg-${STATUS_CORES[status] || 'secondary'}">${Util.esc(rotulo || status)}</span>`; },
    tipoDoc(t) { return TIPOS_DOC[t] || t; },
    param(nome) { return new URLSearchParams(location.search).get(nome); },
    /** Normaliza quantidade digitada ("1,5" -> "1.5"). */
    numero(v) { return String(v || '').trim().replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.'); },
    debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    vazio(msg = 'Nenhum registro encontrado.', colspan = 1) {
      return `<tr><td colspan="${colspan}"><div class="vazio"><i class="bi bi-inbox"></i>${Util.esc(msg)}</div></td></tr>`;
    },
    form(formEl) {
      const dados = {};
      new FormData(formEl).forEach((v, k) => { dados[k] = typeof v === 'string' ? v.trim() : v; });
      return dados;
    },
    opcoes(lista, valor, texto, selecionado, vazio = 'Selecione...') {
      return (vazio !== null ? `<option value="">${Util.esc(vazio)}</option>` : '') +
        lista.map((i) => `<option value="${Util.esc(i[valor])}" ${String(i[valor]) === String(selecionado ?? '') ? 'selected' : ''}>${Util.esc(typeof texto === 'function' ? texto(i) : i[texto])}</option>`).join('');
    },

    toast(mensagem, tipo = 'success') {
      let area = document.getElementById('areaToasts');
      if (!area) {
        area = document.createElement('div');
        area.id = 'areaToasts';
        area.className = 'toast-container position-fixed top-0 end-0 p-3';
        document.body.appendChild(area);
      }
      const el = document.createElement('div');
      el.className = `toast align-items-center text-bg-${tipo} border-0`;
      el.setAttribute('role', 'alert');
      el.innerHTML = `<div class="d-flex"><div class="toast-body">${Util.esc(mensagem)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button></div>`;
      area.appendChild(el);
      const t = new bootstrap.Toast(el, { delay: tipo === 'danger' ? 7000 : 3500 });
      el.addEventListener('hidden.bs.toast', () => el.remove());
      t.show();
    },
    erro(e) { Util.toast(e && e.message ? e.message : String(e), 'danger'); },

    /**
     * Executa uma ação desabilitando o botão durante o envio
     * (evita duplo clique e solicitações duplicadas).
     */
    async comBotao(botao, fn) {
      if (botao && botao.disabled) return undefined;
      const original = botao ? botao.innerHTML : null;
      if (botao) { botao.disabled = true; botao.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Aguarde...'; }
      try { return await fn(); } catch (e) { Util.erro(e); return undefined; } finally {
        if (botao && botao.isConnected) { botao.disabled = false; botao.innerHTML = original; }
      }
    }
  };

  // ---------------------------------------------------------------- Modais
  const Modal = {
    /**
     * Abre um modal com o HTML informado. Retorna { el, fechar }.
     * O modal é removido do DOM ao fechar.
     */
    abrir({ titulo, corpo, rodape = '', tamanho = 'lg', estatico = false }) {
      const el = document.createElement('div');
      el.className = 'modal fade';
      el.tabIndex = -1;
      el.innerHTML = `
        <div class="modal-dialog modal-${tamanho} modal-dialog-scrollable modal-fullscreen-md-down">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">${titulo}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div>
            <div class="modal-body">${corpo}</div>
            ${rodape ? `<div class="modal-footer">${rodape}</div>` : ''}
          </div>
        </div>`;
      document.body.appendChild(el);
      const m = new bootstrap.Modal(el, estatico ? { backdrop: 'static' } : {});
      el.addEventListener('hidden.bs.modal', () => { m.dispose(); el.remove(); });
      m.show();
      return { el, fechar: () => m.hide() };
    },

    /** Confirmação simples ou com campo de motivo obrigatório. Resolve com true/texto ou false. */
    confirmar({ titulo, mensagem, botao = 'Confirmar', cor = 'primary', motivo = false, rotuloMotivo = 'Motivo' }) {
      return new Promise((resolve) => {
        let resolvido = false;
        const { el, fechar } = Modal.abrir({
          titulo: Util.esc(titulo), tamanho: 'md',
          corpo: `<p class="mb-2">${mensagem}</p>
            ${motivo ? `<label class="form-label" for="mdMotivo">${Util.esc(rotuloMotivo)} *</label>
              <textarea id="mdMotivo" class="form-control" rows="3" maxlength="500"></textarea>
              <div class="invalid-feedback">Informe o ${Util.esc(rotuloMotivo.toLowerCase())}.</div>` : ''}`,
          rodape: `<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Voltar</button>
                   <button type="button" class="btn btn-${cor}" id="mdOk">${Util.esc(botao)}</button>`
        });
        el.querySelector('#mdOk').addEventListener('click', () => {
          let valor = true;
          if (motivo) {
            const campo = el.querySelector('#mdMotivo');
            if (!campo.value.trim()) { campo.classList.add('is-invalid'); campo.focus(); return; }
            valor = campo.value.trim();
          }
          resolvido = true; resolve(valor); fechar();
        });
        el.addEventListener('hidden.bs.modal', () => { if (!resolvido) resolve(false); });
      });
    }
  };

  // ------------------------------------------------- Editor de itens
  /**
   * Editor de itens com mercadoria + quantidade, usado em entradas, ajustes e requisições.
   * A mercadoria é escolhida por um campo com sugestões (datalist) "CÓDIGO - Descrição".
   */
  const EditorItens = {
    _mercadorias: null,
    async mercadorias() {
      if (!EditorItens._mercadorias) EditorItens._mercadorias = await Api.get('/api/mercadorias', { ativo: '1' });
      return EditorItens._mercadorias;
    },
    rotulo: (m) => `${m.codigo} - ${m.descricao}`,

    async montar(container, { itens = [], campoQtd = 'quantidade', comObservacao = false, mostrarSaldo = true }) {
      const mercs = await EditorItens.mercadorias();
      const idLista = 'lista-merc-' + Math.random().toString(36).slice(2);
      container.innerHTML = `
        <datalist id="${idLista}">${mercs.map((m) => `<option value="${Util.esc(EditorItens.rotulo(m))}"></option>`).join('')}</datalist>
        <div class="table-responsive"><table class="table table-sm itens-editor mb-2">
          <thead><tr><th style="min-width:260px">Mercadoria</th><th>Un.</th>${mostrarSaldo ? '<th class="num">Saldo</th>' : ''}
            <th style="width:140px">Quantidade</th>${comObservacao ? '<th>Observação</th>' : ''}<th></th></tr></thead>
          <tbody></tbody></table></div>
        <button type="button" class="btn btn-sm btn-outline-primary" data-acao="add-item"><i class="bi bi-plus-lg"></i> Adicionar item</button>`;
      const tbody = container.querySelector('tbody');
      const porRotulo = new Map(mercs.map((m) => [EditorItens.rotulo(m), m]));
      const porId = new Map(mercs.map((m) => [m.id, m]));

      const addLinha = (item = {}) => {
        const m = porId.get(Number(item.mercadoria_id));
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input class="form-control form-control-sm" list="${idLista}" placeholder="Digite código ou descrição"
                value="${m ? Util.esc(EditorItens.rotulo(m)) : ''}" data-campo="mercadoria" autocomplete="off"></td>
          <td class="text-muted" data-campo="un">${m ? Util.esc(m.unidade_sigla) : ''}</td>
          ${mostrarSaldo ? `<td class="num text-muted" data-campo="saldo">${m ? Util.qtd(m.saldo) : ''}</td>` : ''}
          <td><input class="form-control form-control-sm text-end" inputmode="decimal" data-campo="qtd" value="${item[campoQtd] !== undefined ? Util.esc(String(item[campoQtd]).replace('.', ',')) : ''}"></td>
          ${comObservacao ? `<td><input class="form-control form-control-sm" maxlength="255" data-campo="obs" value="${Util.esc(item.observacoes || '')}"></td>` : ''}
          <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger" data-acao="rem-item" title="Remover"><i class="bi bi-trash"></i></button></td>`;
        if (m) tr.dataset.id = m.id;
        tbody.appendChild(tr);
        return tr;
      };

      container.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        if (b.dataset.acao === 'add-item') addLinha().querySelector('input').focus();
        if (b.dataset.acao === 'rem-item') b.closest('tr').remove();
      });
      container.addEventListener('change', (ev) => {
        if (ev.target.dataset.campo !== 'mercadoria') return;
        const tr = ev.target.closest('tr');
        const m = porRotulo.get(ev.target.value);
        tr.dataset.id = m ? m.id : '';
        tr.querySelector('[data-campo="un"]').textContent = m ? m.unidade_sigla : '';
        const s = tr.querySelector('[data-campo="saldo"]');
        if (s) s.textContent = m ? Util.qtd(m.saldo) : '';
        ev.target.classList.toggle('is-invalid', !m && ev.target.value !== '');
      });

      (itens.length ? itens : [{}]).forEach(addLinha);

      return {
        /** Lê e valida os itens. Lança erro com mensagem amigável. */
        valor() {
          const linhas = [...tbody.querySelectorAll('tr')];
          const resultado = [];
          linhas.forEach((tr, i) => {
            const texto = tr.querySelector('[data-campo="mercadoria"]').value.trim();
            const qtd = Util.numero(tr.querySelector('[data-campo="qtd"]').value);
            if (!texto && !qtd) return;  // linha em branco
            if (!tr.dataset.id) throw new Error(`Item ${i + 1}: selecione uma mercadoria da lista.`);
            if (!(Number(qtd) > 0)) throw new Error(`Item ${i + 1}: informe uma quantidade maior que zero.`);
            const item = { mercadoria_id: Number(tr.dataset.id), [campoQtd]: qtd };
            if (comObservacao) item.observacoes = tr.querySelector('[data-campo="obs"]').value.trim() || null;
            resultado.push(item);
          });
          if (!resultado.length) throw new Error('Inclua pelo menos um item.');
          return resultado;
        }
      };
    }
  };

  window.Api = Api;
  window.ApiError = ApiError;
  window.Util = Util;
  window.Modal = Modal;
  window.EditorItens = EditorItens;
})();
