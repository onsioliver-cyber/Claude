# Mittelstand Suite

All-in-One-Unternehmenssoftware für kleine und mittlere Unternehmen – von Personal über Buchhaltung bis zum Ausschreibungsmanagement, durchgehend KI-unterstützt (Claude von Anthropic).

## Module

| Modul | Funktionen | KI-Unterstützung |
|---|---|---|
| **Übersicht** | Offene Forderungen, Umsatz/Ausgaben im Monat, USt-Zahllast, Personalkosten, Abwesenheiten heute, nächste Angebotsfristen | Schnellzugriff auf KI-Funktionen |
| **Personal (HR)** | Mitarbeiterstamm, Abwesenheiten mit Genehmigung, Urlaubskonten (Arbeitstage Mo–Fr) | Stellenanzeigen (AGG-konform), Arbeits- und Zwischenzeugnisse |
| **Buchhaltung** | Ausgangsrechnungen mit automatischer Nummerierung (`RE-JJJJ-0001`), Druckansicht, Ausgaben/Belege, Kunden, USt-Übersicht je Monat, CSV-Export (Excel/DATEV-freundlich, `;`-getrennt) | Belegerfassung per Foto/PDF inkl. SKR03-Kontierungsvorschlag, Zahlungserinnerungen und Mahnungen (3 Stufen) |
| **Ausschreibungen** | Vergabe-Pipeline mit Fristen und Status | Analyse von Vergabeunterlagen (PDF oder Text): Eckdaten, Eignungsprüfung gegen das Firmenprofil, Go/No-Go mit Passungs-Score, Risiken, Unterlagen-Checkliste; Angebotsentwurf mit Ausführungskonzept |
| **KI-Assistent** | Chat mit Echtzeit-Streaming | Kennt den aktuellen Stand (Rechnungen, Personal, Fristen) und beantwortet Fragen zu Steuern, Arbeitsrecht, Vergaberecht, Liquidität |
| **Firmenprofil** | Stammdaten, Leistungen, Referenzen, Zertifikate, Bankverbindung | Grundlage für alle KI-Texte und die Eignungsprüfung |

## iPad / ohne Installation

`standalone/mittelstand-suite.html` ist eine eigenständige Version, die komplett im Browser läuft – ohne Server, ohne Installation, ohne API-Schlüssel. Sie ist als Claude-Artifact veröffentlicht und lässt sich in Safari oder der Claude-App auf iPad, iPhone und Computer öffnen:

- **Daten** liegen in der Cloud-Datenbank des Artifacts (nur für den Eigentümer und eingeladene Bearbeiter sichtbar) und sind auf allen Geräten gleich. Außerhalb von Claude speichert die Seite lokal im Browser.
- **KI** läuft über das Claude-Konto des Nutzers (beim ersten Aufruf wird um Erlaubnis gefragt). Belege können direkt mit der iPad-Kamera fotografiert werden; PDFs werden im Browser gelesen (pdf.js), gescannte PDFs als Bilder an Claude übergeben.
- Rechnungen und CSV-Exporte werden als Datei gesichert (Teilen-Menü / Dateien-App).

## Schnellstart (Server-Version)

Voraussetzung: Node.js ≥ 20.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # API-Schlüssel von https://console.anthropic.com
npm start
```

Danach http://127.0.0.1:3000 öffnen. Beim ersten Start werden Demodaten angelegt (`data/db.json`); zum Zurücksetzen die Datei löschen.

Ohne API-Schlüssel funktionieren alle Verwaltungsfunktionen, die KI-Funktionen melden dann einen Hinweis.

### Konfiguration (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `ANTHROPIC_API_KEY` | Schlüssel für die KI-Funktionen | – |
| `ANTHROPIC_MODEL` | Verwendetes Claude-Modell | `claude-opus-5-5` |
| `PORT` / `HOST` | Adresse des Webservers | `3000` / `127.0.0.1` |
| `APP_PASSWORD` | Aktiviert einen Passwortschutz (HTTP Basic Auth, Benutzername beliebig) | aus |
| `DATA_FILE` | Pfad der Datendatei | `data/db.json` |

Für den Betrieb im Netzwerk `HOST=0.0.0.0` und unbedingt `APP_PASSWORD` setzen sowie HTTPS über einen Reverse-Proxy (z. B. Caddy, nginx) vorschalten.

## Architektur

```
server.js          Express-Server: REST-API, CSV-Export, KI-Endpunkte (inkl. Streaming-Chat per SSE)
lib/store.js       JSON-Dateispeicher (atomares Schreiben)
lib/seed.js        Demodaten
lib/ai.js          Claude-Anbindung (@anthropic-ai/sdk): Text, strukturierte JSON-Ausgaben, Streaming, PDF/Bild-Eingabe
lib/tasks.js       KI-Aufgaben mit Prompts und JSON-Schemata
public/schema.js   Datenmodell + Validierung (von Server und Browser gemeinsam genutzt)
public/calc.js     Brutto/USt, Urlaubskonten, USt-Übersicht, Fristen (gemeinsam genutzt)
public/app.js      Single-Page-App ohne Build-Schritt
test/              Tests (node --test)
```

KI-Aufrufe nutzen strukturierte Ausgaben (`output_config.format`) für Beleg- und Ausschreibungsanalysen, sodass die Ergebnisse direkt in Formulare und die Pipeline übernommen werden. Lehnt das Modell eine Anfrage ab, beantwortet ein serverseitiges Ersatzmodell sie automatisch (`fallbacks: "default"`).

## Tests

```bash
npm test
```

## Hinweise & Grenzen (MVP)

- Die USt-Übersicht ist eine vorläufige Auswertung nach Soll-Versteuerung; sie ersetzt keine Buchhaltung nach GoBD und keine Abstimmung mit dem Steuerberater. Für die Übermittlung an ELSTER/DATEV die CSV-Exporte nutzen.
- Urlaubskonten berücksichtigen keine gesetzlichen Feiertage.
- KI-Ergebnisse (Zeugnisse, Mahnungen, Angebote, Kontierungen) sind Entwürfe und müssen vor Verwendung geprüft werden.
- Daten werden in einer lokalen JSON-Datei gespeichert; für Mehrbenutzerbetrieb ist eine Datenbank (z. B. PostgreSQL) mit Benutzer- und Rechteverwaltung der nächste Schritt.
- Datenschutz: Beim Einsatz der KI werden die jeweiligen Inhalte an die Anthropic-API übertragen. Personenbezogene Daten nur nach Prüfung (AVV, DSGVO) verarbeiten.

## Mögliche nächste Ausbaustufen

- Lohnabrechnung-Vorbereitung und Export an DATEV Lohn
- E-Rechnung (XRechnung/ZUGFeRD) – seit 2025 Pflicht beim Empfang im B2B
- Bankanbindung (FinTS/PSD2) mit automatischem Zahlungsabgleich
- Automatischer Abruf neuer Ausschreibungen (TED, bund.de, Vergabeplattformen) mit KI-Vorfilterung
- Rollen & Rechte, Mehrmandantenfähigkeit, Audit-Log
