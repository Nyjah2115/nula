/* =========================================================
   VIVRA — puszka jako model 3D (Three.js, WebGL)

   Bryła: walec z etykietą (czysty UV, tekstura nie rozjeżdża się
   po obwodzie) + dwa lathe'y na szyjkę z wieczkiem i na denko.
   Etykieta rysowana na canvasie, osobno dla każdego smaku.

   Dookoła latają owoce — modele 3D, po jednym komplecie na smak.
   Przy przełączeniu jeden zestaw się chowa, drugi wyrasta.

   Jeżeli WebGL nie wystartuje, strona zostaje przy płaskich renderach
   z <img class="can"> — <canvas> montuje się dopiero po udanej inicjalizacji.
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(() => {
  'use strict';

  const hero   = document.querySelector('.hero');
  const holder = document.querySelector('.hero__cans');
  if (!hero || !holder) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- paleta smaków -------------------------------------- */
  const FLAVORS = {
    cherry: {
      name:'Wiśnia', base:'#0f8f60', deep:'#03301f', light:'#1fb87e',
      blob:'#c8203c', mark:'#61091a', ink:'#ffffff', onBlob:'#ffffff', glow:0x0b8f5e
    },
    blueberry: {
      name:'Jagoda', base:'#2733a8', deep:'#070d3a', light:'#4a57de',
      blob:'#7d5cf0', mark:'#27186b', ink:'#ffffff', onBlob:'#ffffff', glow:0x0a49a0
    },
    lime: {
      name:'Limonka', base:'#4ea112', deep:'#123f04', light:'#79cc2b',
      blob:'#e0d02f', mark:'#2f6b0c', ink:'#ffffff', onBlob:'#183a06', glow:0x5fc93f
    }
  };

  /* =========================================================
     1. Rysunki owoców na etykietę (2D, canvas)
     ========================================================= */
  function drawCherryMark(g, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-26, 28); g.bezierCurveTo(-14, -18, 4, -34, 12, -52); g.stroke();
    g.beginPath(); g.moveTo(24, 34); g.bezierCurveTo(22, -8, 16, -30, 12, -52); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.arc(-30, 44, 22, 0, 6.284); g.fill();
    g.beginPath(); g.arc(28, 50, 24, 0, 6.284); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.arc(-36, 37, 6, 0, 6.284); g.fill();
    g.beginPath(); g.arc(21, 43, 6.5, 0, 6.284); g.fill();
    g.restore();
  }

  function drawBerryMark(g, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s);
    for (const [bx, by, r] of [[-30, 12, 24], [26, -4, 21], [2, 44, 19]]) {
      g.fillStyle = col;
      g.beginPath(); g.ellipse(bx, by, r, r * .88, 0, 0, 6.284); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3.4;
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.284;
        g.moveTo(bx, by - r * .5);
        g.lineTo(bx + Math.cos(a) * r * .34, by - r * .5 + Math.sin(a) * r * .3);
      }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.42)';
      g.beginPath(); g.arc(bx - r * .34, by - r * .1, r * .2, 0, 6.284); g.fill();
    }
    g.restore();
  }

  function drawLimeMark(g, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = col;
    g.beginPath(); g.arc(0, 20, 52, 0, 6.284); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(0, 20, 44, 0, 6.284); g.fill();
    for (let i = 0; i < 9; i++) {
      const a0 = i / 9 * 6.284 + .08, a1 = (i + 1) / 9 * 6.284 - .08;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, 20);
      g.arc(0, 20, 39, a0, a1); g.closePath(); g.fill();
    }
    g.restore();
  }

  // Rysunki wyżej są tylko zapasem. Docelowo na etykiecie ląduje render
  // tego samego modelu 3D, który lata dookoła puszki — dwa kółka z ogonkiem
  // wyglądały tanio i to była słuszna uwaga.
  const MARK = { cherry: drawCherryMark, blueberry: drawBerryMark, lime: drawLimeMark };
  const SPRITE = {};

  /* =========================================================
     2. Rozmiar tekstury etykiety
     ========================================================= */
  const TW = 2048, TH = 1024;

  /* =========================================================
     3. Tekstura etykiety
     ========================================================= */
  function labelTexture(key) {
    const f = FLAVORS[key];
    const W = TW, H = TH;              // dwa identyczne fronty obok siebie
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // pionowy gradient korpusu — góra jaśniejsza, dół przygaszony
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   f.light);
    grad.addColorStop(.42, f.base);
    grad.addColorStop(1,   f.deep);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // niebieskawy cień na bokach walca — dodaje obłości nawet bez światła
    for (const x of [0, W / 2]) {
      const sh = g.createLinearGradient(x, 0, x + W / 2, 0);
      sh.addColorStop(0,   'rgba(0,0,0,.34)');
      sh.addColorStop(.22, 'rgba(0,0,0,0)');
      sh.addColorStop(.72, 'rgba(0,0,0,0)');
      sh.addColorStop(1,   'rgba(0,0,0,.34)');
      g.fillStyle = sh; g.fillRect(x, 0, W / 2, H);
    }

    // Fala koloru smaku w dolnej części — twarda krawędź zamiast rozmytej
    // plamy. Sinus ma dokładnie dwa okresy na szerokość tekstury, czyli jeden
    // na front, dzięki czemu domyka się na szwie walca.
    g.save();
    g.fillStyle = f.blob;
    g.beginPath();
    const waveY = (x) => H * .618 + Math.sin(x / W * Math.PI * 4) * H * .030;
    g.moveTo(0, waveY(0));
    for (let x = 8; x <= W; x += 8) g.lineTo(x, waveY(x));
    g.lineTo(W, H); g.lineTo(0, H);
    g.closePath(); g.fill();
    // cienka jasna linia na grzbiecie fali
    g.globalAlpha = .5; g.strokeStyle = f.ink; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, waveY(0) - 12);
    for (let x = 8; x <= W; x += 8) g.lineTo(x, waveY(x) - 12);
    g.stroke();
    g.restore();

    // niezadrukowane pasy blachy przy krawędziach
    for (const [y0, y1] of [[0, H * .055], [H * .945, H]]) {
      const mg = g.createLinearGradient(0, y0, 0, y1);
      mg.addColorStop(0, 'rgba(226,232,236,.95)');
      mg.addColorStop(1, 'rgba(150,162,170,.85)');
      g.fillStyle = mg; g.fillRect(0, y0, W, y1 - y0);
    }

    // dwa fronty
    for (const cx of [W * .25, W * .75]) {
      // Delikatna poświata zamiast wielkiej plamy koloru: rozmyty krążek
      // tylko odcina owoc od tła (potrzebne zwłaszcza przy limonce, zielone
      // na zielonym), a nie zamalowuje pół etykiety.
      const rg = g.createRadialGradient(cx, H * .50, 0, cx, H * .50, W * .105);
      rg.addColorStop(0,   f.light);
      rg.addColorStop(.45, f.light);
      rg.addColorStop(1,   'rgba(0,0,0,0)');
      g.save(); g.globalAlpha = .42;
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, H * .50, W * .105, 0, 6.284); g.fill();
      g.restore();

      g.textAlign = 'center'; g.textBaseline = 'middle';

      // logotyp
      g.save();
      g.fillStyle = f.ink;
      g.font = '700 132px Inter, system-ui, sans-serif';
      g.letterSpacing = '38px';
      g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 18; g.shadowOffsetY = 5;
      g.fillText('VIVRA', cx + 19, H * .215);
      g.restore();

      // kreska + podpis kategorii
      g.save();
      g.globalAlpha = .6; g.strokeStyle = f.ink; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 150, H * .285); g.lineTo(cx + 150, H * .285); g.stroke();
      g.globalAlpha = .78; g.fillStyle = f.ink;
      g.font = '600 34px Inter, system-ui, sans-serif';
      g.letterSpacing = '11px';
      g.fillText('NAPÓJ GAZOWANY · ZERO', cx + 6, H * .345);
      g.restore();

      // owoc: render modelu 3D, a gdyby go nie było — rysunek zapasowy
      const sprite = SPRITE[key];
      if (sprite) {
        // miękki cień pod owocem, żeby nie wisiał w próżni
        g.save();
        g.globalAlpha = .3; g.fillStyle = '#000';
        g.beginPath(); g.ellipse(cx, H * .565, W * .052, H * .022, 0, 0, 6.284);
        g.filter = 'blur(14px)'; g.fill();
        g.restore();
        const box = W * .155;
        g.drawImage(sprite, cx - box / 2, H * .50 - box / 2, box, box);
      } else {
        MARK[key](g, cx, H * .50, 1.05, f.mark);
      }

      // nazwa smaku pismem odręcznym — leży już na fali koloru
      g.save();
      g.fillStyle = f.onBlob;
      g.font = '400 150px Yellowtail, cursive';
      g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
      g.fillText(f.name, cx, H * .715);
      g.restore();

      // stopka
      g.save();
      g.globalAlpha = .78; g.fillStyle = f.onBlob;
      g.font = '600 32px Inter, system-ui, sans-serif';
      g.letterSpacing = '7px';
      g.fillText('BEZ CUKRU · BEZ KALORII · 330 ML', cx + 4, H * .845);
      g.restore();
    }

    g.letterSpacing = '0px';

    // ziarno farby — bez tego nadruk jest idealnie gładki i wygląda cyfrowo
    const grain = g.createImageData(W, H);
    for (let i = 0; i < grain.data.length; i += 4) {
      const v = 118 + Math.random() * 20;
      grain.data[i] = grain.data[i+1] = grain.data[i+2] = v;
      grain.data[i+3] = 26;
    }
    const gc = document.createElement('canvas');
    gc.width = W; gc.height = H;
    gc.getContext('2d').putImageData(grain, 0, 0);
    g.save(); g.globalCompositeOperation = 'overlay'; g.drawImage(gc, 0, 0); g.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.offset.x = .25;      // front walca wypada na u=0.5 — cofamy o ćwierć obwodu
    tex.anisotropy = 8;
    return tex;
  }

  /* --- wieczko: szczotkowane aluminium z rowkiem i zawleczką --- */
  function lidTexture() {
    const S = 1024, R = S / 2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.translate(R, R);

    g.fillStyle = '#dfe4e8';
    g.beginPath(); g.arc(0, 0, R, 0, 6.284); g.fill();

    // promieniste szczotkowanie
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * 6.284;
      const r0 = Math.random() * R * .96, r1 = r0 + 4 + Math.random() * 40;
      g.strokeStyle = Math.random() < .5 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.13)';
      g.lineWidth = .6 + Math.random() * 1.6;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }

    // zagłębienie wieczka
    const dish = g.createRadialGradient(0, 0, R * .1, 0, 0, R * .92);
    dish.addColorStop(0, 'rgba(255,255,255,.16)');
    dish.addColorStop(.72, 'rgba(0,0,0,0)');
    dish.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = dish; g.beginPath(); g.arc(0, 0, R * .95, 0, 6.284); g.fill();

    // rowek otwierania — kropla wytłoczona w blasze
    const score = (dx, dy, w, h) => {
      g.beginPath();
      g.moveTo(dx, dy - h);
      g.bezierCurveTo(dx + w, dy - h * .9, dx + w * .95, dy + h * .55, dx, dy + h);
      g.bezierCurveTo(dx - w * .95, dy + h * .55, dx - w, dy - h * .9, dx, dy - h);
      g.closePath();
    };
    g.save();
    g.translate(0, R * .22); g.rotate(.1);
    g.lineWidth = R * .028;
    g.strokeStyle = 'rgba(0,0,0,.5)';  score(0, 0, R * .30, R * .34); g.stroke();
    g.lineWidth = R * .014;
    g.strokeStyle = 'rgba(255,255,255,.5)'; score(-R*.008, -R*.01, R*.30, R*.34); g.stroke();
    g.restore();

    // zawleczka
    g.save();
    g.translate(0, -R * .18); g.rotate(.1);
    g.fillStyle = 'rgba(200,208,214,.98)';
    g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = R * .012;
    g.beginPath();
    if (g.roundRect) g.roundRect(-R * .17, -R * .10, R * .34, R * .62, R * .16);
    else g.rect(-R * .17, -R * .10, R * .34, R * .62);
    g.fill(); g.stroke();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(0, R * .27, R * .10, R * .17, 0, 0, 6.284); g.fill();
    g.globalCompositeOperation = 'source-over';
    // nit
    g.fillStyle = '#cfd6db';
    g.beginPath(); g.arc(0, R * .02, R * .075, 0, 6.284); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = R * .012;
    g.beginPath(); g.arc(0, R * .02, R * .075, 0, 6.284); g.stroke();
    g.restore();

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* --- skórka limonki: drobne wgłębienia ------------------ */
  function peelBump() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 1 + Math.random() * 3.2;
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, 'rgba(40,40,40,.9)');
      d.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = d; g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* --- przekrój limonki na płaską ściankę połówki --------- */
  function sliceTexture() {
    const S = 1024, R = S / 2;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.translate(R, R);

    g.fillStyle = '#5aa81c';                       // skórka
    g.beginPath(); g.arc(0, 0, R * .99, 0, 6.284); g.fill();
    g.fillStyle = '#e8f5cf';                       // albedo
    g.beginPath(); g.arc(0, 0, R * .90, 0, 6.284); g.fill();

    for (let i = 0; i < 10; i++) {                 // cząstki
      const a0 = i / 10 * 6.284 + .055, a1 = (i + 1) / 10 * 6.284 - .055;
      const seg = g.createRadialGradient(0, 0, R * .08, 0, 0, R * .84);
      seg.addColorStop(0, '#c6e88a');
      seg.addColorStop(.7, '#a7dc4f');
      seg.addColorStop(1, '#8fd033');
      g.fillStyle = seg;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * .84, a0, a1); g.closePath(); g.fill();

      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = R * .012;
      g.beginPath(); g.moveTo(0, 0);
      g.lineTo(Math.cos((a0 + a1) / 2) * R * .8, Math.sin((a0 + a1) / 2) * R * .8);
      g.stroke();
    }
    g.fillStyle = '#eaf7d2';
    g.beginPath(); g.arc(0, 0, R * .075, 0, 6.284); g.fill();

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* =========================================================
     3. Owoce jako bryły
     ========================================================= */
  const SPHERE = new THREE.SphereGeometry(1, 30, 22);
  const HEMI   = new THREE.SphereGeometry(1, 34, 18, 0, 6.284, 0, Math.PI / 2);
  const DISC   = new THREE.CircleGeometry(1, 40);

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x7d7a2a, roughness: .72 });
  const peel    = peelBump();
  const slice   = sliceTexture();

  const cherryMat = new THREE.MeshPhysicalMaterial({
    color: 0x7c0917, roughness: .13, metalness: 0,
    bumpMap: peel, bumpScale: .0025,              // ledwie wyczuwalna skóra owocu
    clearcoat: 1, clearcoatRoughness: .035,
    envMapIntensity: 1.55
  });
  // jagoda ma nalot woskowy — matowy, jasny welon na ciemnej skórce
  const berryMat = new THREE.MeshPhysicalMaterial({
    color: 0x232a63, roughness: .68, metalness: 0,
    bumpMap: peel, bumpScale: .006,
    sheen: 1, sheenColor: new THREE.Color(0xa9bde0), sheenRoughness: .85,
    clearcoat: .35, clearcoatRoughness: .55, envMapIntensity: .95
  });
  const berryCrownMat = new THREE.MeshStandardMaterial({ color: 0x1a1f4d, roughness: .8 });
  const limeMat = new THREE.MeshPhysicalMaterial({
    color: 0x62b81c, roughness: .55, metalness: 0,
    bumpMap: peel, bumpScale: .02,
    clearcoat: .7, clearcoatRoughness: .3, envMapIntensity: 1.05
  });
  const sliceMat = new THREE.MeshPhysicalMaterial({
    map: slice, roughness: .3, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.2
  });

  function makeCherry() {
    const grp = new THREE.Group();
    const f = new THREE.Mesh(SPHERE, cherryMat);
    f.scale.set(1, .93, 1);
    grp.add(f);

    // wgłębienie pod ogonkiem — mała ciemna czasza
    const dent = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: 0x4a0510, roughness: .5 }));
    dent.scale.setScalar(.22); dent.position.y = .84;
    grp.add(dent);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .82, 0),
      new THREE.Vector3(.18, 1.5, .12),
      new THREE.Vector3(.52, 2.15, .08),
      new THREE.Vector3(.92, 2.42, -.06)
    ]);
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 22, .052, 7), stemMat));
    return grp;
  }

  function makeBlueberry() {
    const grp = new THREE.Group();
    const b = new THREE.Mesh(SPHERE, berryMat);
    b.scale.set(1, .84, 1);
    grp.add(b);

    // koronka: pięć drobnych ząbków wokół zagłębienia
    const tooth = new THREE.ConeGeometry(.12, .3, 7);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.284;
      const t = new THREE.Mesh(tooth, berryCrownMat);
      t.position.set(Math.cos(a) * .26, .78, Math.sin(a) * .26);
      t.rotation.z = -Math.cos(a) * .8;
      t.rotation.x =  Math.sin(a) * .8;
      grp.add(t);
    }
    const hole = new THREE.Mesh(SPHERE, berryCrownMat);
    hole.scale.set(.3, .16, .3); hole.position.y = .76;
    grp.add(hole);
    return grp;
  }

  function makeLime() {
    const grp = new THREE.Group();
    const l = new THREE.Mesh(SPHERE, limeMat);
    l.scale.set(1, .9, 1);
    grp.add(l);
    for (const y of [.9, -.9]) {                   // dwa dziobki
      const n = new THREE.Mesh(SPHERE, limeMat);
      n.scale.setScalar(.16); n.position.y = y * .98;
      grp.add(n);
    }
    return grp;
  }

  // plaster: krążek z przekrojem na obu płaskich ściankach i skórką na rancie
  const SLICE_GEO = new THREE.CylinderGeometry(1, 1, .13, 44, 1, false);
  function makeLimeSlice() {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(SLICE_GEO, [limeMat, sliceMat, sliceMat]);
    m.rotation.x = Math.PI / 2;                    // przekrojem do kamery
    grp.add(m);
    grp.userData.flat = true;                      // nie obracać go losowo na wszystkie strony
    return grp;
  }

  // Proceduralne bryły zostają jako zapas — jeżeli GLB się nie wczyta
  // (brak pliku, błąd sieci), scena wygląda tak jak przedtem zamiast pustej.
  const FALLBACK = {
    cherry:    [makeCherry],
    blueberry: [makeBlueberry],
    lime:      [makeLimeSlice]
  };

  // Modele z Higgsfielda (tripo_3d). Każdy przychodzi w swojej skali
  // i ze środkiem gdzie popadnie, więc po wczytaniu normalizuję: środek
  // bryły do zera i największy rozmiar POZIOMY do 1. Poziomy, nie ogólny —
  // inaczej ogonek wiśni zjadłby całą skalę i sam owoc byłby mikroskopijny.
  const MODEL_FILES = {
    cherry:    ['media/models/cherry.glb'],
    blueberry: ['media/models/blueberry.glb'],
    lime:      ['media/models/lime-wedge.glb']   // same ćwiartki, bez całych limonek
  };

  function normalize(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const mid  = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z) || Math.max(size.x, size.y, size.z) || 1;
    root.position.sub(mid);
    const holder = new THREE.Group();
    holder.add(root);
    // 2/span, nie 1/span: proceduralne owoce stoją na kuli o promieniu 1,
    // czyli rozpiętości 2, i pod to są dobrane mnożniki skali niżej
    holder.scale.setScalar(2 / span);
    const outer = new THREE.Group();
    outer.add(holder);
    outer.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      const m = o.material;
      if (m) { m.envMapIntensity = 1.35; m.side = THREE.FrontSide; }
    });
    return outer;
  }

  // Ćwiartka limonki ma sens tylko widziana od przekroju. Obracam ją tak,
  // żeby jej najcieńsza oś patrzyła w stronę kamery, i oznaczam jako płaską —
  // dzięki temu populateFruit nie rozrzuci jej losowo na wszystkie strony.
  function faceCut(proto) {
    const box = new THREE.Box3().setFromObject(proto);
    const s = box.getSize(new THREE.Vector3());
    const holder = proto.children[0];
    if (s.x <= s.y && s.x <= s.z)      holder.rotation.y =  Math.PI / 2;
    else if (s.y <= s.x && s.y <= s.z) holder.rotation.x = -Math.PI / 2;
    proto.userData.flat = true;
  }

  function loadModels() {
    const loader = new GLTFLoader();
    const jobs = [];
    const built = {};
    Object.entries(MODEL_FILES).forEach(([key, files]) => {
      built[key] = [];
      files.forEach((url, i) => {
        jobs.push(new Promise(res => {
          loader.load(url,
            gltf => {
              const proto = normalize(gltf.scene);
              if (/wedge|slice/.test(url)) faceCut(proto);
              built[key][i] = proto;
              res();
            },
            undefined,
            () => { built[key][i] = null; res(); });     // brak modelu = zapas
        }));
      });
    });
    return Promise.all(jobs).then(() => {
      const out = {};
      Object.keys(MODEL_FILES).forEach(key => {
        const ok = built[key].filter(Boolean);
        out[key] = ok.length
          ? ok.map(proto => () => proto.clone(true))
          : FALLBACK[key];
      });
      return out;
    });
  }

  /* =========================================================
     4. Scena
     ========================================================= */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
  } catch (e) { return; }
  if (!renderer.getContext()) return;

  const canvas = renderer.domElement;
  canvas.className = 'hero__stage';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  /* --- studio: otoczenie z sufitem, podłogą i softboxami ---
     To ono robi cały połysk na blasze i na owocach — im bogatsze,
     tym mniej „plastikowo" wygląda materiał. --------------- */
  function studioEnv() {
    const W = 2048, H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // sufit → horyzont → podłoga
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   '#6e747d');
    bg.addColorStop(.28, '#3a3f47');
    bg.addColorStop(.5,  '#14171b');
    bg.addColorStop(.52, '#20242a');
    bg.addColorStop(1,   '#080a0d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // ciepły klucz z lewej, chłodne wypełnienie z prawej
    for (const [x, w, top, hgt, col, a] of [
      [W*.13, W*.075, H*.05, H*.52, '255,248,235', 1],
      [W*.34, W*.030, H*.12, H*.34, '255,255,255', .5],
      [W*.55, W*.055, H*.08, H*.44, '226,238,255', .8],
      [W*.83, W*.045, H*.14, H*.36, '210,226,255', .55]
    ]) {
      const lg = g.createLinearGradient(x - w, 0, x + w, 0);
      lg.addColorStop(0,  `rgba(${col},0)`);
      lg.addColorStop(.5, `rgba(${col},${a})`);
      lg.addColorStop(1,  `rgba(${col},0)`);
      g.fillStyle = lg;
      const vg = g.createLinearGradient(0, top, 0, top + hgt);
      vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillRect(x - w, top, w * 2, hgt);
    }

    // odblask podłogi pod puszką
    const fg = g.createRadialGradient(W*.5, H*.62, 0, W*.5, H*.62, W*.3);
    fg.addColorStop(0, 'rgba(255,255,255,.22)');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fg; g.fillRect(0, H*.5, W, H*.5);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
    return env;
  }

  const scene = new THREE.Scene();
  scene.environment = studioEnv();

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 0, 4.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, .55));
  const key  = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-2.4, 2.6, 3.2);
  const rim  = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(3.0, .6, -2.2);
  const fill = new THREE.DirectionalLight(0xffffff, .7);  fill.position.set(1.6, -2.2, 2.0);
  scene.add(key, rim, fill);

  const glow = new THREE.PointLight(FLAVORS.cherry.glow, 6, 8, 2);
  glow.position.set(0, 0, -1.6);
  scene.add(glow);

  /* --- puszka --------------------------------------------- */
  const R = .43, TOP = .75, BOT = -.75;            // klasyczna puszka 330 ml (66 x 115 mm)
  const can = new THREE.Group();

  const labels = {};
  Object.keys(FLAVORS).forEach(k => { labels[k] = labelTexture(k); });
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: labels.cherry,
    roughness: .52, metalness: .04,
    clearcoat: 1, clearcoatRoughness: .08,
    envMapIntensity: 1.2
  });
  // Bryła proceduralna leci od razu, żeby coś było na ekranie, i zostaje
  // jako zapas, gdyby model z generatora się nie wczytał.
  const shell = new THREE.Group();
  can.add(shell);
  shell.add(new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, TOP - BOT, 180, 1, true),
    bodyMat
  ));

  const metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6ebef, metalness: 1, roughness: .22,
    anisotropy: .5, anisotropyRotation: Math.PI / 2,    // szczotkowanie wzdłuż obwodu
    envMapIntensity: 2.1, side: THREE.DoubleSide
  });
  const lidMat = new THREE.MeshPhysicalMaterial({
    map: lidTexture(), metalness: 1, roughness: .26,
    anisotropy: .5, envMapIntensity: 2.1
  });

  // Tarcza wieczka. Bez niej puszka jest otwartą rurą — widać przez nią
  // wnętrze. Startuje w bryle zapasowej, a po wczytaniu modelu przenosi się
  // na jego rant.
  const lid = new THREE.Mesh(new THREE.CircleGeometry(R * .74, 72), lidMat);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = TOP + .1478;

  const lathe = (pts) => new THREE.LatheGeometry(
    pts.map(p => new THREE.Vector2(p[0], p[1])), 180
  );

  // Profil przejść zdjęty z modelu generatora (tools/glbprofile.py):
  // korpus trzyma pion do ~89% wysokości i dopiero tam się załamuje,
  // a rant ROZSZERZA SIĘ z powrotem — to zawinięcie blachy. Poprzedni obrys
  // zwężał się monotonicznie i przez to wyglądał jak zaokrąglony walec.
  shell.add(new THREE.Mesh(lathe([
    [R,      TOP       ], [R*.998, TOP+.030], [R*.985, TOP+.055], [R*.945, TOP+.080],
    [R*.880, TOP+.100  ], [R*.826, TOP+.116], [R*.802, TOP+.128], [R*.818, TOP+.140],
    [R*.845, TOP+.150  ], [R*.842, TOP+.161], [R*.800, TOP+.163], [R*.770, TOP+.152],
    [R*.40,  TOP+.146  ], [0,      TOP+.150]
  ]), metalMat));

  // denko: zaokrąglenie na dolnych ~4% wysokości, potem kopuła do środka
  shell.add(lid);
  shell.add(new THREE.Mesh(lathe([
    [R,      BOT       ], [R*.995, BOT-.020], [R*.965, BOT-.042], [R*.905, BOT-.060],
    [R*.830, BOT-.072  ], [R*.800, BOT-.078], [R*.700, BOT-.070], [R*.45,  BOT-.048],
    [R*.20,  BOT-.036  ], [0,      BOT-.034]
  ]), metalMat));

  /* =========================================================
     Puszka z modelu (media/models/can.glb)

     Model przyszedł BEZ tekstur i bez sensownych UV, więc współrzędne
     liczę sam rzutem walcowym: u z kąta wokół osi, v z wysokości.
     Front (+Z) musi wypaść na środku frontu etykiety — stąd +0.25
     w kącie, bo sama tekstura ma jeszcze offset 0.25.

     Trójkąty przecinające szew mają u skaczące z ~0.99 na ~0.01 i bez
     poprawki rozmazałyby całą etykietę wstecz. Wierzchołki po niższej
     stronie dubluję z u+1 (tekstura się zawija, więc to legalne).

     Podział na materiały idzie po wysokości: korpus dostaje etykietę,
     szyjka i denko blachę. Progi wzięte z profilu — dno zaokrągla się
     do 4,8% wysokości, bark zaczyna się na 88,5%.
     ========================================================= */
  function cylindricalUV(geo) {
    const pos = geo.attributes.position;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const h = (y1 - y0) || 1;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      // kąt LICZONY W MINUS: przy dodatnim napis wychodzi odbity lustrzanie,
      // bo patrzymy na walec od zewnątrz. Stała 0.75 sadza front (+Z) na 0.5,
      // a offset 0.25 samej tekstury dosuwa go na środek frontu etykiety.
      let u = -Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) + .75;
      u -= Math.floor(u);
      uv[i * 2]     = u;
      uv[i * 2 + 1] = (pos.getY(i) - y0) / h;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  function fixSeam(geo) {
    const idx = Array.from(geo.index.array);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv  = geo.attributes.uv;

    const addPos = [], addNor = [], addUv = [], copy = new Map();
    let next = pos.count;

    for (let t = 0; t < idx.length; t += 3) {
      const u = [uv.getX(idx[t]), uv.getX(idx[t+1]), uv.getX(idx[t+2])];
      if (Math.max(...u) - Math.min(...u) <= .5) continue;
      for (let k = 0; k < 3; k++) {
        const vi = idx[t + k];
        if (uv.getX(vi) >= .5) continue;
        let ni = copy.get(vi);
        if (ni === undefined) {
          ni = next++;
          copy.set(vi, ni);
          addPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
          if (nor) addNor.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
          addUv.push(uv.getX(vi) + 1, uv.getY(vi));
        }
        idx[t + k] = ni;
      }
    }
    if (!addPos.length) { geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); return; }

    const grow = (attr, extra, size) => {
      const out = new Float32Array(attr.count * size + extra.length);
      out.set(attr.array.subarray(0, attr.count * size), 0);
      out.set(extra, attr.count * size);
      return new THREE.BufferAttribute(out, size);
    };
    geo.setAttribute('position', grow(pos, addPos, 3));
    if (nor) geo.setAttribute('normal', grow(nor, addNor, 3));
    geo.setAttribute('uv', grow(uv, addUv, 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  }

  // loV/hiV = zakres korpusu (etykieta), cutV = wysokość, powyżej której
  // geometria modelu leci do kosza. Generator zrobił wieczko jako kopułę
  // WYSTAJĄCĄ ponad rant, zamiast płaskiego, wpuszczonego lidu — wygląda to
  // jak blob, więc górę odcinam i zastępuję własnym rantem z zawleczką.
  function splitByHeight(geo, loV, hiV, cutV) {
    const idx = geo.index.array, uv = geo.attributes.uv;
    const label = [], metal = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t+1], c = idx[t+2];
      const v = [uv.getY(a), uv.getY(b), uv.getY(c)];
      if (Math.max(...v) > cutV) continue;
      const dst = (Math.min(...v) >= loV && Math.max(...v) <= hiV) ? label : metal;
      dst.push(a, b, c);
    }
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(label.concat(metal)), 1));
    geo.clearGroups();
    geo.addGroup(0, label.length, 0);
    geo.addGroup(label.length, metal.length, 1);
  }

  let canLoaded;
  const canReady = new Promise(r => { canLoaded = r; });

  new GLTFLoader().load('media/models/can.glb', gltf => {
    let src = null;
    gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
    if (!src) return;

    const geo = src.geometry.index ? src.geometry : src.geometry.toNonIndexed();
    if (!geo.index) {
      const n = geo.attributes.position.count;
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array([...Array(n).keys()]), 1));
    }
    cylindricalUV(geo);
    fixSeam(geo);
    splitByHeight(geo, .048, .892, .963);
    geo.computeBoundingBox();

    const mesh = new THREE.Mesh(geo, [bodyMat, metalMat]);

    // Skalowanie nierównomierne: model jest smuklejszy (H/D 2,3) niż puszka,
    // o którą prosił Dawid (1,74), więc poziom rozciągam mocniej niż pion.
    const b = geo.boundingBox;
    const size = b.getSize(new THREE.Vector3());
    const mid  = b.getCenter(new THREE.Vector3());
    const hTarget = (TOP + .163) - (BOT - .078);
    mesh.scale.set(2 * R / size.x, hTarget / size.y, 2 * R / size.z);
    mesh.position.set(
      -mid.x * (2 * R / size.x),
      ((TOP + .163) + (BOT - .078)) / 2 - mid.y * (hTarget / size.y),
      -mid.z * (2 * R / size.z)
    );

    shell.visible = false;          // proceduralny zapas schodzi ze sceny
    can.add(mesh);

    // rant i wieczko w miejsce odciętej kopuły; wysokości są bezwzględne,
    // dobrane do miejsca cięcia modelu (v = 0.963 wypada na y ≈ 0.849)
    // Rant DOMYKA SIĘ do osi. Wcześniej kończył się otworem, a tarcza wieczka
    // leżała pod nim z małym odstępem — pod kątem prześwitywał przez to ciemny
    // pierścień, czyli szpara przy górnej krawędzi.
    const cap = new THREE.Mesh(lathe([
      [R*.803, .849], [R*.815, .858], [R*.838, .868], [R*.846, .877],
      [R*.843, .886], [R*.815, .891], [R*.790, .883], [R*.780, .8700],
      [R*.42,  .8680], [0, .8676]
    ]), metalMat);
    can.add(cap);

    // tarcza leży odrobinę NAD dnem rantu i jest od niego szersza, więc jej
    // krawędź chowa się w metalu zamiast zostawiać prześwit
    lid.position.y = .8712;
    lid.scale.setScalar(.79 / .74);
    lid.visible = true;
    can.add(lid);                     // zabieramy ją z ukrytej grupy zapasowej
    canLoaded();
  }, undefined, err => {
    // GLTFLoader opakowuje onLoad w try/catch i kieruje wyjątek TUTAJ, więc
    // bez tego logu błąd w składaniu puszki przepada bez śladu.
    console.warn('Puszka z modelu nie została złożona, zostaje bryła zapasowa:', err);
    shell.visible = true;
    canLoaded();
  });

  can.rotation.z = -0.26;
  can.rotation.x =  0.06;
  can.scale.setScalar(0.72);
  scene.add(can);

  /* --- bąbelki (zawsze) + owoce (na smak) ----------------- */
  const orbit = new THREE.Group();
  scene.add(orbit);

  const props = [];      // { m, set, base, s0, sp, ph, spin }

  function place(i, n, spread) {
    const ang = (i / n) * 6.284 + Math.random() * .55;
    const rad = .60 + Math.random() * spread;
    return new THREE.Vector3(
      Math.cos(ang) * rad * 1.4,
      (Math.random() - .5) * 1.55,
      Math.sin(ang) * rad - .15
    );
  }

  // owoce — komplet na każdy smak; wołane dopiero, gdy modele są gotowe
  function populateFruit(BUILD) {
    const start = document.body.dataset.flavor || 'cherry';
    Object.keys(BUILD).forEach(k => {
      const makers = BUILD[k];
      for (let i = 0; i < 11; i++) {
        const g = makers[i % makers.length]();
        g.position.copy(place(i, 11, .82));
        const s = .072 + Math.random() * .042;
        g.scale.setScalar(s);
        if (g.userData.flat) {
          g.rotation.set((Math.random() - .5) * .7, (Math.random() - .5) * .9, Math.random() * 6.28);
        } else {
          g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        }
        g.visible = (k === start);
        orbit.add(g);
        props.push({
          m: g, set: k, base: g.position.y, s0: s,
          sp: .5 + Math.random(), ph: Math.random() * 6.28,
          spin: (Math.random() - .5) * .35
        });
      }
    });
  }

  const grow = { cherry: 1, blueberry: 0, lime: 0 };   // 0…1, animowane

  /* =========================================================
     5. Sterowanie
     ========================================================= */
  /* Poprzednia wersja obracała puszkę SAMĄ PRĘDKOŚCIĄ, która zaraz wygasała,
     więc po puszczeniu wracała tam, gdzie była — jak na gumce. Do tego sam
     ruch myszy nad hero obracał ją o ponad radian i walczył z przeciąganiem.

     Teraz jest normalny model: `angle` to kąt trwały, przeciąganie przesuwa
     go jeden do jednego z kursorem, a przy puszczeniu zostaje bezwładność
     wyliczona z ostatniego ruchu. Najazd myszy daje tylko drobne odchylenie
     DODAWANE na wierzch, którego nic nie akumuluje. Tarcie i wygładzenia
     liczone z dt, więc na ekranie 120 Hz działa tak samo jak na 60 Hz. */
  const DRAG_RAD_PER_PX = .011;   // ~90 px na radian
  const FRICTION        = .08;    // ile prędkości zostaje po sekundzie
  const AUTO_SPIN       = .16;    // rad/s, gdy nikt nie dotyka
  const HOVER_YAW       = .22;    // maksymalne odchylenie od najazdu myszy

  const state = {
    angle: 0, vel: 0, idle: 0,
    hover: 0, hoverT: 0, pitch: 0, pitchT: 0,
    scroll: 0, drag: false, lastX: 0, lastT: 0
  };

  hero.addEventListener('pointermove', e => {
    if (state.drag) return;
    const r = hero.getBoundingClientRect();
    state.hoverT =  ((e.clientX - r.left) / r.width  - .5) * 2 * HOVER_YAW;
    state.pitchT = -((e.clientY - r.top)  / r.height - .5) * 0.42;
  });
  hero.addEventListener('pointerleave', () => { state.hoverT = 0; state.pitchT = 0; });

  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('.chip, a, button')) return;   // UI ma pierwszeństwo
    state.drag  = true;
    state.lastX = e.clientX;
    state.lastT = performance.now();
    state.vel   = 0;                 // chwytamy puszkę w locie, nie doganiamy jej
    state.hoverT = 0;
    hero.setPointerCapture(e.pointerId);
    hero.style.cursor = 'grabbing';
  });
  hero.addEventListener('pointermove', e => {
    if (!state.drag) return;
    const now = performance.now();
    const d   = (e.clientX - state.lastX) * DRAG_RAD_PER_PX;
    const dt  = Math.max(8, now - state.lastT) / 1000;
    state.angle += d;                // kąt zmienia się TRWALE
    state.vel    = d / dt;           // a to jest wyrzut po puszczeniu
    state.lastX  = e.clientX;
    state.lastT  = now;
  });
  const endDrag = e => {
    if (!state.drag) return;
    state.drag = false;
    hero.style.cursor = 'grab';
    // ruch sprzed dłuższej chwili nie może udawać zamachu
    if (performance.now() - state.lastT > 90) state.vel = 0;
    if (e && e.pointerId !== undefined && hero.hasPointerCapture(e.pointerId)) {
      hero.releasePointerCapture(e.pointerId);
    }
  };
  hero.addEventListener('pointerup', endDrag);
  hero.addEventListener('pointercancel', endDrag);
  hero.addEventListener('lostpointercapture', endDrag);

  document.addEventListener('scroll', () => {
    // Zasięg mierzę przy każdym scrollu, a nie raz przy starcie: strona rośnie
    // w trakcie ładowania (czcionki, modele), więc wartość policzona na dzień
    // dobry potrafi się zdezaktualizować i puszka nie zeszłaby z kadru.
    if (flavors) {
      const r = flavors.getBoundingClientRect();
      stageEnd = Math.max(1, r.bottom + window.scrollY - window.innerHeight * .55);
    }
    state.scroll = Math.min(1, Math.max(0, window.scrollY / stageEnd));
  }, { passive: true });

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /* --- zmiana smaku --------------------------------------- */
  let active = 'cherry';

  // Płynność przejścia psuły trzy rzeczy naraz i każda leczy się inaczej:
  //  – etykieta podmieniała się po stałych 320 ms, bez związku z tym, gdzie
  //    faktycznie jest front puszki, więc przy wolniejszym obrocie dało się
  //    złapać cięcie; teraz decyduje przebyty KĄT, z zapasem czasowym,
  //  – kolor poświaty skakał jednym przypisaniem; teraz jedzie po smoothstep,
  //  – zamach dokładał całą prędkość w jednej klatce; teraz rozkłada się
  //    na ułamek sekundy, więc start jest miękki.
  let pendingLabel = null, swapAtAngle = 0, swapDeadline = 0;
  let impulse = 0;
  const glowFrom = new THREE.Color(), glowTo = new THREE.Color();
  let glowT = 1;

  function setFlavor(name) {
    const f = FLAVORS[name];
    if (!f || name === active) return;
    active = name;

    impulse = 13;
    glowFrom.copy(glow.color);
    glowTo.setHex(f.glow);
    glowT = 0;

    pendingLabel = name;
    swapAtAngle  = state.angle + Math.PI * .85;   // gdy front odjedzie w tył
    swapDeadline = performance.now() + 1400;      // awaryjnie, gdyby ktoś przytrzymał
  }
  window.VIVRA3D = { setFlavor, can, camera, scene, state };   // przydatne przy podglądzie

  /* =========================================================
     6. Pętla i rozmiar
     ========================================================= */
  // Na szerokim ekranie puszka stoi w prawej części kadru — treść ma wtedy
  // całą lewą kolumnę dla siebie. Wąsko wraca na środek, bo tam układ
  // przechodzi na jedną kolumnę.
  // Płótno jest przypięte do okna i przechodzi przez kilka sekcji, więc
  // wymiary bierzemy z okna, a nie z hero.
  const flavors = document.querySelector('.flavors');
  let wide = true, stageEnd = 1;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 6.6 : 4.6;
    camera.updateProjectionMatrix();
    wide = w / h > 1.15;

    // Sekwencja trwa od góry strony do końca sekcji smaków. Na podstronach,
    // gdzie tej sekcji nie ma, zasięg jest nieskończony — postęp zostaje na
    // zerze i puszka po prostu stoi w swoim miejscu, zamiast od razu odlecieć.
    if (flavors) {
      const r = flavors.getBoundingClientRect();
      stageEnd = Math.max(1, r.bottom + window.scrollY - h * .55);
    } else {
      // Podstrona bez sekwencji: zasięgiem jest samo hero, więc puszka
      // odjeżdża w górę dokładnie wtedy, gdy schodzi z niego wzrok.
      stageEnd = Math.max(1, hero.offsetHeight);
    }
  }
  window.addEventListener('resize', resize);

  let t0 = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - t0) / 1000); t0 = now;

    // zamach rozłożony na kilka klatek zamiast skoku prędkości
    if (impulse > 0) {
      const take = Math.min(impulse, 70 * dt);
      state.vel += take;
      impulse   -= take;
    }

    // poświata przechodzi łagodnie, a nie jednym przypisaniem
    if (glowT < 1) {
      glowT = Math.min(1, glowT + dt / .95);
      const e = glowT * glowT * (3 - 2 * glowT);
      glow.color.copy(glowFrom).lerp(glowTo, e);
    }

    // etykieta zmienia się dopiero, gdy front jest odwrócony
    if (pendingLabel &&
        (state.angle >= swapAtAngle || now > swapDeadline)) {
      bodyMat.map = labels[pendingLabel];
      bodyMat.needsUpdate = true;
      pendingLabel = null;
    }

    if (!state.drag) {
      state.angle += state.vel * dt;
      state.vel   *= Math.pow(FRICTION, dt);
      if (Math.abs(state.vel) < .002) state.vel = 0;
    }

    // leniwy obrót wraca dopiero, gdy puszka się uspokoi
    const idleTarget = (state.drag || Math.abs(state.vel) > .3 || reduce) ? 0 : AUTO_SPIN;
    state.idle  += (idleTarget - state.idle) * Math.min(1, dt * 1.5);
    state.angle += state.idle * dt;

    state.hover += (state.hoverT - state.hover) * Math.min(1, dt * 4);
    state.pitch += (state.pitchT - state.pitch) * Math.min(1, dt * 4);

    can.rotation.y = state.angle + state.hover;
    can.rotation.x = 0.06 + state.pitch;
    /* --- choreografia: puszka jedzie przez stronę razem ze scrollem ---
       hero → sekcja smaków (bliżej środka, większa) → wyjazd w górę. */
    const p    = state.scroll;
    const move = smoothstep(.03, .40, p);   // przejście z hero do sekcji smaków
    const exit = smoothstep(.86, 1.0, p);   // zjazd z kadru na końcu sekwencji

    const x = wide ? .58 + (.42 - .58) * move : 0;
    const s = (.72 + (1.08 - .72) * move) * (1 - exit * .5);

    can.position.x = x;
    can.position.y = Math.sin(now / 1400) * .05 + move * .04 + exit * 2.2;
    can.scale.setScalar(s);
    canvas.style.opacity = String(1 - exit);
    canvas.style.visibility = exit >= 1 ? 'hidden' : 'visible';

    // owoce dryfują razem z puszką, ale wolniej — inaczej scena wygląda sztywno
    orbit.rotation.y = state.angle * .35 + state.hover * .5;
    orbit.position.x = x;
    orbit.position.y = move * .12 + exit * 2.2;

    // komplet owoców aktywnego smaku wyrasta, pozostałe znikają
    for (const k in grow) {
      const target = k === active ? 1 : 0;
      grow[k] += (target - grow[k]) * Math.min(1, dt * 3.2);
    }

    props.forEach(p => {
      p.m.position.y = p.base + Math.sin(now / 1000 * p.sp + p.ph) * .10;
      if (p.spin) {
        if (p.m.userData && p.m.userData.flat) { p.m.rotation.z += p.spin * .6 * dt; }
        else { p.m.rotation.y += p.spin * dt; p.m.rotation.x += p.spin * .4 * dt; }
      }
      if (p.set) {
        const e = grow[p.set];
        p.m.visible = e > .015;
        p.m.scale.setScalar(p.s0 * e * e);          // wejście z lekkim „popem"
      }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* --- start dopiero po dojechaniu czcionek (napisy na etykiecie) */
  function mount() {
    // płótno wychodzi z hero na poziom strony — ma towarzyszyć scrollowi
    document.body.appendChild(canvas);
    document.body.classList.add('has3d');
    canvas.style.cursor = 'grab';
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* --- render owocu do sprite'a na etykietę -------------------
     Ten sam model, który lata dookoła puszki, renderuję raz do tekstury
     i wklejam w nadruk. Dzięki temu owoc na etykiecie i owoc w powietrzu
     to dosłownie ten sam obiekt, a nie dwa różne rysunki. ------------ */
  function fruitSprite(make, size) {
    const obj = make();
    const sc = new THREE.Scene();
    sc.environment = scene.environment;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x223040, .85));
    const k1 = new THREE.DirectionalLight(0xffffff, 2.8); k1.position.set(-1.6, 2.2, 2.4);
    const k2 = new THREE.DirectionalLight(0xffffff, 1.1); k2.position.set(2.0, -.6, 1.4);
    sc.add(k1, k2, obj);

    obj.rotation.set(-.16, .55, .10);
    const box = new THREE.Box3().setFromObject(obj);
    const sz  = box.getSize(new THREE.Vector3());
    obj.position.sub(box.getCenter(new THREE.Vector3()));

    const half = Math.max(sz.x, sz.y) * .60;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, -20, 20);
    cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);

    return offscreen(sc, cam, size, size);
  }

  /* --- render sceny do canvasa poza ekranem ------------------------- */
  function offscreen(sc, cam, w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h);
    // renderer.outputColorSpace dotyczy TYLKO płótna na ekranie. Tekstura celu
    // renderowania domyślnie zostaje liniowa, więc odczytane piksele wrzucone
    // do canvasa jako sRGB wychodzą wyraźnie ciemniejsze. Stąd ta linia.
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevTarget = renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(sc, cam);

    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    rt.dispose();

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;      // bufor idzie od dołu, canvas od góry
      for (let x = 0; x < w; x++) {
        const i = src + x * 4, o = (y * w + x) * 4;
        const a = buf[i + 3];
        const un = a ? 255 / a : 0;         // bufor jest premnożony przez alfę
        img.data[o]     = Math.min(255, buf[i]     * un);
        img.data[o + 1] = Math.min(255, buf[i + 1] * un);
        img.data[o + 2] = Math.min(255, buf[i + 2] * un);
        img.data[o + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --- miniatury w kafelkach: ta sama bryła i ta sama etykieta, co w hero.
     Zamiast trzech osobnych scen podmieniam etykietę na materiale, renderuję
     puszkę w ustalonej pozie i przywracam stan — dzięki temu kafelek nie może
     rozjechać się z tym, co widać na środku strony. -------------------- */
  function paintCans() {
    // Cele: puszki w pasku smaków i puszki w kartach zestawów. Render robię
    // raz na smak i podstawiam wszystkim, którzy go potrzebują — inaczej ta
    // sama scena renderowałaby się sześć razy.
    const cele = [];
    document.querySelectorAll('.chip img').forEach(img => {
      const chip = img.closest('.chip');
      if (chip) cele.push({ img, key: chip.dataset.flavor });
    });
    document.querySelectorAll('img[data-can]').forEach(img => {
      cele.push({ img, key: img.dataset.can });
    });
    if (!cele.length) return;

    const W = 360, H = 470;
    // Kadr liczony pod wysokość puszki: przy fov 24° i tej odległości
    // zajmuje ~90% wysokości renderu, zamiast tonąć w pustym tle.
    const cam = new THREE.PerspectiveCamera(24, W / H, .1, 100);
    cam.position.set(0, .03, 3.1);
    cam.lookAt(0, .03, 0);

    const keep = {
      map: bodyMat.map,
      rot: can.rotation.clone(),
      pos: can.position.clone(),
      scl: can.scale.clone(),
      orbit: orbit.visible
    };
    // lekki podbicie ekspozycji, bo kafelek leży w ciemnym rogu winiety
    const prevExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = 1.12;

    orbit.visible = false;                 // owoce nie wchodzą do kafelka
    can.rotation.set(.05, .38, -.14);
    can.position.set(0, 0, 0);
    can.scale.setScalar(.63);

    const gotowe = {};
    cele.forEach(({ img, key }) => {
      if (!labels[key]) return;
      if (!gotowe[key]) {
        bodyMat.map = labels[key];
        bodyMat.needsUpdate = true;
        gotowe[key] = offscreen(scene, cam, W, H).toDataURL('image/png');
      }
      img.src = gotowe[key];
      img.classList.add('is-model');
    });

    renderer.toneMappingExposure = prevExposure;
    bodyMat.map = keep.map; bodyMat.needsUpdate = true;
    can.rotation.copy(keep.rot);
    can.position.copy(keep.pos);
    can.scale.copy(keep.scl);
    orbit.visible = keep.orbit;
  }

  function buildSprites(BUILD) {
    Object.keys(BUILD).forEach(k => {
      try { SPRITE[k] = fruitSprite(BUILD[k][0], 512); } catch (e) { /* zostaje rysunek */ }
    });
  }

  function rebuildLabels() {
    Object.keys(FLAVORS).forEach(k => { labels[k].dispose(); labels[k] = labelTexture(k); });
    bodyMat.map = labels[active] || labels.cherry;
    bodyMat.needsUpdate = true;
  }

  const waitFonts = (document.fonts && document.fonts.ready) || Promise.resolve();
  waitFonts.then(() => { rebuildLabels(); mount(); });

  // owoce dojeżdżają osobno — puszka nie czeka na kilka megabajtów siatek,
  // a gdy już są, wracamy do etykiety i wklejamy w nią render owocu
  Promise.all([waitFonts, loadModels(), canReady]).then(([, BUILD]) => {
    populateFruit(BUILD);
    buildSprites(BUILD);
    rebuildLabels();
    paintCans();
  });
})();
