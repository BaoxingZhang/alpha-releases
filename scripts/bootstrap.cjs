// Recovery adapter. src/main now includes the documented backend selection.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const backendMode = require('./packages/alpha-desktop/backend-mode.cjs');
const projectIdentity = require('./packages/alpha-desktop/project-identity.cjs');
const { resolveRuntimeRoot } = require('./packages/alpha-desktop/runtime-root.cjs');
// Both generated development launches (<project>/dist/app) and packaged
// launches (<app>/Contents/Resources/app) place bootstrap two levels below
// the project/container root. Packaged runtime writes are redirected below
// Electron's writable userData by resolveRuntimeRoot.
const project = path.resolve(__dirname, '../..');
const packagedBackend = backendMode.applyPackagedBackendMode(process.resourcesPath, process.env);
const identity = projectIdentity.readProjectIdentity(require(path.join(__dirname, 'package.json')));
app.setName(projectIdentity.flavorIdentity(identity, packagedBackend === 'independent' || process.env.ALPHA_RECOVERY_BACKEND === 'independent' ? 'independent' : 'original').productName);
const runtimeRoot = resolveRuntimeRoot({
  packaged: app.isPackaged,
  project,
  userData: app.isPackaged ? app.getPath('userData') : undefined,
  session: process.env.ALPHA_RECOVERY_SESSION
});
const lifecycle = (event, detail) => fs.appendFileSync(path.join(runtimeRoot, 'lifecycle.ndjson'), JSON.stringify({ at: new Date().toISOString(), event, detail }) + '\n');
fs.mkdirSync(runtimeRoot, { recursive: true });
lifecycle('bootstrap');
app.on('ready', () => lifecycle('ready'));
app.on('web-contents-created', (_event, contents) => {
  lifecycle('web-contents-created', contents.id);
  contents.on('did-finish-load', () => lifecycle('did-finish-load', contents.getURL().startsWith('data:') ? 'splash' : contents.getURL()));
  contents.on('render-process-gone', (_e, detail) => lifecycle('render-process-gone', detail));
});
for (const name of ['home', 'documents', 'desktop', 'downloads', 'appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps']) {
  const directory = path.join(runtimeRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
// Offline recovery never asks the macOS keychain for secrets. Mark storage
// unavailable and fail closed; do not substitute plaintext or a mock key.
safeStorage.isEncryptionAvailable = () => false;
safeStorage.encryptString = () => { throw new Error('RECOVERY_KEYCHAIN_DISABLED'); };
safeStorage.decryptString = () => { throw new Error('RECOVERY_KEYCHAIN_DISABLED'); };
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
fs.writeFileSync(path.join(runtimeRoot, 'bootstrap.json'), JSON.stringify({ appPath: app.getAppPath(), isPackaged: app.isPackaged, paths: Object.fromEntries(['home','documents','appData','userData','sessionData','temp'].map(k => [k, app.getPath(k)])) }, null, 2));
lifecycle('require-main');
require('./out/main/index.js');
lifecycle('main-loaded');
