import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDxi, cdxTimestamps, pickClosestSnapshot, momDirection } from './dram-dxi.js';

// Verbatim from the dramexchange.com homepage (2026-08-05). The value-bearing
// anchor is inside an HTML comment — the visible widget is an image — but the
// server still stamps the current index value into the commented markup, so we
// parse the raw HTML without stripping comments.
const LIVE_FRAGMENT =
  '<div class="box-c"><div align="center">' +
  '<!-- <a rel="nofollow" href="/Market/DXI">952611.90<img border="0" height="7" ' +
  'src="/Common/Images/dxi_up.gif" width="13">1395.32 (0.15 %)</a>' +
  '<img src="/Common/Images/Home/icon001.gif" width="18" height="15"><br> -->' +
  '<!--<a rel="nofollow" href="/Market/DXI"><img src="//chart.dramexchange.com/dxi2png.php" ' +
  'alt="DXI" width="180" height="155" border="0"></a>-->' +
  '</div></div>';

// Verbatim from the Wayback Machine capture of 2026-07-06. Wayback rewrites
// hrefs in live markup but leaves commented markup untouched, so the same
// pattern matches archived pages.
const WAYBACK_FRAGMENT =
  '<li><a href="/web/20260706184100/https://dramexchange.com/Market/DXI">DXI</a></li>' +
  '<!-- <a rel="nofollow" href="/Market/DXI">867894.80<img border="0" height="7" ' +
  'src="/Common/Images/dxi_up.gif" width="13">5307.90 (0.62 %)</a>' +
  '<img src="/Common/Images/Home/icon001.gif" width="18" height="15"><br> -->';

test('parseDxi extracts the index value from the live homepage markup', () => {
  assert.equal(parseDxi(LIVE_FRAGMENT), 952611.9);
});

test('parseDxi extracts the index value from a Wayback capture', () => {
  assert.equal(parseDxi(WAYBACK_FRAGMENT), 867894.8);
});

test('parseDxi tolerates thousands separators and a down day', () => {
  const html =
    '<a rel="nofollow" href="/Market/DXI">1,052,611.90<img src="/Common/Images/dxi_down.gif">500.00 (0.05 %)</a>';
  assert.equal(parseDxi(html), 1052611.9);
});

test('parseDxi ignores anchors without a value (nav links, chart images)', () => {
  const html =
    '<li><a href="/Market/DXI">DXI</a></li>' +
    '<a rel="nofollow" href="/Market/DXI"><img src="//chart.dramexchange.com/dxi2png.php" alt="DXI"></a>';
  assert.equal(parseDxi(html), null);
});

test('parseDxi returns null on unrelated HTML', () => {
  assert.equal(parseDxi('<html><body>maintenance</body></html>'), null);
});

test('cdxTimestamps reads a CDX JSON response and skips the header row', () => {
  const json = [['timestamp'], ['20260702064027'], ['20260706184100'], ['20260711050228']];
  assert.deepEqual(cdxTimestamps(json), ['20260702064027', '20260706184100', '20260711050228']);
});

test('cdxTimestamps handles multi-column rows (no fl= filter)', () => {
  const json = [
    ['urlkey', 'timestamp', 'original'],
    ['com,dramexchange)/', '20260706184100', 'https://dramexchange.com/'],
  ];
  assert.deepEqual(cdxTimestamps(json), ['20260706184100']);
});

test('cdxTimestamps returns [] for an empty or malformed response', () => {
  assert.deepEqual(cdxTimestamps([]), []);
  assert.deepEqual(cdxTimestamps('not an array'), []);
});

test('pickClosestSnapshot picks the capture nearest the target date', () => {
  const ts = ['20260609172718', '20260702064027', '20260706184100', '20260711050228'];
  assert.equal(pickClosestSnapshot(ts, '20260705'), '20260706184100');
});

test('pickClosestSnapshot returns null when there are no candidates', () => {
  assert.equal(pickClosestSnapshot([], '20260705'), null);
});

test('momDirection reports an up move with the percentage change', () => {
  const r = momDirection(952611.9, 867894.8);
  assert.ok(r);
  assert.equal(r.direction, 'up');
  assert.ok(Math.abs(r.pctChange - 9.76) < 0.01);
});

test('momDirection reports a down move', () => {
  const r = momDirection(800, 900);
  assert.ok(r);
  assert.equal(r.direction, 'down');
  assert.ok(Math.abs(r.pctChange - -11.11) < 0.01);
});

// The tripwire fires on "turns DOWN month-over-month"; a flat print is not a
// downturn, so flat maps to up.
test('momDirection maps a flat month to up', () => {
  const r = momDirection(500, 500);
  assert.ok(r);
  assert.equal(r.direction, 'up');
  assert.equal(r.pctChange, 0);
});

test('momDirection rejects a non-positive or non-finite baseline', () => {
  assert.equal(momDirection(500, 0), null);
  assert.equal(momDirection(500, -1), null);
  assert.equal(momDirection(Number.NaN, 500), null);
});
