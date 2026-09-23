// Content stays visible without JavaScript. Animate once, only as it enters view.
(() => {
  const main = document.querySelector('.framer-yLbTn main.framer-1w30fu2');
  if (!main || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches) return;
  const active = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (entry.target.contains(document.activeElement)) continue;
      const animation = entry.target.animate([
        { opacity: .65, translate: '0 14px' },
        { opacity: 1, translate: '0 0' },
      ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      active.set(entry.target, animation);
      animation.onfinish = animation.oncancel = () => active.delete(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
  // Observe content groups, never whole sections, backgrounds, or the hero.
  main.querySelectorAll('.framer-1m5pe8e, .framer-td806k, .framer-jwc1zq, .framer-1xmtor, .framer-1jble4v > div, .framer-ufjcbz, .framer-6ywkq6, .framer-1ossc8g, .framer-3pe6yk, .framer-1lakdmu').forEach(target => {
    if (target.getBoundingClientRect().top >= window.innerHeight) observer.observe(target);
  });
  const stop = () => {
    observer.disconnect();
    active.forEach(animation => animation.cancel());
    active.clear();
  };
  preference.addEventListener('change', stop, { once: true });
  window.addEventListener('hashchange', stop, { once: true });
  window.addEventListener('pagehide', stop, { once: true });
  main.addEventListener('focusin', event => {
    active.forEach((animation, target) => {
      if (target.contains(event.target)) animation.cancel();
    });
  });
})();
