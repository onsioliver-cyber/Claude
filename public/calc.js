// Gemeinsame Berechnungen (Server + Browser).

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function brutto(beleg) {
  const netto = Number(beleg.netto) || 0;
  return round2(netto * (1 + (Number(beleg.ustSatz) || 0) / 100));
}

export function ust(beleg) {
  return round2(brutto(beleg) - (Number(beleg.netto) || 0));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(rechnung, stichtag = today()) {
  return rechnung.status === 'offen' && Boolean(rechnung.faellig) && rechnung.faellig < stichtag;
}

// Arbeitstage (Mo–Fr) zwischen zwei ISO-Daten inkl. Start und Ende. Feiertage werden nicht berücksichtigt.
export function arbeitstage(von, bis) {
  if (!von || !bis || bis < von) return 0;
  const d = new Date(`${von}T00:00:00Z`);
  const end = new Date(`${bis}T00:00:00Z`);
  let count = 0;
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// Urlaubskonto eines Mitarbeiters für ein Kalenderjahr.
export function urlaubskonto(mitarbeiter, abwesenheiten, jahr = new Date().getFullYear()) {
  const start = `${jahr}-01-01`;
  const ende = `${jahr}-12-31`;
  let genommen = 0;
  let beantragt = 0;
  for (const a of abwesenheiten) {
    if (a.mitarbeiterId !== mitarbeiter.id || a.art !== 'Urlaub') continue;
    const tage = arbeitstage(a.von < start ? start : a.von, a.bis > ende ? ende : a.bis);
    if (a.status === 'genehmigt') genommen += tage;
    else if (a.status === 'beantragt') beantragt += tage;
  }
  const anspruch = Number(mitarbeiter.urlaubsanspruch) || 0;
  return { anspruch, genommen, beantragt, rest: anspruch - genommen };
}

// Umsatzsteuer-Übersicht (Soll-Versteuerung, vereinfacht) je Monat eines Jahres.
export function ustUebersicht(rechnungen, ausgaben, jahr) {
  const monate = Array.from({ length: 12 }, (_, i) => ({
    monat: i + 1, umsatzNetto: 0, umsatzsteuer: 0, ausgabenNetto: 0, vorsteuer: 0, zahllast: 0,
  }));
  for (const r of rechnungen) {
    if (r.status === 'storniert' || !r.datum?.startsWith(String(jahr))) continue;
    const m = monate[Number(r.datum.slice(5, 7)) - 1];
    m.umsatzNetto += Number(r.netto) || 0;
    m.umsatzsteuer += ust(r);
  }
  for (const a of ausgaben) {
    if (!a.datum?.startsWith(String(jahr))) continue;
    const m = monate[Number(a.datum.slice(5, 7)) - 1];
    m.ausgabenNetto += Number(a.netto) || 0;
    m.vorsteuer += ust(a);
  }
  for (const m of monate) {
    for (const k of ['umsatzNetto', 'umsatzsteuer', 'ausgabenNetto', 'vorsteuer']) m[k] = round2(m[k]);
    m.zahllast = round2(m.umsatzsteuer - m.vorsteuer);
  }
  return monate;
}

export function tageBis(datum, stichtag = today()) {
  if (!datum) return null;
  return Math.round((new Date(`${datum}T00:00:00Z`) - new Date(`${stichtag}T00:00:00Z`)) / 86400000);
}
