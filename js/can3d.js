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
      blob:'#c8203c', mark:'#61091a', ink:'#ffffff', glow:0x0b8f5e
    },
    blueberry: {
      name:'Jagoda', base:'#2733a8', deep:'#070d3a', light:'#4a57de',
      blob:'#7d5cf0', mark:'#27186b', ink:'#ffffff', glow:0x0a49a0
    },
    lime: {
      name:'Limonka', base:'#4ea112', deep:'#123f04', light:'#79cc2b',
      blob:'#e0d02f', mark:'#2f6b0c', ink:'#ffffff', glow:0x5fc93f
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
     2. Skropliny z fotografii

     Mapy powstały narzędziem tools/drops.swift z jednego zdjęcia
     (media/raw/drops-a.png, OpenArt): normalna, chropowatość i warstwa
     światła na etykietę. Wszystkie z tego samego kadru, więc kropla
     w kolorze leży dokładnie tam, gdzie kropla w relief i w połysku.
     Kadr jest domknięty w poziomie, bo etykieta owija się wokół walca.
     ========================================================= */
  const TW = 2048, TH = 1024;

  const texLoader = new THREE.TextureLoader();
  function dataTex(url) {
    const t = texLoader.load(url);
    t.wrapS = THREE.RepeatWrapping;
    t.offset.x = .25;                 // ten sam obrót co etykieta
    t.anisotropy = 8;
    return t;
  }
  const dropNormal = dataTex('media/drops-normal.jpg');
  const dropRough  = dataTex('media/drops-rough.jpg');
  const dropAlpha  = dataTex('media/drops-alpha.jpg');
  // mapa zawija się w obu osiach, więc można ją przewijać w dół bez szwu
  [dropNormal, dropRough, dropAlpha].forEach(t => { t.wrapT = THREE.RepeatWrapping; });

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
      MARK[key](g, cx, H * .50, 1.05, f.mark);

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

    // Krople NIE są wypalane w etykietę — spływają, więc mają własną
    // przezroczystą warstwę wody na zewnątrz walca (patrz `water` niżej).
    g.letterSpacing = '0px';

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
    lime:      [makeLime, makeLimeSlice]
  };

  // Modele z Higgsfielda (tripo_3d). Każdy przychodzi w swojej skali
  // i ze środkiem gdzie popadnie, więc po wczytaniu normalizuję: środek
  // bryły do zera i największy rozmiar POZIOMY do 1. Poziomy, nie ogólny —
  // inaczej ogonek wiśni zjadłby całą skalę i sam owoc byłby mikroskopijny.
  const MODEL_FILES = {
    cherry:    ['media/models/cherry.glb'],
    blueberry: ['media/models/blueberry.glb'],
    lime:      ['media/models/lime.glb', 'media/models/lime-wedge.glb']
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

  function loadModels() {
    const loader = new GLTFLoader();
    const jobs = [];
    const built = {};
    Object.entries(MODEL_FILES).forEach(([key, files]) => {
      built[key] = [];
      files.forEach((url, i) => {
        jobs.push(new Promise(res => {
          loader.load(url,
            gltf => { built[key][i] = normalize(gltf.scene); res(); },
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
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, TOP - BOT, 180, 1, true),
    bodyMat
  );
  can.add(body);

  const metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6ebef, metalness: 1, roughness: .22,
    anisotropy: .5, anisotropyRotation: Math.PI / 2,    // szczotkowanie wzdłuż obwodu
    envMapIntensity: 2.1, side: THREE.DoubleSide
  });
  const lidMat = new THREE.MeshPhysicalMaterial({
    map: lidTexture(), metalness: 1, roughness: .26,
    anisotropy: .5, envMapIntensity: 2.1
  });

  const lathe = (pts) => new THREE.LatheGeometry(
    pts.map(p => new THREE.Vector2(p[0], p[1])), 180
  );

  // Profil przejść zdjęty z modelu generatora (tools/glbprofile.py):
  // korpus trzyma pion do ~89% wysokości i dopiero tam się załamuje,
  // a rant ROZSZERZA SIĘ z powrotem — to zawinięcie blachy. Poprzedni obrys
  // zwężał się monotonicznie i przez to wyglądał jak zaokrąglony walec.
  can.add(new THREE.Mesh(lathe([
    [R,      TOP       ], [R*.998, TOP+.030], [R*.985, TOP+.055], [R*.945, TOP+.080],
    [R*.880, TOP+.100  ], [R*.826, TOP+.116], [R*.802, TOP+.128], [R*.818, TOP+.140],
    [R*.845, TOP+.150  ], [R*.842, TOP+.161], [R*.800, TOP+.163], [R*.770, TOP+.152],
    [R*.40,  TOP+.146  ], [0,      TOP+.150]
  ]), metalMat));

  // denko: zaokrąglenie na dolnych ~4% wysokości, potem kopuła do środka
  can.add(new THREE.Mesh(lathe([
    [R,      BOT       ], [R*.995, BOT-.020], [R*.965, BOT-.042], [R*.905, BOT-.060],
    [R*.830, BOT-.072  ], [R*.800, BOT-.078], [R*.700, BOT-.070], [R*.45,  BOT-.048],
    [R*.20,  BOT-.036  ], [0,      BOT-.034]
  ]), metalMat));

  /* --- warstwa wody: cienka koszulka na korpusie, widoczna tylko tam,
     gdzie alfa mówi „kropla". Przewija się w dół, więc całe zroszenie
     powoli osiada. --------------------------------------------------- */
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf2f7,
    transparent: true, opacity: .34, depthWrite: false,
    alphaMap: dropAlpha,
    normalMap: dropNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: dropRough,
    roughness: .06, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .02,
    envMapIntensity: 3.2
  });
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.004, R * 1.004, TOP - BOT, 180, 1, true),
    waterMat
  );
  can.add(water);

  /* --- pojedyncze krople, które naprawdę zbiegają po puszce ---------- */
  // Kropla biegnąca musi być wyraźnie większa od zroszenia, inaczej ginie
  // w polu skroplin. Smuga jest ciemniejsza i bardziej lustrzana — czyta się
  // jako mokry ślad zmywający szron, a nie jako biała kreska.
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f9fd, transparent: true, opacity: .78, depthWrite: false,
    roughness: .01, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .01, envMapIntensity: 5
  });
  const trailMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8c2d2, transparent: true, opacity: .58, depthWrite: false,
    roughness: .02, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 4
  });

  const RUNNERS = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();                 // obrót grupy = kąt na obwodzie
    const head = new THREE.Mesh(SPHERE, dropMat);
    head.position.z = R * 1.016;
    head.scale.set(.04, .058, .018);
    g.add(head);

    const tail = new THREE.Mesh(SPHERE, trailMat);
    tail.position.set(0, .085, R * 1.011);
    tail.scale.set(.015, .085, .009);
    g.add(tail);

    g.rotation.y = Math.random() * 6.284;
    g.position.y = BOT + Math.random() * (TOP - BOT);
    can.add(g);
    RUNNERS.push({ g, head, tail, sp: .09 + Math.random() * .16, wait: Math.random() * 4 });
  }

  // tarcza wieczka z rowkiem i zawleczką, tuż nad płaskim dnem lathe'a
  const lid = new THREE.Mesh(new THREE.CircleGeometry(R * .74, 72), lidMat);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = TOP + .1478;
  can.add(lid);

  can.rotation.z = -0.26;
  can.rotation.x =  0.06;
  can.scale.setScalar(0.63);
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
  window.NULA3D = { setFlavor, can, camera, scene };   // przydatne przy podglądzie bryły

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
    can.scale.setScalar(0.63 * (1 + state.scroll * .12));

    // całe zroszenie powoli osiada w dół
    const slide = dt * .025;
    dropNormal.offset.y -= slide;
    dropRough.offset.y  -= slide;
    dropAlpha.offset.y  -= slide;

    // krople biegnące: przyspieszają, po zejściu na dół czekają i wracają
    RUNNERS.forEach(r => {
      if (r.wait > 0) { r.wait -= dt; r.g.visible = false; return; }
      r.g.visible = true;
      r.sp += dt * .06;                                  // grawitacja
      r.g.position.y -= r.sp * dt * 2.2;
      const run = Math.min(1, (TOP - r.g.position.y) / (TOP - BOT));
      r.tail.scale.y = .03 + run * .26;                  // smuga rośnie za kroplą
      r.tail.position.y = r.tail.scale.y * 1.05;
      if (r.g.position.y < BOT - .05) {
        r.g.position.y = TOP - .02;
        r.g.rotation.y = Math.random() * 6.284;
        r.sp = .09 + Math.random() * .16;
        r.wait = Math.random() * 3.5;
      }
    });

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

  function rebuildLabels() {
    Object.keys(FLAVORS).forEach(k => { labels[k].dispose(); labels[k] = labelTexture(k); });
    bodyMat.map = labels[active] || labels.cherry;
    bodyMat.needsUpdate = true;
  }

  const waitFonts = (document.fonts && document.fonts.ready) || Promise.resolve();
  waitFonts.then(() => { rebuildLabels(); mount(); });

  // owoce dojeżdżają osobno — puszka nie czeka na kilka megabajtów siatek
  loadModels().then(populateFruit);
})();
