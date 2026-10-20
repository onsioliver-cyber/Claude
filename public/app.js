import { COLLECTIONS, FIRMA_FIELDS } from './schema.js';
import { brutto, ust, isOverdue, tageBis, today } from './calc.js';

// ---------- Hilfsfunktionen ----------

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const dialog = $('#dialog');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const euro = (n) => Number(n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const datum = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('de-DE') : '–');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, error ? 6000 : 2500);
}

// Minimaler, sicherer Markdown-Renderer für KI-Antworten.
function markdown(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of String(text).split('\n')) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (h) { closeList(); out.push(`<h4>${inline(h[2])}</h4>`); }
    else if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
    } else if (!line.trim()) closeList();
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return `<div class="md">${out.join('')}</div>`;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) return reject(new Error('Datei ist größer als 20 MB'));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mediaType: file.type, data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function busy(button, fn) {
  const label = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> KI arbeitet …';
  try { return await fn(); } finally { button.disabled = false; button.innerHTML = label; }
}

function openDialog(html, onMount) {
  $('#dialog-body').innerHTML = html;
  dialog.showModal();
  onMount?.($('#dialog-body'));
}
dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-close]')) dialog.close(); });

function badge(text) {
  const cls = {
    bezahlt: 'ok', genehmigt: 'ok', aktiv: 'ok', gewonnen: 'ok', Go: 'ok', ja: 'ok',
    offen: 'warn', beantragt: 'warn', 'in Prüfung': 'warn', 'Angebot in Arbeit': 'warn', Prüfen: 'warn', unklar: 'warn',
    'überfällig': 'bad', abgelehnt: 'bad', verloren: 'bad', storniert: 'bad', 'No-Go': 'bad', nein: 'bad', ausgeschieden: 'bad', verworfen: 'bad',
  }[text] || '';
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

// ---------- Datencache ----------

const cache = {};
async function load(col, force = false) {
  if (force || !cache[col]) cache[col] = await api(col);
  return cache[col];
}
const refName = (col, id) => cache[col]?.find((r) => r.id === id)?.name ?? '–';

// ---------- Generische Tabellen & Formulare ----------

function formatCell(field, record) {
  const v = record[field.key];
  if (field.type === 'money') return euro(v);
  if (field.type === 'date') return datum(v);
  if (field.type === 'ref') return esc(refName(field.ref, v));
  if (field.key === 'status' || field.key === 'art') return badge(v);
  return esc(v);
}

function fieldInput(f, value) {
  const v = value ?? f.default ?? '';
  const attrs = `name="${f.key}" id="f-${f.key}" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`;
  let input;
  if (f.type === 'textarea') input = `<textarea ${attrs}>${esc(v)}</textarea>`;
  else if (f.type === 'select') input = `<select ${attrs}>${f.options.map((o) => `<option ${o === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.type === 'ref') input = `<select ${attrs}><option value="">– bitte wählen –</option>${(cache[f.ref] || []).map((r) => `<option value="${r.id}" ${r.id === v ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
  else {
    const type = { money: 'number', number: 'number', date: 'date', email: 'email' }[f.type] || 'text';
    input = `<input type="${type}" ${type === 'number' ? 'step="0.01"' : ''} ${attrs} value="${esc(v)}">`;
  }
  return `<div class="${f.type === 'textarea' ? 'full' : ''}"><label for="f-${f.key}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function openForm(col, record, onSaved, preset = {}) {
  const def = COLLECTIONS[col];
  await Promise.all(def.fields.filter((f) => f.type === 'ref').map((f) => load(f.ref)));
  const values = { ...preset, ...record };
  openDialog(`
    <h2>${record ? `${esc(def.singular)} bearbeiten` : `Neue/r ${esc(def.singular)}`}</h2>
    <form class="form" id="crud-form">
      ${def.fields.map((f) => fieldInput(f, values[f.key])).join('')}
    </form>
    <div class="dialog-actions">
      <button data-close>Abbrechen</button>
      <button class="primary" id="save">Speichern</button>
    </div>`, (root) => {
    $('#save', root).onclick = async () => {
      const form = $('#crud-form', root);
      if (!form.reportValidity()) return;
      try {
        const body = formValues(form);
        const saved = record ? await api(`${col}/${record.id}`, { method: 'PUT', body }) : await api(col, { method: 'POST', body });
        dialog.close();
        toast('Gespeichert');
        await load(col, true);
        onSaved?.(saved);
      } catch (e) { toast(e.message, true); }
    };
  });
}

// Rendert eine Tabelle mit CRUD-Funktionen. opts: extraColumns, rowActions, toolbar, filter.
async function crudTable(container, col, opts = {}) {
  const def = COLLECTIONS[col];
  await Promise.all(def.fields.filter((f) => f.type === 'ref').map((f) => load(f.ref)));
  const rows = await load(col);
  const fields = def.fields.filter((f) => f.list);
  const extra = opts.extraColumns || [];
  let query = '';

  const render = () => {
    const shown = rows
      .filter((r) => (opts.filter ? opts.filter(r) : true))
      .filter((r) => !query || JSON.stringify(r).toLowerCase().includes(query))
      .sort(opts.sort || (() => 0));
    $('.rows', container).innerHTML = shown.length ? shown.map((r) => `
      <tr data-id="${r.id}">
        ${fields.map((f) => `<td class="${f.type === 'money' ? 'num' : ''}">${formatCell(f, r)}</td>`).join('')}
        ${extra.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render(r)}</td>`).join('')}
        <td class="actions">
          ${(opts.rowActions || []).filter((a) => !a.show || a.show(r)).map((a, i) => `<button class="small ${a.ki ? 'ki' : ''}" data-action="${i}">${a.label}</button>`).join('')}
          <button class="small" data-edit>Bearbeiten</button>
          <button class="small danger" data-delete>Löschen</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="99" class="empty">Keine Einträge vorhanden.</td></tr>`;
  };

  container.innerHTML = `
    <div class="toolbar">
      <button class="primary" data-new>+ ${esc(def.singular)}</button>
      ${opts.toolbar || ''}
      <span class="spacer"></span>
      <input type="search" placeholder="Suchen …">
      <a class="btn" href="/api/export/${col}.csv" download>CSV-Export</a>
    </div>
    <div class="card table-wrap"><table>
      <thead><tr>${fields.map((f) => `<th class="${f.type === 'money' ? 'num' : ''}">${esc(f.label)}</th>`).join('')}${extra.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody class="rows"></tbody>
    </table></div>`;
  render();

  const reload = async () => { await load(col, true); rows.splice(0, rows.length, ...cache[col]); render(); opts.onChange?.(); };
  $('input[type=search]', container).oninput = (e) => { query = e.target.value.toLowerCase(); render(); };
  $('[data-new]', container).onclick = () => openForm(col, null, reload, opts.preset?.());
  container.onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const record = rows.find((r) => r.id === tr.dataset.id);
    if (e.target.closest('[data-edit]')) openForm(col, record, reload);
    else if (e.target.closest('[data-delete]')) {
      if (!confirm(`${def.singular} wirklich löschen?`)) return;
      try { await api(`${col}/${record.id}`, { method: 'DELETE' }); toast('Gelöscht'); reload(); } catch (err) { toast(err.message, true); }
    } else if (e.target.closest('[data-action]')) {
      const visible = (opts.rowActions || []).filter((a) => !a.show || a.show(record));
      await visible[Number(e.target.closest('[data-action]').dataset.action)].run(record, reload, e.target.closest('button'));
    }
  };
  return { reload };
}

async function patch(col, record, changes) {
  const updated = await api(`${col}/${record.id}`, { method: 'PUT', body: { ...record, ...changes } });
  toast('Aktualisiert');
  return updated;
}

// KI-Ergebnis in einem Dialog anzeigen, mit Kopieren-Funktion.
function showKiText(title, text) {
  openDialog(`
    <h2>${esc(title)}</h2>
    <div class="output">${esc(text)}</div>
    <div class="dialog-actions">
      <button id="copy">In Zwischenablage kopieren</button>
      <button class="primary" data-close>Schließen</button>
    </div>`, (root) => {
    $('#copy', root).onclick = async () => { await navigator.clipboard.writeText(text); toast('Kopiert'); };
  });
}

function tabs(container, defs) {
  container.innerHTML = `<div class="tabs">${defs.map((d, i) => `<button data-tab="${i}">${esc(d.label)}</button>`).join('')}</div><div class="tab-body"></div>`;
  const body = $('.tab-body', container);
  const select = (i) => {
    container.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', Number(b.dataset.tab) === i));
    body.innerHTML = '';
    Promise.resolve(defs[i].render(body)).catch((e) => toast(e.message, true));
  };
  container.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => select(Number(b.dataset.tab)); });
  select(0);
}

const header = (title, sub) => `<h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p><div id="page"></div>`;

// ---------- Seiten ----------

const pages = {};

pages.dashboard = async () => {
  main.innerHTML = header('Übersicht', 'Ihr Unternehmen auf einen Blick.');
  const d = await api('dashboard');
  $('#page').innerHTML = `
    <div class="grid">
      <div class="kpi"><div class="label">Offene Forderungen</div><div class="value">${euro(d.offeneForderungen)}</div><div class="hint">${d.offeneAnzahl} Rechnungen, ${d.ueberfaellig.length} überfällig</div></div>
      <div class="kpi"><div class="label">Umsatz (Monat, netto)</div><div class="value">${euro(d.umsatzMonat)}</div><div class="hint">Ausgaben: ${euro(d.ausgabenMonat)}</div></div>
      <div class="kpi"><div class="label">USt-Zahllast (Monat)</div><div class="value">${euro(d.ustZahllastMonat)}</div><div class="hint">${d.ustZahllastMonat < 0 ? 'Vorsteuerüberhang (Erstattung)' : 'vorläufig, Soll-Versteuerung'}</div></div>
      <div class="kpi"><div class="label">Mitarbeiter aktiv</div><div class="value">${d.mitarbeiterAktiv}</div><div class="hint">Bruttolöhne/Monat: ${euro(d.personalkostenMonat)}</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Überfällige Rechnungen</h2>
        ${d.ueberfaellig.length ? `<table>${d.ueberfaellig.map((r) => `<tr><td>${esc(r.nummer)}<br><small>${esc(r.kunde)}</small></td><td>fällig ${datum(r.faellig)}</td><td class="num">${euro(r.betrag)}</td></tr>`).join('')}</table>
          <p><a href="#/buchhaltung">→ Mahnungen mit KI erstellen</a></p>` : '<p class="empty">Keine überfälligen Rechnungen. 👍</p>'}
      </div>
      <div class="card"><h2>Nächste Angebotsfristen</h2>
        ${d.fristen.length ? `<table>${d.fristen.map((t) => `<tr><td>${esc(t.titel)}</td><td>${badge(t.status)}</td><td class="num">${datum(t.frist)}<br>${t.tage <= 7 ? `<span class="badge bad">in ${t.tage} Tagen</span>` : `<small>in ${t.tage} Tagen</small>`}</td></tr>`).join('')}</table>` : '<p class="empty">Keine offenen Fristen.</p>'}
      </div>
      <div class="card"><h2>Personal heute</h2>
        ${d.heuteAbwesend.length ? `<ul class="list">${d.heuteAbwesend.map((a) => `<li>${esc(a.name)} – ${esc(a.art)} bis ${datum(a.bis)}</li>`).join('')}</ul>` : '<p class="empty">Alle anwesend.</p>'}
        ${d.offeneUrlaubsantraege ? `<p>${badge(`${d.offeneUrlaubsantraege} offene Anträge`)} <a href="#/personal">→ prüfen</a></p>` : ''}
      </div>
      <div class="card"><h2>KI-Schnellzugriff</h2>
        <div class="suggestions">
          <a class="btn" href="#/assistent?q=${encodeURIComponent('Wie ist unsere Liquiditätslage und was sollte ich diese Woche priorisieren?')}">Wochenprioritäten</a>
          <a class="btn" href="#/buchhaltung">Beleg per Foto erfassen</a>
          <a class="btn" href="#/ausschreibungen">Ausschreibung analysieren</a>
          <a class="btn" href="#/personal">Stellenanzeige schreiben</a>
        </div>
      </div>
    </div>`;
};

pages.personal = async () => {
  main.innerHTML = header('Personal', 'Mitarbeiter, Abwesenheiten, Urlaubskonten und KI-gestütztes Recruiting.');
  await load('mitarbeiter');
  tabs($('#page'), [
    {
      label: 'Mitarbeiter',
      render: (el) => crudTable(el, 'mitarbeiter', {
        rowActions: [{ label: 'Zeugnis (KI)', ki: true, run: (m) => zeugnisDialog(m) }],
      }),
    },
    {
      label: 'Abwesenheiten',
      render: (el) => crudTable(el, 'abwesenheiten', {
        sort: (a, b) => b.von.localeCompare(a.von),
        rowActions: [
          { label: 'Genehmigen', show: (a) => a.status === 'beantragt', run: async (a, reload) => { await patch('abwesenheiten', a, { status: 'genehmigt' }); reload(); } },
          { label: 'Ablehnen', show: (a) => a.status === 'beantragt', run: async (a, reload) => { await patch('abwesenheiten', a, { status: 'abgelehnt' }); reload(); } },
        ],
      }),
    },
    {
      label: 'Urlaubskonten',
      render: async (el) => {
        const jahr = new Date().getFullYear();
        const konten = await api(`urlaubskonten?jahr=${jahr}`);
        el.innerHTML = `<div class="card table-wrap"><h2>Urlaubskonten ${jahr}</h2><table>
          <thead><tr><th>Mitarbeiter</th><th class="num">Anspruch</th><th class="num">Genommen</th><th class="num">Beantragt</th><th class="num">Rest</th></tr></thead>
          <tbody>${konten.map((k) => `<tr><td>${esc(k.name)}</td><td class="num">${k.anspruch}</td><td class="num">${k.genommen}</td><td class="num">${k.beantragt}</td><td class="num">${k.rest < 0 ? badge(String(k.rest)) : k.rest}</td></tr>`).join('')}</tbody>
          </table><p class="sub">Arbeitstage Mo–Fr; gesetzliche Feiertage sind nicht abgezogen.</p></div>`;
      },
    },
    {
      label: 'Recruiting (KI)',
      render: (el) => {
        el.innerHTML = `<div class="card"><h2>Stellenanzeige mit KI erstellen</h2>
          <div class="form">
            <div><label>Position *</label><input id="pos" placeholder="z. B. Elektroniker/in für Energie- und Gebäudetechnik"></div>
            <div><label>Standort / Arbeitszeit</label><input id="ort" placeholder="z. B. Musterstadt, Vollzeit, unbefristet"></div>
            <div class="full"><label>Anforderungen, Benefits, Gehaltsspanne …</label><textarea id="details"></textarea></div>
          </div>
          <div class="dialog-actions"><button class="ki" id="go">Stellenanzeige generieren</button></div>
          <div id="result"></div></div>`;
        $('#go', el).onclick = (e) => busy(e.currentTarget, async () => {
          try {
            const { text } = await api('ki/stellenanzeige', { method: 'POST', body: { position: $('#pos', el).value, details: `${$('#ort', el).value}\n${$('#details', el).value}` } });
            $('#result', el).innerHTML = `<h2 style="margin-top:18px">Entwurf</h2><div class="output">${esc(text)}</div>`;
          } catch (err) { toast(err.message, true); }
        });
      },
    },
  ]);
};

function zeugnisDialog(m) {
  openDialog(`
    <h2>Arbeitszeugnis für ${esc(m.name)}</h2>
    <div class="form">
      <div><label>Anlass</label><select id="anlass"><option>Endzeugnis</option><option>Zwischenzeugnis</option></select></div>
      <div><label>Art</label><select id="art"><option>qualifiziertes</option><option>einfaches</option></select></div>
      <div><label>Gesamtnote</label><select id="note">${[1, 2, 3, 4].map((n) => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <p class="sub">Die KI nutzt die Notizen aus dem Mitarbeiterprofil. Bitte Ergebnis immer prüfen.</p>
    <div class="dialog-actions"><button data-close>Abbrechen</button><button class="ki" id="go">Zeugnis erstellen</button></div>`, (root) => {
    $('#go', root).onclick = (e) => busy(e.currentTarget, async () => {
      try {
        const { text } = await api('ki/arbeitszeugnis', { method: 'POST', body: { mitarbeiterId: m.id, anlass: $('#anlass', root).value, art: $('#art', root).value, note: $('#note', root).value } });
        showKiText(`Arbeitszeugnis ${m.name}`, text);
      } catch (err) { toast(err.message, true); }
    });
  });
}

pages.buchhaltung = async () => {
  main.innerHTML = header('Buchhaltung', 'Rechnungen, Belege, Kunden und Umsatzsteuer – mit KI-Belegerfassung und Mahnwesen.');
  await load('kunden');
  tabs($('#page'), [
    {
      label: 'Ausgangsrechnungen',
      render: (el) => crudTable(el, 'rechnungen', {
        sort: (a, b) => (b.datum || '').localeCompare(a.datum || ''),
        preset: () => {
          const ziel = new Date(); ziel.setDate(ziel.getDate() + 14);
          return { datum: today(), faellig: ziel.toISOString().slice(0, 10) };
        },
        extraColumns: [
          { label: 'Brutto', num: true, render: (r) => euro(brutto(r)) },
          { label: '', render: (r) => (isOverdue(r) ? badge('überfällig') : '') },
        ],
        rowActions: [
          { label: 'Bezahlt', show: (r) => r.status === 'offen', run: async (r, reload) => { await patch('rechnungen', r, { status: 'bezahlt' }); reload(); } },
          { label: 'Drucken', run: (r) => druckeRechnung(r) },
          { label: 'Mahnung (KI)', ki: true, show: (r) => r.status === 'offen', run: (r) => mahnDialog(r) },
        ],
      }),
    },
    {
      label: 'Ausgaben & Belege',
      render: (el) => crudTable(el, 'ausgaben', {
        sort: (a, b) => (b.datum || '').localeCompare(a.datum || ''),
        toolbar: '<button class="ki" data-beleg>📷 Beleg mit KI erfassen</button>',
        extraColumns: [{ label: 'Vorsteuer', num: true, render: (a) => euro(ust(a)) }],
      }).then(({ reload }) => { $('[data-beleg]', el).onclick = () => belegDialog(reload); }),
    },
    { label: 'Kunden', render: (el) => crudTable(el, 'kunden') },
    {
      label: 'Umsatzsteuer',
      render: async (el) => {
        const aktuell = new Date().getFullYear();
        el.innerHTML = `<div class="toolbar"><label style="margin:0">Jahr</label><select id="jahr" style="width:auto">${[aktuell, aktuell - 1, aktuell - 2].map((j) => `<option>${j}</option>`).join('')}</select></div><div id="ust"></div>`;
        const show = async () => {
          const monate = await api(`ust?jahr=${$('#jahr', el).value}`);
          const sum = (k) => monate.reduce((s, m) => s + m[k], 0);
          const name = (m) => new Date(2000, m - 1, 1).toLocaleDateString('de-DE', { month: 'long' });
          $('#ust', el).innerHTML = `<div class="card table-wrap"><table>
            <thead><tr><th>Monat</th><th class="num">Umsatz netto</th><th class="num">Umsatzsteuer</th><th class="num">Ausgaben netto</th><th class="num">Vorsteuer</th><th class="num">Zahllast</th></tr></thead>
            <tbody>${monate.map((m) => `<tr><td>${name(m.monat)}</td><td class="num">${euro(m.umsatzNetto)}</td><td class="num">${euro(m.umsatzsteuer)}</td><td class="num">${euro(m.ausgabenNetto)}</td><td class="num">${euro(m.vorsteuer)}</td><td class="num"><strong>${euro(m.zahllast)}</strong></td></tr>`).join('')}
            <tr><th>Summe</th><th class="num">${euro(sum('umsatzNetto'))}</th><th class="num">${euro(sum('umsatzsteuer'))}</th><th class="num">${euro(sum('ausgabenNetto'))}</th><th class="num">${euro(sum('vorsteuer'))}</th><th class="num">${euro(sum('zahllast'))}</th></tr></tbody>
          </table><p class="sub">Vorläufige Übersicht als Grundlage für die USt-Voranmeldung (ELSTER). Stornierte Rechnungen sind ausgenommen. Bitte mit Ihrem Steuerberater abstimmen.</p></div>`;
        };
        $('#jahr', el).onchange = show;
        show();
      },
    },
  ]);
};

function belegDialog(reload) {
  openDialog(`
    <h2>Beleg mit KI erfassen</h2>
    <p class="sub">Laden Sie ein Foto oder PDF einer Eingangsrechnung hoch. Die KI liest die Daten aus und schlägt ein SKR03-Konto vor.</p>
    <div class="form">
      <div class="full"><label>Beleg (PDF, JPG, PNG)</label><input type="file" id="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"></div>
      <div class="full"><label>oder Beleginhalt beschreiben / Zusatzinfos</label><textarea id="text" placeholder="z. B. Tankquittung Aral 12.10., 84,20 € brutto"></textarea></div>
    </div>
    <div class="dialog-actions"><button data-close>Abbrechen</button><button class="ki" id="go">Auslesen & kontieren</button></div>`, (root) => {
    $('#go', root).onclick = (e) => busy(e.currentTarget, async () => {
      try {
        const f = $('#file', root).files[0];
        const { daten } = await api('ki/beleg', { method: 'POST', body: { text: $('#text', root).value, file: f ? await readFile(f) : undefined } });
        dialog.close();
        await openForm('ausgaben', null, reload, { ...daten, datum: daten.datum || today() });
        $('#dialog-body h2').insertAdjacentHTML('afterend', `<p class="output">🤖 ${esc(daten.begruendung)}</p>`);
      } catch (err) { toast(err.message, true); }
    });
  });
}

function mahnDialog(r) {
  openDialog(`
    <h2>Mahnung für ${esc(r.nummer)}</h2>
    <p>${esc(refName('kunden', r.kundeId))} · ${euro(brutto(r))} · fällig ${datum(r.faellig)}${r.faellig ? ` (${-tageBis(r.faellig)} Tage überfällig)` : ''}</p>
    <label>Mahnstufe</label>
    <select id="stufe"><option value="1">Zahlungserinnerung</option><option value="2">1. Mahnung</option><option value="3">Letzte Mahnung</option></select>
    <div class="dialog-actions"><button data-close>Abbrechen</button><button class="ki" id="go">Schreiben erstellen</button></div>`, (root) => {
    $('#go', root).onclick = (e) => busy(e.currentTarget, async () => {
      try {
        const { text } = await api('ki/mahnung', { method: 'POST', body: { rechnungId: r.id, stufe: $('#stufe', root).value } });
        showKiText(`Mahnschreiben ${r.nummer}`, text);
      } catch (err) { toast(err.message, true); }
    });
  });
}

async function druckeRechnung(r) {
  const firma = await api('firma');
  const kunde = cache.kunden.find((k) => k.id === r.kundeId) || {};
  const w = window.open('', '_blank');
  if (!w) return toast('Pop-up wurde blockiert', true);
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(r.nummer)}</title>
    <style>body{font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.head{display:flex;justify-content:space-between}small{color:#555}</style></head><body>
    <div class="head"><div><strong>${esc(firma.name)}</strong><br>${esc(firma.adresse).replace(/\n/g, '<br>')}</div><div class="r"><h2>Rechnung</h2>Nr. ${esc(r.nummer)}<br>Datum: ${datum(r.datum)}<br>Fällig: ${datum(r.faellig)}</div></div>
    <p style="margin:40px 0"><strong>${esc(kunde.name)}</strong><br>${esc(kunde.ansprechpartner)}<br>${esc(kunde.adresse).replace(/\n/g, '<br>')}${kunde.ustId ? `<br>USt-IdNr.: ${esc(kunde.ustId)}` : ''}</p>
    <table><tr><th>Leistung</th><th class="r">Betrag</th></tr>
      <tr><td>${esc(r.beschreibung).replace(/\n/g, '<br>')}</td><td class="r">${euro(r.netto)}</td></tr>
      <tr><td class="r">zzgl. ${esc(r.ustSatz)} % USt</td><td class="r">${euro(ust(r))}</td></tr>
      <tr><th class="r">Gesamtbetrag</th><th class="r">${euro(brutto(r))}</th></tr></table>
    <p style="margin-top:30px">Bitte überweisen Sie den Betrag bis ${datum(r.faellig)} unter Angabe der Rechnungsnummer.</p>
    <p><small>${esc(firma.name)} · ${esc(firma.bank)} · IBAN ${esc(firma.iban)} · USt-IdNr. ${esc(firma.ustId)} · St.-Nr. ${esc(firma.steuernummer)}</small></p>
    <script>window.print()<\/script></body></html>`);
  w.document.close();
}

function analyseHtml(a) {
  const list = (items) => (items?.length ? `<ul class="list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="empty">–</p>');
  return `
    <div class="grid">
      <div class="kpi"><div class="label">Empfehlung</div><div class="value">${badge(a.empfehlung)}</div></div>
      <div class="kpi"><div class="label">Passung</div><div class="score">${a.passung_score}/100</div></div>
      <div class="kpi"><div class="label">Frist</div><div class="value">${datum(a.frist)}</div></div>
      <div class="kpi"><div class="label">Volumen (geschätzt)</div><div class="value">${a.volumen ? euro(a.volumen) : '–'}</div></div>
    </div>
    <p><strong>${esc(a.titel)}</strong> – ${esc(a.auftraggeber)}${a.cpv ? ` · CPV ${esc(a.cpv)}` : ''}</p>
    <p>${esc(a.zusammenfassung)}</p>
    <p><strong>Begründung:</strong> ${esc(a.begruendung)}</p>
    <div class="grid2">
      <div><h2>Eignungskriterien</h2><table>${a.eignungskriterien.map((k) => `<tr><td>${badge(k.erfuellt)}</td><td>${esc(k.kriterium)}<br><small>${esc(k.kommentar)}</small></td></tr>`).join('')}</table></div>
      <div><h2>Leistungsumfang</h2>${list(a.leistungsumfang)}<h2>Zuschlagskriterien</h2>${list(a.zuschlagskriterien)}</div>
      <div><h2>Geforderte Unterlagen</h2>${list(a.geforderte_unterlagen)}</div>
      <div><h2>Risiken</h2>${list(a.risiken)}<h2>Nächste Schritte</h2>${list(a.naechste_schritte)}</div>
    </div>`;
}

function zeigeAnalyse(t) {
  openDialog(`<h2>KI-Analyse: ${esc(t.titel)}</h2>${analyseHtml(t.analyse)}
    <div class="dialog-actions"><button data-close>Schließen</button></div>`);
  dialog.style.width = 'min(1000px, 96vw)';
  dialog.addEventListener('close', () => { dialog.style.width = ''; }, { once: true });
}

function angebotDialog(t) {
  openDialog(`
    <h2>Angebotsentwurf: ${esc(t.titel)}</h2>
    <p class="sub">Die KI erstellt Anschreiben, Unternehmensdarstellung, Ausführungskonzept und Unterlagen-Checkliste${t.analyse ? ' auf Basis der vorhandenen Analyse' : ''}.</p>
    <label>Hinweise (optional)</label><textarea id="hinweise" placeholder="z. B. Projektleitung Jonas Weber, Ausführung mit eigenem Personal, Nachunternehmer für Elektro"></textarea>
    <div class="dialog-actions"><button data-close>Abbrechen</button><button class="ki" id="go">Entwurf erstellen</button></div>`, (root) => {
    $('#go', root).onclick = (e) => busy(e.currentTarget, async () => {
      try {
        const { text } = await api('ki/angebot', { method: 'POST', body: { ausschreibungId: t.id, hinweise: $('#hinweise', root).value } });
        showKiText(`Angebotsentwurf – ${t.titel}`, text);
      } catch (err) { toast(err.message, true); }
    });
  });
}

pages.ausschreibungen = async () => {
  main.innerHTML = header('Ausschreibungen', 'Vergabe-Pipeline, KI-Analyse von Vergabeunterlagen (Go/No-Go) und Angebotsentwürfe.');
  tabs($('#page'), [
    {
      label: 'Pipeline',
      render: (el) => crudTable(el, 'ausschreibungen', {
        sort: (a, b) => (a.frist || '9999').localeCompare(b.frist || '9999'),
        extraColumns: [
          { label: 'Restzeit', render: (t) => { const n = tageBis(t.frist); return n == null ? '' : n < 0 ? '<small>abgelaufen</small>' : n <= 7 ? `<span class="badge bad">${n} Tage</span>` : `${n} Tage`; } },
          { label: 'KI', render: (t) => (t.analyse ? `${badge(t.analyse.empfehlung)} <small>${t.analyse.passung_score}/100</small>` : '') },
        ],
        rowActions: [
          { label: 'Analyse ansehen', show: (t) => Boolean(t.analyse), run: (t) => zeigeAnalyse(t) },
          { label: 'KI-Analyse', ki: true, run: (t, reload, btn) => busy(btn, async () => {
            try {
              await api('ki/ausschreibungAnalyse', { method: 'POST', body: { ausschreibungId: t.id } });
              await reload();
              zeigeAnalyse(cache.ausschreibungen.find((x) => x.id === t.id));
            } catch (err) { toast(err.message, true); }
          }) },
          { label: 'Angebot (KI)', ki: true, run: (t) => angebotDialog(t) },
        ],
      }),
    },
    {
      label: 'Neue Unterlagen analysieren',
      render: (el) => {
        el.innerHTML = `<div class="card"><h2>Vergabeunterlagen mit KI prüfen</h2>
          <p class="sub">Laden Sie die Bekanntmachung oder Leistungsbeschreibung als PDF hoch oder fügen Sie den Text ein. Die KI extrahiert Eckdaten, prüft die Eignung gegen Ihr Firmenprofil und gibt eine Go/No-Go-Empfehlung.</p>
          <div class="form">
            <div class="full"><label>PDF / Bild</label><input type="file" id="file" accept="application/pdf,image/png,image/jpeg"></div>
            <div class="full"><label>oder Text der Bekanntmachung</label><textarea id="text" style="min-height:160px"></textarea></div>
          </div>
          <div class="dialog-actions"><button class="ki" id="go">Analysieren</button></div></div>
          <div id="result"></div>`;
        $('#go', el).onclick = (e) => busy(e.currentTarget, async () => {
          try {
            const f = $('#file', el).files[0];
            const { analyse } = await api('ki/ausschreibungAnalyse', { method: 'POST', body: { text: $('#text', el).value, file: f ? await readFile(f) : undefined } });
            $('#result', el).innerHTML = `<div class="card">${analyseHtml(analyse)}<div class="dialog-actions"><button class="primary" id="anlegen">In Pipeline übernehmen</button></div></div>`;
            $('#anlegen', el).onclick = async () => {
              try {
                await api('ausschreibungen', { method: 'POST', body: {
                  titel: analyse.titel, auftraggeber: analyse.auftraggeber, frist: /^\d{4}-\d{2}-\d{2}$/.test(analyse.frist) ? analyse.frist : '',
                  volumen: analyse.volumen || '', cpv: analyse.cpv, status: 'in Prüfung', beschreibung: analyse.zusammenfassung,
                  analyse: { ...analyse, erstellt: new Date().toISOString() },
                } });
                cache.ausschreibungen = null;
                toast('In Pipeline übernommen');
                location.hash = '#/ausschreibungen';
                pages.ausschreibungen();
              } catch (err) { toast(err.message, true); }
            };
          } catch (err) { toast(err.message, true); }
        });
      },
    },
  ]);
};

pages.assistent = async (params) => {
  main.innerHTML = header('KI-Assistent', 'Fragen Sie alles zu Ihrem Unternehmen – der Assistent kennt Ihre aktuellen Zahlen, Mitarbeiter und Fristen.');
  const history = [];
  $('#page').innerHTML = `<div class="chat card">
    <div class="chat-log" id="log">
      <div class="suggestions" id="sugg">
        ${['Welche Rechnungen sollte ich heute anmahnen?', 'Wie hoch ist unsere USt-Zahllast diesen Monat und wann ist die Voranmeldung fällig?', 'Wer hat noch viel Resturlaub und sollte ihn planen?', 'Welche Ausschreibung sollten wir priorisieren und warum?', 'Was muss ich bei der Einstellung eines Minijobbers beachten?']
          .map((q) => `<button>${esc(q)}</button>`).join('')}
      </div>
    </div>
    <form class="chat-input" id="chat-form">
      <textarea id="q" placeholder="Frage stellen … (Enter zum Senden, Shift+Enter für Zeilenumbruch)"></textarea>
      <button class="primary" id="send">Senden</button>
    </form></div>`;
  const log = $('#log');
  const q = $('#q');
  const send = async (text) => {
    if (!text.trim()) return;
    $('#sugg')?.remove();
    history.push({ role: 'user', content: text });
    log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div><div class="msg assistant"><span class="spinner"></span></div>`);
    const out = log.lastElementChild;
    log.scrollTop = log.scrollHeight;
    q.value = '';
    $('#send').disabled = true;
    let answer = '';
    try {
      const res = await fetch('/api/ki/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop();
        for (const ev of events) {
          const type = ev.match(/^event: (.*)$/m)?.[1];
          const data = JSON.parse(ev.match(/^data: (.*)$/m)?.[1] || 'null');
          if (type === 'text') { answer += data; out.innerHTML = markdown(answer); log.scrollTop = log.scrollHeight; }
          if (type === 'error') throw new Error(data.error);
        }
      }
      history.push({ role: 'assistant', content: answer });
    } catch (err) {
      history.pop();
      out.innerHTML = `<span class="badge bad">Fehler</span> ${esc(err.message)}`;
    } finally {
      $('#send').disabled = false;
    }
  };
  $('#chat-form').onsubmit = (e) => { e.preventDefault(); send(q.value); };
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q.value); } };
  $('#sugg').onclick = (e) => { if (e.target.tagName === 'BUTTON') send(e.target.textContent); };
  if (params.get('q')) send(params.get('q'));
};

pages.einstellungen = async () => {
  main.innerHTML = header('Firmenprofil', 'Diese Angaben nutzt die KI für Angebote, Stellenanzeigen, Mahnungen und die Eignungsprüfung bei Ausschreibungen.');
  const firma = await api('firma');
  $('#page').innerHTML = `<div class="card"><form class="form" id="firma">${FIRMA_FIELDS.map((f) => fieldInput(f, firma[f.key])).join('')}</form>
    <div class="dialog-actions"><button class="primary" id="save">Speichern</button></div></div>`;
  $('#save').onclick = async () => {
    try {
      const saved = await api('firma', { method: 'PUT', body: formValues($('#firma')) });
      $('#firmenname').textContent = saved.name;
      toast('Firmenprofil gespeichert');
    } catch (e) { toast(e.message, true); }
  };
};

// ---------- Router ----------

async function route() {
  const [pathPart, query] = location.hash.replace(/^#\/?/, '').split('?');
  const page = pages[pathPart] ? pathPart : 'dashboard';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${page}`));
  if (dialog.open) dialog.close();
  try {
    await pages[page](new URLSearchParams(query));
  } catch (e) {
    main.innerHTML = `<div class="card"><span class="badge bad">Fehler</span> ${esc(e.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);
route();

api('status').then((s) => {
  $('#ki-status').innerHTML = s.ki ? `🟢 KI aktiv<br><small>${esc(s.modell)}</small>` : '🟠 KI inaktiv<br><small>ANTHROPIC_API_KEY fehlt</small>';
});
api('firma').then((f) => { $('#firmenname').textContent = f.name || ''; });
