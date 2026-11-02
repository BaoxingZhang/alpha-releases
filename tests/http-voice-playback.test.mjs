import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');

function voiceEngine() {
  const calls = [];
  return {
    calls,
    async dispatch(request) {
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: 'acct-voice', accountId: 'acct-voice', displayName: '合成语音账号', capabilities: ['voice-playback'], ready: true, verified: true }], selectedAccountId: 'acct-voice' } });
      if (request.decodeVoicePlayback) {
        calls.push(request.decodeVoicePlayback);
        return EngineServerFrame.fromPartial({ requestId: request.requestId, decodeVoicePlayback: { wavMediaId: 'b'.repeat(64) } });
      }
      throw new Error('unexpected method');
    }
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test('HTTP and MCP adapters expose synthetic voice playback resolution', async t => {
  const token = 'v'.repeat(32);
  const engine = voiceEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const headers = { Authorization: `Bearer ${token}` };
  const mediaId = 'a'.repeat(64);

  let result = await request(base, `/api/v1/independent/media/voice-playback?account_id=acct-voice&media_id=${mediaId}`, { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.synthetic_only, true);
  assert.equal(result.body.native_schema_supported, false);
  assert.equal(result.body.schema, '__alpha_voice_playback_v1');
  assert.equal(result.body.scope, 'synthetic-voice-playback');
  assert.equal(result.body.wav_media_id, 'b'.repeat(64));
  assert.deepEqual(engine.calls[0], { accountId: 'acct-voice', mediaId });

  result = await request(base, '/api/v1/independent/media/voice-playback?account_id=acct-voice&media_id=' + 'A'.repeat(64), { headers });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_VOICE_MEDIA_ID_INVALID');

  const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'alpha-independent.media.decode_voice_playback', arguments: { account_id: 'acct-voice', media_id: mediaId } } }) });
  const mcpBody = await mcp.json();
  assert.equal(mcp.status, 200);
  assert.equal(mcpBody.result.structuredContent.synthetic_only, true);
  assert.equal(mcpBody.result.structuredContent.native_schema_supported, false);
  assert.equal(mcpBody.result.structuredContent.schema, '__alpha_voice_playback_v1');
  assert.equal(mcpBody.result.structuredContent.wav_media_id, 'b'.repeat(64));
});
