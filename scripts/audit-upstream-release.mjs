import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultOutput = path.join(root, 'docs', 'upstream-alpha-releases-current.json');
const repositoryUrl = 'https://api.github.com/repos/xunchahaha/alpha-releases';
const rawBase = 'https://raw.githubusercontent.com/xunchahaha/alpha-releases';
const defaultBranch = 'main';
const defaultTag = 'v0.3.5';
const maxResponseBytes = 8 * 1024 * 1024;
const defaultTimeoutMs = 20_000;

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function dateOnly(value) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

async function fetchBytes(url, { fetchImpl = globalThis.fetch, timeoutMs = defaultTimeoutMs } = {}) {
  if (typeof fetchImpl !== 'function') fail('UPSTREAM_FETCH_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'alpha-recovered-upstream-audit/1'
      },
      signal: controller.signal
    });
    if (!response?.ok) fail(`UPSTREAM_HTTP_${response?.status ?? 'UNKNOWN'}`);
    const declared = Number(response.headers?.get?.('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > maxResponseBytes) fail('UPSTREAM_RESPONSE_TOO_LARGE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) fail('UPSTREAM_RESPONSE_TOO_LARGE');
    return bytes;
  } catch (error) {
    if (error?.name === 'AbortError') fail('UPSTREAM_FETCH_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  const bytes = await fetchBytes(url, options);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail(`UPSTREAM_JSON_INVALID:${url}`); }
}

function treePaths(tree) {
  if (!Array.isArray(tree)) fail('UPSTREAM_TREE_INVALID');
  return tree.filter(entry => entry?.type === 'blob' && typeof entry.path === 'string').map(entry => entry.path).sort();
}

function rootTreeEntries(paths) {
  const entries = new Set();
  for (const value of paths) {
    const slash = value.indexOf('/');
    entries.add(slash === -1 ? value : `${value.slice(0, slash)}/`);
  }
  return [...entries].sort();
}

function sourcePaths(paths) {
  const sourceExtension = /\.(?:ts|tsx|rs|c|cc|cpp|h|hh|hpp)$/i;
  return paths.filter(value => sourceExtension.test(value) || /(?:^|\/)(?:Cargo\.toml|Cargo\.lock|CMakeLists\.txt)$/.test(value));
}

function releaseArtifact(release, name) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const asset = assets.find(value => value?.name === name);
  if (!asset) fail(`UPSTREAM_ARTIFACT_MISSING:${name}`);
  if (!Number.isSafeInteger(asset.size) || asset.size < 0 || typeof asset.browser_download_url !== 'string') fail('UPSTREAM_ARTIFACT_INVALID');
  const digest = typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)
    ? asset.digest.slice('sha256:'.length).toLowerCase()
    : undefined;
  return {
    name,
    size: asset.size,
    ...(digest ? { sha256: digest } : {}),
    url: asset.browser_download_url
  };
}

function updateReleaseRecord(existing, release, artifact) {
  const previous = existing?.release_v0_3_5 ?? {};
  const oldArtifacts = Array.isArray(previous.artifacts) ? previous.artifacts : [];
  const oldByName = new Map(oldArtifacts.filter(item => typeof item?.name === 'string').map(item => [item.name, item]));
  const artifactRecord = { ...oldByName.get(artifact.name), ...artifact };
  return {
    ...previous,
    api_url: `${repositoryUrl}/releases/tags/${defaultTag}`,
    tag_name: typeof release?.tag_name === 'string' ? release.tag_name : defaultTag,
    published_at: release?.published_at ?? previous.published_at ?? null,
    release_commit: typeof release?.target_commitish === 'string' && /^[0-9a-f]{7,40}$/i.test(release.target_commitish)
      ? release.target_commitish
      : previous.release_commit ?? null,
    artifacts: [artifactRecord, ...oldArtifacts.filter(item => item?.name !== artifact.name)]
  };
}

function updateStableRecord(existing, stable, stableBytes) {
  const previous = existing?.stable_policy ?? {};
  if (!stable || typeof stable !== 'object' || Array.isArray(stable)) fail('UPSTREAM_STABLE_POLICY_INVALID');
  const signature = stable.signature && typeof stable.signature === 'object' ? stable.signature : {};
  return {
    ...previous,
    url: `${rawBase}/${defaultBranch}/update/stable.json`,
    schema_version: stable.schema_version ?? previous.schema_version ?? null,
    sequence: stable.sequence ?? previous.sequence ?? null,
    latest_version: stable.latestVersion ?? previous.latest_version ?? null,
    channel: stable.channel ?? previous.channel ?? null,
    issued_at: stable.issuedAt ?? previous.issued_at ?? null,
    expires_at: stable.expiresAt ?? previous.expires_at ?? null,
    signature: { alg: signature.alg ?? previous.signature?.alg ?? null, kid: signature.kid ?? previous.signature?.kid ?? null },
    raw_sha256: sha256(stableBytes),
    interpretation: previous.interpretation ?? 'This is public update-policy metadata, not a source or entitlement proof.'
  };
}

export async function auditUpstream({
  existing,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  artifactPath,
  branch = defaultBranch,
  tag = defaultTag
} = {}) {
  if (tag !== defaultTag || branch !== defaultBranch) fail('UPSTREAM_TARGET_UNSUPPORTED');
  const repository = await fetchJson(repositoryUrl, { fetchImpl });
  const headCommit = await fetchJson(`${repositoryUrl}/commits/${branch}`, { fetchImpl });
  const release = await fetchJson(`${repositoryUrl}/releases/tags/${tag}`, { fetchImpl });
  const treeResponse = await fetchJson(`${repositoryUrl}/git/trees/${branch}?recursive=1`, { fetchImpl });
  const readmeBytes = await fetchBytes(`${rawBase}/${branch}/README.md`, { fetchImpl });
  const stableBytes = await fetchBytes(`${rawBase}/${branch}/update/stable.json`, { fetchImpl });
  const stable = JSON.parse(stableBytes.toString('utf8'));
  const artifact = releaseArtifact(release, 'Alpha-0.3.5-arm64.dmg');
  const paths = treePaths(treeResponse.tree);
  const sourceFiles = sourcePaths(paths);
  const localArtifact = artifactPath ? await fs.readFile(path.resolve(artifactPath)) : null;
  const localVerification = localArtifact ? {
    path: path.resolve(artifactPath),
    bytes: localArtifact.byteLength,
    sha256: sha256(localArtifact),
    matchesRelease: localArtifact.byteLength === artifact.size && (!artifact.sha256 || sha256(localArtifact) === artifact.sha256)
  } : null;
  if (localVerification && !localVerification.matchesRelease) fail('UPSTREAM_LOCAL_ARTIFACT_MISMATCH');

  const previous = existing && typeof existing === 'object' ? existing : {};
  const next = {
    ...previous,
    evidence_type: previous.evidence_type ?? 'read_only_public_repository_audit',
    observed_at: dateOnly(now),
    repository: {
      ...(previous.repository ?? {}),
      url: repository.html_url ?? 'https://github.com/xunchahaha/alpha-releases',
      api_url: repositoryUrl,
      visibility: repository.visibility ?? 'public',
      default_branch: repository.default_branch ?? branch,
      description: repository.description ?? 'Alpha releases',
      license_field: repository.license?.spdx_id ?? null,
      head: {
        sha: typeof headCommit.sha === 'string' ? headCommit.sha : previous.repository?.head?.sha ?? null,
        date: headCommit.commit?.author?.date ?? previous.repository?.head?.date ?? null,
        message: headCommit.commit?.message ?? previous.repository?.head?.message ?? null,
        url: headCommit.html_url ?? previous.repository?.head?.url ?? null
      },
      root_tree_observed: rootTreeEntries(paths),
      readme_sha256: sha256(readmeBytes),
      source_boundary: {
        ...(previous.repository?.source_boundary ?? {}),
        observed_source_files: sourceFiles,
        observed_build_files: paths.filter(value => /(?:^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Makefile|\.github\/workflows\/)/.test(value)),
        interpretation: previous.repository?.source_boundary?.interpretation ?? 'The public repository is release, documentation, screenshot, and update-policy material; source availability is bounded to the observed tree.'
      }
    },
    release_v0_3_5: updateReleaseRecord(previous, release, artifact),
    stable_policy: updateStableRecord(previous, stable, stableBytes),
    artifact_verification: localVerification,
    audit_boundary: [
      ...(Array.isArray(previous.audit_boundary) ? previous.audit_boundary.filter(value => typeof value === 'string' && !value.includes('Observed facts come from')) : []),
      `Observed facts come from GitHub repository/API/raw README/docs/stable metadata at the URLs above on ${dateOnly(now)}.`,
      'The audit does not download release binaries; a local artifact is checked only when --artifact is supplied.',
      'No source code, private repositories, credentials, real WeChat data, or unredacted native secrets are accessed by this audit.'
    ]
  };
  return next;
}

async function writeJsonAtomic(destination, value) {
  const absolute = path.resolve(destination);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, absolute);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
  return absolute;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let output = defaultOutput;
  let artifactPath;
  let write = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--write') write = true;
    else if (argument === '--output' && args.length) output = args.shift();
    else if (argument === '--artifact' && args.length) artifactPath = args.shift();
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  const existing = JSON.parse(await fs.readFile(output, 'utf8'));
  const audit = await auditUpstream({ existing, artifactPath });
  if (write) await writeJsonAtomic(output, audit);
  console.log(JSON.stringify({
    observedAt: audit.observed_at,
    head: audit.repository.head,
    release: audit.release_v0_3_5.tag_name,
    artifact: audit.release_v0_3_5.artifacts.find(item => item.name === 'Alpha-0.3.5-arm64.dmg'),
    localArtifact: audit.artifact_verification,
    sourceFiles: audit.repository.source_boundary.observed_source_files,
    wrote: write ? path.resolve(output) : null
  }, null, 2));
}
