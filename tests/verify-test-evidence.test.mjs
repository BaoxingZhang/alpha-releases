import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parseTestSummary, validateTestEvidence } from '../scripts/verify-test-evidence.mjs';

const evidence = { validation: { npmTest: { passed: 3, failed: 0 } } };
const log = 'hello\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n';

test('test evidence parser reads the final Node test summary', () => {
  assert.deepEqual(parseTestSummary(log), { tests: 3, pass: 3, fail: 0, cancelled: 0, skipped: 0 });
  assert.deepEqual(validateTestEvidence(parseTestSummary(log), evidence), {
    status: 'passed', tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0,
    evidencePath: 'docs/independent-validation-current.json'
  });
});

test('test evidence parser rejects stale or malformed summaries', () => {
  assert.throws(() => parseTestSummary('ℹ tests 3\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n'), /TEST_EVIDENCE_SUMMARY_INCONSISTENT/);
  assert.throws(() => validateTestEvidence(parseTestSummary(log), { validation: { npmTest: { passed: 2, failed: 0 } } }), error => error.code === 'TEST_EVIDENCE_STALE');
  assert.throws(() => parseArgs(['--log']), /TEST_EVIDENCE_USAGE/);
});
