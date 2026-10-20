// Gemeinsame Datendefinitionen für Server und Browser.
// Jedes Feld: key, label, type (text|textarea|number|money|date|email|select|ref), optional required, options, ref, list.

export const COLLECTIONS = {
  mitarbeiter: {
    label: 'Mitarbeiter',
    singular: 'Mitarbeiter',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, list: true },
      { key: 'position', label: 'Position', type: 'text', list: true },
      { key: 'abteilung', label: 'Abteilung', type: 'text', list: true },
      { key: 'email', label: 'E-Mail', type: 'email' },
      { key: 'eintritt', label: 'Eintrittsdatum', type: 'date', list: true },
      { key: 'vertragsart', label: 'Vertragsart', type: 'select', options: ['Vollzeit', 'Teilzeit', 'Minijob', 'Auszubildende/r', 'Werkstudent/in'], list: true },
      { key: 'bruttogehalt', label: 'Bruttogehalt / Monat', type: 'money' },
      { key: 'urlaubsanspruch', label: 'Urlaubsanspruch (Tage/Jahr)', type: 'number', default: 30 },
      { key: 'status', label: 'Status', type: 'select', options: ['aktiv', 'ausgeschieden'], default: 'aktiv', list: true },
      { key: 'notizen', label: 'Notizen / Leistungsbeurteilung', type: 'textarea' },
    ],
  },
  abwesenheiten: {
    label: 'Abwesenheiten',
    singular: 'Abwesenheit',
    fields: [
      { key: 'mitarbeiterId', label: 'Mitarbeiter', type: 'ref', ref: 'mitarbeiter', required: true, list: true },
      { key: 'art', label: 'Art', type: 'select', options: ['Urlaub', 'Krankheit', 'Fortbildung', 'Sonderurlaub', 'Sonstiges'], default: 'Urlaub', list: true },
      { key: 'von', label: 'Von', type: 'date', required: true, list: true },
      { key: 'bis', label: 'Bis', type: 'date', required: true, list: true },
      { key: 'status', label: 'Status', type: 'select', options: ['beantragt', 'genehmigt', 'abgelehnt'], default: 'beantragt', list: true },
      { key: 'notiz', label: 'Notiz', type: 'text' },
    ],
  },
  kunden: {
    label: 'Kunden',
    singular: 'Kunde',
    fields: [
      { key: 'name', label: 'Firma / Name', type: 'text', required: true, list: true },
      { key: 'ansprechpartner', label: 'Ansprechpartner', type: 'text', list: true },
      { key: 'email', label: 'E-Mail', type: 'email', list: true },
      { key: 'telefon', label: 'Telefon', type: 'text' },
      { key: 'adresse', label: 'Adresse', type: 'textarea' },
      { key: 'ustId', label: 'USt-IdNr.', type: 'text' },
    ],
  },
  rechnungen: {
    label: 'Ausgangsrechnungen',
    singular: 'Rechnung',
    fields: [
      { key: 'nummer', label: 'Rechnungsnr.', type: 'text', list: true, placeholder: 'wird automatisch vergeben' },
      { key: 'kundeId', label: 'Kunde', type: 'ref', ref: 'kunden', required: true, list: true },
      { key: 'datum', label: 'Rechnungsdatum', type: 'date', required: true, list: true },
      { key: 'faellig', label: 'Fällig am', type: 'date', list: true },
      { key: 'beschreibung', label: 'Leistung', type: 'textarea' },
      { key: 'netto', label: 'Nettobetrag', type: 'money', required: true, list: true },
      { key: 'ustSatz', label: 'USt-Satz %', type: 'select', options: ['19', '7', '0'], default: '19' },
      { key: 'status', label: 'Status', type: 'select', options: ['offen', 'bezahlt', 'storniert'], default: 'offen', list: true },
    ],
  },
  ausgaben: {
    label: 'Ausgaben & Belege',
    singular: 'Ausgabe',
    fields: [
      { key: 'datum', label: 'Belegdatum', type: 'date', required: true, list: true },
      { key: 'lieferant', label: 'Lieferant', type: 'text', required: true, list: true },
      { key: 'beschreibung', label: 'Beschreibung', type: 'text', list: true },
      { key: 'netto', label: 'Nettobetrag', type: 'money', required: true, list: true },
      { key: 'ustSatz', label: 'USt-Satz %', type: 'select', options: ['19', '7', '0'], default: '19' },
      { key: 'konto', label: 'Konto (SKR03)', type: 'text', list: true },
      { key: 'kategorie', label: 'Kategorie', type: 'text' },
    ],
  },
  ausschreibungen: {
    label: 'Ausschreibungen',
    singular: 'Ausschreibung',
    fields: [
      { key: 'titel', label: 'Titel', type: 'text', required: true, list: true },
      { key: 'auftraggeber', label: 'Auftraggeber', type: 'text', list: true },
      { key: 'vergabeplattform', label: 'Vergabeplattform / Link', type: 'text' },
      { key: 'frist', label: 'Angebotsfrist', type: 'date', list: true },
      { key: 'volumen', label: 'Geschätztes Volumen (netto)', type: 'money', list: true },
      { key: 'cpv', label: 'CPV-Code', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['neu', 'in Prüfung', 'Angebot in Arbeit', 'abgegeben', 'gewonnen', 'verloren', 'verworfen'], default: 'neu', list: true },
      { key: 'beschreibung', label: 'Leistungsbeschreibung / Auszug', type: 'textarea' },
    ],
  },
};

export const FIRMA_FIELDS = [
  { key: 'name', label: 'Firmenname', type: 'text' },
  { key: 'rechtsform', label: 'Rechtsform', type: 'text' },
  { key: 'adresse', label: 'Adresse', type: 'textarea' },
  { key: 'branche', label: 'Branche', type: 'text' },
  { key: 'leistungen', label: 'Kernleistungen & Referenzen', type: 'textarea' },
  { key: 'zertifikate', label: 'Zertifikate (ISO, Präqualifikation …)', type: 'textarea' },
  { key: 'jahresumsatz', label: 'Jahresumsatz (netto)', type: 'money' },
  { key: 'ustId', label: 'USt-IdNr.', type: 'text' },
  { key: 'steuernummer', label: 'Steuernummer', type: 'text' },
  { key: 'iban', label: 'IBAN', type: 'text' },
  { key: 'bank', label: 'Bank', type: 'text' },
];

// Validiert und normalisiert einen Datensatz. Gibt { value } oder { error } zurück.
export function sanitize(collection, input) {
  const def = COLLECTIONS[collection];
  if (!def) return { error: `Unbekannte Sammlung: ${collection}` };
  const value = {};
  for (const f of def.fields) {
    let v = input?.[f.key];
    if (v === undefined || v === null || v === '') v = f.default ?? '';
    if (f.type === 'number' || f.type === 'money') {
      if (v !== '') {
        v = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(v)) return { error: `${f.label}: keine gültige Zahl` };
      }
    } else {
      v = String(v).trim();
    }
    if (f.type === 'date' && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `${f.label}: Datum im Format JJJJ-MM-TT erwartet` };
    if (f.type === 'select' && v !== '' && !f.options.includes(v)) return { error: `${f.label}: ungültiger Wert` };
    if (f.required && v === '') return { error: `${f.label} ist ein Pflichtfeld` };
    value[f.key] = v;
  }
  return { value };
}
