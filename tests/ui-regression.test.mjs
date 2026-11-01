import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const styles = read('css/styles.css');
const responsive = read('css/responsive.css');
const index = read('index.html');
const app = read('js/app.js');
const learning = read('js/learning.js');
const theme = read('js/theme.js');

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, 'expected CSS rule for ' + selector);
  return match[1];
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, 'expected source marker ' + start);
  assert.ok(to > from, 'expected source marker ' + end);
  return source.slice(from, to);
}

function loadContract() {
  const context = {
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    TypeError,
    clearTimeout,
    console,
    isFinite,
    setTimeout
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('js/study-contract.js'), context, {
    filename: 'js/study-contract.js'
  });
  return context.MindForgeContract;
}

test('progress layout constrains its grid and saved-row content', () => {
  assert.match(cssRule(styles, '.progress-layout'), /grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(cssRule(styles, '.progress-layout > *'), /min-width:\s*0;/);
  assert.match(cssRule(styles, '.progress-saved-row__main'), /min-width:\s*0;/);
  assert.match(cssRule(styles, '.progress-saved-row__main'), /max-width:\s*100%;/);
  assert.ok(
    cssRule(styles, '.progress-saved-row__main strong').includes('text-overflow: ellipsis;'),
    'long saved-session titles should still ellipsize'
  );
  assert.match(responsive, /@media \(max-width: 900px\)[\s\S]*?\.progress-preview\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});

test('generation copy no longer claims the browser makes no AI call', () => {
  assert.ok(!index.includes('Runs locally in this browser'));
  assert.ok(!index.includes('No backend, account or AI call'));
  assert.ok(index.includes('Your Gemini key never reaches this browser.'));

  assert.ok(!learning.includes('Generated locally in the browser'));
  assert.ok(!learning.includes('No AI service was used'));
  assert.ok(learning.includes('Generated with Google Gemini via the MindForge server.'));
});

test('flashcard lookup does not interpolate untrusted ids into selectors', () => {
  assert.ok(learning.includes('function findCard(cardId)'));
  assert.ok(learning.includes("getAttribute('data-card-id')"));
  assert.ok(!learning.includes("querySelector('[data-card-id=\"' + cardId + '\"]')"));
  assert.ok(!/querySelector\([^)]*data-card-id[^)]*\+\s*cardId/.test(learning));
});

test('contract preserves quoted and backslash ids instead of rewriting them', () => {
  const contract = loadContract();
  const quiz = Array.from({ length: 5 }, (_, index) => ({
    id: index === 0 ? 'q"1' : index === 1 ? 'q\\2' : 'q' + index,
    question: 'Question ' + (index + 1) + '?',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswer: 0,
    explanation: 'Option A is correct.'
  }));

  const validation = contract.validateResponse({
    summary: {
      title: 'Hostile ids',
      text: 'A summary long enough to satisfy the response contract.',
      keyConcepts: ['Concept one', 'Concept two']
    },
    quiz,
    flashcards: [
      { id: 'fc"bad', front: 'Front one', back: 'Back one' },
      { id: 'fc\\bad', front: 'Front two', back: 'Back two' }
    ]
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.value.quiz[0].id, 'q"1');
  assert.equal(validation.value.quiz[1].id, 'q\\2');
  assert.deepEqual(
    validation.value.flashcards.map((card) => card.id),
    ['fc"bad', 'fc\\bad']
  );
});

test('history filter input only re-renders the filtered lists', () => {
  const bindFilters = sourceBetween(app, 'function bindFilters()', 'function bindActions()');

  assert.ok(app.includes('function renderFiltered()'));
  assert.equal((bindFilters.match(/renderFiltered\(\)/g) || []).length, 2);
  assert.ok(!bindFilters.includes('renderAll()'));

  const renderFiltered = sourceBetween(app, 'function renderFiltered()', 'function bindFilters()');
  assert.ok(renderFiltered.includes('renderHistoryArchive(records, visible);'));
  assert.ok(renderFiltered.includes('renderSavedGenerations(records, visible);'));
  assert.ok(!renderFiltered.includes('renderStats('));
  assert.ok(!renderFiltered.includes('renderProgress('));
});

test('deleting a saved session restores focus after the list re-renders', () => {
  assert.ok(app.includes('function savedRowIndex(trigger)'));
  assert.ok(app.includes('function focusAfterDelete(index)'));
  assert.ok(app.includes('focusAfterDelete(rowIndex);'));
  assert.ok(app.includes("target.focus({ preventScroll: true });"));
  assert.match(app, /deleteSavedGeneration\([\s\S]{0,160}deleteTrigger/);
  assert.ok(app.includes("querySelectorAll('.saved-row')"));
  assert.ok(app.includes("target = $('[data-history-search]');"));

  // The row position must be captured before history.remove() runs, because
  // removal re-renders the list and detaches the clicked row.
  const deleter = sourceBetween(app, 'function deleteSavedGeneration(', 'function syncFilters()');
  const capture = deleter.indexOf('var rowIndex = savedRowIndex(trigger);');
  const removal = deleter.indexOf('history.remove(id)');
  assert.ok(capture >= 0, 'expected the row index to be captured on delete');
  assert.ok(removal > capture, 'row index must be captured before the record is removed');
  assert.ok(deleter.includes('focusAfterDelete(rowIndex);'));
  assert.ok(!deleter.includes('focusAfterDelete(trigger)'));
});

test('result panels show a visible keyboard focus ring', () => {
  assert.ok(
    cssRule(styles, '.study-result-panel:focus-visible').includes(
      'outline: 2px solid var(--focus);'
    ),
    'the tabpanel is a tab stop and must keep a visible focus indicator'
  );
});

test('closed navigation drawer stays out of the tab order without inert', () => {
  const drawer = sourceBetween(
    responsive,
    '@media (max-width: 1140px)',
    '@media (max-width: 900px)'
  );
  const sidebarRule = cssRule(drawer, '.sidebar');
  const openRule = cssRule(drawer, '.sidebar.is-open');

  assert.ok(sidebarRule.includes('visibility: hidden;'));
  assert.ok(openRule.includes('visibility: visible;'));
});

test('theme controller tolerates MediaQueryList without addEventListener', () => {
  assert.ok(theme.includes("typeof systemQuery.addEventListener === 'function'"));
  assert.ok(theme.includes('systemQuery.addListener(handleSystemChange)'));
});

test('status regions and reduced-motion handling remain in place', () => {
  assert.match(index, /id="toast"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(index, /data-summary-status role="status" aria-live="polite"/);
  assert.match(index, /data-quiz-live role="status" aria-live="polite"/);
  assert.match(index, /data-flashcard-live role="status" aria-live="polite"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /transition-duration:\s*0\.01ms !important;/);
  assert.match(styles, /animation-duration:\s*0\.01ms !important;/);
});

test('untrusted study content is rendered as text, never as executable HTML', () => {
  assert.ok(!learning.includes('innerHTML'));
  assert.ok(!learning.includes('insertAdjacentHTML'));
  assert.ok(!learning.includes('document.write'));
  assert.equal(
    (app.match(/innerHTML/g) || []).length,
    (app.match(/innerHTML\s*=\s*'';/g) || []).length,
    'app.js should only use innerHTML to clear containers'
  );
  assert.ok(!app.includes('insertAdjacentHTML'));
  assert.ok(!app.includes('document.write'));
});
