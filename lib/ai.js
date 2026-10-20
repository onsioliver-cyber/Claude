import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

export class AiUnavailableError extends Error {
  constructor() {
    super('KI ist nicht konfiguriert. Bitte ANTHROPIC_API_KEY setzen und den Server neu starten.');
    this.status = 503;
  }
}

export class AiRefusalError extends Error {
  constructor() {
    super('Die KI hat diese Anfrage abgelehnt. Bitte formulieren Sie die Anfrage anders.');
    this.status = 422;
  }
}

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client;
function getClient() {
  if (!aiAvailable()) throw new AiUnavailableError();
  client ??= new Anthropic();
  return client;
}

// Server-seitiger Fallback: lehnt das Modell eine Anfrage aus Sicherheitsgründen ab,
// beantwortet ein von Anthropic empfohlenes Ersatzmodell sie im selben Aufruf.
const BASE = {
  model: MODEL,
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
};

function textOf(message) {
  if (message.stop_reason === 'refusal') throw new AiRefusalError();
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Baut den Inhalt einer Nutzernachricht, optional mit angehängter Datei (PDF oder Bild).
export function userContent(text, file) {
  if (!file) return text;
  const blocks = [];
  if (file.mediaType === 'application/pdf') {
    blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data }, title: file.name });
  } else if (/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)) {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } });
  } else {
    throw Object.assign(new Error('Nur PDF- oder Bilddateien (PNG, JPG, GIF, WEBP) werden unterstützt.'), { status: 400 });
  }
  blocks.push({ type: 'text', text });
  return blocks;
}

export async function generateText({ system, content, effort = 'medium' }) {
  const stream = getClient().beta.messages.stream({
    ...BASE,
    max_tokens: 32000,
    output_config: { effort },
    system,
    messages: [{ role: 'user', content }],
  });
  return textOf(await stream.finalMessage());
}

export async function generateJSON({ system, content, schema, effort = 'medium' }) {
  const stream = getClient().beta.messages.stream({
    ...BASE,
    max_tokens: 32000,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  });
  return JSON.parse(textOf(await stream.finalMessage()));
}

export async function streamChat({ system, messages, onText }) {
  const stream = getClient().beta.messages.stream({
    ...BASE,
    max_tokens: 32000,
    output_config: { effort: 'medium' },
    system,
    messages,
  });
  stream.on('text', onText);
  return textOf(await stream.finalMessage());
}
