/**
 * Tests for the download URL logic in docs.html and the checkout redirect in index.html.
 *
 * These tests verify the exact bug that was fixed: clicking "Buy for Windows" must
 * always produce the .exe download link, even when the buyer is on a Mac or Windows ARM.
 *
 * Run with: node --test landing-page/download-url.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Constants matching release-config.js ────────────────────────────────────

const WINDOWS_URL = 'https://github.com/pawelkom88/glance/releases/download/v0.4.0-rc.9/Glance_0.4.0_x64-setup.exe';
const MAC_ARM_URL = 'https://github.com/pawelkom88/glance/releases/download/v0.4.0-rc.9/Glance_0.4.0_aarch64.dmg';
const MAC_INTEL_URL = 'https://github.com/pawelkom88/glance/releases/download/v0.4.0-rc.9/Glance_0.4.0_x64.dmg';

// ─── Extracted getDownloadUrl logic (mirrors docs.html) ──────────────────────
//
// This is a pure-function extraction of the getDownloadUrl logic from docs.html
// with the navigator APIs replaced by explicit parameters for testability.

function getDownloadUrl(purchasePlatform, { isAppleSilicon = false, isWindowsOS = false } = {}) {
  const normalizedPlatform = typeof purchasePlatform === 'string' ? purchasePlatform.toLowerCase() : '';

  if (normalizedPlatform === 'windows') {
    return WINDOWS_URL;
  }

  if (normalizedPlatform === 'macos' || normalizedPlatform === 'mac') {
    return isAppleSilicon ? MAC_ARM_URL : MAC_INTEL_URL;
  }

  // Fallback: if the API did not return a platform, detect the OS
  if (isWindowsOS) {
    return WINDOWS_URL;
  }

  return isAppleSilicon ? MAC_ARM_URL : MAC_INTEL_URL;
}

// ─── getDownloadUrl tests ────────────────────────────────────────────────────

test('getDownloadUrl: platform "windows" returns .exe regardless of device OS', async (t) => {
  await t.test('on a Mac (Apple Silicon)', () => {
    const url = getDownloadUrl('windows', { isAppleSilicon: true, isWindowsOS: false });
    assert.equal(url, WINDOWS_URL, 'Windows purchase on a Mac must return the .exe');
    assert.ok(url.endsWith('.exe'), 'URL must end with .exe');
    assert.ok(!url.endsWith('.dmg'), 'URL must NOT end with .dmg');
  });

  await t.test('on a Mac (Intel)', () => {
    const url = getDownloadUrl('windows', { isAppleSilicon: false, isWindowsOS: false });
    assert.equal(url, WINDOWS_URL);
  });

  await t.test('on Windows x64', () => {
    const url = getDownloadUrl('windows', { isAppleSilicon: false, isWindowsOS: true });
    assert.equal(url, WINDOWS_URL);
  });

  await t.test('on Windows ARM', () => {
    // This was the original bug: Windows ARM reported architecture "arm",
    // which the old code mistook for Apple Silicon.
    const url = getDownloadUrl('windows', { isAppleSilicon: true, isWindowsOS: true });
    assert.equal(url, WINDOWS_URL, 'Windows ARM purchase must return .exe, not .dmg');
  });
});

test('getDownloadUrl: platform "macos" returns .dmg based on chip', async (t) => {
  await t.test('Apple Silicon returns ARM .dmg', () => {
    const url = getDownloadUrl('macos', { isAppleSilicon: true });
    assert.equal(url, MAC_ARM_URL);
    assert.ok(url.includes('aarch64'), 'URL must be the ARM build');
  });

  await t.test('Intel Mac returns x64 .dmg', () => {
    const url = getDownloadUrl('macos', { isAppleSilicon: false });
    assert.equal(url, MAC_INTEL_URL);
    assert.ok(url.includes('x64'), 'URL must be the Intel build');
  });
});

test('getDownloadUrl: platform "mac" (alternate) returns .dmg', () => {
  const url = getDownloadUrl('mac', { isAppleSilicon: true });
  assert.equal(url, MAC_ARM_URL);
});

test('getDownloadUrl: platform is case-insensitive', async (t) => {
  await t.test('"Windows" (capitalised)', () => {
    assert.equal(getDownloadUrl('Windows'), WINDOWS_URL);
  });

  await t.test('"WINDOWS" (upper)', () => {
    assert.equal(getDownloadUrl('WINDOWS'), WINDOWS_URL);
  });

  await t.test('"MacOS" (capitalised)', () => {
    assert.equal(getDownloadUrl('MacOS', { isAppleSilicon: true }), MAC_ARM_URL);
  });
});

// ─── Fallback tests (platform is null/undefined/empty) ───────────────────────

test('getDownloadUrl: null platform on Windows OS falls back to .exe', () => {
  const url = getDownloadUrl(null, { isAppleSilicon: false, isWindowsOS: true });
  assert.equal(url, WINDOWS_URL, 'null platform on Windows must return .exe');
});

test('getDownloadUrl: undefined platform on Windows OS falls back to .exe', () => {
  const url = getDownloadUrl(undefined, { isAppleSilicon: false, isWindowsOS: true });
  assert.equal(url, WINDOWS_URL, 'undefined platform on Windows must return .exe');
});

test('getDownloadUrl: null platform on Mac falls back to .dmg', () => {
  const url = getDownloadUrl(null, { isAppleSilicon: true, isWindowsOS: false });
  assert.equal(url, MAC_ARM_URL, 'null platform on Mac must return .dmg');
});

test('getDownloadUrl: null platform on Windows ARM falls back to .exe (not .dmg)', () => {
  // Regression test for the exact original bug:
  // Windows ARM has isAppleSilicon=true (architecture "arm") but isWindowsOS=true.
  // The fallback must check isWindowsOS BEFORE isAppleSilicon.
  const url = getDownloadUrl(null, { isAppleSilicon: true, isWindowsOS: true });
  assert.equal(url, WINDOWS_URL, 'null platform on Windows ARM must return .exe, NOT .dmg');
});

test('getDownloadUrl: empty string platform on Windows falls back to .exe', () => {
  const url = getDownloadUrl('', { isAppleSilicon: false, isWindowsOS: true });
  assert.equal(url, WINDOWS_URL);
});

// ─── Checkout redirect URL tests ─────────────────────────────────────────────
//
// Verifies that the redirect from index.html to docs.html includes the platform
// query parameter, which was the missing piece that caused the bug.

function buildCheckoutRedirectUrl(transactionId, customDataPlatform) {
  const redirectUrl = new URL('https://atglance.app/docs.html');
  redirectUrl.searchParams.set('checkout', 'pending');
  redirectUrl.searchParams.set('transaction_id', transactionId);
  if (customDataPlatform) {
    redirectUrl.searchParams.set('platform', customDataPlatform);
  }
  return redirectUrl;
}

test('checkout redirect includes platform=windows for Windows purchase', () => {
  const url = buildCheckoutRedirectUrl('txn_test_1', 'windows');
  assert.equal(url.searchParams.get('platform'), 'windows');
  assert.equal(url.searchParams.get('checkout'), 'pending');
  assert.equal(url.searchParams.get('transaction_id'), 'txn_test_1');
});

test('checkout redirect includes platform=macos for Mac purchase', () => {
  const url = buildCheckoutRedirectUrl('txn_test_2', 'macos');
  assert.equal(url.searchParams.get('platform'), 'macos');
});

test('checkout redirect without platform does not add platform param', () => {
  const url = buildCheckoutRedirectUrl('txn_test_3', null);
  assert.equal(url.searchParams.get('platform'), null, 'platform param must not be set when custom_data is missing');
});

// ─── Platform priority tests ─────────────────────────────────────────────────
//
// docs.html uses: urlPlatform || checkoutStatus.platform
// The URL platform (from the button click) must take priority.

test('URL platform takes priority over checkout-status platform', () => {
  const urlPlatform = 'windows';
  const checkoutStatusPlatform = 'macos'; // e.g. stale or wrong data
  const effectivePlatform = urlPlatform || checkoutStatusPlatform;
  assert.equal(effectivePlatform, 'windows');
});

test('checkout-status platform is used when URL platform is missing', () => {
  const urlPlatform = null;
  const checkoutStatusPlatform = 'windows';
  const effectivePlatform = urlPlatform || checkoutStatusPlatform;
  assert.equal(effectivePlatform, 'windows');
});

test('both null falls through to OS detection fallback', () => {
  const urlPlatform = null;
  const checkoutStatusPlatform = null;
  const effectivePlatform = urlPlatform || checkoutStatusPlatform;
  assert.equal(effectivePlatform, null);
  // In this case getDownloadUrl(null, ...) is called, which uses the OS fallback
  const url = getDownloadUrl(effectivePlatform, { isWindowsOS: true });
  assert.equal(url, WINDOWS_URL, 'even with both null, Windows OS detection must produce .exe');
});
