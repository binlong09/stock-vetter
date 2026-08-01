import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LayoutBlock } from '@stock-vetter/core';
import { stripBoilerplate } from './boilerplate.js';

const para = (text: string): LayoutBlock => ({ kind: 'para', text, markdown: text });

// Verbatim from Church & Dwight's 2025 10-K Item 8 (fixtures/CHD/sec/…), which
// abbreviates rather than spelling out the board's name — the form a rule
// written from memory tends to miss.
const AUDIT_SCOPE =
  'Basis for Opinion These financial statements are the responsibility of the ' +
  "Company's management. Our responsibility is to express an opinion on the Company's " +
  'financial statements based on our audits. We are a public accounting firm registered ' +
  'with the PCAOB and are required to be independent with respect to the Company in ' +
  'accordance with the U.S. federal securities laws. We conducted our audits in accordance ' +
  'with the standards of the PCAOB. Those standards require that we plan and perform the ' +
  'audit to obtain reasonable assurance about whether the financial statements are free of ' +
  'material misstatement, whether due to error or fraud.';

const SAFE_HARBOR =
  'This report contains forward-looking statements within the meaning of the Private ' +
  'Securities Litigation Reform Act of 1995. Actual results could differ materially from ' +
  'those projected. We undertake no obligation to update any forward-looking statement.';

const REAL_CONTENT =
  'Net sales increased 1.6% to $6,203.2 million, driven by volume growth in the Consumer ' +
  'Domestic segment, partially offset by unfavorable product mix.';

test('recognized boilerplate is removed', () => {
  const r = stripBoilerplate([para(SAFE_HARBOR), para(REAL_CONTENT), para(AUDIT_SCOPE)]);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0]!.text, REAL_CONTENT);
  assert.deepEqual(r.reports.map((x) => x.ruleId).sort(), ['audit-scope', 'safe-harbor']);
});

test('the audit-scope rule matches the abbreviated PCAOB form real filers use', () => {
  // Regression guard: a rule keyed only on the spelled-out board name matches
  // nothing in CHD, MELI, or any other filer that abbreviates, and the rule
  // looks like it works because it never errors.
  const r = stripBoilerplate([para(AUDIT_SCOPE)]);
  assert.equal(r.blocks.length, 0);
});

test('a protected phrase overrides every strip rule', () => {
  // This is the whole safety model. The sentence that matters is embedded in a
  // paragraph that is otherwise textbook boilerplate; removing the paragraph
  // removes the thesis.
  const withWeakness =
    AUDIT_SCOPE +
    ' We identified a material weakness in internal control over financial reporting ' +
    'relating to the review of manual journal entries.';
  const r = stripBoilerplate([para(withWeakness)]);
  assert.equal(r.blocks.length, 1, 'material-weakness disclosure was stripped as boilerplate');
  assert.equal(r.protectedFromStripping, 1);
});

test('going-concern language survives inside otherwise-boilerplate text', () => {
  const t =
    SAFE_HARBOR +
    ' These conditions raise substantial doubt about our ability to continue as a going concern.';
  const r = stripBoilerplate([para(t)]);
  assert.equal(r.blocks.length, 1);
});

test('tables are never stripped', () => {
  const t: LayoutBlock = {
    kind: 'table',
    // Text that would otherwise match a rule outright.
    text: 'Table of Contents',
    markdown: '| Table of Contents | 1 |',
    rows: [],
  };
  const r = stripBoilerplate([t]);
  assert.equal(r.blocks.length, 1);
});

test('page furniture and note legends are removed', () => {
  const r = stripBoilerplate([
    para('Table of Contents'),
    para('42'),
    para('The accompanying notes are an integral part of these consolidated financial statements.'),
    para(REAL_CONTENT),
  ]);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0]!.text, REAL_CONTENT);
});

test('over-aggressive stripping is reported as a warning, not hidden', () => {
  const blocks = [...Array(9).fill(para(SAFE_HARBOR)), para(REAL_CONTENT)];
  const r = stripBoilerplate(blocks);
  assert.ok(r.strippedFraction > 0.5);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0]!, /review STRIP_RULES/);
});

test('rules can be disabled individually', () => {
  const r = stripBoilerplate([para(SAFE_HARBOR)], { disable: ['safe-harbor'] });
  assert.equal(r.blocks.length, 1);
});

test('every removal is attributed to a named rule with a stated reason', () => {
  const r = stripBoilerplate([para(SAFE_HARBOR), para('Table of Contents')]);
  assert.equal(r.reports.reduce((n, x) => n + x.blocksRemoved, 0), 2);
  assert.ok(r.reports.every((x) => x.why.length > 10));
});
