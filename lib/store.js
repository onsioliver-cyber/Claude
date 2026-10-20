import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COLLECTIONS } from '../public/schema.js';
import { seedData } from './seed.js';

// Einfacher JSON-Dateispeicher. Für den Produktivbetrieb durch eine Datenbank ersetzen.
export class Store {
  constructor(file) {
    this.file = file;
    if (fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      this.data = seedData();
      this.save();
    }
    for (const name of Object.keys(COLLECTIONS)) this.data[name] ??= [];
    this.data.firma ??= {};
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list(collection) {
    return this.data[collection];
  }

  get(collection, id) {
    return this.data[collection].find((r) => r.id === id);
  }

  insert(collection, value) {
    const record = { id: crypto.randomUUID(), ...value, erstellt: new Date().toISOString() };
    this.data[collection].push(record);
    this.save();
    return record;
  }

  update(collection, id, value) {
    const record = this.get(collection, id);
    if (!record) return null;
    Object.assign(record, value, { geaendert: new Date().toISOString() });
    this.save();
    return record;
  }

  remove(collection, id) {
    const list = this.data[collection];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.save();
    return true;
  }

  nextInvoiceNumber(datum) {
    const jahr = (datum || new Date().toISOString()).slice(0, 4);
    const prefix = `RE-${jahr}-`;
    const max = this.data.rechnungen
      .map((r) => r.nummer)
      .filter((n) => n?.startsWith(prefix))
      .reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
}
