export const APP_NAME = 'PinkySwear';
export const BACKUP_VERSION = 4;

export const TEMPLATE_CATEGORIES = Object.freeze([
  'business',
  'legal',
  'field',
  'custom'
]);

export function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeName(value) {
  return normalizeWhitespace(value).slice(0, 80);
}

export function getInitials(value) {
  const parts = normalizeName(value).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripHtml(value) {
  const parser = new DOMParser();
  return parser.parseFromString(String(value ?? ''), 'text/html').body.textContent || '';
}

export function sanitizeRichText(value) {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(String(value ?? ''), 'text/html');
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'OL', 'UL', 'LI', 'H1', 'H2', 'H3', 'A']);

  for (const element of [...documentFragment.body.querySelectorAll('*')]) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const isSafeLink = element.tagName === 'A'
        && attribute.name === 'href'
        && /^(https?:|mailto:)/i.test(attribute.value);
      if (!isSafeLink) element.removeAttribute(attribute.name);
    }

    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute('target', '_blank');
    }
  }

  return documentFragment.body.innerHTML;
}

export function extractTemplateVariables(content) {
  const matches = stripHtml(content).match(/\[([^\[\]\r\n]{1,80})\]/g) || [];
  return [...new Set(matches.map((match) => match.slice(1, -1).trim()).filter(Boolean))];
}

export function applyTemplateValues(content, values = {}) {
  return Object.entries(values).reduce((result, [key, value]) => {
    if (!normalizeWhitespace(value)) return result;
    return result.replace(new RegExp(`\\[${escapeRegExp(key)}\\]`, 'g'), String(value).trim());
  }, String(content ?? ''));
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function isImageDataUrl(value) {
  return typeof value === 'string'
    && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)
    && value.length <= 8_000_000;
}

export function validateBackup(value) {
  if (!value || typeof value !== 'object') throw new Error('Backup must be a JSON object.');
  if (!Array.isArray(value.documents) || !Array.isArray(value.templates)) {
    throw new Error('Backup is missing documents or templates.');
  }
  if (Number(value.version) > BACKUP_VERSION) throw new Error('This backup was created by a newer version of PinkySwear.');
  if (value.documents.length > 10_000 || value.templates.length > 5_000) {
    throw new Error('Backup exceeds the supported record limit.');
  }

  const documents = value.documents.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Document ${index + 1} is invalid.`);
    if (typeof record.title !== 'string' || !normalizeWhitespace(record.title)) throw new Error(`Document ${index + 1} has no title.`);
    if (String(record.content ?? '').length > 500_000) throw new Error(`Document ${index + 1} exceeds the content limit.`);
    if (record.signature && !isImageDataUrl(record.signature)) throw new Error(`Document ${index + 1} has an invalid signature image.`);
    if (record.photos !== undefined && (!Array.isArray(record.photos) || record.photos.length > 12 || record.photos.some((photo) => !isImageDataUrl(photo)))) {
      throw new Error(`Document ${index + 1} has invalid photos.`);
    }
    if (record.location && (!Number.isFinite(Number(record.location.latitude)) || !Number.isFinite(Number(record.location.longitude)))) {
      throw new Error(`Document ${index + 1} has invalid location data.`);
    }
    return record;
  });
  const templates = value.templates.map((template, index) => {
    if (!template || typeof template !== 'object' || Array.isArray(template)) throw new Error(`Template ${index + 1} is invalid.`);
    if (typeof template.title !== 'string' || !normalizeWhitespace(template.title)) throw new Error(`Template ${index + 1} has no title.`);
    if (String(template.content ?? '').length > 500_000) throw new Error(`Template ${index + 1} exceeds the content limit.`);
    return template;
  });
  const brandProfiles = Array.isArray(value.brandProfiles) ? value.brandProfiles : [];
  if (brandProfiles.length > 100) throw new Error('Backup contains too many brand profiles.');
  brandProfiles.forEach((profile, index) => {
    if (!profile || typeof profile !== 'object' || typeof profile.name !== 'string') throw new Error(`Brand profile ${index + 1} is invalid.`);
    if (String(profile.logoUrl || '').length > 8_000_000) throw new Error(`Brand profile ${index + 1} has an oversized logo.`);
  });
  return { version: Number(value.version) || 1, documents, templates, brandProfiles };
}

export function debounce(callback, delay = 180) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

export function createClientId() {
  return globalThis.crypto?.randomUUID?.()
    || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function formatDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: options.includeTime ? 'short' : undefined
  }).format(date);
}
