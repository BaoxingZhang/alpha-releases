const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function compareField(errors, actual, expected, label) {
  if (actual !== expected) errors.push(`${label}: ${JSON.stringify(actual)} does not match ${JSON.stringify(expected)}`);
}

function compareCountAndDigest(errors, actual, expected, label) {
  if (!isRecord(actual)) {
    errors.push(`${label}: evidence entry is missing`);
    return;
  }
  if (!isCount(actual.fileCount)) errors.push(`${label}.fileCount: expected a non-negative safe integer`);
  if (!SHA256.test(actual.artifactDigest ?? '')) errors.push(`${label}.artifactDigest: expected a lowercase SHA-256 digest`);
  if (isRecord(expected)) {
    compareField(errors, actual.fileCount, expected.fileCount, `${label}.fileCount`);
    compareField(errors, actual.artifactDigest, expected.artifactDigest, `${label}.artifactDigest`);
  }
}

/**
 * Validate the internal joins in docs/independent-validation-current.json.
 * This compares recorded evidence with optional checked-in runtime metadata;
 * it does not inspect .runtime artifacts or require a build/package to be present.
 */
export function validateCurrentEvidenceRefresh(currentValidation, options = {}) {
  const errors = [];
  const validation = currentValidation?.validation;
  const refresh = validation?.currentEvidenceRefresh;
  if (!isRecord(refresh)) return ['docs/independent-validation-current.json: validation.currentEvidenceRefresh is missing'];

  if (!DATE.test(refresh.observedAt ?? '')) errors.push('validation.currentEvidenceRefresh.observedAt: expected YYYY-MM-DD');
  if (!Array.isArray(refresh.commands) || refresh.commands.length === 0 || refresh.commands.some(command => typeof command !== 'string' || command.trim() === '')) {
    errors.push('validation.currentEvidenceRefresh.commands: expected a non-empty list of command strings');
  }

  const httpAdapter = validation.httpAdapter;
  if (!isRecord(httpAdapter)) {
    errors.push('validation.httpAdapter: recorded evidence entry is missing');
  } else {
    if (!isCount(httpAdapter.tools)) errors.push('validation.httpAdapter.tools: expected a non-negative safe integer');
    if (isCount(options.httpToolCount)) compareField(errors, httpAdapter.tools, options.httpToolCount, 'validation.httpAdapter.tools vs runtime toolDefinitions');
    const sourceDiagnostics = httpAdapter.listTools?.sourceDiagnostics;
    if (!isRecord(sourceDiagnostics)) {
      errors.push('validation.httpAdapter.listTools.sourceDiagnostics: recorded evidence entry is missing');
    } else {
      for (const path of [
        '/api/v1/independent/source/revision',
        '/api/v1/independent/source/watch-targets',
        '/api/v1/independent/source/schema'
      ]) {
        if (!Array.isArray(sourceDiagnostics.httpPaths) || !sourceDiagnostics.httpPaths.includes(path)) {
          errors.push(`validation.httpAdapter.listTools.sourceDiagnostics.httpPaths: missing ${path}`);
        }
      }
      for (const tool of [
        'alpha-independent.source.get_revision',
        'alpha-independent.source.get_watch_targets',
        'alpha-independent.source.get_schema'
      ]) {
        if (!Array.isArray(sourceDiagnostics.mcpTools) || !sourceDiagnostics.mcpTools.includes(tool)) {
          errors.push(`validation.httpAdapter.listTools.sourceDiagnostics.mcpTools: missing ${tool}`);
        }
      }
    }
  }

  const source = refresh.publicSourceCandidate;
  const recordedSource = validation.publicSourceCandidate;
  if (!isRecord(source)) errors.push('validation.currentEvidenceRefresh.publicSourceCandidate: evidence entry is missing');
  else {
    if (!isCount(source.fileCount)) errors.push('validation.currentEvidenceRefresh.publicSourceCandidate.fileCount: expected a non-negative safe integer');
    if (!isCount(source.auditFindings)) errors.push('validation.currentEvidenceRefresh.publicSourceCandidate.auditFindings: expected a non-negative safe integer');
    if (!isRecord(recordedSource)) errors.push('validation.publicSourceCandidate: recorded evidence entry is missing');
    else {
      compareField(errors, source.fileCount, recordedSource.fileCount, 'validation.currentEvidenceRefresh.publicSourceCandidate.fileCount');
      compareField(errors, source.auditFindings, recordedSource.auditFindings, 'validation.currentEvidenceRefresh.publicSourceCandidate.auditFindings');
    }
  }

  const release = refresh.releaseManifest;
  const recordedRelease = validation.releaseManifest;
  if (!isRecord(release)) errors.push('validation.currentEvidenceRefresh.releaseManifest: evidence entry is missing');
  else {
    if (!isCount(release.artifactCount)) errors.push('validation.currentEvidenceRefresh.releaseManifest.artifactCount: expected a non-negative safe integer');
    if (!SHA256.test(release.artifactDigest ?? '')) errors.push('validation.currentEvidenceRefresh.releaseManifest.artifactDigest: expected a lowercase SHA-256 digest');
    if (!isRecord(recordedRelease)) errors.push('validation.releaseManifest: recorded evidence entry is missing');
    else {
      compareField(errors, release.artifactCount, recordedRelease.artifactCount, 'validation.currentEvidenceRefresh.releaseManifest.artifactCount');
      compareField(errors, release.artifactDigest, recordedRelease.artifactDigest, 'validation.currentEvidenceRefresh.releaseManifest.artifactDigest');
    }
    const verification = validation.releaseManifestVerification;
    if (!isRecord(verification)) errors.push('validation.releaseManifestVerification: recorded evidence entry is missing');
    else {
      compareField(errors, release.artifactCount, verification.artifactCount, 'validation.currentEvidenceRefresh.releaseManifest.artifactCount vs releaseManifestVerification.artifactCount');
      compareField(errors, release.artifactDigest, verification.artifactDigest, 'validation.currentEvidenceRefresh.releaseManifest.artifactDigest vs releaseManifestVerification.artifactDigest');
    }
    const bundle = validation.recoveryBundle;
    if (!isRecord(bundle)) errors.push('validation.recoveryBundle: recorded evidence entry is missing');
    else compareField(errors, release.artifactDigest, bundle.artifactManifestDigest, 'validation.currentEvidenceRefresh.releaseManifest.artifactDigest vs recoveryBundle.artifactManifestDigest');
  }

  const packaged = refresh.packagedFlavors;
  if (!isRecord(packaged)) {
    errors.push('validation.currentEvidenceRefresh.packagedFlavors: evidence entry is missing');
  } else {
    const original = packaged.original;
    const recordedOriginal = validation.packagedApp;
    if (!isRecord(recordedOriginal)) errors.push('validation.packagedApp: recorded evidence entry is missing');
    compareCountAndDigest(errors, original, recordedOriginal, 'validation.currentEvidenceRefresh.packagedFlavors.original');

    const independent = packaged.independent;
    const recordedArtifact = validation.packagedArtifact;
    if (!isRecord(recordedArtifact)) errors.push('validation.packagedArtifact: recorded evidence entry is missing');
    compareCountAndDigest(errors, independent, {
      fileCount: recordedArtifact?.appFileCount,
      artifactDigest: recordedArtifact?.appArtifactDigest
    }, 'validation.currentEvidenceRefresh.packagedFlavors.independent');

    const markers = validation.packagedMarkers;
    if (!isRecord(markers)) errors.push('validation.packagedMarkers: recorded evidence entry is missing');
    else if (!Array.isArray(markers.flavors)) errors.push('validation.packagedMarkers.flavors: expected a list');
    else {
      for (const flavor of [
        { backendMode: 'original', snapshot: original },
        { backendMode: 'independent', snapshot: independent }
      ]) {
        const marker = markers.flavors.find(candidate => candidate?.backendMode === flavor.backendMode);
        if (!marker) {
          errors.push(`validation.packagedMarkers.flavors: missing ${flavor.backendMode} flavor`);
          continue;
        }
        compareField(errors, flavor.snapshot?.fileCount, marker.fileCount, `validation.currentEvidenceRefresh.packagedFlavors.${flavor.backendMode}.fileCount vs packagedMarkers`);
        compareField(errors, flavor.snapshot?.artifactDigest, marker.artifactDigest, `validation.currentEvidenceRefresh.packagedFlavors.${flavor.backendMode}.artifactDigest vs packagedMarkers`);
      }
    }
  }

  return errors;
}

