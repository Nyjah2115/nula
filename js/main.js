/* =========================================================
   NULA — przełączanie smaków, parallaksa hero, wejścia sekcji
   ========================================================= */
(() => {
  'use strict';

  const body   = document.body;
  const cans   = [...document.querySelectorAll('.can')];
  const chips  = [...document.querySelectorAll('.chip')];
  const cards  = [...document.querySelectorAll('.card')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- teksty zmieniane razem ze smakiem ------------------ */
  const COPY = {
    cherry: {
      text: 'Bąbelki, zimna woda źródlana i wyciśnięta wiśnia. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.',
      note: '330 ml · 0 g cukru · 0 kcal · 4% soku z wiśni'
    },
    blueberry: {
      text: 'Bąbelki, zimna woda źródlana i leśna jagoda. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.',
      note: '330 ml · 0 g cukru · 0 kcal · 3% soku z jagód'
    },
    lime: {
      text: 'Bąbelki, zimna woda źródlana i wyciśnięta limonka. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.',
      note: '330 ml · 0 g cukru · 0 kcal · 5% soku z limonki'
    }
  };

  const slots = {
    text: document.querySelector('[data-copy="text"]'),
    note: document.querySelector('[data-copy="note"]')
  };

  function setFlavor(name) {
    if (body.dataset.flavor === name) return;
    body.dataset.flavor = name;

    cans.forEach(c => c.classList.toggle('is-on', c.dataset.flavor === name));
    if (window.NULA3D) window.NULA3D.setFlavor(name);   // model 3D, jeśli wystartował
    chips.forEach(c => c.classList.toggle('is-on', c.dataset.flavor === name));

    // tekst wymieniamy w połowie przenikania, żeby nie migał
    Object.entries(slots).forEach(([key, el]) => {
      if (!el || !COPY[name]) return;
      el.style.transition = 'opacity .28s ease';
      el.style.opacity = '0';
      setTimeout(() => { el.textContent = COPY[name][key]; el.style.opacity = '1'; }, 280);
    });
  }

  chips.forEach(chip => chip.addEventListener('click', () => setFlavor(chip.dataset.flavor)));
  // najazd na kartę smaku w sekcji niżej też przestawia paletę strony
  cards.forEach(card => card.addEventListener('mouseenter', () => setFlavor(card.dataset.flavor)));

  /* --- pigułka nawigacji: podświetlenie jeździ za linkiem -- */
  const pill  = document.querySelector('.pill');
  const thumb = document.querySelector('.pill__thumb');
  const links = pill ? [...pill.querySelectorAll('a')] : [];

  function moveThumb(el) {
    if (!thumb || !el) return;
    thumb.style.width = el.offsetWidth + 'px';
    thumb.style.transform = `translateX(${el.offsetLeft - 5}px)`;
  }
  function activate(el) {
    links.forEach(a => a.classList.toggle('is-active', a === el));
    moveThumb(el);
  }
  links.forEach(a => a.addEventListener('click', () => activate(a)));
  if (links.length) {
    // czcionki dojeżdżają po pierwszym pomiarze — stąd druga próba
    const initial = links.find(a => a.classList.contains('is-active')) || links[0];
    moveThumb(initial);
    if (document.fonts) document.fonts.ready.then(() => moveThumb(
      links.find(a => a.classList.contains('is-active')) || links[0]
    ));
    window.addEventListener('resize', () => moveThumb(
      links.find(a => a.classList.contains('is-active')) || links[0]
    ));
  }

  // sekcja widoczna na ekranie ustawia aktywny link
  const sections = ['#top', '#sklad', '#zero', '#sklep']
    .map(h => document.querySelector(h === '#top' ? '#hero' : h))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const byId = { hero: 0, sklad: 1, zero: 2, sklep: 3 };
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const i = byId[e.target.id];
        if (i !== undefined && links[i]) activate(links[i]);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach(s => io.observe(s));
  }

  /* --- parallaksa hero: puszka i napis rozjeżdżają się ----- */
  const hero = document.querySelector('.hero');
  const script = document.querySelector('.hero__script');

  if (hero && !reduce) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = window.innerHeight;
        const p = Math.min(1, Math.max(0, window.scrollY / h));   // 0 → 1 przez pierwszy ekran
        hero.style.setProperty('--canY', (-p * 130) + 'px');
        hero.style.setProperty('--canScale', (1 + p * 0.14).toFixed(3));
        hero.style.setProperty('--scriptY', (p * 90) + 'px');
        if (script) script.style.opacity = String(1 - p * 0.85);
        ticking = false;
      });
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* --- wejścia sekcji ------------------------------------- */
  const targets = document.querySelectorAll(
    '.flavors .wrap > *, .zero .wrap > *, .specs__grid > *, .shop__inner > *'
  );
  targets.forEach(el => el.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = (e.target.dataset.d || 0) + 'ms';
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });

    targets.forEach((el, i) => { el.dataset.d = (i % 4) * 90; io.observe(el); });
  } else {
    targets.forEach(el => el.classList.add('is-in'));
  }
})();
