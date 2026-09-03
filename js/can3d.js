/* =========================================================
   NULA — puszka jako model 3D (Three.js, WebGL)

   Bryła: walec z etykietą (czysty UV, tekstura nie rozjeżdża się
   po obwodzie) + dwa lathe'y na szyjkę z wieczkiem i na denko.
   Etykieta rysowana na canvasie, osobno dla każdego smaku.

   Dookoła latają PRAWDZIWE owoce zbudowane z brył — wiśnie z ogonkami,
   jagody z koronkami, limonki i przekrojone połówki — a nie kulki.
   Każdy smak ma swój komplet; przy przełączeniu jeden zestaw się chowa,
   drugi wyrasta (skalowanie, bez przezroczystości).

   Jeżeli WebGL nie wystartuje, strona zostaje przy płaskich renderach
   z <img class="can"> — <canvas> montuje się dopiero po udanej inicjalizacji.
   ========================================================= */
(() => {
  'use strict';
  if (!window.THREE) return;

  const hero   = document.querySelector('.hero');
  const holder = document.querySelector('.hero__cans');
  if (!hero || !holder) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- paleta smaków -------------------------------------- */
  const FLAVORS = {
    cherry: {
      name:'Wiśnia', base:'#0f8f60', deep:'#03301f', light:'#1fb87e',
      blob:'#c8203c', ink:'#ffffff', glow:0x0b8f5e
    },
    blueberry: {
      name:'Jagoda', base:'#2733a8', deep:'#070d3a', light:'#4a57de',
      blob:'#7d5cf0', ink:'#ffffff', glow:0x0a49a0
    },
    lime: {
      name:'Limonka', base:'#4ea112', deep:'#123f04', light:'#79cc2b',
      blob:'#e0d02f', ink:'#ffffff', glow:0x5fc93f
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

  const MARK = { cherry: drawCherryMark, blueberry: drawBerryMark, lime: drawLimeMark };

  /* =========================================================
     2. Tekstura etykiety
     ========================================================= */
  function labelTexture(key) {
    const f = FLAVORS[key];
    const W = 2048, H = 1024;          // dwa identyczne fronty obok siebie
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

    // niezadrukowane pasy blachy przy krawędziach
    for (const [y0, y1] of [[0, H * .055], [H * .945, H]]) {
      const mg = g.createLinearGradient(0, y0, 0, y1);
      mg.addColorStop(0, 'rgba(226,232,236,.95)');
      mg.addColorStop(1, 'rgba(150,162,170,.85)');
      g.fillStyle = mg; g.fillRect(0, y0, W, y1 - y0);
    }

    // dwa fronty
    for (const cx of [W * .25, W * .75]) {
      // miękka plama koloru smaku pod treścią
      const rg = g.createRadialGradient(cx, H * .60, 0, cx, H * .60, W * .19);
      rg.addColorStop(0,   f.blob);
      rg.addColorStop(.55, f.blob);
      rg.addColorStop(1,   'rgba(0,0,0,0)');
      g.save(); g.globalAlpha = .9;
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(cx, H * .60, W * .19, H * .30, 0, 0, 6.284); g.fill();
      g.restore();

      g.textAlign = 'center'; g.textBaseline = 'middle';

      // logotyp
      g.save();
      g.fillStyle = f.ink;
      g.font = '700 132px Inter, system-ui, sans-serif';
      g.letterSpacing = '38px';
      g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 18; g.shadowOffsetY = 5;
      g.fillText('NULA', cx + 19, H * .215);
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

      // rysunek owocu
      MARK[key](g, cx, H * .50, 1.05, key === 'lime' ? '#2f6b0c' : f.blob);

      // nazwa smaku pismem odręcznym
      g.save();
      g.fillStyle = f.ink;
      g.font = '400 150px Yellowtail, cursive';
      g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
      g.fillText(f.name, cx, H * .715);
      g.restore();

      // stopka
      g.save();
      g.globalAlpha = .72; g.fillStyle = f.ink;
      g.font = '600 32px Inter, system-ui, sans-serif';
      g.letterSpacing = '7px';
      g.fillText('0 KCAL · 0 G CUKRU · 330 ML', cx + 4, H * .845);
      g.restore();
    }

    // skropliny
    g.letterSpacing = '0px';
    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 1.6 + Math.pow(Math.random(), 2.6) * 12;
      const d = g.createRadialGradient(x - r * .35, y - r * .4, 0, x, y, r);
      d.addColorStop(0,   'rgba(255,255,255,.5)');
      d.addColorStop(.45, 'rgba(255,255,255,.08)');
      d.addColorStop(.85, 'rgba(0,0,0,.15)');
      d.addColorStop(1,   'rgba(255,255,255,.28)');
      g.fillStyle = d; g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.offset.x = .25;      // front walca wypada na u=0.5 — cofamy o ćwierć obwodu
    tex.anisotropy = 8;
    return tex;
  }

  /* --- mapa chropowatości: kropla jest gładsza od lakieru --- */
  function dropletRoughness() {
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#8f8f8f'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 1.5 + Math.pow(Math.random(), 2.4) * 7;
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, '#101010'); d.addColorStop(.8, '#303030'); d.addColorStop(1, '#8f8f8f');
      g.fillStyle = d; g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
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
    color: 0x8d0b1c, roughness: .16, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.35
  });
  const berryMat = new THREE.MeshPhysicalMaterial({
    color: 0x2c3277, roughness: .52, metalness: 0,
    clearcoat: .55, clearcoatRoughness: .35, envMapIntensity: .9
  });
  const berryCrownMat = new THREE.MeshStandardMaterial({ color: 0x1a1f4d, roughness: .8 });
  const limeMat = new THREE.MeshPhysicalMaterial({
    color: 0x62b81c, roughness: .55, metalness: 0,
    bumpMap: peel, bumpScale: .012,
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

  const BUILD = {
    cherry:    [makeCherry],
    blueberry: [makeBlueberry],
    lime:      [makeLime, makeLimeSlice]
  };

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

  /* --- studio: równoprostokątne otoczenie z softboxami ----- */
  function studioEnv() {
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#42474f'); bg.addColorStop(.5, '#15181c'); bg.addColorStop(1, '#05070a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (const [x, w, a] of [[W*.14, W*.10, 1], [W*.52, W*.06, .75], [W*.82, W*.08, .6]]) {
      const lg = g.createLinearGradient(x - w, 0, x + w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(.5, `rgba(255,255,255,${a})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(x - w, H*.06, w*2, H*.62);
    }
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
  const R = .29, TOP = .78, BOT = -.78;            // smukła puszka 330 ml
  const can = new THREE.Group();

  const labels = {};
  Object.keys(FLAVORS).forEach(k => { labels[k] = labelTexture(k); });
  const rough = dropletRoughness();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: labels.cherry,
    roughnessMap: rough,
    roughness: .5, metalness: .05,
    clearcoat: 1, clearcoatRoughness: .1,
    envMapIntensity: 1.15
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, TOP - BOT, 180, 1, true),
    bodyMat
  );
  can.add(body);

  const metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e7ec, metalness: 1, roughness: .22,
    envMapIntensity: 1.8, side: THREE.DoubleSide
  });

  const lathe = (pts) => new THREE.LatheGeometry(
    pts.map(p => new THREE.Vector2(p[0], p[1])), 180
  );

  // szyjka + wieczko z zawiniętym rantem
  can.add(new THREE.Mesh(lathe([
    [R,       TOP        ], [R*.995, TOP+.028], [R*.955, TOP+.072], [R*.885, TOP+.115],
    [R*.805,  TOP+.147   ], [R*.762, TOP+.166], [R*.752, TOP+.182], [R*.712, TOP+.178],
    [R*.672,  TOP+.158   ], [R*.34,  TOP+.152], [0,      TOP+.156]
  ]), metalMat));

  // denko z wklęsłą kopułą
  can.add(new THREE.Mesh(lathe([
    [R,      BOT        ], [R*.995, BOT-.024], [R*.955, BOT-.058], [R*.885, BOT-.094],
    [R*.785, BOT-.119   ], [R*.635, BOT-.127], [R*.47,  BOT-.104], [R*.26, BOT-.088],
    [0,      BOT-.086   ]
  ]), metalMat));

  can.rotation.z = -0.26;
  can.rotation.x =  0.06;
  can.scale.setScalar(0.74);
  scene.add(can);

  /* --- bąbelki (zawsze) + owoce (na smak) ----------------- */
  const orbit = new THREE.Group();
  scene.add(orbit);

  // bez transmission: przy przezroczystym tle wychodziły z tego szare krążki.
  // Szklistość robi tu samo odbicie środowiska plus mocny clearcoat.
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0, metalness: 0,
    transparent: true, opacity: .3, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0, ior: 1.4,
    envMapIntensity: 6, reflectivity: 1
  });

  const props = [];      // { m, set, base, s0, sp, ph, spin }

  function place(i, n, spread) {
    const ang = (i / n) * 6.284 + Math.random() * .55;
    const rad = .60 + Math.random() * spread;
    return new THREE.Vector3(
      Math.cos(ang) * rad * 1.4,
      (Math.random() - .5) * 1.95,
      Math.sin(ang) * rad - .15
    );
  }

  // bąbelki
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(SPHERE, bubbleMat);
    m.position.copy(place(i, 14, .85));
    const s = .013 + Math.random() * .022;
    m.scale.setScalar(s);
    orbit.add(m);
    props.push({ m, set: null, base: m.position.y, s0: s, sp: .5 + Math.random(), ph: Math.random() * 6.28, spin: 0 });
  }

  // owoce — komplet na każdy smak
  Object.keys(BUILD).forEach(k => {
    const makers = BUILD[k];
    for (let i = 0; i < 8; i++) {
      const g = makers[i % makers.length]();
      g.position.copy(place(i, 8, .78));
      const s = .072 + Math.random() * .042;
      g.scale.setScalar(s);
      if (g.userData.flat) {
        g.rotation.set((Math.random() - .5) * .7, (Math.random() - .5) * .9, Math.random() * 6.28);
      } else {
        g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      }
      g.visible = (k === 'cherry');
      orbit.add(g);
      props.push({
        m: g, set: k, base: g.position.y, s0: s,
        sp: .5 + Math.random(), ph: Math.random() * 6.28,
        spin: (Math.random() - .5) * .35
      });
    }
  });

  const grow = { cherry: 1, blueberry: 0, lime: 0 };   // 0…1, animowane

  /* =========================================================
     5. Sterowanie
     ========================================================= */
  const state = { yaw:0, yawT:0, vel:0, pitch:0, pitchT:0, scroll:0, drag:false, lastX:0 };

  hero.addEventListener('pointermove', e => {
    if (state.drag) return;
    const r = hero.getBoundingClientRect();
    state.yawT   =  ((e.clientX - r.left) / r.width  - .5) * 1.15;
    state.pitchT = -((e.clientY - r.top)  / r.height - .5) * 0.42;
  });
  hero.addEventListener('pointerleave', () => { state.yawT = 0; state.pitchT = 0; });

  canvas.addEventListener('pointerdown', e => {
    state.drag = true; state.lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (!state.drag) return;
    state.vel += (e.clientX - state.lastX) / 140;
    state.lastX = e.clientX;
  });
  const endDrag = () => { state.drag = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  document.addEventListener('scroll', () => {
    state.scroll = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
  }, { passive: true });

  /* --- zmiana smaku --------------------------------------- */
  let spin = 0, active = 'cherry';
  function setFlavor(name) {
    const f = FLAVORS[name];
    if (!f || name === active) return;
    active = name;
    spin += Math.PI * 2;
    glow.color.setHex(f.glow);
    // etykieta zmienia się w połowie obrotu, kiedy jest odwrócona tyłem
    setTimeout(() => { bodyMat.map = labels[name]; bodyMat.needsUpdate = true; }, 320);
  }
  window.NULA3D = { setFlavor };

  /* =========================================================
     6. Pętla i rozmiar
     ========================================================= */
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 6.6 : 4.6;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  let auto = 0, t0 = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - t0) / 1000); t0 = now;

    if (!reduce) auto += dt * .16;
    state.vel *= .93;
    spin *= .92;

    state.yaw   += (state.yawT   - state.yaw)   * .06;
    state.pitch += (state.pitchT - state.pitch) * .06;

    can.rotation.y = auto + state.yaw + state.vel * 6 + spin;
    can.rotation.x = 0.06 + state.pitch;
    can.position.y = Math.sin(now / 1400) * .05 - state.scroll * 1.1;
    can.scale.setScalar(0.74 * (1 + state.scroll * .12));

    orbit.rotation.y = auto * .35 + state.yaw * .5;
    orbit.position.y = -state.scroll * .7;

    // komplet owoców aktywnego smaku wyrasta, pozostałe znikają
    for (const k in grow) {
      const target = k === active ? 1 : 0;
      grow[k] += (target - grow[k]) * Math.min(1, dt * 5.5);
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
    holder.appendChild(canvas);
    document.body.classList.add('has3d');
    canvas.style.cursor = 'grab';
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      Object.keys(FLAVORS).forEach(k => { labels[k].dispose(); labels[k] = labelTexture(k); });
      bodyMat.map = labels[document.body.dataset.flavor] || labels.cherry;
      bodyMat.needsUpdate = true;
      mount();
    });
  } else {
    mount();
  }
})();
