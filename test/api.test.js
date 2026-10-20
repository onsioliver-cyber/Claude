import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { Store } from '../lib/store.js';
import { arbeitstage, brutto, ustUebersicht, urlaubskonto } from '../public/calc.js';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

let server;
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-test-'));

before(async () => {
  const app = createApp(new Store(path.join(dir, 'db.json')));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (p, method = 'GET', body) => {
  const res = await fetch(`${base}/${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
};

test('Berechnungen', () => {
  assert.equal(brutto({ netto: 100, ustSatz: '19' }), 119);
  assert.equal(brutto({ netto: 10.5, ustSatz: '7' }), 11.24);
  assert.equal(arbeitstage('2026-10-19', '2026-10-25'), 5); // Mo–So
  const m = { id: 'a', urlaubsanspruch: 30 };
  const konto = urlaubskonto(m, [
    { mitarbeiterId: 'a', art: 'Urlaub', von: '2026-10-19', bis: '2026-10-23', status: 'genehmigt' },
    { mitarbeiterId: 'a', art: 'Urlaub', von: '2026-12-28', bis: '2027-01-08', status: 'beantragt' },
    { mitarbeiterId: 'a', art: 'Krankheit', von: '2026-03-02', bis: '2026-03-06', status: 'genehmigt' },
  ], 2026);
  assert.deepEqual(konto, { anspruch: 30, genommen: 5, beantragt: 4, rest: 25 });
  const ust = ustUebersicht(
    [{ datum: '2026-03-05', netto: 1000, ustSatz: '19', status: 'offen' }, { datum: '2026-03-06', netto: 500, ustSatz: '19', status: 'storniert' }],
    [{ datum: '2026-03-10', netto: 200, ustSatz: '19' }],
    2026,
  );
  assert.equal(ust[2].umsatzsteuer, 190);
  assert.equal(ust[2].vorsteuer, 38);
  assert.equal(ust[2].zahllast, 152);
});

test('Demodaten und Dashboard', async () => {
  const { status, body } = await call('dashboard');
  assert.equal(status, 200);
  assert.equal(body.mitarbeiterAktiv, 4);
  assert.ok(body.ueberfaellig.length >= 1);
  assert.ok(body.fristen.length >= 1);
});

test('CRUD mit Validierung und Rechnungsnummer', async () => {
  const kunden = (await call('kunden')).body;
  const bad = await call('rechnungen', 'POST', { kundeId: kunden[0].id, datum: '2026-10-01' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Nettobetrag/);

  const created = await call('rechnungen', 'POST', { kundeId: kunden[0].id, datum: '2026-10-01', netto: '1.234,5'.replace('.', ''), ustSatz: '19' });
  assert.equal(created.status, 201);
  assert.equal(created.body.netto, 1234.5);
  assert.match(created.body.nummer, /^RE-2026-\d{4}$/);
  assert.equal(created.body.status, 'offen');

  const updated = await call(`rechnungen/${created.body.id}`, 'PUT', { ...created.body, nummer: '', status: 'bezahlt' });
  assert.equal(updated.body.status, 'bezahlt');
  assert.equal(updated.body.nummer, created.body.nummer);

  assert.equal((await call(`rechnungen/${created.body.id}`, 'DELETE')).status, 204);
  assert.equal((await call(`rechnungen/${created.body.id}`, 'DELETE')).status, 404);
  assert.equal((await call('unbekannt')).status, 404);
});

test('CSV-Export', async () => {
  const res = await fetch(`${base}/export/mitarbeiter.csv`);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(text, /Name;Position/);
  assert.match(text, /Anna Schneider/);
});

test('KI ohne API-Schlüssel liefert verständlichen Fehler', async () => {
  const res = await call('ki/stellenanzeige', 'POST', { position: 'Elektriker' });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /ANTHROPIC_API_KEY/);
  const chat = await call('ki/chat', 'POST', { messages: [{ role: 'user', content: 'Hallo' }] });
  assert.equal(chat.status, 503);
  assert.equal((await call('ki/gibtsnicht', 'POST', {})).status, 404);
});
