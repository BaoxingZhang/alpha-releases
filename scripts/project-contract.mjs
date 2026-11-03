export function validatePackageLock(packageJson, packageLock) {
  const errors = [];
  if (!packageLock || typeof packageLock !== 'object' || Array.isArray(packageLock)) {
    errors.push('package-lock.json: invalid JSON object');
    return errors;
  }
  if (packageLock.lockfileVersion !== 3) {
    errors.push(`package-lock.json lockfileVersion ${packageLock.lockfileVersion ?? 'missing'} must be 3`);
  }
  const rootPackage = packageLock.packages?.[''];
  if (!rootPackage || typeof rootPackage !== 'object' || Array.isArray(rootPackage)) {
    errors.push('package-lock.json: root package metadata is missing');
    return errors;
  }
  if (rootPackage.name !== packageJson?.name) {
    errors.push(`package-lock.json root name ${rootPackage.name ?? 'missing'} does not match package.json ${packageJson?.name ?? 'missing'}`);
  }
  if (rootPackage.version !== packageJson?.version) {
    errors.push(`package-lock.json root version ${rootPackage.version ?? 'missing'} does not match package.json ${packageJson?.version ?? 'missing'}`);
  }
  return errors;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateChangelogVersion(packageJson, changelogText) {
  const version = packageJson?.version;
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ''))) return ['package.json version is invalid for CHANGELOG validation'];
  if (typeof changelogText !== 'string') return ['CHANGELOG.md: text is missing'];
  const heading = new RegExp(`^##\\s+${escapeRegExp(version)}(?:[-\\s]|$)`, 'm');
  return heading.test(changelogText) ? [] : [`CHANGELOG.md: missing heading for package version ${version}`];
}
