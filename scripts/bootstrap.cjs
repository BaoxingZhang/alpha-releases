// Recovery adapter. src/main now includes the documented backend selection.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(project, '.runtime', process.env.ALPHA_RECOVERY_SESSION || 'manual');
if (!runtimeRoot.startsWith(path.join(project, '.runtime') + path.sep)) throw new Error('Invalid runtime directory');
const lifecycle = (event, detail) => fs.appendFileSync(path.join(runtimeRoot, 'lifecycle.ndjson'), JSON.stringify({ at: new Date().toISOString(), event, detail }) + '\n');
fs.mkdirSync(runtimeRoot, { recursive: true });
lifecycle('bootstrap');
app.on('ready', () => lifecycle('ready'));
app.on('web-contents-created', (_event, contents) => {
  lifecycle('web-contents-created', contents.id);
  contents.on('did-finish-load', () => lifecycle('did-finish-load', contents.getURL().startsWith('data:') ? 'splash' : contents.getURL()));
  contents.on('render-process-gone', (_e, detail) => lifecycle('render-process-gone', detail));
});
app.setName('Alpha Recovered');
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
