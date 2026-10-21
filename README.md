# Sorgenfrei Pflege-Abo

Prototyp einer Webapp für ein Pflege-Abo in Deutschland: vier buchbare Pakete von der kostenlosen Pflegebox bis zur kompletten ambulanten Pflege, ein Kostenrechner nach Pflegegrad und ein Buchungsformular in fünf Schritten.

## Starten

Keine Abhängigkeiten, kein Build. `index.html` im Browser öffnen oder lokal ausliefern:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Inhalt

- `index.html` – komplette App (HTML, CSS, JavaScript)
- `img/` – Bilder, erstellt mit Canva
- `RESEARCH.md` – Recherche zu Leistungen von Pflege- und Krankenkasse 2026 mit Quellen

## Pakete

| Paket | Inhalt | Kostenträger |
|---|---|---|
| Basis · Pflegebox | Pflegehilfsmittel bis 42 €/Monat | Pflegekasse ab PG 1 |
| Plus · Versorgung | + Medikamentenservice, Inkontinenz, Hausnotruf | Pflege- und Krankenkasse, Servicepauschale privat |
| Komfort · Alltag | + Alltagshilfe, Pflegeberatung | Entlastungsbetrag 131 € |
| Premium · Ambulant komplett | + Grund- und Behandlungspflege | Pflegesachleistung ab PG 2, Krankenkasse (§ 37 SGB V) |

Die gesetzlichen Beträge stehen im Objekt `PG` in `index.html`, Beispielpreise im Objekt `PRICE`.

## Hinweise

- Das Buchungsformular überträgt keine Daten; Anfragen werden nur im `localStorage` des Browsers gespeichert. Für den Livebetrieb braucht es ein Backend mit DSGVO-konformer Verarbeitung von Gesundheitsdaten.
- Die Bilder in `img/` sind derzeit Vorschaugrößen (ca. 160×200 px), weil die Arbeitsumgebung `media.canva.com` nicht erreicht. Die Originale (1264×1580) liegen in Canva und werden unter gleichem Dateinamen ersetzt:

  | Datei | Canva-Medien-ID |
  |---|---|
  | `img/hero.jpg` | MAHYqpRM7pE |
  | `img/paket-basis.jpg` | MAHYqhMVlgU |
  | `img/paket-plus.jpg` | MAHYqoiFb5I |
  | `img/paket-komfort.jpg` | MAHYqsVDBTs |
  | `img/paket-premium.jpg` | MAHYqnqVGSM |
