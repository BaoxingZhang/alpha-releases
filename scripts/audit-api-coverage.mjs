#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolDefinitions } from '../packages/alpha-engine/http-server.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPath = path.join(ROOT, 'docs/api-reference-index.json');
const httpSourcePath = path.join(ROOT, 'packages/alpha-engine/http-server.cjs');
const api = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
const httpSource = fs.readFileSync(httpSourcePath, 'utf8');

function unique(values) { return [...new Set(values)]; }

function runtimeHttpPaths() {
  const paths = [];
  for (const match of httpSource.matchAll(/(?:pathname|url\.pathname)\s*===\s*['\"]([^'\"]+)['\"]/g)) paths.push(match[1]);
  // These routes are implemented by a regular expression or in the outer
  // request handler rather than by a literal pathname comparison.
  paths.push(
    '/health', '/api/v1/health', '/mcp',
    '/api/v1/sessions/{session_id}/messages', '/api/v1/analysis/{analysis_id}', '/api/v1/analysis/{analysis_id}/cancel',
    // Dynamic routes are implemented by anchored regular expressions. Keep
    // their documented shapes in the audit surface so coverage does not
    // report false gaps merely because the source has no literal pathname.
    '/api/v1/independent/moments/exports/:job_id',
    '/api/v1/independent/moments/exports/:job_id/cancel',
    '/api/v1/favorites/:favorite_id/media',
    '/api/v1/favorites/media/:token',
    '/api/v1/independent/sessions/:conversation_id/messages',
    '/api/v1/independent/sessions/:conversation_id/history',
    '/api/v1/independent/media/indexed/<sha256>',
    '/api/v1/independent/records/exports/:job_id',
    '/api/v1/independent/records/exports/:job_id/cancel'
  );
  return new Set(unique(paths));
}

function normalizeOfficialPath(value) {
  return value.replace(/\{[^}]+\}/g, match => match.includes('session_id') ? '{session_id}' : '{parameter}');
}

function officialHttpCoverage(paths) {
  return (api.http || []).map(entry => {
    const route = normalizeOfficialPath(entry.path);
    const implemented = paths.has(entry.path) || paths.has(route);
    return { path: entry.path, methods: entry.methods, implemented };
  });
}

function mcpCoverage() {
  const runtime = new Set(toolDefinitions().map(tool => tool.name));
  const official = Array.isArray(api.mcp?.tools) ? api.mcp.tools : [];
  return { runtime: [...runtime].sort(), official: official.map(name => ({ name, implemented: runtime.has(name) })) };
}

const httpPaths = runtimeHttpPaths();
const http = officialHttpCoverage(httpPaths);
const mcp = mcpCoverage();
const independent = api.independentAdapter || {};
const documentedIndependentPaths = new Set((independent.http || []).map(entry => entry.path));
const independentRuntimeUndocumentedPaths = [...httpPaths]
  .filter(path => path.startsWith('/api/v1/independent/') && !documentedIndependentPaths.has(path))
  .sort();
const report = {
  schema: 'alpha-api-coverage.v1',
  generatedAt: new Date().toISOString(),
  source: {
    contract: 'docs/api-reference-index.json',
    runtime: 'packages/alpha-engine/http-server.cjs',
    note: 'Coverage is route/tool presence only; it does not prove native schema, real-data compatibility, or write capability.'
  },
  http: {
    officialCount: http.length,
    implementedCount: http.filter(entry => entry.implemented).length,
    missing: http.filter(entry => !entry.implemented),
    entries: http,
    runtimePaths: [...httpPaths].sort(),
    independentDocumentedPaths: (independent.http || []).map(entry => entry.path),
    independentRuntimeUndocumentedPaths
  },
  mcp: {
    officialCount: mcp.official.length,
    implementedCount: mcp.official.filter(entry => entry.implemented).length,
    missing: mcp.official.filter(entry => !entry.implemented),
    runtimeToolCount: mcp.runtime.length,
    runtimeTools: mcp.runtime,
    entries: mcp.official,
    independentDocumentedTools: (independent.mcp || []).map(entry => entry.name)
  }
};

const check = process.argv.includes('--check');
if (check) {
  const names = mcp.runtime;
  if (new Set(names).size !== names.length) throw new Error('RUNTIME_MCP_TOOL_DUPLICATE');
  if (httpPaths.has('/api/v1/media/{opaque_id}') || httpPaths.has('/api/v1/messages/send-text')) {
    throw new Error('UNVERIFIED_WRITE_OR_MEDIA_ROUTE_MUST_REMAIN_ABSENT');
  }
  // The check is deliberately limited to structural invariants. Missing
  // official routes are emitted as a reviewable gap and must not be hidden by
  // returning fabricated success values.
  if (!httpPaths.has('/health') || !httpPaths.has('/api/v1/health') || !httpPaths.has('/mcp')) throw new Error('CORE_HTTP_ROUTES_MISSING');
  if (!mcp.runtime.includes('wechat.core.get_status')) throw new Error('CORE_MCP_TOOL_MISSING');
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
