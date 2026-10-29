const PALETTES = [
  ['#ff92bd', '#36232c'], ['#77d6c5', '#1e3434'], ['#f7c46b', '#3a3021'],
  ['#9bb9ff', '#252f49'], ['#c8a3ff', '#332945'], ['#f39f7f', '#3c2924'],
  ['#8bc4e8', '#223641'], ['#d8d58b', '#353622']
];

function templateText(content = '') {
  const parser = document.createElement('div');
  parser.innerHTML = String(content);
  return (parser.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getLayout(template, text) {
  const title = String(template.title || '').toLowerCase();
  if (/inspection|report|checklist/.test(title)) return 'inspection checklist with status chips and a photo grid';
  if (/authorization|access|consent/.test(title)) return 'consent form with a prominent property details block and approval section';
  if (/rental/.test(title)) return 'rental form with an equipment summary, date range, and itemized charges';
  if (/non-disclosure|confidential/.test(title)) return 'confidentiality form with two party panels and numbered clauses';
  if (/license/.test(title)) return 'license form with selectable plan options and a usage scope panel';
  if (/api/.test(title)) return 'API access form with usage limit meters and a fee tier selector';
  if (/development/.test(title)) return 'project agreement with a milestone timeline, deliverables, and payment schedule';
  if (/assignment|intellectual property/.test(title)) return 'rights transfer form with an asset list and representations checklist';
  if (/idea submission/.test(title)) return 'idea submission form with a large summary area and acknowledgment checklist';
  if (/beta testing/.test(title)) return 'beta testing form with a product version panel, test period, and tester checklist';
  if (/open source|contribution/.test(title)) return 'contribution form with contributor details, contribution type controls, and license section';
  if (/saas|subscription/.test(title)) return 'subscription form with plan cards, included features, and renewal details';
  if (/partnership/.test(title)) return 'partnership form with side-by-side partner roles and a revenue split diagram';
  if (/service agreement/.test(title)) return 'service contract with scope, compensation, term, and paired signature lines';
  if (/signature|signed by/i.test(text)) return 'agreement form with party details, clause sections, and paired signature lines';
  return 'single-page business form with labeled fields, clause groups, and an approval area';
}

export function templateThumbnailFingerprint(template) {
  const source = `${template.title || ''}\n${template.category || ''}\n${template.content || ''}`;
  return `wireframe-v2-${hashText(source).toString(16)}`;
}

export function templateThumbnailSeed(template) {
  return hashText(`${template.id || ''}\n${templateThumbnailFingerprint(template)}`) || 1;
}

export function createWireframeThumbnail(template) {
  const text = templateText(template.content);
  const id = String(template.id || 'new');
  const visualHash = hashText(`${id}\n${template.title || ''}\n${template.content || ''}`);
  const [accent, accentDark] = PALETTES[visualHash % PALETTES.length];
  const rows = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const title = String(template.title || 'Agreement');
  const titleLines = Math.min(2, Math.max(1, Math.ceil(title.length / 34)));
  const sectionCount = Math.max(3, Math.min(6, rows.filter((line) => /^\d+[.)]|^[A-Z][A-Z\s&/-]{4,}$/.test(line)).length));
  const kind = getLayout(template, text);
  const isField = /field|inspection|checklist|access|consent|authorization/i.test(`${template.category} ${title}`);
  const checkboxCount = (text.match(/□|\[ \]/g) || []).length;
  const variant = visualHash % 4;
  const lineWidths = Array.from({ length: 3 + sectionCount }, (_, index) => {
    const variation = ((visualHash >>> (index % 24)) & 15) * 5;
    return Math.max(92, 248 - ((index * 29 + variation) % 104));
  });
  const formLines = lineWidths.map((width, index) => {
    const y = 105 + index * 13;
    const x = variant === 1 && index % 3 === 0 ? 203 : 112;
    return `<rect x="${x}" y="${y}" width="${Math.min(width, x === 203 ? 85 : 176)}" height="5" rx="2.5" fill="#c8c4c1"/>`;
  }).join('');
  const checkboxRows = isField || checkboxCount
    ? '<g fill="none" stroke="#aaa5a1" stroke-width="2"><rect x="38" y="217" width="10" height="10" rx="2"/><rect x="62" y="217" width="10" height="10" rx="2"/><rect x="86" y="217" width="10" height="10" rx="2"/><rect x="110" y="217" width="10" height="10" rx="2"/></g>'
    : '';
  const sideDetail = variant === 0
    ? `<rect x="276" y="80" width="12" height="${78 + (visualHash % 48)}" rx="6" fill="${accent}" opacity=".82"/>`
    : variant === 1
      ? `<rect x="112" y="80" width="${74 + (visualHash % 56)}" height="6" rx="3" fill="${accent}"/>`
      : variant === 2
        ? `<g fill="${accent}"><circle cx="272" cy="85" r="4"/><circle cx="284" cy="85" r="4"/><circle cx="296" cy="85" r="4"/></g>`
        : `<rect x="112" y="${89 + (visualHash % 18)}" width="176" height="7" rx="3.5" fill="${accent}" opacity=".72"/>`;
  const marker = Array.from({ length: 25 }, (_, index) => {
    const active = ((visualHash >>> (index % 32)) ^ (index * 13) ^ (id.charCodeAt(index % id.length) || 0)) & 1;
    if (!active) return '';
    const x = 321 + (index % 5) * 7;
    const y = 233 + Math.floor(index / 5) * 7;
    return `<rect x="${x}" y="${y}" width="5" height="5" rx="1" fill="${accent}"/>`;
  }).join('');
  const safeTitle = xmlEscape(title.slice(0, 58));
  const uniqueCode = xmlEscape(Number.isFinite(Number(template.id)) && Number(template.id) > 0
    ? Number(template.id).toString(36).toUpperCase()
    : visualHash.toString(36).slice(0, 4).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${xmlEscape(kind)} wireframe for ${safeTitle}">
    <rect width="400" height="300" rx="18" fill="${accentDark}"/>
    <rect x="91" y="18" width="218" height="264" rx="5" fill="#f8f6f3"/>
    <rect x="112" y="38" width="${Math.min(174, 34 + titleLines * 65)}" height="8" rx="4" fill="#77716e"/>
    <rect x="112" y="54" width="125" height="4" rx="2" fill="#d0cbc7"/>
    <rect x="112" y="73" width="176" height="1" fill="#dfdbd7"/>
    ${sideDetail}${formLines}${checkboxRows}
    <rect x="112" y="237" width="74" height="1" fill="#aaa5a1"/>
    <rect x="216" y="237" width="72" height="1" fill="#aaa5a1"/>
    <rect x="112" y="247" width="46" height="4" rx="2" fill="#d0cbc7"/>
    <rect x="216" y="247" width="44" height="4" rx="2" fill="#d0cbc7"/>
    <rect x="112" y="263" width="176" height="1" fill="#dfdbd7"/>
    <rect x="315" y="225" width="48" height="48" rx="8" fill="#242326" opacity=".92"/>
    ${marker}<text x="339" y="268" text-anchor="middle" fill="#f8f6f3" font-family="Arial,sans-serif" font-size="8" letter-spacing=".5">${uniqueCode}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildTemplateImagePrompt(template) {
  const text = templateText(template.content);
  const layout = getLayout(template, text);
  const uniqueCode = Number.isFinite(Number(template.id)) && Number(template.id) > 0
    ? Number(template.id).toString(36).toUpperCase()
    : templateThumbnailSeed(template).toString(36).slice(0, 5).toUpperCase();
  const [accent] = PALETTES[templateThumbnailSeed(template) % PALETTES.length];
  return `Create a distinct, polished product-preview thumbnail for template ${uniqueCode}: “${String(template.title || 'Agreement').slice(0, 70)}”. This is a ${template.category || 'business'} document wireframe. Use this specific composition: ${layout}. Show an upright cream paper page centered on a quiet charcoal background, soft gray placeholder rules, one restrained accent color ${accent}, and a tiny unique “${uniqueCode}” index tab at the lower right. Straight-on view, crisp vector-like editorial SaaS mockup. Do not use legible contract wording, logos, signatures, or decorative photography. Make the layout composition visibly different from other document previews; do not reuse a generic repeated form layout. This is only a visual layout illustration, not legal advice.`;
}
