import {
  applyTemplateValues,
  extractTemplateVariables,
  getInitials,
  isImageDataUrl,
  normalizeName,
  safeJsonParse,
  sanitizeRichText,
  validateBackup
} from '../core.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

test('normalizes profile names', () => equal(normalizeName('  Jordan   Lee  '), 'Jordan Lee'));
test('limits profile names', () => equal(normalizeName('a'.repeat(100)).length, 80));
test('creates accessible initials', () => equal(getInitials('Jordan Avery Lee'), 'JA'));
test('extracts unique template variables', () => equal(extractTemplateVariables('[NAME] met [DATE] and [NAME].'), ['NAME', 'DATE']));
test('escapes template variable regular expressions', () => equal(applyTemplateValues('[A+B]', { 'A+B': 'done' }), 'done'));
test('preserves unfilled template variables', () => equal(applyTemplateValues('[NAME]', { NAME: ' ' }), '[NAME]'));
test('parses malformed JSON safely', () => equal(safeJsonParse('{bad}', 'fallback'), 'fallback'));
test('accepts valid backups', () => equal(validateBackup({ version: 2, documents: [], templates: [] }).version, 2));
test('rejects incomplete backups', () => {
  let rejected = false;
  try { validateBackup({ documents: [] }); } catch { rejected = true; }
  equal(rejected, true);
});
test('rejects a backup document without a title', () => {
  let rejected = false;
  try { validateBackup({ documents: [{ content: 'terms' }], templates: [] }); } catch { rejected = true; }
  equal(rejected, true);
});
test('rejects backups with too many photos on one document', () => {
  let rejected = false;
  try {
    validateBackup({
      documents: [{ title: 'Agreement', photos: Array.from({ length: 13 }, () => 'data:image/png;base64,aGVsbG8=') }],
      templates: []
    });
  } catch { rejected = true; }
  equal(rejected, true);
});
test('rejects unsupported future backup versions', () => {
  let rejected = false;
  try { validateBackup({ version: 999, documents: [], templates: [] }); } catch { rejected = true; }
  equal(rejected, true);
});
test('accepts supported image data URLs', () => equal(isImageDataUrl('data:image/png;base64,aGVsbG8='), true));
test('rejects executable data URLs', () => equal(isImageDataUrl('data:text/html;base64,aGVsbG8='), false));
test('removes event handlers and unsafe links from rich text', () => {
  const result = sanitizeRichText('<p onclick="alert(1)">Safe <a href="javascript:alert(1)">link</a></p>');
  equal(result.includes('onclick'), false);
  equal(result.includes('javascript:'), false);
});

let passed = 0;
for (const { name, run } of tests) {
  const item = document.createElement('li');
  try {
    await run();
    item.className = 'pass';
    item.textContent = `✓ ${name}`;
    passed += 1;
  } catch (error) {
    item.className = 'fail';
    item.textContent = `✕ ${name}`;
    const detail = document.createElement('pre');
    detail.textContent = error.stack || error.message;
    item.append(detail);
    console.error(name, error);
  }
  document.getElementById('results').append(item);
}

const summary = document.getElementById('summary');
summary.textContent = `${passed}/${tests.length} tests passed`;
summary.dataset.status = passed === tests.length ? 'passed' : 'failed';
if (passed !== tests.length) throw new Error(`${tests.length - passed} core test(s) failed`);
