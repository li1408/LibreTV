const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adapterPath = path.join(__dirname, '..', 'js', 'internet-archive.js');
const code = fs.readFileSync(adapterPath, 'utf8');
const sandbox = { console, URLSearchParams };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: adapterPath });

const IA = sandbox.InternetArchiveAdapter;
assert.ok(IA, 'InternetArchiveAdapter should be exposed on window/globalThis');

const searchDoc = {
  identifier: 'night_of_the_living_dead',
  title: 'Night of the Living Dead',
  description: '<p>A public-domain horror film.</p>',
  year: '1968',
  creator: 'George A. Romero',
};

const mapped = IA.mapSearchDoc(searchDoc);
assert.equal(mapped.vod_id, 'night_of_the_living_dead');
assert.equal(mapped.vod_name, 'Night of the Living Dead');
assert.equal(mapped.vod_year, '1968');
assert.equal(mapped.source_code, 'internetarchive');
assert.equal(mapped.vod_pic, 'https://archive.org/services/img/night_of_the_living_dead');

const metadata = {
  metadata: {
    identifier: 'night_of_the_living_dead',
    title: 'Night of the Living Dead',
    description: '<p>A public-domain horror film.</p>',
    year: '1968',
    creator: 'George A. Romero',
    subject: ['horror', 'public domain'],
  },
  files: [
    { name: 'night_of_the_living_dead_meta.xml', format: 'Metadata' },
    { name: 'night_of_the_living_dead.thumbs/night_000001.jpg', format: 'Thumbnail' },
    { name: 'night_of_the_living_dead.ogv', format: 'Ogg Video' },
    { name: 'night_of_the_living_dead_512kb.mp4', format: 'MPEG4' },
    { name: 'night_of_the_living_dead_archive.torrent', format: 'Archive BitTorrent' },
  ],
};

const detail = IA.mapMetadataToDetail(metadata, 'night_of_the_living_dead');
assert.equal(detail.code, 200);
assert.deepEqual(detail.episodes, [
  'https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead_512kb.mp4',
  'https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead.ogv',
]);
assert.equal(detail.videoInfo.title, 'Night of the Living Dead');
assert.equal(detail.videoInfo.source_code, 'internetarchive');

assert.equal(IA.isPlayableFile({ name: 'movie.mp4', format: 'MPEG4' }), true);
assert.equal(IA.isPlayableFile({ name: 'movie_meta.xml', format: 'Metadata' }), false);
assert.equal(IA.isPlayableFile({ name: 'movie_archive.torrent', format: 'Archive BitTorrent' }), false);
