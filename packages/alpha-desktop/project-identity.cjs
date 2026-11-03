'use strict';

const SEMVER = /^\d+\.\d+\.\d+$/;
const PRODUCT_NAME = /^[^\u0000-\u001f/\\]+$/;
const IDENTIFIER = /^[A-Za-z0-9.-]+$/;
const EXECUTABLE = /^[A-Za-z0-9._-]+$/;

function invalid(detail) {
  throw new Error(`PROJECT_IDENTITY_INVALID:${detail}`);
}

function validateFlavor(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label}:object`);
  for (const key of ['productName', 'bundleIdentifier', 'executableName']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) invalid(`${label}:${key}`);
  }
  if (!PRODUCT_NAME.test(value.productName) || value.productName !== value.productName.trim()) invalid(`${label}:productName`);
  if (!IDENTIFIER.test(value.bundleIdentifier)) invalid(`${label}:bundleIdentifier`);
  if (!EXECUTABLE.test(value.executableName)) invalid(`${label}:executableName`);
  return Object.freeze({
    productName: value.productName,
    bundleIdentifier: value.bundleIdentifier,
    executableName: value.executableName
  });
}

function readProjectIdentity(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) invalid('package');
  if (typeof packageJson.productName !== 'string' || !packageJson.productName.trim()) invalid('productName');
  if (typeof packageJson.version !== 'string' || !SEMVER.test(packageJson.version)) invalid('version');
  const original = validateFlavor({
    productName: packageJson.productName,
    ...(packageJson.alphaIdentity || {})
  }, 'original');
  const independent = validateFlavor(packageJson.alphaIdentity?.independent, 'independent');
  return Object.freeze({
    version: packageJson.version,
    productName: original.productName,
    bundleIdentifier: original.bundleIdentifier,
    executableName: original.executableName,
    independent
  });
}

function flavorIdentity(identity, backend = 'original') {
  if (!identity || typeof identity !== 'object') invalid('resolved');
  if (backend === 'original') return identity;
  if (backend === 'independent') return identity.independent;
  invalid(`backend:${backend}`);
}

module.exports = Object.freeze({ readProjectIdentity, flavorIdentity });
