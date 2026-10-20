import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Store } from './lib/store.js';
import { COLLECTIONS, FIRMA_FIELDS, sanitize } from './public/schema.js';
import { brutto, isOverdue, today, tageBis, urlaubskonto, ustUebersicht, round2 } from './public/calc.js';
import Anthropic from '@anthropic-ai/sdk';
import { aiAvailable, streamChat, MODEL, AiUnavailableError } from './lib/ai.js';
import { TASKS, CHAT_SYSTEM, unternehmensKontext } from './lib/tasks.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Optionaler Zugangsschutz per HTTP Basic Auth (Benutzername beliebig, Passwort = APP_PASSWORD).
function basicAuth(password) {
  const expected = crypto.createHash('sha256').update(password).digest();
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
    if (crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Mittelstand Suite", charset="UTF-8"').status(401).send('Anmeldung erforderlich');
  };
}

function csvCell(v) {
  if (typeof v === 'number') return String(v).replace('.', ',');
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function createApp(store, { password } = {}) {
  const app = express();
  if (password) app.use(basicAuth(password));
  app.use(express.json({ limit: '30mb' }));
  app.use(express.static(path.join(here, 'public')));

  const collection = (req, res, next) => (COLLECTIONS[req.params.col] ? next() : res.status(404).json({ error: 'Unbekannte Sammlung' }));

  app.get('/api/status', (req, res) => res.json({ ki: aiAvailable(), modell: MODEL }));

  app.get('/api/firma', (req, res) => res.json(store.data.firma));
  app.put('/api/firma', (req, res) => {
    const firma = {};
    for (const f of FIRMA_FIELDS) firma[f.key] = req.body?.[f.key] ?? '';
    store.data.firma = firma;
    store.save();
    res.json(firma);
  });

  app.get('/api/dashboard', (req, res) => {
    const d = store.data;
    const stichtag = today();
    const monat = stichtag.slice(0, 7);
    const offen = d.rechnungen.filter((r) => r.status === 'offen');
    const ueberfaellig = offen.filter((r) => isOverdue(r, stichtag));
    const umsatzMonat = d.rechnungen.filter((r) => r.status !== 'storniert' && r.datum?.startsWith(monat)).reduce((s, r) => s + Number(r.netto || 0), 0);
    const ausgabenMonat = d.ausgaben.filter((a) => a.datum?.startsWith(monat)).reduce((s, a) => s + Number(a.netto || 0), 0);
    const ustMonat = ustUebersicht(d.rechnungen, d.ausgaben, Number(stichtag.slice(0, 4)))[Number(stichtag.slice(5, 7)) - 1];
    const aktiv = d.mitarbeiter.filter((m) => m.status === 'aktiv');
    const heuteAbwesend = d.abwesenheiten
      .filter((a) => a.status === 'genehmigt' && a.von <= stichtag && a.bis >= stichtag)
      .map((a) => ({ ...a, name: d.mitarbeiter.find((m) => m.id === a.mitarbeiterId)?.name }));
    const fristen = d.ausschreibungen
      .filter((t) => t.frist && !['abgegeben', 'gewonnen', 'verloren', 'verworfen'].includes(t.status) && t.frist >= stichtag)
      .sort((a, b) => a.frist.localeCompare(b.frist))
      .map((t) => ({ id: t.id, titel: t.titel, frist: t.frist, tage: tageBis(t.frist, stichtag), status: t.status }));
    res.json({
      stichtag,
      offeneForderungen: round2(offen.reduce((s, r) => s + brutto(r), 0)),
      offeneAnzahl: offen.length,
      ueberfaellig: ueberfaellig.map((r) => ({ id: r.id, nummer: r.nummer, betrag: brutto(r), faellig: r.faellig, kunde: d.kunden.find((k) => k.id === r.kundeId)?.name })),
      umsatzMonat: round2(umsatzMonat),
      ausgabenMonat: round2(ausgabenMonat),
      ustZahllastMonat: ustMonat.zahllast,
      mitarbeiterAktiv: aktiv.length,
      personalkostenMonat: round2(aktiv.reduce((s, m) => s + Number(m.bruttogehalt || 0), 0)),
      offeneUrlaubsantraege: d.abwesenheiten.filter((a) => a.status === 'beantragt').length,
      heuteAbwesend,
      fristen,
    });
  });

  app.get('/api/urlaubskonten', (req, res) => {
    const jahr = Number(req.query.jahr) || new Date().getFullYear();
    res.json(store.data.mitarbeiter.map((m) => ({ id: m.id, name: m.name, ...urlaubskonto(m, store.data.abwesenheiten, jahr) })));
  });

  app.get('/api/ust', (req, res) => {
    const jahr = Number(req.query.jahr) || new Date().getFullYear();
    res.json(ustUebersicht(store.data.rechnungen, store.data.ausgaben, jahr));
  });

  app.get('/api/export/:col.csv', collection, (req, res) => {
    const def = COLLECTIONS[req.params.col];
    const lines = [def.fields.map((f) => csvCell(f.label)).join(';')];
    for (const r of store.list(req.params.col)) {
      lines.push(def.fields.map((f) => {
        const v = r[f.key];
        if (f.type === 'ref') return csvCell(store.get(f.ref, v)?.name ?? '');
        return csvCell(v);
      }).join(';'));
    }
    res.set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${req.params.col}-${today()}.csv"`)
      .send(`﻿${lines.join('\r\n')}`);
  });

  app.get('/api/:col', collection, (req, res) => res.json(store.list(req.params.col)));

  app.post('/api/:col', collection, (req, res) => {
    const { value, error } = sanitize(req.params.col, req.body);
    if (error) return res.status(400).json({ error });
    if (req.params.col === 'rechnungen' && !value.nummer) value.nummer = store.nextInvoiceNumber(value.datum);
    // Eine im Browser erstellte KI-Analyse darf beim Anlegen einer Ausschreibung mitgegeben werden.
    const analyse = req.body?.analyse;
    if (req.params.col === 'ausschreibungen' && Array.isArray(analyse?.eignungskriterien)) value.analyse = analyse;
    res.status(201).json(store.insert(req.params.col, value));
  });

  app.put('/api/:col/:id', collection, (req, res) => {
    const { value, error } = sanitize(req.params.col, req.body);
    if (error) return res.status(400).json({ error });
    if (req.params.col === 'rechnungen' && !value.nummer) delete value.nummer;
    const record = store.update(req.params.col, req.params.id, value);
    record ? res.json(record) : res.status(404).json({ error: 'Nicht gefunden' });
  });

  app.delete('/api/:col/:id', collection, (req, res) => {
    store.remove(req.params.col, req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Nicht gefunden' });
  });

  app.post('/api/ki/chat', async (req, res, next) => {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length || messages.some((m) => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
      return res.status(400).json({ error: 'Ungültiger Gesprächsverlauf' });
    }
    if (!aiAvailable()) return next(new AiUnavailableError());
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await streamChat({
        system: [
          { type: 'text', text: CHAT_SYSTEM },
          { type: 'text', text: unternehmensKontext(store) },
        ],
        messages,
        onText: (text) => send('text', text),
      });
      send('done', {});
    } catch (err) {
      console.error(err);
      const ownError = !(err instanceof Anthropic.APIError) && err.status && err.status < 500;
      send('error', { error: ownError ? err.message : 'KI-Anfrage fehlgeschlagen' });
    }
    res.end();
  });

  app.post('/api/ki/:task', async (req, res, next) => {
    const task = TASKS[req.params.task];
    if (!task) return res.status(404).json({ error: 'Unbekannte KI-Funktion' });
    try {
      res.json(await task(store, req.body || {}));
    } catch (err) {
      next(err);
    }
  });

  app.use((err, req, res, next) => {
    if (err instanceof Anthropic.APIError) {
      console.error(err);
      return res.status(502).json({ error: `KI-Dienst nicht erreichbar oder Anfrage abgelehnt (${err.status ?? 'Verbindung'})` });
    }
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500 && status !== 503) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Interner Fehler' : err.message });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new Store(process.env.DATA_FILE || path.join(here, 'data', 'db.json'));
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createApp(store, { password: process.env.APP_PASSWORD }).listen(port, host, () => {
    console.log(`Mittelstand Suite läuft auf http://${host}:${port}`);
    console.log(aiAvailable() ? `KI aktiv (Modell ${MODEL})` : 'KI inaktiv – ANTHROPIC_API_KEY setzen, um KI-Funktionen zu nutzen');
  });
}
