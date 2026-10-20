import { brutto, today, tageBis, urlaubskonto, isOverdue } from '../public/calc.js';
import { generateText, generateJSON, userContent } from './ai.js';

const GRUNDREGELN = `Du bist der KI-Assistent der "Mittelstand Suite", einer All-in-One-Unternehmenssoftware für kleine und mittlere Unternehmen in Deutschland.
Antworte immer auf Deutsch, sachlich, präzise und praxisnah. Nutze die Unternehmensdaten, die dir mitgegeben werden.
Bei steuerlichen, arbeitsrechtlichen oder vergaberechtlichen Fragen gibst du fundierte Orientierung nach deutschem Recht (HGB, UStG, AO, BGB, ArbZG, BUrlG, GWB, VgV, UVgO, VOB/A), weist aber darauf hin, wenn eine verbindliche Prüfung durch Steuerberater, Fachanwalt oder Vergabestelle nötig ist.
Erfinde keine Fakten. Wenn Informationen fehlen, kennzeichne Platzhalter deutlich mit [eckigen Klammern].`;

function firmaText(firma) {
  const zeilen = Object.entries(firma).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${v}`);
  return zeilen.length ? zeilen.join('\n') : '(kein Firmenprofil hinterlegt)';
}

const euro = (n) => `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function finde(store, collection, id, label) {
  const record = id && store.get(collection, id);
  if (!record) throw httpError(404, `${label} nicht gefunden`);
  return record;
}

// Kompakter Lagebericht für den Chat-Assistenten.
export function unternehmensKontext(store) {
  const d = store.data;
  const kundeName = (id) => d.kunden.find((k) => k.id === id)?.name ?? '?';
  const maName = (id) => d.mitarbeiter.find((m) => m.id === id)?.name ?? '?';
  const offen = d.rechnungen.filter((r) => r.status === 'offen');
  return `Stichtag: ${today()}

FIRMENPROFIL
${firmaText(d.firma)}

MITARBEITER (${d.mitarbeiter.filter((m) => m.status === 'aktiv').length} aktiv)
${d.mitarbeiter.map((m) => {
    const u = urlaubskonto(m, d.abwesenheiten);
    return `- ${m.name}, ${m.position || '-'} (${m.abteilung || '-'}), ${m.vertragsart || '-'}, seit ${m.eintritt || '?'}, Status ${m.status}, Resturlaub ${u.rest}/${u.anspruch} Tage`;
  }).join('\n')}

ABWESENHEITEN
${d.abwesenheiten.map((a) => `- ${maName(a.mitarbeiterId)}: ${a.art} ${a.von} bis ${a.bis} (${a.status})`).join('\n') || '-'}

OFFENE RECHNUNGEN (${offen.length}, Summe brutto ${euro(offen.reduce((s, r) => s + brutto(r), 0))})
${offen.map((r) => `- ${r.nummer} an ${kundeName(r.kundeId)}: ${euro(brutto(r))} brutto, fällig ${r.faellig || '-'}${isOverdue(r) ? ' – ÜBERFÄLLIG' : ''}`).join('\n') || '-'}

AUSGABEN (letzte 20)
${d.ausgaben.slice(-20).map((a) => `- ${a.datum} ${a.lieferant}: ${euro(a.netto)} netto, Konto ${a.konto || '-'} (${a.kategorie || '-'})`).join('\n') || '-'}

AUSSCHREIBUNGEN
${d.ausschreibungen.map((t) => `- ${t.titel} (${t.auftraggeber || '-'}), Frist ${t.frist || '-'}${t.frist ? ` (in ${tageBis(t.frist)} Tagen)` : ''}, Volumen ${euro(t.volumen)}, Status ${t.status}`).join('\n') || '-'}`;
}

export const CHAT_SYSTEM = `${GRUNDREGELN}

Du hilfst der Geschäftsführung und den Mitarbeitenden bei allen Aufgaben: Personal, Buchhaltung, Steuern, Liquidität, Vertrieb, Ausschreibungen und Organisation.
Du hast lesenden Zugriff auf einen aktuellen Lagebericht der Firma (siehe unten). Ändern kannst du keine Daten – sage dem Nutzer, in welchem Modul er etwas erledigen kann.
Formatiere Antworten mit kurzen Absätzen und Aufzählungen (Markdown).`;

const BELEG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['datum', 'lieferant', 'beschreibung', 'netto', 'ustSatz', 'konto', 'kategorie', 'begruendung'],
  properties: {
    datum: { type: 'string', description: 'Belegdatum JJJJ-MM-TT, leer wenn unbekannt' },
    lieferant: { type: 'string' },
    beschreibung: { type: 'string' },
    netto: { type: 'number', description: 'Nettobetrag in Euro' },
    ustSatz: { type: 'string', enum: ['19', '7', '0'] },
    konto: { type: 'string', description: 'Vierstelliges Sachkonto nach DATEV SKR03' },
    kategorie: { type: 'string' },
    begruendung: { type: 'string', description: 'Kurze Begründung der Kontierung und Hinweise (z. B. fehlende Pflichtangaben nach § 14 UStG)' },
  },
};

const ANALYSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titel', 'auftraggeber', 'frist', 'volumen', 'cpv', 'zusammenfassung', 'leistungsumfang', 'eignungskriterien', 'zuschlagskriterien', 'geforderte_unterlagen', 'risiken', 'passung_score', 'empfehlung', 'begruendung', 'naechste_schritte'],
  properties: {
    titel: { type: 'string' },
    auftraggeber: { type: 'string' },
    frist: { type: 'string', description: 'Angebotsfrist JJJJ-MM-TT, leer wenn unbekannt' },
    volumen: { type: 'number', description: 'Geschätztes Nettovolumen in Euro, 0 wenn unbekannt' },
    cpv: { type: 'string' },
    zusammenfassung: { type: 'string' },
    leistungsumfang: { type: 'array', items: { type: 'string' } },
    eignungskriterien: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kriterium', 'erfuellt', 'kommentar'],
        properties: { kriterium: { type: 'string' }, erfuellt: { type: 'string', enum: ['ja', 'nein', 'unklar'] }, kommentar: { type: 'string' } },
      },
    },
    zuschlagskriterien: { type: 'array', items: { type: 'string' } },
    geforderte_unterlagen: { type: 'array', items: { type: 'string' } },
    risiken: { type: 'array', items: { type: 'string' } },
    passung_score: { type: 'integer', description: '0–100, wie gut die Ausschreibung zum Unternehmen passt' },
    empfehlung: { type: 'string', enum: ['Go', 'No-Go', 'Prüfen'] },
    begruendung: { type: 'string' },
    naechste_schritte: { type: 'array', items: { type: 'string' } },
  },
};

export const TASKS = {
  async stellenanzeige(store, { position, details }) {
    if (!position) throw httpError(400, 'Bitte eine Position angeben');
    const text = await generateText({
      system: `${GRUNDREGELN}\nDu bist HR-Expertin für Recruiting im Mittelstand.`,
      content: `Erstelle eine ansprechende, AGG-konforme Stellenanzeige (m/w/d) für die Position "${position}".
Gliederung: Einleitung zum Unternehmen, Ihre Aufgaben, Ihr Profil, Wir bieten, Kontakt. Halte sie prägnant und ehrlich, ohne Floskeln.
Zusätzliche Angaben: ${details || '-'}

Unternehmen:
${firmaText(store.data.firma)}`,
    });
    return { text };
  },

  async arbeitszeugnis(store, { mitarbeiterId, note, art, anlass }) {
    const m = finde(store, 'mitarbeiter', mitarbeiterId, 'Mitarbeiter');
    const text = await generateText({
      system: `${GRUNDREGELN}\nDu bist Personalreferent und kennst die Zeugnissprache (Notenskala in Formulierungen) und den Grundsatz "wohlwollend und wahr" (§ 109 GewO).`,
      content: `Erstelle ein ${art || 'qualifiziertes'} ${anlass === 'Zwischenzeugnis' ? 'Zwischenzeugnis' : 'Arbeitszeugnis'} mit Gesamtnote ${note || 2} (Schulnotenskala).
Mitarbeiter: ${m.name}, Position: ${m.position}, Abteilung: ${m.abteilung}, Eintritt: ${m.eintritt}, Vertragsart: ${m.vertragsart}.
Notizen der Führungskraft: ${m.notizen || '-'}
Arbeitgeber: ${store.data.firma.name || '[Firma]'}, ${store.data.firma.adresse || ''}
Ort/Datum am Ende: [Ort], ${today()}. Erfinde keine konkreten Projekte – nutze Platzhalter in [eckigen Klammern], wo Details fehlen.`,
    });
    return { text };
  },

  async beleg(store, { text, file }) {
    if (!text && !file) throw httpError(400, 'Bitte Beleg hochladen oder Beleginhalt beschreiben');
    const daten = await generateJSON({
      system: `${GRUNDREGELN}\nDu bist Bilanzbuchhalter und kontierst Eingangsbelege nach DATEV SKR03 (z. B. 3400 Wareneingang 19 %, 4530 Kfz-Betriebskosten, 4930 Bürobedarf, 4920 Telefon, 4210 Miete, 4650 Bewirtungskosten, 4660 Reisekosten AN, 4964 EDV-Software, 0480 GWG).`,
      content: userContent(`Lies den Beleg aus und schlage die Buchung vor. Heute ist ${today()}.${text ? `\nZusatzinfo vom Nutzer: ${text}` : ''}`, file),
      schema: BELEG_SCHEMA,
    });
    return { daten };
  },

  async mahnung(store, { rechnungId, stufe }) {
    const r = finde(store, 'rechnungen', rechnungId, 'Rechnung');
    const k = store.get('kunden', r.kundeId) || {};
    const s = Math.min(Math.max(Number(stufe) || 1, 1), 3);
    const text = await generateText({
      system: `${GRUNDREGELN}\nDu schreibst Zahlungserinnerungen und Mahnungen im Forderungsmanagement – bestimmt, aber kundenfreundlich.`,
      content: `Schreibe ${s === 1 ? 'eine freundliche Zahlungserinnerung' : s === 2 ? 'eine 1. Mahnung' : 'eine letzte Mahnung mit Hinweis auf gerichtliches Mahnverfahren und Verzugszinsen (§ 288 BGB)'}.
Rechnung ${r.nummer} vom ${r.datum}, fällig ${r.faellig || '-'}, Betrag ${euro(brutto(r))} brutto, Leistung: ${r.beschreibung || '-'}.
Kunde: ${k.name || '-'}, Ansprechpartner: ${k.ansprechpartner || '-'}, Adresse: ${k.adresse || '-'}
Absender: ${store.data.firma.name || '[Firma]'}, Bank: ${store.data.firma.bank || '-'}, IBAN: ${store.data.firma.iban || '-'}
Heute ist ${today()}. Setze eine neue Zahlungsfrist von ${s === 3 ? 7 : 10} Tagen.`,
      effort: 'low',
    });
    return { text };
  },

  async ausschreibungAnalyse(store, { ausschreibungId, text, file }) {
    const t = ausschreibungId ? finde(store, 'ausschreibungen', ausschreibungId, 'Ausschreibung') : null;
    const quelle = [text, t && `Erfasste Daten: ${JSON.stringify({ ...t, analyse: undefined })}`].filter(Boolean).join('\n\n');
    if (!quelle && !file) throw httpError(400, 'Bitte Ausschreibungsunterlagen hochladen oder Text einfügen');
    const analyse = await generateJSON({
      system: `${GRUNDREGELN}\nDu bist erfahrener Bid-Manager für öffentliche Ausschreibungen (GWB, VgV, UVgO, VOB/A) und bewertest Ausschreibungen für mittelständische Bieter.`,
      content: userContent(`Analysiere die folgende Ausschreibung und bewerte, ob sich eine Teilnahme für unser Unternehmen lohnt. Prüfe die Eignungskriterien gegen unser Firmenprofil. Heute ist ${today()}.

UNSER FIRMENPROFIL:
${firmaText(store.data.firma)}
Mitarbeiterzahl: ${store.data.mitarbeiter.filter((m) => m.status === 'aktiv').length}

AUSSCHREIBUNG:
${quelle || '(siehe angehängtes Dokument)'}`, file),
      schema: ANALYSE_SCHEMA,
      effort: 'high',
    });
    if (t) store.update('ausschreibungen', t.id, { analyse: { ...analyse, erstellt: new Date().toISOString() } });
    return { analyse };
  },

  async angebot(store, { ausschreibungId, hinweise }) {
    const t = finde(store, 'ausschreibungen', ausschreibungId, 'Ausschreibung');
    const text = await generateText({
      system: `${GRUNDREGELN}\nDu bist Bid-Manager und schreibst überzeugende, formal saubere Angebotsunterlagen für öffentliche Auftraggeber.`,
      content: `Erstelle einen Entwurf für unser Angebot. Gliederung:
1. Anschreiben an die Vergabestelle
2. Unternehmensdarstellung & Referenzen (aus Firmenprofil)
3. Ausführungskonzept (Vorgehen, Projektorganisation, Zeitplan, Qualitätssicherung) – zugeschnitten auf die Zuschlagskriterien
4. Checkliste der beizufügenden Unterlagen und Eigenerklärungen
Preise nicht erfinden – Platzhalter verwenden.

AUSSCHREIBUNG: ${JSON.stringify({ ...t, analyse: undefined })}
${t.analyse ? `KI-ANALYSE: ${JSON.stringify(t.analyse)}` : ''}
UNSER FIRMENPROFIL:
${firmaText(store.data.firma)}
Hinweise des Nutzers: ${hinweise || '-'}`,
      effort: 'high',
    });
    return { text };
  },
};
