(function () {
  'use strict';
  const form = document.getElementById('fLogin');
  const msg = document.getElementById('msg');
  const mostrar = (texto) => { msg.textContent = texto; msg.classList.toggle('d-none', !texto); };

  const aviso = sessionStorage.getItem('msgLogin');
  if (aviso) { mostrar(aviso); sessionStorage.removeItem('msgLogin'); }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    mostrar('');
    const dados = Util.form(form);
    if (!dados.login || !dados.senha) { mostrar('Informe login e senha.'); return; }
    Util.comBotao(document.getElementById('btnEntrar'), async () => {
      try {
        await Api.post('/api/auth/login', dados);
        const voltar = Util.param('voltar');
        // Só redireciona para caminhos internos
        location.href = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/index.html';
      } catch (e) {
        mostrar(e.message);
        document.getElementById('senha').value = '';
      }
    });
  });
})();
