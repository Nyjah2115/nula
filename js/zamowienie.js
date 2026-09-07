/* =========================================================
   VIVRA — konfigurator zamówienia

   Wszystko liczy się po stronie przeglądarki i nigdzie nie wychodzi:
   strona jest pokazowa, nie ma backendu i nie udaje, że go ma.
   ========================================================= */
(() => {
  'use strict';

  const form = document.getElementById('formularz');
  if (!form) return;

  const ZESTAWY = {
    probnik:     { nazwa: 'Próbnik',     cena: 29, puszki: 6,  mix: true,  cykl: '' },
    dwunastka:   { nazwa: 'Zestaw 12',   cena: 52, puszki: 12, mix: false, cykl: '' },
    subskrypcja: { nazwa: 'Subskrypcja', cena: 88, puszki: 24, mix: false, cykl: ' / mies.' }
  };
  const SMAKI = { cherry: 'Wiśnia', blueberry: 'Jagoda', lime: 'Limonka' };

  const DARMOWA_OD = 39;
  const DOSTAWA    = 12;

  let ilosc = 1;

  const $ = id => document.getElementById(id);
  const zl = n => n.toLocaleString('pl-PL') + ' zł';

  // Polska odmiana przez liczbę: 1 puszka, 2-4 puszki, 5-21 puszek,
  // 22-24 znowu puszki. Bez tego wychodziło „24 puszek”.
  function odmien(n, poj, mnogi, dopelniacz) {
    const d = n % 10, s = n % 100;
    if (n === 1) return poj;
    if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return mnogi;
    return dopelniacz;
  }

  function wybrany(nazwa) {
    const el = form.querySelector(`input[name="${nazwa}"]:checked`);
    return el ? el.value : null;
  }

  function przelicz() {
    const kluczZ = wybrany('zestaw');
    const z = ZESTAWY[kluczZ];
    const smak = wybrany('smak');

    // W próbniku są wszystkie smaki, więc krok z wyborem smaku jest wyłączony
    const krokSmak = $('krokSmak');
    krokSmak.classList.toggle('krok--wylaczony', z.mix);
    krokSmak.querySelectorAll('input').forEach(i => { i.disabled = z.mix; });
    $('uwagaSmak').hidden = !z.mix;

    // paleta strony idzie za wybranym smakiem, tak jak na stronie głównej
    document.body.dataset.flavor = z.mix ? 'cherry' : smak;
    if (window.VIVRA3D && !z.mix) window.VIVRA3D.setFlavor(smak);

    const towar   = z.cena * ilosc;
    const dostawa = towar >= DARMOWA_OD ? 0 : DOSTAWA;
    const razem   = towar + dostawa;

    $('sumaZestaw').textContent = z.nazwa + (ilosc > 1 ? ` × ${ilosc}` : '');
    $('sumaCena').textContent   = zl(towar) + z.cykl;
    $('sumaSmak').textContent   = z.mix ? 'Wszystkie trzy smaki' : SMAKI[smak];
    const puszki = z.puszki * ilosc;
    $('sumaPuszki').textContent = puszki + ' ' + odmien(puszki, 'puszka', 'puszki', 'puszek');
    $('sumaDostawa').textContent = dostawa ? zl(dostawa) : 'gratis';
    $('sumaRazem').textContent  = zl(razem) + z.cykl;

    const brakuje = DARMOWA_OD - towar;
    $('sumaInfo').textContent = brakuje > 0
      ? `Do darmowej dostawy brakuje ${zl(brakuje)}.`
      : 'Dostawa gratis — próg przekroczony.';

    $('ile').textContent = ilosc;
    $('opisIlosci').textContent = odmien(ilosc, 'zestaw', 'zestawy', 'zestawów');
  }

  form.addEventListener('change', przelicz);

  form.querySelectorAll('.licznik__btn').forEach(b => {
    b.addEventListener('click', () => {
      ilosc = Math.min(9, Math.max(1, ilosc + Number(b.dataset.krok)));
      przelicz();
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    // walidacja własna, żeby komunikat pasował do reszty strony
    const puste = [...form.querySelectorAll('input[required]')]
      .filter(i => !i.value.trim());
    puste.forEach(i => i.closest('.pole').classList.add('pole--brak'));
    if (puste.length) {
      puste[0].focus();
      return;
    }

    const z = ZESTAWY[wybrany('zestaw')];
    const smak = z.mix ? 'wszystkie trzy smaki' : SMAKI[wybrany('smak')].toLowerCase();
    const imie = form.querySelector('[name="imie"]').value.trim().split(' ')[0];

    document.getElementById('potwierdzenieOpis').textContent =
      `${imie}, Twoje zamówienie — ${z.nazwa.toLowerCase()} × ${ilosc}, ${smak} — ` +
      `trafiłoby teraz do realizacji. To jednak strona pokazowa: nic nie zostało ` +
      `wysłane ani zapisane.`;

    form.hidden = true;
    const ok = document.getElementById('potwierdzenie');
    ok.hidden = false;
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  form.addEventListener('input', e => {
    const pole = e.target.closest('.pole');
    if (pole && e.target.value.trim()) pole.classList.remove('pole--brak');
  });

  // zestaw wskazany linkiem z sekcji „Zestawy”
  const zParam = new URLSearchParams(location.search).get('zestaw');
  if (zParam && ZESTAWY[zParam]) {
    const radio = form.querySelector(`input[name="zestaw"][value="${zParam}"]`);
    if (radio) radio.checked = true;
  }

  przelicz();
})();
