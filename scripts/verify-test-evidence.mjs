#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_LOG_BYTES = 16 * 1024 * 1024;

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--log' || !argv[1] || argv[1].startsWith('-')) throw failure('TEST_EVIDENCE_USAGE');
  return { logPath: path.resolve(argv[1]) };
}

function parseTestSummary(text) {
  if (typeof text !== 'string') throw failure('TEST_EVIDENCE_LOG_INVALID');
  const fields = {};
  for (const match of text.matchAll(/^\s*ℹ\s+(tests|pass|fail|cancelled|skipped)\s+(\d+)\s*$/gmu)) fields[match[1]] = Number(match[2]);
  const required = ['tests', 'pass', 'fail', 'cancelled', 'skipped'];
  if (required.some(name => !Number.isSafeInteger(fields[name]) || fields[name] < 0)) throw failure('TEST_EVIDENCE_SUMMARY_MISSING');
  if (fields.tests !== fields.pass + fields.fail + fields.cancelled + fields.skipped) throw failure('TEST_EVIDENCE_SUMMARY_INCONSISTENT');
  return fields;
}

function validateTestEvidence(summary, currentValidation) {
  const expected = currentValidation?.validation?.npmTest;
  if (!expected || !Number.isSafeInteger(expected.passed) || !Number.isSafeInteger(expected.failed)) throw failure('TEST_EVIDENCE_RECORD_MISSING');
  const errors = [];
  if (summary.pass !== expected.passed) errors.push(`passed: log=${summary.pass}, evidence=${expected.passed}`);
  if (summary.fail !== expected.failed) errors.push(`failed: log=${summary.fail}, evidence=${expected.failed}`);
  if (errors.length) throw failure('TEST_EVIDENCE_STALE', errors.join('; '));
  return { status: 'passed', tests: summary.tests, passed: summary.pass, failed: summary.fail, cancelled: summary.cancelled, skipped: summary.skipped, evidencePath: 'docs/independent-validation-current.json' };
}

async function readBounded(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_LOG_BYTES) throw failure('TEST_EVIDENCE_LOG_TOO_LARGE');
  return fs.readFile(file, 'utf8');
}

export { MAX_LOG_BYTES, parseArgs, parseTestSummary, validateTestEvidence };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { logPath } = parseArgs(process.argv.slice(2));
    const [logText, evidenceText] = await Promise.all([
      readBounded(logPath),
      fs.readFile(path.join(root, 'docs/independent-validation-current.json'), 'utf8')
    ]);
    console.log(JSON.stringify(validateTestEvidence(parseTestSummary(logText), JSON.parse(evidenceText)), null, 2));
  } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'TEST_EVIDENCE_FAILED'}\n`);
    process.exitCode = 2;
  }
}
