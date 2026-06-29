(function (root) {
    const SOURCE_CODE = 'internetarchive';
    const SOURCE_NAME = 'Internet Archive 公共媒体';
    const SEARCH_ENDPOINT = 'https://archive.org/advancedsearch.php';
    const METADATA_ENDPOINT = 'https://archive.org/metadata/';
    const DOWNLOAD_ENDPOINT = 'https://archive.org/download/';
    const ROWS = 20;

    function stripHtml(value) {
        const text = Array.isArray(value) ? value.join(', ') : (value || '');
        return String(text)
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeSearchQuery(query) {
        return String(query || '')
            .trim()
            .replace(/[(){}[\]^~?:\\]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    function firstValue(value) {
        return Array.isArray(value) ? value[0] : value;
    }

    function getYear(doc) {
        const raw = firstValue(doc.year) || firstValue(doc.date) || '';
        const match = String(raw).match(/\d{4}/);
        return match ? match[0] : '';
    }

    function buildSearchUrl(query, page) {
        const params = new URLSearchParams();
        const normalized = normalizeSearchQuery(query);
        params.set('q', `title:(${normalized}) AND mediatype:movies`);
        ['identifier', 'title', 'description', 'year', 'date', 'creator'].forEach(field => {
            params.append('fl[]', field);
        });
        params.set('rows', String(ROWS));
        params.set('page', String(page || 1));
        params.set('output', 'json');
        params.append('sort[]', 'downloads desc');
        return `${SEARCH_ENDPOINT}?${params.toString()}`;
    }

    function buildMetadataUrl(identifier) {
        return `${METADATA_ENDPOINT}${encodeURIComponent(identifier)}`;
    }

    function proxiedUrl(url) {
        if (typeof PROXY_URL === 'string' && PROXY_URL) {
            return PROXY_URL + encodeURIComponent(url);
        }
        return url;
    }

    async function fetchJson(url) {
        const response = await fetch(proxiedUrl(url), {
            headers: { Accept: 'application/json' },
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                ? AbortSignal.timeout(12000)
                : undefined
        });
        if (!response.ok) {
            throw new Error(`Internet Archive request failed: ${response.status}`);
        }
        return await response.json();
    }

    function mapSearchDoc(doc) {
        const identifier = String(doc.identifier || '').trim();
        const title = stripHtml(doc.title) || identifier;
        const description = stripHtml(doc.description);
        return {
            vod_id: identifier,
            vod_name: title,
            vod_pic: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : '',
            vod_remarks: description || 'Internet Archive media item',
            vod_year: getYear(doc),
            vod_actor: stripHtml(doc.creator),
            type_name: 'Public Media',
            source_name: SOURCE_NAME,
            source_code: SOURCE_CODE
        };
    }

    function isPlayableFile(file) {
        if (!file || !file.name) return false;
        const name = String(file.name).toLowerCase();
        const format = String(file.format || '').toLowerCase();
        if (
            name.endsWith('.torrent') ||
            name.endsWith('_files.xml') ||
            name.endsWith('_meta.xml') ||
            name.includes('/_') ||
            format.includes('metadata') ||
            format.includes('thumbnail') ||
            format.includes('text')
        ) {
            return false;
        }
        return (
            name.endsWith('.mp4') ||
            name.endsWith('.m4v') ||
            name.endsWith('.webm') ||
            name.endsWith('.ogv') ||
            name.endsWith('.ogg') ||
            format.includes('h.264') ||
            format.includes('mpeg4') ||
            format.includes('webm') ||
            format.includes('ogg video')
        );
    }

    function playablePriority(file) {
        const name = String(file.name || '').toLowerCase();
        const format = String(file.format || '').toLowerCase();
        if (name.endsWith('.mp4')) return 0;
        if (name.endsWith('.m4v')) return 1;
        if (format.includes('h.264') || format.includes('mpeg4')) return 2;
        if (name.endsWith('.webm') || format.includes('webm')) return 3;
        if (name.endsWith('.ogv') || name.endsWith('.ogg') || format.includes('ogg video')) return 4;
        return 5;
    }

    function fileDownloadUrl(identifier, fileName) {
        const encodedIdentifier = encodeURIComponent(identifier);
        const encodedPath = String(fileName).split('/').map(part => encodeURIComponent(part)).join('/');
        return `${DOWNLOAD_ENDPOINT}${encodedIdentifier}/${encodedPath}`;
    }

    function mapMetadataToDetail(metadataResponse, fallbackIdentifier) {
        const metadata = metadataResponse && metadataResponse.metadata ? metadataResponse.metadata : {};
        const identifier = String(metadata.identifier || fallbackIdentifier || '').trim();
        const files = Array.isArray(metadataResponse && metadataResponse.files) ? metadataResponse.files : [];
        const episodes = files
            .filter(isPlayableFile)
            .sort((a, b) => playablePriority(a) - playablePriority(b))
            .map(file => fileDownloadUrl(identifier, file.name));
        const subject = Array.isArray(metadata.subject) ? metadata.subject.join(', ') : (metadata.subject || '');

        return {
            code: 200,
            episodes,
            detailUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}` : '',
            videoInfo: {
                title: stripHtml(metadata.title) || identifier,
                cover: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : '',
                desc: stripHtml(metadata.description),
                type: subject || 'Public Media',
                year: getYear(metadata),
                area: '',
                director: stripHtml(metadata.creator),
                actor: stripHtml(metadata.creator),
                remarks: 'Internet Archive',
                source_name: SOURCE_NAME,
                source_code: SOURCE_CODE
            }
        };
    }

    async function search(query) {
        const normalized = normalizeSearchQuery(query);
        if (!normalized) return [];
        const data = await fetchJson(buildSearchUrl(normalized, 1));
        const docs = data && data.response && Array.isArray(data.response.docs)
            ? data.response.docs
            : [];
        return docs.map(mapSearchDoc).filter(item => item.vod_id);
    }

    async function detail(identifier) {
        const data = await fetchJson(buildMetadataUrl(identifier));
        return mapMetadataToDetail(data, identifier);
    }

    root.InternetArchiveAdapter = {
        SOURCE_CODE,
        SOURCE_NAME,
        buildSearchUrl,
        buildMetadataUrl,
        mapSearchDoc,
        mapMetadataToDetail,
        isPlayableFile,
        search,
        detail
    };
})(typeof window !== 'undefined' ? window : globalThis);
