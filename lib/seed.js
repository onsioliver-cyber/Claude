import crypto from 'node:crypto';

// Demodaten, relativ zum aktuellen Datum, damit Fristen und Fälligkeiten realistisch wirken.
export function seedData(now = new Date()) {
  const day = (offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const id = () => crypto.randomUUID();
  const jahr = now.getFullYear();

  const ma = [
    { id: id(), name: 'Anna Schneider', position: 'Leitung Buchhaltung', abteilung: 'Finanzen', email: 'a.schneider@beispiel.de', eintritt: '2015-04-01', vertragsart: 'Vollzeit', bruttogehalt: 5200, urlaubsanspruch: 30, status: 'aktiv', notizen: 'Sehr zuverlässig, hat die Umstellung auf DATEV Unternehmen online geleitet.' },
    { id: id(), name: 'Jonas Weber', position: 'Projektleiter', abteilung: 'Technik', email: 'j.weber@beispiel.de', eintritt: '2019-09-01', vertragsart: 'Vollzeit', bruttogehalt: 5800, urlaubsanspruch: 30, status: 'aktiv', notizen: 'Leitet öffentliche Projekte, sehr gute Kundenkommunikation.' },
    { id: id(), name: 'Mehmet Yılmaz', position: 'Servicetechniker', abteilung: 'Technik', email: 'm.yilmaz@beispiel.de', eintritt: '2021-02-15', vertragsart: 'Vollzeit', bruttogehalt: 3900, urlaubsanspruch: 28, status: 'aktiv', notizen: '' },
    { id: id(), name: 'Lea Hoffmann', position: 'Auszubildende Bürokauffrau', abteilung: 'Verwaltung', email: 'l.hoffmann@beispiel.de', eintritt: `${jahr - 1}-08-01`, vertragsart: 'Auszubildende/r', bruttogehalt: 1050, urlaubsanspruch: 27, status: 'aktiv', notizen: '' },
  ];

  const kunden = [
    { id: id(), name: 'Stadtwerke Musterstadt GmbH', ansprechpartner: 'Herr Krüger', email: 'einkauf@stadtwerke-musterstadt.de', telefon: '0123 45678', adresse: 'Hauptstraße 1\n12345 Musterstadt', ustId: 'DE123456789' },
    { id: id(), name: 'Bäckerei Sonnenschein KG', ansprechpartner: 'Frau Lange', email: 'info@baeckerei-sonnenschein.de', telefon: '0123 98765', adresse: 'Marktplatz 7\n12345 Musterstadt', ustId: '' },
  ];

  return {
    firma: {
      name: 'Muster Haustechnik GmbH',
      rechtsform: 'GmbH',
      adresse: 'Industriestraße 12\n12345 Musterstadt',
      branche: 'Gebäude- und Haustechnik (SHK, Elektro)',
      leistungen: 'Planung, Installation und Wartung von Heizungs-, Sanitär- und Elektroanlagen; Wärmepumpen; Wartungsverträge für Kommunen und Gewerbe. Referenzen: Sanierung Grundschule Musterstadt (2023, 480 T€), Wartung Liegenschaften Landkreis (seit 2021).',
      zertifikate: 'Eintrag ins Präqualifikationsverzeichnis (PQ-VOB), Meisterbetrieb, DIN EN ISO 9001',
      jahresumsatz: 4200000,
      ustId: 'DE987654321',
      steuernummer: '12/345/67890',
      iban: 'DE02 1203 0000 0000 2020 51',
      bank: 'Musterbank',
    },
    mitarbeiter: ma,
    abwesenheiten: [
      { id: id(), mitarbeiterId: ma[0].id, art: 'Urlaub', von: day(-40), bis: day(-31), status: 'genehmigt', notiz: '' },
      { id: id(), mitarbeiterId: ma[1].id, art: 'Fortbildung', von: day(0), bis: day(1), status: 'genehmigt', notiz: 'Seminar Vergaberecht' },
      { id: id(), mitarbeiterId: ma[2].id, art: 'Urlaub', von: day(14), bis: day(25), status: 'beantragt', notiz: '' },
    ],
    kunden,
    rechnungen: [
      { id: id(), nummer: `RE-${jahr}-0001`, kundeId: kunden[0].id, datum: day(-50), faellig: day(-20), beschreibung: 'Wartung Heizungsanlagen Q3', netto: 8400, ustSatz: '19', status: 'offen' },
      { id: id(), nummer: `RE-${jahr}-0002`, kundeId: kunden[1].id, datum: day(-12), faellig: day(2), beschreibung: 'Austausch Durchlauferhitzer', netto: 1250, ustSatz: '19', status: 'offen' },
      { id: id(), nummer: `RE-${jahr}-0003`, kundeId: kunden[0].id, datum: day(-70), faellig: day(-40), beschreibung: 'Notdienst Pumpwerk', netto: 2300, ustSatz: '19', status: 'bezahlt' },
    ],
    ausgaben: [
      { id: id(), datum: day(-15), lieferant: 'Großhandel Rohr & Co.', beschreibung: 'Installationsmaterial', netto: 3120, ustSatz: '19', konto: '3400', kategorie: 'Wareneingang' },
      { id: id(), datum: day(-9), lieferant: 'Tankstelle Nord', beschreibung: 'Diesel Firmenfahrzeuge', netto: 410.5, ustSatz: '19', konto: '4530', kategorie: 'Kfz-Kosten' },
      { id: id(), datum: day(-3), lieferant: 'Bürobedarf Schmidt', beschreibung: 'Druckerpapier, Toner', netto: 186, ustSatz: '19', konto: '4930', kategorie: 'Bürobedarf' },
    ],
    ausschreibungen: [
      { id: id(), titel: 'Erneuerung der Heizungsanlage – Rathaus Musterstadt', auftraggeber: 'Stadt Musterstadt', vergabeplattform: 'Vergabemarktplatz NRW', frist: day(18), volumen: 320000, cpv: '45331100-7', status: 'in Prüfung', beschreibung: 'Demontage der bestehenden Gas-Kesselanlage und Errichtung einer Luft-Wasser-Wärmepumpenanlage (ca. 250 kW) inkl. Pufferspeicher, MSR-Technik und hydraulischem Abgleich. Ausführung: Q2 bis Q3 des Folgejahres. Eignungsnachweise: Präqualifikation oder Einzelnachweise, 3 Referenzen vergleichbarer Größe aus den letzten 5 Jahren, Mindestumsatz 1 Mio. € p.a. Zuschlag: Preis 70 %, Qualität des Ausführungskonzepts 30 %.' },
      { id: id(), titel: 'Rahmenvertrag Wartung Sanitäranlagen Schulen', auftraggeber: 'Landkreis Beispielkreis', vergabeplattform: 'DTVP', frist: day(6), volumen: 150000, cpv: '50700000-2', status: 'Angebot in Arbeit', beschreibung: 'Rahmenvereinbarung über 2 Jahre (+1 Jahr Option) für Wartung und Instandsetzung der Sanitäranlagen an 14 Schulstandorten. Reaktionszeit Notdienst 4 Stunden.' },
    ],
  };
}
