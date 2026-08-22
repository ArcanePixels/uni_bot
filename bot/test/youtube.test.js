import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/plugins/youtube.js';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>Kanal</title>
  <entry>
    <id>yt:video:abc123XYZ_1</id>
    <yt:videoId>abc123XYZ_1</yt:videoId>
    <title>Mein Video &amp; mehr</title>
    <author><name>ArcanePixels</name></author>
    <published>2026-08-21T10:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>alt999</yt:videoId>
    <title>Aelteres Video</title>
  </entry>
</feed>`;

test('parseFeed liest den neuesten Eintrag', () => {
  const r = parseFeed(FEED);
  assert.equal(r.videoId, 'abc123XYZ_1');
  assert.equal(r.title, 'Mein Video & mehr');
  assert.equal(r.author, 'ArcanePixels');
  assert.equal(r.url, 'https://www.youtube.com/watch?v=abc123XYZ_1');
});

test('parseFeed liefert null bei leerem Feed', () => {
  assert.equal(parseFeed('<feed></feed>'), null);
});
