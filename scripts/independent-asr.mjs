#!/usr/bin/env node
import process from 'node:process';
import { inspectAsrRuntime, transcribeIndexedVoice } from '../packages/alpha-engine/optional-asr.cjs';

function argumentMap(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error('ASR_CLI_ARGUMENT_INVALID');
    const key = item.slice(2).replaceAll('-', '_');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('ASR_CLI_ARGUMENT_MISSING');
    result[key] = value; index += 1;
  }
  return result;
}

function output(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

async function main() {
  const [command = 'inspect', ...rest] = process.argv.slice(2);
  const args = argumentMap(rest);
  if (command === 'inspect') {
    if (!args.model_root) throw new Error('ASR_MODEL_ROOT_REQUIRED');
    output(inspectAsrRuntime({ modelRoot: args.model_root, modelId: args.model_id || 'zipformer-zh-small' }));
    return;
  }
  if (command === 'transcribe') {
    if (!args.model_root || !args.media_index_root || !args.media_id) throw new Error('ASR_CLI_REQUIRED');
    output(await transcribeIndexedVoice({ mediaIndexRoot: args.media_index_root, mediaId: args.media_id, accountId: args.account_id || '', modelRoot: args.model_root, modelId: args.model_id || 'zipformer-zh-small' }));
    return;
  }
  throw new Error('ASR_CLI_COMMAND_UNSUPPORTED');
}

try { await main(); }
catch (failure) {
  process.stderr.write(`${failure?.message || 'ASR_CLI_FAILED'}\n`);
  process.exitCode = 2;
}
