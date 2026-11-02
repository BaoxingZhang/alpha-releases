import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditUpstream } from '../scripts/audit-upstream-release.mjs';

const api = 'https://api.github.com/repos/xunchahaha/alpha-releases';
const raw = 'https://raw.githubusercontent.com/xunchahaha/alpha-releases';
const head = '09232cbca892241fd3d2046957832a6b4d764ddc';
const artifactBytes = Buffer.from('dmg-fixture');
const artifactSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');

function fixtureFetch() {
  const values = new Map([
    [`${api}`, { html_url: 'https://github.com/xunchahaha/alpha-releases', visibility: 'public', default_branch: 'main', description: 'Alpha releases', license: null }],
    [`${api}/commits/main`, { sha: head, html_url: `https://github.com/xunchahaha/alpha-releases/commit/${head}`, commit: { author: { date: '2026-10-20T07:05:27Z' }, message: 'docs: 0.3.5 停更公告' } }],
    [`${api}/releases/tags/v0.3.5`, { tag_name: 'v0.3.5', published_at: '2026-10-20T03:48:31Z', target_commitish: 'main', assets: [{ name: 'Alpha-0.3.5-arm64.dmg', size: artifactBytes.byteLength, browser_download_url: 'https://example.invalid/Alpha-0.3.5-arm64.dmg' }] }],
    [`${api}/git/trees/main?recursive=1`, { tree: [{ type: 'blob', path: 'README.md' }, { type: 'blob', path: 'assets/icon.png' }, { type: 'blob', path: 'docs/api/http-api.md' }, { type: 'tree', path: 'docs' }] }],
    [`${raw}/main/README.md`, 'Alpha release README\n'],
    [`${raw}/main/update/stable.json`, { schema_version: 1, sequence: 10, latestVersion: '0.3.5', channel: 'stable', issuedAt: '2026-10-20T06:08:29Z', expiresAt: '2027-04-18T06:08:29Z', signature: { alg: 'Ed25519', kid: 'release-1' } }]
  ]);
  return async url => {
    if (!values.has(url)) return new Response('missing', { status: 404 });
    const value = values.get(url);
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    return new Response(body, { status: 200, headers: { 'content-length': String(Buffer.byteLength(body)) } });
  };
}

function baseline() {
  return {
    evidence_type: 'read_only_public_repository_audit',
    repository: { source_boundary: { interpretation: 'bounded' }, head: { sha: 'old', date: null, message: null, url: null } },
    release_v0_3_5: { artifacts: [{ name: 'Alpha-0.3.5-arm64.dmg', sha256: artifactSha256 }] },
    stable_policy: { interpretation: 'policy only' },
    readme_feature_summary: { observed_categories: ['kept'] },
    audit_boundary: ['old boundary']
  };
}

test('upstream audit refreshes head, tree, raw hashes and preserves feature summary', async () => {
  const result = await auditUpstream({ existing: baseline(), fetchImpl: fixtureFetch(), now: new Date('2026-11-02T01:02:03Z') });
  assert.equal(result.observed_at, '2026-11-02');
  assert.equal(result.repository.head.sha, head);
  assert.deepEqual(result.repository.root_tree_observed, ['README.md', 'assets/', 'docs/']);
  assert.deepEqual(result.repository.source_boundary.observed_source_files, []);
  assert.equal(result.repository.readme_sha256, crypto.createHash('sha256').update('Alpha release README\n').digest('hex'));
  assert.equal(result.stable_policy.sequence, 10);
  assert.equal(result.stable_policy.raw_sha256, crypto.createHash('sha256').update(JSON.stringify({ schema_version: 1, sequence: 10, latestVersion: '0.3.5', channel: 'stable', issuedAt: '2026-10-20T06:08:29Z', expiresAt: '2027-04-18T06:08:29Z', signature: { alg: 'Ed25519', kid: 'release-1' } })).digest('hex'));
  assert.equal(result.readme_feature_summary.observed_categories[0], 'kept');
  assert.equal(result.release_v0_3_5.artifacts[0].sha256, artifactSha256);
});

test('upstream audit verifies an explicitly supplied local artifact and fails closed on size changes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-upstream-audit-'));
  const artifact = path.join(directory, 'Alpha-0.3.5-arm64.dmg');
  try {
    await fs.writeFile(artifact, artifactBytes);
    const result = await auditUpstream({ existing: baseline(), fetchImpl: fixtureFetch(), artifactPath: artifact });
    assert.equal(result.artifact_verification.matchesRelease, true);
    assert.equal(result.artifact_verification.sha256, artifactSha256);
    await fs.writeFile(artifact, Buffer.from('changed'));
    await assert.rejects(() => auditUpstream({ existing: baseline(), fetchImpl: fixtureFetch(), artifactPath: artifact }), /UPSTREAM_LOCAL_ARTIFACT_MISMATCH/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('upstream audit rejects a public tree that exposes source files', async () => {
  const fetchImpl = async url => {
    if (url === `${api}/git/trees/main?recursive=1`) return new Response(JSON.stringify({ tree: [{ type: 'blob', path: 'src/main.ts' }] }), { status: 200 });
    return fixtureFetch()(url);
  };
  const result = await auditUpstream({ existing: baseline(), fetchImpl, now: new Date('2026-11-02T00:00:00Z') });
  assert.deepEqual(result.repository.source_boundary.observed_source_files, ['src/main.ts']);
});
