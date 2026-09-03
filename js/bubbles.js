/* =========================================================
   NULA — bąbelki w tle hero

   Osobne płótno 2D pod modelem puszki, nie bryły w scenie 3D. Przezroczysta
   kulka w WebGL-u, za którą nic nie stoi, nie ma czego załamywać i wychodzi
   z niej szary krążek — tutaj rysuję sam pierścień z refleksem, więc bąbelek
   czyta się jak bąbelek niezależnie od oświetlenia sceny.

   Warstwa leży między poświatą tła a puszką (z-index 1), nie łapie wskaźnika
   i zatrzymuje się, gdy hero zjedzie z ekranu.
   ========================================================= */
(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero__bubbles';
  canvas.setAttribute('aria-hidden', 'true');
  hero.appendChild(canvas);

  const g = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;

  function size() {
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const COUNT = 54;
  const bubbles = [];

  function reset(b, first) {
    // Rozkład potęgowy, ale spłaszczony: przy wykładniku 2.2 mediana promienia
    // wypadała ~3 px i pierścienie przy takiej wielkości gasły poniżej progu
    // widoczności — z całego płótna zostawało 0,01% niezerowych pikseli.
    b.r     = 5 + Math.pow(Math.random(), 1.5) * 26;
    b.x     = Math.random() * w;
    b.y     = first ? Math.random() * h : h + b.r * 3;
    b.speed = 10 + Math.random() * 22 + b.r * 1.4;   // większe płyną szybciej
    b.wobA  = 5 + Math.random() * 16;                // amplituda kołysania
    b.wobS  = .3 + Math.random() * .5;               // tempo kołysania
    b.phase = Math.random() * 6.283;
    b.alpha = .16 + Math.random() * .34;
  }

  // size() MUSI pójść pierwsze: reset() losuje pozycję z w/h, a te są zerami,
  // dopóki płótno nie dostanie wymiarów. Inaczej wszystkie bąbelki rodzą się
  // w rogu (0,0), natychmiast uciekają poza kadr i ekran zostaje pusty.
  size();
  for (let i = 0; i < COUNT; i++) {
    const b = {};
    reset(b, true);
    bubbles.push(b);
  }

  window.addEventListener('resize', size);

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
      .observe(hero);
  }

  let t0 = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - t0) / 1000);
    t0 = now;

    if (visible) {
      g.clearRect(0, 0, w, h);

      for (const b of bubbles) {
        b.y -= b.speed * dt;
        if (b.y + b.r < -12) reset(b, false);

        const x = b.x + Math.sin(now / 1000 * b.wobS + b.phase) * b.wobA;

        // sam pierścień — środek zostaje pusty, jak w prawdziwym bąbelku
        const ring = g.createRadialGradient(x, b.y, b.r * .15, x, b.y, b.r);
        ring.addColorStop(0,   `rgba(255,255,255,${b.alpha * .07})`);
        ring.addColorStop(.55, `rgba(255,255,255,${b.alpha * .16})`);
        ring.addColorStop(.88, `rgba(255,255,255,${b.alpha})`);
        ring.addColorStop(.97, `rgba(255,255,255,${b.alpha * .8})`);
        ring.addColorStop(1,   'rgba(255,255,255,0)');
        g.fillStyle = ring;
        g.beginPath(); g.arc(x, b.y, b.r, 0, 6.283); g.fill();

        // punktowy refleks u góry po lewej
        if (b.r > 7) {
          g.fillStyle = `rgba(255,255,255,${b.alpha * .85})`;
          g.beginPath();
          g.arc(x - b.r * .33, b.y - b.r * .36, Math.max(.7, b.r * .12), 0, 6.283);
          g.fill();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
