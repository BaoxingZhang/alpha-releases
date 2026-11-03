import test from 'node:test';
import assert from 'node:assert/strict';
import identity from '../packages/alpha-desktop/project-identity.cjs';
import packageJson from '../package.json' with { type: 'json' };

test('project identity contract preserves both packaged flavor identities', () => {
  const resolved = identity.readProjectIdentity(packageJson);
  assert.deepEqual(resolved, {
    version: '0.3.5',
    productName: 'Alpha Recovered',
    bundleIdentifier: 'local.alpha.recovered',
    executableName: 'AlphaRecovered',
    independent: {
      productName: 'Alpha Recovered Independent',
      bundleIdentifier: 'local.alpha.recovered.independent',
      executableName: 'AlphaRecoveredIndependent'
    }
  });
  assert.equal(identity.flavorIdentity(resolved, 'original').productName, 'Alpha Recovered');
  assert.equal(identity.flavorIdentity(resolved, 'independent').bundleIdentifier, 'local.alpha.recovered.independent');
});

test('project identity contract rejects malformed or incomplete flavor metadata', () => {
  assert.throws(() => identity.readProjectIdentity({ ...packageJson, productName: '' }), /PROJECT_IDENTITY_INVALID/);
  assert.throws(() => identity.readProjectIdentity({ ...packageJson, productName: '../outside' }), /PROJECT_IDENTITY_INVALID/);
  assert.throws(() => identity.readProjectIdentity({ ...packageJson, productName: ' Alpha' }), /PROJECT_IDENTITY_INVALID/);
  assert.throws(() => identity.readProjectIdentity({ ...packageJson, alphaIdentity: { ...packageJson.alphaIdentity, bundleIdentifier: 'not valid' } }), /PROJECT_IDENTITY_INVALID/);
  assert.throws(() => identity.flavorIdentity(identity.readProjectIdentity(packageJson), 'unknown'), /PROJECT_IDENTITY_INVALID/);
});
