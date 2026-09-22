export function initializePublicExperience() {
  const contact = document.querySelector('[data-fusion-contact]');
  contact?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(contact);
    const subject = encodeURIComponent(`Contato Fusion — ${data.get('name') || 'Mensagem'}`);
    const body = encodeURIComponent(`Nome: ${data.get('name')}\nE-mail: ${data.get('email')}\n\n${data.get('message')}`);
    window.location.href = `mailto:contato@fusionapp.site?subject=${subject}&body=${body}`;
    let status = contact.querySelector('[role=status]');
    if (!status) { status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'fusion-contact-note'; contact.append(status); }
    status.textContent = 'Revise e envie no seu aplicativo de e-mail. Se ele não abriu, escreva para contato@fusionapp.site.';
  });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;
  const targets = [...document.querySelectorAll('[data-fusion-reveal]')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.remove('fusion-awaiting'); observer.unobserve(entry.target); } });
  }, { threshold: 0, rootMargin: '0px 0px -32px 0px' });
  targets.forEach(target => {
    if (target.getBoundingClientRect().top > window.innerHeight && target.getClientRects().length) { target.classList.add('fusion-awaiting'); observer.observe(target); }
  });
  const revealAll = () => { targets.forEach(target => target.classList.remove('fusion-awaiting')); observer.disconnect(); };
  preference.addEventListener('change', revealAll, { once: true });
  // Anchor navigation and keyboard focus must never land in visually hidden content.
  document.addEventListener('focusin', event => event.target.closest('[data-fusion-reveal]')?.classList.remove('fusion-awaiting'));
  window.addEventListener('hashchange', revealAll, { once: true });
}
