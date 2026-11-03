#!/usr/bin/env node
import { createChatlogCandidate } from '../packages/alpha-engine/chatlog-candidate.cjs';

function usage() {
  return 'USAGE: --binary /absolute/chatlog --work-dir /absolute/decrypted-work --kind contacts|sessions|messages [--keyword value] [--talker value] [--sender value] [--time value] [--limit n] [--offset n]';
}

function parse(argv) {
  const values = {};
  const allowed = new Set(['binary', 'work-dir', 'kind', 'keyword', 'talker', 'sender', 'time', 'limit', 'offset']);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!option?.startsWith('--') || !allowed.has(option.slice(2)) || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw new Error(usage());
    const key = option.slice(2);
    if (Object.hasOwn(values, key)) throw new Error(usage());
    values[key] = argv[++index];
  }
  if (!values.binary || !values['work-dir'] || !['contacts', 'sessions', 'messages'].includes(values.kind)) throw new Error(usage());
  for (const key of ['limit', 'offset']) if (values[key] !== undefined && !/^\d+$/.test(values[key])) throw new Error(usage());
  return values;
}

try {
  const options = parse(process.argv.slice(2));
  const candidate = await createChatlogCandidate({ binaryPath: options.binary, workDir: options['work-dir'] });
  try {
    const common = {
      ...(options.keyword === undefined ? {} : { keyword: options.keyword }),
      ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
      ...(options.offset === undefined ? {} : { offset: Number(options.offset) })
    };
    const result = options.kind === 'contacts'
      ? await candidate.readContacts(common)
      : options.kind === 'sessions'
        ? await candidate.readSessions(common)
        : await candidate.readMessages({
            ...common,
            ...(options.talker === undefined ? {} : { talker: options.talker }),
            ...(options.sender === undefined ? {} : { sender: options.sender }),
            ...(options.time === undefined ? {} : { time: options.time })
          });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await candidate.close();
  }
} catch (error) {
  process.stderr.write(`${error?.code || error?.message || 'CHATLOG_CANDIDATE_PREVIEW_FAILED'}\n`);
  process.exitCode = 2;
}
