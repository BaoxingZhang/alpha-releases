#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSchemaOnly } from './inspect-schema-only.mjs';
import { accountId, explicitDirectory, inspectSource } from './inspect-source.mjs';

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parse(argv) {
  const values = {};
  let index = 0;
  while (index < argv.length) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('V4_PREFLIGHT_USAGE');
      values.json = true;
      index += 1;
      continue;
    }
    if (!['--data-dir', '--account-id'].includes(option) || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) {
      throw failure('V4_PREFLIGHT_USAGE');
    }
    const key = option.slice(2);
    if (Object.hasOwn(values, key)) throw failure('V4_PREFLIGHT_USAGE');
    values[key] = argv[index + 1];
    index += 2;
  }
  if (!values['data-dir'] || !values['account-id']) throw failure('V4_PREFLIGHT_USAGE');
  return values;
}

function sourceFailure(error) {
  return {
    status: 'unavailable',
    code: typeof error?.code === 'string' ? error.code : 'SOURCE_INSPECTION_FAILED'
  };
}

async function preflightV4Copy({ dataDir, account, inspectSchema = inspectSchemaOnly, inspectSrc = inspectSource }) {
  let label;
  try {
    label = accountId(account);
  } catch (error) {
    return {
      schema: 'alpha-independent-v4-preflight.v1',
      scope: 'alpha-independent-v4-preflight',
      status: 'rejected',
      read_only: true,
      complete: false,
      native_schema_supported: false,
      error: { code: typeof error?.code === 'string' ? error.code : 'V4_PREFLIGHT_ACCOUNT_ID_INVALID' }
    };
  }
  let root;
  try {
    root = await explicitDirectory(dataDir);
  } catch (error) {
    return {
      schema: 'alpha-independent-v4-preflight.v1',
      scope: 'alpha-independent-v4-preflight',
      status: 'rejected',
      read_only: true,
      complete: false,
      native_schema_supported: false,
      account_id: label,
      error: { code: typeof error?.code === 'string' ? error.code : 'V4_PREFLIGHT_DATA_DIR_INVALID' }
    };
  }

  let schemaReport;
  try {
    schemaReport = await inspectSchema({ dataDir: root });
  } catch (error) {
    return {
      schema: 'alpha-independent-v4-preflight.v1',
      scope: 'alpha-independent-v4-preflight',
      status: 'rejected',
      read_only: true,
      complete: false,
      native_schema_supported: false,
      account_id: label,
      error: { code: typeof error?.code === 'string' ? error.code : 'V4_PREFLIGHT_SCHEMA_FAILED' }
    };
  }

  let sourceReport;
  try {
    sourceReport = await inspectSrc({ dataDir: root, account: label });
  } catch (error) {
    sourceReport = sourceFailure(error);
  }
  const sourceReady = sourceReport.status === 'ready';
  const schemaReady = schemaReport.status === 'ready' || schemaReport.status === 'partial';
  return {
    schema: 'alpha-independent-v4-preflight.v1',
    scope: 'alpha-independent-v4-preflight',
    status: sourceReady ? 'ready' : schemaReady ? 'schema-only' : 'unavailable',
    read_only: true,
    complete: false,
    native_schema_supported: false,
    account_id: label,
    schema_only: schemaReport,
    source: sourceReady
      ? { status: 'ready', diagnostics: sourceReport.diagnostics }
      : sourceReport
  };
}

function printHuman(report) {
  console.log(`v4 preflight: ${report.status}`);
  console.log(`account: ${report.account_id}; schema-only: ${report.schema_only?.status || 'rejected'}; source: ${report.source?.status || 'rejected'}`);
  console.log('read-only: true; complete: false; native schema supported: false');
  if (report.error?.code) console.log(`error: ${report.error.code}`);
  if (report.source?.code) console.log(`source error: ${report.source.code}`);
}

export { parse, preflightV4Copy };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await preflightV4Copy({ dataDir: options['data-dir'], account: options['account-id'] });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.status === 'rejected' || report.status === 'unavailable') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'V4_PREFLIGHT_FAILED'}\n`);
    process.exitCode = 2;
  }
}
