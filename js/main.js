/* =========================================================
   VIVRA — przełączanie smaków, parallaksa hero, wejścia sekcji
   ========================================================= */
(() => {
  'use strict';

  const body   = document.body;
  const cans   = [...document.querySelectorAll('.can')];
  const chips  = [...document.querySelectorAll('.chip')];
  const steps  = [...document.querySelectorAll('.step')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- teksty zmieniane razem ze smakiem ------------------ */
  const COPY = {
    cherry: {
      no: '01', flavour: 'Wiśnia', juice: '4%',
      text: 'Bąbelki, zimna woda źródlana i wyciśnięta wiśnia. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.'
    },
    blueberry: {
      no: '02', flavour: 'Jagoda', juice: '3%',
      text: 'Bąbelki, zimna woda źródlana i leśna jagoda. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.'
    },
    lime: {
      no: '03', flavour: 'Limonka', juice: '5%',
      text: 'Bąbelki, zimna woda źródlana i wyciśnięta limonka. Bez cukru, ' +
            'bez słodzików, bez barwników — 0 kcal w każdej puszce.'
    }
  };

  // pola podmieniane przy zmianie smaku: numer, nazwa, opis, udział soku
  const slots = {};
  ['text', 'no', 'flavour', 'juice'].forEach(k => {
    slots[k] = document.querySelector(`[data-copy="${k}"]`);
  });

  function setFlavor(name) {
    if (body.dataset.flavor === name) return;
    body.dataset.flavor = name;

    cans.forEach(c => c.classList.toggle('is-on', c.dataset.flavor === name));
    if (window.VIVRA3D) window.VIVRA3D.setFlavor(name);   // model 3D, jeśli wystartował
    chips.forEach(c => c.classList.toggle('is-on', c.dataset.flavor === name));

    // Teksty schodzą i wracają z lekkim przesunięciem względem siebie, żeby
    // wymiana nie wyglądała jak jedno mrugnięcie całej kolumny. Czas dobrany
    // pod przejście palety, które trwa około sekundy.
    Object.entries(slots).forEach(([key, el], i) => {
      if (!el || !COPY[name]) return;
      const lag = i * 55;
      el.style.transition = 'opacity .34s ease, transform .34s ease';
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(4px)';
      }, lag);
      setTimeout(() => {
        el.textContent = COPY[name][key];
        el.style.opacity = '1';
        el.style.transform = 'none';
      }, lag + 340);
    });
  }

  chips.forEach(chip => chip.addEventListener('click', () => setFlavor(chip.dataset.flavor)));

  /* --- sekcja smaków prowadzi puszkę scrollem ---------------
     Każdy krok zajmuje ekran; ten, którego środek jest najbliżej środka
     okna, przejmuje smak. Liczę to WPROST w zdarzeniu scrolla, a nie przez
     IntersectionObserver — obserwator dostarcza zdarzenia dopiero w klatce
     animacji, więc przy zdławionej pętli puszka rozjeżdżała się z tekstem.
     Tutaj tekst i model zmieniają się w tym samym momencie. --------- */
  function trackSteps() {
    if (!steps.length) return;
    const mid = window.innerHeight / 2;
    let best = null, bestDist = Infinity;

    steps.forEach(step => {
      const r = step.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = step; }
    });

    // krok liczy się tylko wtedy, gdy naprawdę wypełnia środek ekranu
    const r = best.getBoundingClientRect();
    const inView = r.top < mid && r.bottom > mid;
    steps.forEach(s => s.classList.toggle('is-live', inView && s === best));
    if (inView) setFlavor(best.dataset.flavor);
  }

  /* --- nazwa smaku wchodzi literami ------------------------
     Litery rozbijam raz, przy starcie, i podpinam każdej opóźnienie.
     Animacja rusza dopiero, gdy krok stanie się aktywny, więc przy
     przewijaniu w górę i w dół zagrywa się od nowa. -------------- */
  document.querySelectorAll('.step__name').forEach(el => {
    const tekst = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-label', tekst);
    [...tekst].forEach((znak, i) => {
      const span = document.createElement('span');
      span.className = 'ltr';
      span.textContent = znak === ' ' ? '\u00a0' : znak;
      span.style.transitionDelay = (i * 42) + 'ms';
      el.appendChild(span);
    });
  });

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

  /* --- parallaksa hero: puszka odjeżdża przy scrollu -------- */
  const hero = document.querySelector('.hero');
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
        ticking = false;
      });
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (steps.length) {
    document.addEventListener('scroll', trackSteps, { passive: true });
    window.addEventListener('resize', trackSteps);
    trackSteps();
  }

  /* --- wejścia sekcji ------------------------------------- */
  const targets = document.querySelectorAll(
    '.flavors__intro > *, .zero .wrap > *, .specs__grid > *, .shop__inner > *'
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
