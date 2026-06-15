/*
 * Spotify Controller GNOME Extension
 * Copyright (C) 2026 NarkAgni
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


import Soup from 'gi://Soup';
import GLib from 'gi://GLib';


const decode = (data) => new TextDecoder().decode(data);

export class LyricsClient {

    constructor() {
        this._session = new Soup.Session();
        this._session.timeout = 8;              // fail fast instead of hanging the spinner

        this._memCache = new Map();             // key -> parsed lines[] | null
        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'spotify-controller-lyrics']);
        GLib.mkdir_with_parents(this._cacheDir, 0o755);
    }

    _cacheKey(title, artist, duration) {
        const raw = `${(title || '').toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}|${duration}`;
        return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, raw, -1);
    }

    _cachePath(key) {
        return GLib.build_filenamev([this._cacheDir, `${key}.json`]);
    }

    /** Reads parsed lyrics from disk, or undefined if not cached. */
    _readDiskCache(key) {
        const path = this._cachePath(key);
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return undefined;
        try {
            const [ok, contents] = GLib.file_get_contents(path);
            if (!ok) return undefined;
            return JSON.parse(decode(contents));
        } catch (e) {
            return undefined;
        }
    }

    /** Persists positive lyric hits so revisits are instant and offline. */
    _writeDiskCache(key, lines) {
        try {
            GLib.file_set_contents(this._cachePath(key), JSON.stringify(lines));
        } catch (e) { }
    }

    /**
     * Spotify titles carry suffixes lrclib's bare titles don't have, e.g.
     * "Song (feat. X)", "Song - Remastered 2011", "Song (Live)". Strip them
     * so both /get and /search can match.
     */
    _cleanTitle(title) {
        return (title || '')
            .replace(/\s*[-(]\s*(feat\.?|ft\.?|with)\b[^)]*\)?/gi, '')   // featured artists
            .replace(/\s*-\s*(remaster(ed)?|live|acoustic|mono|stereo|radio edit|single version|deluxe)\b.*$/gi, '')
            .replace(/\s*\((remaster(ed)?|live|acoustic|mono|stereo|radio edit|single version|deluxe)\b[^)]*\)/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    /** "Artist A, Artist B & C" -> "Artist A" — lrclib search matches better on the lead artist. */
    _primaryArtist(artist) {
        return (artist || '').split(/\s*[,&]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i)[0].trim();
    }

    async getLyrics(title, artist, album, duration) {
        if (!this._session) return null;

        const dur = Math.round(duration) || 0;
        const key = this._cacheKey(title, artist, dur);

        // 1. In-memory cache (covers negatives too, within this session).
        if (this._memCache.has(key)) return this._memCache.get(key);

        // 2. Disk cache (positive hits survive restarts / offline).
        const disk = this._readDiskCache(key);
        if (disk !== undefined) {
            this._memCache.set(key, disk);
            return disk;
        }

        // 3. Network.
        let lines = null;
        try {
            const url = `https://lrclib.net/api/get`
                + `?track_name=${encodeURIComponent(title)}`
                + `&artist_name=${encodeURIComponent(artist)}`
                + `&album_name=${encodeURIComponent(album || '')}`
                + `&duration=${dur}`;

            const msg   = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);

            if (msg.status_code === Soup.Status.OK) {
                const data = JSON.parse(decode(bytes.get_data()));
                if (data.syncedLyrics) lines = this._parseLRC(data.syncedLyrics);
            }
        } catch (e) {
            lines = null;
        }

        // Fall back to search whenever the exact lookup didn't yield synced lyrics
        // (404, or a 200 record that only had plain lyrics). The exact /get is
        // strict about title/artist/duration; search is far more forgiving.
        if (!lines || lines.length === 0) {
            lines = await this._searchLyrics(title, artist, dur);
        }

        // Cache negatives in memory only (so a later session can retry),
        // positives to disk as well.
        this._memCache.set(key, lines);
        if (lines && lines.length > 0) this._writeDiskCache(key, lines);
        return lines;
    }

    async _searchLyrics(title, artist, duration) {
        if (!this._session) return null;

        const cleanTitle = this._cleanTitle(title);
        const primary    = this._primaryArtist(artist);

        // A few progressively looser queries; first synced hit wins.
        const queries = [
            `${cleanTitle} ${primary}`,
            `${cleanTitle} ${artist}`,
            cleanTitle,
        ];

        const seen = new Set();
        for (const q of queries) {
            const query = q.trim();
            if (!query || seen.has(query)) continue;
            seen.add(query);

            let data;
            try {
                const url   = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
                const msg   = Soup.Message.new('GET', url);
                const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                data = JSON.parse(decode(bytes.get_data()));
            } catch (e) {
                continue;
            }

            if (!Array.isArray(data) || data.length === 0) continue;
            const synced = data.filter(item => item.syncedLyrics);
            if (synced.length === 0) continue;

            // Prefer a duration-aligned result; otherwise accept the best synced hit
            // (lrclib's relevance ordering puts the likeliest match first).
            const match = synced.find(item => Math.abs(item.duration - duration) < 5) || synced[0];
            return this._parseLRC(match.syncedLyrics);
        }

        return null;
    }

    _parseLRC(lrcText) {
        const lines = [];
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

        lrcText.split('\n').forEach(line => {
            const match = line.match(regex);
            if (!match) return;

            const minutes      = parseInt(match[1]);
            const seconds      = parseInt(match[2]);
            const centiseconds = parseFloat('0.' + match[3]);
            const timeMs       = (minutes * 60 * 1000) + (seconds * 1000) + (centiseconds * 1000);
            const text         = match[4].trim();

            if (text) lines.push({ time: timeMs, text });
        });

        return lines;
    }

    destroy() {
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
}