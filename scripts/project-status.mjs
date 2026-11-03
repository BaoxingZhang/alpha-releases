import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = relative => fs.readFile(path.join(root, relative), 'utf8').then(JSON.parse);

const [packageJson, matrix, diagnosis, nativeSmoke, componentManifest, provenance] = await Promise.all([
  readJson('package.json'),
  readJson('docs/independent-support-matrix.json'),
  readJson('docs/native-startup-diagnosis.json'),
  readJson('docs/native-smoke-validation.json'),
  readJson('vendor/runtime/component-manifest.json'),
  readJson('provenance/recovered-files.json')
]);

const category = name => {
  if (/License|ApplicationLock|DataKey/.test(name)) return '授权、密钥与原生锁';
  if (/Message(Session|Send|Capture|Activity|Resource|Mutation)/.test(name)) return '实时消息与写入';
  if (/Material|OfficialSchedule/.test(name)) return '公众号与官方计划';
  if (/CdnMedia/.test(name)) return 'CDN 媒体补齐';
  if (/TranscribeVoice/.test(name)) return '语音转写';
  if (/Persona/.test(name)) return 'AI Persona/Gateway';
  if (/AdvancedComponent/.test(name)) return '高级组件';
  return '其他原生能力';
};

const unsupportedByCategory = {};
for (const item of matrix.unsupported) {
  const key = category(item.name);
  unsupportedByCategory[key] = (unsupportedByCategory[key] ?? 0) + 1;
}

const observedSmoke = diagnosis.observed_smoke ?? {};
const nativeSmokePassed = nativeSmoke.status === 'passed' && nativeSmoke.backend?.state === 'ready' && nativeSmoke.nativeFilesModified === false;
const unavailableComponents = Object.entries(componentManifest.capabilities ?? {})
  .filter(([, value]) => value === 'unavailable' || value?.state === 'unavailable')
  .map(([name]) => name)
  .sort();

let branch = 'unknown';
try {
  branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() || 'detached';
} catch {
  // A source archive without .git is still a valid status target.
}

const total = matrix.counts.totalRequestBranches;
const implemented = matrix.counts.implementedRequestBranches;
const unsupported = matrix.counts.unsupportedRequestBranches;
const report = {
  schema: 'alpha.recovery-status.v1',
  project: { name: packageJson.name, version: packageJson.version, branch },
  source: { dmgSha256: provenance.source_dmg_sha256, recoveredFileCount: provenance.files.length },
  independent: {
    implementedRequestBranches: implemented,
    totalRequestBranches: total,
    unsupportedRequestBranches: unsupported,
    implementedPercent: Number((implemented * 100 / total).toFixed(1)),
    unsupportedByCategory
  },
  native: {
    state: nativeSmokePassed ? 'ready-disposable' : (observedSmoke.backend?.state ?? 'unknown'),
    errorCode: nativeSmokePassed ? '' : (observedSmoke.backend?.errorCode ?? ''),
    isolatedSmoke: nativeSmokePassed ? 'ready' : 'unavailable',
    customSeatbeltSmoke: observedSmoke.backend?.state ?? 'unknown',
    customSeatbeltErrorCode: observedSmoke.backend?.errorCode ?? '',
    realDataValidated: nativeSmoke.realWeChatData === true,
    diagnosisStatus: diagnosis.status,
    unavailableComponents
  },
  boundary: {
    syntheticFixturesAreNativeParity: false,
    nativeSourceRecovered: false,
    realWechatDataValidated: false
  }
};

const json = process.argv.includes('--json');
if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Alpha recovery status (${report.project.name} ${report.project.version})`);
  console.log(`branch: ${branch}`);
  console.log(`independent backend: ${implemented}/${total} request branches (${report.independent.implementedPercent}%)`);
  console.log('unsupported branches:');
  for (const [name, count] of Object.entries(unsupportedByCategory).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`  - ${name}: ${count}`);
  console.log(`native package mode: ${report.native.state}${report.native.errorCode ? ` (${report.native.errorCode})` : ''}`);
  console.log(`custom Seatbelt smoke: ${report.native.customSeatbeltSmoke}${report.native.customSeatbeltErrorCode ? ` (${report.native.customSeatbeltErrorCode})` : ''}`);
  console.log(`native source recovered: ${report.boundary.nativeSourceRecovered}`);
  console.log(`real WeChat data validated: ${report.boundary.realWechatDataValidated}`);
}
