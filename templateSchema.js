export const TEMPLATE_SCHEMA_VERSION = 1;

const SELECTABLE_PLACEHOLDERS = new Map([
  ['IOS/ANDROID/BOTH', { key: 'PLATFORM', label: 'Platform', options: ['iOS', 'Android', 'Both'] }],
  ['EXCLUSIVE/NON-EXCLUSIVE', { key: 'LICENSE_TYPE', label: 'License type', options: ['Exclusive', 'Non-exclusive'] }],
  ['DAY/WEEK/MONTH', { key: 'RENTAL_UNIT', label: 'Rental rate unit', options: ['Day', 'Week', 'Month'] }]
]);
const REPEATABLE_GROUPS = {
  'Field Inspection Report': [
    { key: 'FINDING_ITEMS', label: 'Inspection finding', section: 'FINDINGS' },
    { key: 'RECOMMENDED_ACTION_ITEMS', label: 'Recommended action', section: 'RECOMMENDED ACTIONS' }
  ],
  'Equipment Rental Agreement': [
    { key: 'EQUIPMENT_ITEMS', label: 'Equipment item', section: 'EQUIPMENT' }
  ],
  'Mobile App Development Agreement': [
    { key: 'PROJECT_MILESTONES', label: 'Project milestone', section: 'TIMELINE AND MILESTONES' }
  ],
  'Data Reef Monitorium': [
    { key: 'MONITORING_READINGS', label: 'Monitoring reading', section: 'MONITORING READINGS' },
    { key: 'FOLLOW_UP_ACTIONS', label: 'Follow-up action', section: 'FOLLOW-UP ACTIONS' }
  ],
  'A to Zenith Template': [
    { key: 'PROJECT_PHASES', label: 'Project phase', section: 'PROJECT PHASES' }
  ],
  'Omega Mega Corp': [
    { key: 'SERVICE_DELIVERABLES', label: 'Service deliverable', section: 'SCOPE AND DELIVERABLES' }
  ]
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function slug(value) {
  return String(value).normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 52) || 'DETAILS';
}

function isHeading(line) {
  return /^\s*(?:\d+[.)]\s*)?[A-Z][A-Z0-9 &/()'-]{3,}\s*$/.test(line) && !/_{3,}/.test(line);
}

function fieldType(key, label, options = []) {
  if (options.length) return 'select';
  const text = `${key.replace(/_/g, ' ')} ${label}`.toLowerCase();
  if (/\b(date|start|end|from|to)\b/.test(text)) return 'date';
  if (/\b(url|website|documentation)\b/.test(text)) return 'url';
  if (/\bemail\b/.test(text)) return 'email';
  if (/\b(amount|cost|fee|price|rate|deposit|compensation|budget)\b|\bpayment (amount|total|fee)\b/.test(text)) return 'currency';
  if (/\b(number|count|days|users|percentage|percent|timeframe|quantity|thresholds?)\b/.test(text)) return 'number';
  if (/\b(description|purpose|scope|services?|responsibilities|findings?|actions?|terms?|instructions?|features?|deliverables?|objective|outcome|restrictions?|dependencies|impact|anomalies|risks|decisions|measures|assumptions|stakeholders)\b/.test(text)) return 'textarea';
  return 'text';
}

function parseOptionsLine(line) {
  const matches = [...line.matchAll(/□\s*([^□]+)/g)];
  return matches.map((match) => match[1].trim().replace(/\s*\([^)]*\)/g, '').replace(/:\s*_{3,}.*$/, '').replace(/_{3,}/g, '').trim()).filter(Boolean);
}

function makeToken(key) {
  return `[${key}]`;
}

function plainTextAndNormalize(content) {
  const source = String(content || '');
  if (/<(?:p|h[1-6]|br|ul|ol|li)\b/i.test(source)) {
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    const render = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const inner = [...node.childNodes].map(render).join('');
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'LI') return `- ${inner}\n`;
      if (['P', 'H1', 'H2', 'H3', 'DIV', 'UL', 'OL'].includes(node.tagName)) return `${inner}\n`;
      return inner;
    };
    return [...parsed.body.childNodes].map(render).join('').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  return source.replace(/\r/g, '');
}

function collectSigners(lines) {
  const roles = new Set();
  lines.forEach((line) => {
    const match = line.match(/^\s*([^:]{2,60}?)\s+(?:Signature|Representative)\s*:/i);
    if (match) {
      const bracketRole = match[1].match(/\[([^\]]+)\]/)?.[1];
      roles.add((bracketRole || match[1].replace(/\[[^\]]+\]/g, '')).trim() || 'Signer');
    }
  });
  if (roles.size) return [...roles].map((role, index) => ({ role, required: true, order: index + 1 }));
  return [];
}

function normalizePlainTemplate(template, sourceText) {
  const lines = sourceText.split('\n').map((line) => line.trimEnd());
  const repeatableGroups = REPEATABLE_GROUPS[template.title] || [];
  for (const group of repeatableGroups) {
    const sectionIndex = lines.findIndex((line) => isHeading(line) && line.replace(/^\d+[.)]\s*/, '').trim().toUpperCase() === group.section);
    if (sectionIndex < 0) continue;
    let endIndex = sectionIndex + 1;
    while (endIndex < lines.length && !isHeading(lines[endIndex])) endIndex += 1;
    lines.splice(sectionIndex + 1, endIndex - sectionIndex - 1, `${group.label} (one per line): ${makeToken(group.key)}`);
  }
  const fields = new Map();
  const sectionHeads = [];
  let currentSection = 'Overview';
  let standaloneIndex = 0;
  const normalized = [];

  const addField = (key, label, options = [], explicitRequired = false) => {
    const safeKey = slug(key);
    if (!fields.has(safeKey)) {
      fields.set(safeKey, {
        key: safeKey,
        label: label || safeKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
        type: repeatableGroups.some((group) => group.key === safeKey)
          ? 'repeatable'
          : (options.length && /items inspected|contribution|responsibilities/i.test(currentSection) ? 'multiselect' : fieldType(safeKey, label, options)),
        required: explicitRequired || /^(DATE|REPORT_DATE|EFFECTIVE_DATE|START_DATE|COMPANY_NAME|PARTY_A|PARTY_B|CUSTOMER_NAME|PROPERTY_ADDRESS|PROJECT_NAME|PRODUCT_NAME|OWNER_NAME|PROVIDER_NAME|CLIENT_NAME|PLAN_OWNER)$/.test(safeKey),
        placeholder: repeatableGroups.some((group) => group.key === safeKey) ? 'Enter one item per line' : (label || safeKey.replace(/_/g, ' ').toLowerCase()),
        ...(repeatableGroups.some((group) => group.key === safeKey) ? { repeatable: true, rowLabel: repeatableGroups.find((group) => group.key === safeKey).label } : {}),
        ...(options.length ? { options } : {})
      });
    }
    return safeKey;
  };

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (!line.trim()) { normalized.push(''); continue; }
    if (/^\[Photo attachments will be added here\]$/i.test(line.trim())) {
      normalized.push('Add supporting photos using the document evidence controls.');
      continue;
    }
    if (isHeading(line)) {
      currentSection = line.replace(/^\d+[.)]\s*/, '').trim();
      sectionHeads.push(currentSection);
    }

    if (line.includes('□')) {
      const optionLines = [];
      while (index < lines.length && lines[index].includes('□')) optionLines.push(lines[index++]);
      index -= 1;
      const options = optionLines.flatMap(parseOptionsLine);
      if (options.length > 1) {
        const key = addField(`${currentSection} options`, `${currentSection} options`, options);
        normalized.push(`${currentSection}: ${makeToken(key)}`);
        continue;
      }
    }

    // Turn labeled blanks into actual placeholders while keeping signature lines for signing.
    if (!/signature\s*:/i.test(line)) {
      line = line.replace(/^\s*([A-Za-z][A-Za-z0-9 /()'&-]{1,55}):\s*(\$\s*)?_{3,}(.*)$/i, (_match, label, currency = '', suffix = '') => {
        const key = addField(label, label.replace(/[()]/g, '').trim());
        return `${label}: ${currency}${makeToken(key)}${suffix}`;
      });
      if (/^_{3,}\s*$/.test(line.trim())) {
        standaloneIndex += 1;
        const label = `${currentSection} detail ${standaloneIndex}`;
        const key = addField(`${currentSection}_DETAIL_${standaloneIndex}`, label);
        line = makeToken(key);
      }
    }

    line = line.replace(/\[([^\[\]]{1,80})\]/g, (placeholder, raw) => {
      const normalizedOption = SELECTABLE_PLACEHOLDERS.get(raw.replace(/\s+/g, '').toUpperCase());
      if (normalizedOption) {
        addField(normalizedOption.key, normalizedOption.label, normalizedOption.options);
        return makeToken(normalizedOption.key);
      }
      const label = raw.trim().replace(/\s+/g, ' ');
      const repeatable = repeatableGroups.find((group) => group.key === slug(label));
      const key = addField(label, repeatable ? `${repeatable.label} (one per line)` : label.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()));
      return makeToken(key);
    });
    normalized.push(line);
  }

  const content = linesToHtml(normalized);
  const sections = splitSections(normalized, fields);
  return {
    content,
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    fields: [...fields.values()],
    sections,
    signers: collectSigners(lines),
    repeatableGroups: repeatableGroups.map((group) => ({ ...group, sectionId: slug(group.section).toLowerCase() })),
    layout: { pageSize: 'A4', orientation: 'portrait', columns: 1, density: 'comfortable' },
    reviewNotes: 'Starting point only. Confirm that terms match the transaction and applicable requirements before signing.'
  };
}

function linesToHtml(lines) {
  const output = [];
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    output.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (isHeading(line)) {
      flushList();
      output.push(`<h2>${escapeHtml(line.replace(/^\d+[.)]\s*/, ''))}</h2>`);
    } else if (/^[-•]\s+/.test(line)) {
      list.push(line.replace(/^[-•]\s+/, ''));
    } else {
      flushList();
      output.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return output.join('\n');
}

function splitSections(lines, fields) {
  const sections = [];
  let current = { id: 'overview', title: 'Overview', lines: [] };
  const push = () => {
    if (!current.lines.length && sections.length) return;
    const body = linesToHtml(current.lines);
    const fieldKeys = [...new Set([...body.matchAll(/\[([A-Z0-9_]+)\]/g)].map((match) => match[1]))]
      .filter((key) => fields.has(key));
    sections.push({ id: current.id, title: current.title, body, fieldKeys });
  };
  for (const line of lines) {
    if (isHeading(line)) {
      push();
      const title = line.replace(/^\d+[.)]\s*/, '').trim();
      current = { id: slug(title).toLowerCase(), title, lines: [] };
    } else current.lines.push(line);
  }
  push();
  return sections;
}

export function normalizeTemplateSchema(template) {
  if (Number(template?.schemaVersion) === TEMPLATE_SCHEMA_VERSION
    && Array.isArray(template.fields) && Array.isArray(template.sections)) {
    return template;
  }
  const text = plainTextAndNormalize(template?.content);
  return { ...template, ...normalizePlainTemplate(template, text) };
}

export function applyTemplateSchemaValues(template, values = {}) {
  let content = String(template?.content || '');
  for (const field of template?.fields || []) {
    const value = values[field.key];
    const rawRendered = Array.isArray(value)
      ? value.join(', ')
      : (field.repeatable ? String(value || '').split(/\n+/).map((line) => line.trim()).filter(Boolean).join('\n') : String(value || ''));
    const rendered = rawRendered.trim()
      ? (field.repeatable ? rawRendered.split('\n').map((line) => `• ${escapeHtml(line)}`).join('<br>') : escapeHtml(rawRendered).replace(/\n/g, '<br>'))
      : '';
    const replacement = rendered || '________________';
    const escapedKey = field.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`\\[${escapedKey}\\]`, 'g'), () => replacement);
  }
  return content;
}

export function templateContentToText(content = '') {
  const parsed = new DOMParser().parseFromString(String(content || ''), 'text/html');
  const render = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const inner = [...node.childNodes].map(render).join('');
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'LI') return `• ${inner}\n`;
    if (['P', 'H1', 'H2', 'H3', 'DIV', 'UL', 'OL'].includes(node.tagName)) return `${inner}\n`;
    return inner;
  };
  return [...parsed.body.childNodes].map(render).join('').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
