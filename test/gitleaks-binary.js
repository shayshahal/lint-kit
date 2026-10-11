/**
 * gitleaks-binary: the pinned Gitleaks executable the real-command tests run.
 *
 * The secret-scanning tests exercise the actual scanner, so they must have the exact release the
 * wrapper pins — not a version from `node_modules` or a global install. Resolution is, in order:
 *
 *   1. `LINT_KIT_GITLEAKS`, an absolute path a developer or CI already provisioned;
 *   2. `test/.gitleaks/<version>/gitleaks[.exe]`, the cache this module writes;
 *   3. the official release asset for this platform, downloaded and checked against the recorded
 *      SHA-256 before it is extracted into the cache.
 *
 * There is no silent skip. A platform the recorded checksums do not cover must be provisioned
 * explicitly through `LINT_KIT_GITLEAKS`, and a missing or mismatched download fails the test run.
 *
 * Run `node test/gitleaks-binary.js` to provision and print the path.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one Gitleaks release the wrapper and these tests accept. */
export const PINNED_GITLEAKS_VERSION = '8.30.1';

const RELEASE_URL = `https://github.com/gitleaks/gitleaks/releases/download/v${PINNED_GITLEAKS_VERSION}`;

/** Official release assets and their SHA-256, from the `gitleaks_8.30.1_checksums.txt` published with the release. */
const PINNED_GITLEAKS_ASSETS = {
	'win32-x64': {
		archive: 'gitleaks_8.30.1_windows_x64.zip',
		sha256: 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
	},
	'linux-x64': {
		archive: 'gitleaks_8.30.1_linux_x64.tar.gz',
		sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
	},
	'darwin-arm64': {
		archive: 'gitleaks_8.30.1_darwin_arm64.tar.gz',
		sha256: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
	},
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'test', '.gitleaks', PINNED_GITLEAKS_VERSION);
const EXECUTABLE_NAME = process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks';

/** The absolute path to the pinned Gitleaks 8.30.1 executable, provisioning it when needed. */
export async function resolvePinnedGitleaks() {
	const override = process.env.LINT_KIT_GITLEAKS;
	if (override !== undefined && override !== '') {
		if (!fs.existsSync(override))
			throw new Error(`LINT_KIT_GITLEAKS names ${override}, which does not exist`);
		return override;
	}
	const cached = path.join(CACHE, EXECUTABLE_NAME);
	if (fs.existsSync(cached)) return cached;
	return provision();
}

/** Download the recorded asset, verify its checksum, and extract the executable into the cache. */
async function provision() {
	const platform = `${process.platform}-${process.arch}`;
	const asset = PINNED_GITLEAKS_ASSETS[platform];
	if (asset === undefined)
		throw new Error(
			`no checksum-verified Gitleaks ${PINNED_GITLEAKS_VERSION} asset for ${platform}; set LINT_KIT_GITLEAKS to a pinned executable`,
		);
	const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-gitleaks-'));
	try {
		const archive = path.join(work, asset.archive);
		await download(`${RELEASE_URL}/${asset.archive}`, archive);
		const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
		if (digest !== asset.sha256)
			throw new Error(`gitleaks ${asset.archive} checksum mismatch: expected ${asset.sha256}, got ${digest}`);
		const extracted = path.join(work, 'extracted');
		fs.mkdirSync(extracted);
		extractArchive(archive, extracted);
		const executable = findExecutable(extracted);
		if (executable === null)
			throw new Error(`gitleaks ${asset.archive} did not contain ${EXECUTABLE_NAME}`);
		fs.mkdirSync(CACHE, { recursive: true });
		const cached = path.join(CACHE, EXECUTABLE_NAME);
		fs.copyFileSync(executable, cached);
		if (process.platform !== 'win32') fs.chmodSync(cached, 0o755);
		return cached;
	} finally {
		fs.rmSync(work, { recursive: true, force: true });
	}
}

/** `fetch` the release asset to disk, or fail the test run with the URL and status. */
async function download(url, target) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`could not download ${url}: HTTP ${response.status}`);
	fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** Expand a `.zip` with PowerShell on Windows, a `.tar.gz` with tar everywhere else. */
function extractArchive(archive, destination) {
	const [file, args] =
		process.platform === 'win32'
			? [
					'powershell.exe',
					[
						'-NoProfile',
						'-NonInteractive',
						'-Command',
						`Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destination}' -Force`,
					],
				]
			: ['tar', ['-xzf', archive, '-C', destination]];
	const result = spawnSync(file, args, { encoding: 'utf8' });
	if (result.error || result.status !== 0) throw new Error(`could not extract ${archive}`);
}

/** The executable anywhere in the extracted archive. */
function findExecutable(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			const nested = findExecutable(full);
			if (nested !== null) return nested;
		} else if (entry.name === EXECUTABLE_NAME) return full;
	}
	return null;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.stdout.write(`${await resolvePinnedGitleaks()}\n`);
}
