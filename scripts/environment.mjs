import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import electron from 'electron';
import { fileURLToPath } from 'node:url';
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function launchEnvironment(session = 'manual') {
  if (!/^[a-zA-Z0-9_-]+$/.test(session)) throw new Error('Invalid session name');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^ALPHA_|^ELECTRON_|^NODE_OPTIONS$|^NODE_PATH$|^DYLD_|^(?:HTTP|HTTPS|ALL)_PROXY$/i.test(k)) delete env[k];
  const runtime = path.join(root, 'build/runtime-bundle');
  Object.assign(env, {
    ALPHA_RECOVERY_SESSION: session,
    ALPHA_ENGINE_PATH: path.join(runtime, 'bin/alpha-engine'),
    ALPHA_GATEWAY_PATH: path.join(runtime, 'bin/alpha-server'),
    ALPHA_DATA_HOST_PATH: path.join(runtime, 'bin/alpha-data-host'),
    ALPHA_SECURITY_HOST_PATH: path.join(runtime, 'bin/alpha-security-host'),
    ALPHA_KEY_WORKER_PATH: path.join(runtime, 'bin/alpha-key-worker'),
    ALPHA_NATIVE_LIBRARY_PATH: path.join(runtime, 'native/wcdb/libalpha_native.dylib'),
    ALPHA_WCDB_LIBRARY_PATH: path.join(runtime, 'native/wcdb/libalpha_sqlcipher_readonly.dylib'),
    ALPHA_AGENT_HOST_PATH: path.join(root, 'workers/agent/dist/index.cjs'),
    ALPHA_AGENT_HOST_NODE: electron,
    ALPHA_FFMPEG_PATH: path.join(runtime, 'bin/ffmpeg'),
    ALPHA_ENABLE_LOCAL_MESSAGE_MUTATIONS: '0',
    ALPHA_ENABLE_MOMENTS_ANTI_DELETE: '0',
    ALPHA_ENABLE_MESSAGE_ANTI_RECALL: '0'
  });
  return env;
}
export function sandboxProfile() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Only macOS arm64 is supported by the recovered runtime');
  const directory = path.join(root, '.runtime');
  fs.mkdirSync(directory, { recursive: true });
  const profile = path.join(directory, 'offline.sb');
  // Personal-file access is denied, with a narrower exception for this project.
  // Local TCP is needed by Electron/Playwright. Remote IP connections are denied.
  fs.writeFileSync(profile, `(version 1)\n(allow default)\n(deny network-outbound (remote ip "*:*"))\n(allow network-outbound (remote ip "localhost:*"))\n(deny file-read-data file-write* (subpath ${JSON.stringify(os.homedir())}))\n(allow file-read-data (subpath ${JSON.stringify(root)}))\n(allow file-write* (subpath ${JSON.stringify(directory)}))\n`);
  return profile;
}
