/* Componentes compartilhados das telas de documentos de estoque:
 * listagem, detalhe e ações (efetivar, excluir rascunho, estornar). */
(function () {
  'use strict';
  const { esc, qtd, dataHora, data, badge, tipoDoc } = Util;

  const endpointDe = (tipo) => (tipo === 'ENTRADA' ? '/api/entradas' : tipo === 'SAIDA' ? '/api/saidas' : tipo.startsWith('AJUSTE') ? '/api/ajustes' : '/api/documentos');
  const sinal = (d) => (d.sentido === 1 ? '<span class="text-success fw-semibold">+</span>' : '<span class="text-danger fw-semibold">−</span>');

  function origemDestino(d) {
    if (d.tipo === 'ENTRADA') return d.fornecedor_nome ? esc(d.fornecedor_nome) : '<span class="text-muted">—</span>';
    if (d.tipo === 'SAIDA' || d.tipo === 'ESTORNO_SAIDA') return `${esc(d.setor_sigla)} <span class="text-muted small">(${esc(d.requisicao_numero)})</span>`;
    if (d.tipo.startsWith('ESTORNO')) return `Estorno de ${esc(d.documento_origem_numero)}`;
    return `<span class="small">${esc((d.justificativa || '').slice(0, 60))}</span>`;
  }

  const Documentos = {
    endpointDe,

    linhaLista(d) {
      return `<tr data-id="${d.id}">
        <td><strong>${esc(d.numero)}</strong></td>
        <td>${sinal(d)} ${esc(tipoDoc(d.tipo))}</td>
        <td>${d.status === 'RASCUNHO' ? data(d.data_movimentacao) : dataHora(d.efetivado_em || d.data_movimentacao)}</td>
        <td>${origemDestino(d)}</td>
        <td class="num">${d.total_itens}</td>
        <td>${esc(d.usuario_nome)}</td>
        <td>${badge(d.status)}</td></tr>`;
    },
    cabecalhoLista: '<tr><th>Número</th><th>Tipo</th><th>Data</th><th>Origem / destino</th><th class="num">Itens</th><th>Responsável</th><th>Situação</th></tr>',

    /**
     * Abre o detalhe do documento com as ações permitidas.
     * @param {number} id
     * @param {{aoAlterar?:Function, aoEditar?:Function}} opcoes
     */
    async abrir(id, { aoAlterar, aoEditar } = {}) {
      let d;
      try { d = await Api.get(`/api/documentos/${id}`); } catch (e) { Util.erro(e); return; }

      const podeGerir = (d.tipo === 'ENTRADA' && App.pode('entradas.gerenciar')) ||
                        (d.tipo === 'SAIDA' && App.pode('saidas.gerenciar')) ||
                        (d.tipo.startsWith('AJUSTE') && App.pode('ajustes.gerenciar'));
      const podeEstornar = d.status === 'EFETIVADO' && !d.tipo.startsWith('ESTORNO') && App.pode('ajustes.gerenciar');
      const rascunho = d.status === 'RASCUNHO';

      const info = [
        ['Tipo', `${sinal(d)} ${esc(tipoDoc(d.tipo))}`],
        ['Situação', badge(d.status)],
        [d.tipo === 'ENTRADA' ? 'Data da entrada' : 'Data', d.tipo === 'ENTRADA' ? data(d.data_movimentacao) : dataHora(d.data_movimentacao)],
        ['Lançado por', `${esc(d.usuario_nome)} <span class="text-muted small">${dataHora(d.criado_em)}</span>`],
        d.efetivado_em && ['Efetivado por', `${esc(d.efetivado_por_nome)} <span class="text-muted small">${dataHora(d.efetivado_em)}</span>`],
        d.tipo === 'ENTRADA' && ['Documento de referência', esc([d.tipo_documento_referencia, d.documento_referencia].filter(Boolean).join(' ')) || '—'],
        d.tipo === 'ENTRADA' && ['Fornecedor', esc(d.fornecedor_nome) || '—'],
        d.requisicao_id && ['Requisição', `<a href="/pages/requisicoes.html?id=${d.requisicao_id}">${esc(d.requisicao_numero)}</a> — ${esc(d.setor_sigla)} ${esc(d.setor_nome)}`],
        d.recebedor && ['Recebido por', esc(d.recebedor)],
        d.documento_origem_id && ['Documento estornado', esc(d.documento_origem_numero)],
        d.estorno_numero && ['Estornado pelo documento', esc(d.estorno_numero)],
        d.justificativa && ['Justificativa', esc(d.justificativa)],
        d.observacoes && ['Observações', esc(d.observacoes)]
      ].filter(Boolean);

      const corpo = `
        <dl class="row dl-compacto">${info.map(([k, v]) => `<div class="col-md-4"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="table-responsive"><table class="table table-sm">
          <thead><tr><th>Código</th><th>Mercadoria</th><th>Un.</th>${d.tipo === 'SAIDA' ? '<th class="num">Solicitado</th>' : ''}
            <th class="num">Quantidade</th><th class="num">${rascunho ? 'Saldo atual' : 'Saldo após'}</th></tr></thead>
          <tbody>${d.itens.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}${i.mercadoria_ativa ? '' : ' <span class="badge text-bg-secondary">inativa</span>'}</td>
            <td>${esc(i.unidade_sigla)}</td>${d.tipo === 'SAIDA' ? `<td class="num">${qtd(i.quantidade_solicitada)}</td>` : ''}
            <td class="num fw-semibold">${qtd(i.quantidade)}</td><td class="num">${qtd(rascunho ? i.saldo_atual : i.saldo_apos)}</td></tr>`).join('')}</tbody>
        </table></div>
        ${rascunho ? '<div class="alert alert-warning small mb-0"><i class="bi bi-info-circle me-1"></i>Documento em rascunho: o saldo só será alterado após a efetivação.</div>' : ''}`;

      const botoes = [];
      if (rascunho && podeGerir) {
        botoes.push('<button class="btn btn-outline-danger me-auto" data-acao="excluir"><i class="bi bi-trash me-1"></i>Excluir rascunho</button>');
        if (aoEditar) botoes.push('<button class="btn btn-outline-primary" data-acao="editar"><i class="bi bi-pencil me-1"></i>Editar</button>');
        botoes.push('<button class="btn btn-success" data-acao="efetivar"><i class="bi bi-check2-circle me-1"></i>Efetivar</button>');
      }
      if (podeEstornar) botoes.push('<button class="btn btn-outline-danger me-auto" data-acao="estornar"><i class="bi bi-arrow-counterclockwise me-1"></i>Estornar</button>');
      botoes.push('<button class="btn btn-outline-secondary" data-acao="imprimir"><i class="bi bi-printer me-1"></i>Imprimir</button>');
      botoes.push('<button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>');

      const { el, fechar } = Modal.abrir({ titulo: `${esc(tipoDoc(d.tipo))} ${esc(d.numero)}`, corpo, rodape: botoes.join(''), tamanho: 'xl' });
      const concluir = (msg) => { Util.toast(msg); fechar(); if (aoAlterar) aoAlterar(); };

      el.querySelector('.modal-footer').addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'imprimir') { Documentos.imprimir(d); return; }
        if (acao === 'editar') { fechar(); aoEditar(d); return; }
        if (acao === 'efetivar') {
          const ok = await Modal.confirmar({ titulo: 'Efetivar documento', mensagem: `Ao efetivar <strong>${esc(d.numero)}</strong> o saldo será atualizado e o documento não poderá mais ser alterado. Confirma?`, botao: 'Efetivar', cor: 'success' });
          if (ok) Util.comBotao(b, async () => { await Api.post(`${endpointDe(d.tipo)}/${d.id}/efetivar`); concluir('Documento efetivado. Saldo atualizado.'); });
        }
        if (acao === 'excluir') {
          const ok = await Modal.confirmar({ titulo: 'Excluir rascunho', mensagem: `Excluir o rascunho <strong>${esc(d.numero)}</strong>?`, botao: 'Excluir', cor: 'danger' });
          if (ok) Util.comBotao(b, async () => { await Api.del(`${endpointDe(d.tipo)}/${d.id}`); concluir('Rascunho excluído.'); });
        }
        if (acao === 'estornar') {
          const motivo = await Modal.confirmar({
            titulo: 'Estornar documento', cor: 'danger', botao: 'Estornar', motivo: true, rotuloMotivo: 'Justificativa',
            mensagem: `Será gerado um documento de estorno com movimento inverso ao de <strong>${esc(d.numero)}</strong>. O documento original permanece no histórico.`
          });
          if (motivo) Util.comBotao(b, async () => { const e = await Api.post(`/api/documentos/${d.id}/estornar`, { justificativa: motivo }); concluir(`Estorno ${e.numero} registrado.`); });
        }
      });
    },

    /** Comprovante para impressão (entrega assinada pelo recebedor, conferência de entrada). */
    imprimir(d) {
      const janela = window.open('', '_blank');
      if (!janela) { Util.toast('Permita pop-ups para imprimir.', 'warning'); return; }
      const linhas = d.itens.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade_sigla)}</td><td style="text-align:right">${qtd(i.quantidade)}</td></tr>`).join('');
      janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.numero)}</title>
        <link rel="stylesheet" href="/vendor/bootstrap/css/bootstrap.min.css"></head><body class="p-4">
        <h4>${esc(tipoDoc(d.tipo))} ${esc(d.numero)}</h4>
        <p class="mb-1">Situação: ${esc(d.status)} · Data: ${esc(dataHora(d.efetivado_em || d.data_movimentacao))}</p>
        ${d.requisicao_numero ? `<p class="mb-1">Requisição: ${esc(d.requisicao_numero)} · Setor: ${esc(d.setor_sigla)} - ${esc(d.setor_nome)}</p>` : ''}
        ${d.fornecedor_nome ? `<p class="mb-1">Fornecedor: ${esc(d.fornecedor_nome)} · ${esc([d.tipo_documento_referencia, d.documento_referencia].filter(Boolean).join(' '))}</p>` : ''}
        ${d.justificativa ? `<p class="mb-1">Justificativa: ${esc(d.justificativa)}</p>` : ''}
        <table class="table table-sm table-bordered mt-3"><thead><tr><th>Código</th><th>Mercadoria</th><th>Un.</th><th style="text-align:right">Quantidade</th></tr></thead><tbody>${linhas}</tbody></table>
        <div class="row mt-5 pt-4"><div class="col-6 text-center border-top pt-1">${esc(d.efetivado_por_nome || d.usuario_nome)}<br><small>Almoxarifado</small></div>
        <div class="col-6 text-center border-top pt-1">${esc(d.recebedor || '')}<br><small>${d.tipo === 'SAIDA' ? 'Recebedor' : 'Conferente'}</small></div></div>
        </body></html>`);
      janela.document.close();
      setTimeout(() => { janela.focus(); janela.print(); }, 500);
    }
  };

  window.Documentos = Documentos;
})();
