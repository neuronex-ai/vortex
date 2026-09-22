/* JavaScript puro. Edite o HTML para alterar textos e os arquivos css/ para o visual. */
'use strict';

document.querySelectorAll('[data-local-menu-toggle]').forEach(button => {
  const menu = button.closest('nav').querySelector('.local-mobile-menu');
  function toggle(force) {
    const open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  }
  button.addEventListener('click', () => toggle());
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    if (event.key === 'Escape') toggle(false);
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) toggle(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') toggle(false); });
});

// O endereço público não fornece um serviço de envio independente do Framer.
// Conecte aqui seu próprio endpoint antes de publicar formulários funcionais.
document.querySelectorAll('form[data-local-form]').forEach(form => {
  const controls = Array.from(form.elements);
  const originallyDisabled = new Set(controls.filter(control => control.disabled));
  function syncVisibleFields() {
    controls.forEach(control => { control.disabled = originallyDisabled.has(control) || control.getClientRects().length === 0; });
  }
  syncVisibleFields();
  window.addEventListener('resize', syncVisibleFields);
  form.addEventListener('submit', event => {
    event.preventDefault();
    let message = form.nextElementSibling;
    if (!message?.classList.contains('local-form-status')) {
      message = document.createElement('p');
      message.className = 'local-form-status';
      message.setAttribute('role', 'status');
      form.after(message);
    }
    message.textContent = 'Este formulário é uma cópia local. Nenhum dado foi enviado. Configure o serviço de envio para receber solicitações.';
  });
});

// Carrosséis publicados: todos os itens permanecem acessíveis com rolagem horizontal.
document.querySelectorAll('section[style*="mask-image"]:has(> ul)').forEach(section => {
  section.classList.add('local-carousel');
  section.tabIndex = 0;
  section.setAttribute('aria-label', 'Conteúdo em carrossel. Role horizontalmente para ver todos os itens.');
});
