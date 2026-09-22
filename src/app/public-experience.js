const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

function initializeNotebookScene(preference) {
  const scene = document.querySelector('[data-fusion-notebook]');
  const next = document.querySelector('[data-fusion-next-chapter]');
  if (!scene || !next) return;
  const compact = window.matchMedia('(max-width: 767px)');
  let frame = 0;
  function update() {
    frame = 0;
    if (preference.matches || compact.matches) {
      for (const name of ['--fusion-lid-angle','--fusion-lid-brightness','--fusion-device-scale','--fusion-device-opacity','--fusion-copy-opacity','--fusion-copy-offset','--fusion-glow-opacity']) scene.style.removeProperty(name);
      for (const name of ['--fusion-third-offset','--fusion-third-scale','--fusion-third-opacity']) next.style.removeProperty(name);
      return;
    }
    const viewport = window.innerHeight;
    const bounds = scene.getBoundingClientRect();
    const progress = clamp(-bounds.top / Math.max(1, bounds.height - viewport));
    const opening = ease((progress - .035) / .46);
    const leaving = ease((progress - .72) / .27);
    const copyLeaving = ease((progress - .62) / .27);
    scene.style.setProperty('--fusion-lid-angle', `${(-77 * (1 - opening)).toFixed(2)}deg`);
    scene.style.setProperty('--fusion-lid-brightness', (.3 + .7 * opening).toFixed(3));
    scene.style.setProperty('--fusion-device-scale', (1 - .28 * leaving).toFixed(3));
    scene.style.setProperty('--fusion-device-opacity', (1 - .96 * leaving).toFixed(3));
    scene.style.setProperty('--fusion-copy-opacity', (1 - copyLeaving).toFixed(3));
    scene.style.setProperty('--fusion-copy-offset', `${(-18 * copyLeaving).toFixed(1)}px`);
    scene.style.setProperty('--fusion-glow-opacity', (.4 + .35 * opening - .4 * leaving).toFixed(3));
    const nextTop = next.getBoundingClientRect().top;
    const arrival = ease((viewport - nextTop) / (viewport * .8));
    next.style.setProperty('--fusion-third-offset', `${(46 * (1 - arrival)).toFixed(1)}px`);
    next.style.setProperty('--fusion-third-scale', (.955 + .045 * arrival).toFixed(3));
    next.style.setProperty('--fusion-third-opacity', (.55 + .45 * arrival).toFixed(3));
  }
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  preference.addEventListener('change', schedule);
  compact.addEventListener('change', schedule);
}

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
  initializeNotebookScene(preference);
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
