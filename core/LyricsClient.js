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


import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';


// This module owns its own Soup session, so it promisifies the method it needs
// instead of relying on another module having already done it. Guarded because
// older GJS releases (GNOME 45/46) throw when a method is promisified twice.
try {
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
} catch (e) { }


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
            } else {
                lines = await this._searchLyrics(title, artist, dur);
            }
        } catch (e) {
            lines = null;
        }

        // Cache negatives in memory only (so a later session can retry),
        // positives to disk as well.
        this._memCache.set(key, lines);
        if (lines && lines.length > 0) this._writeDiskCache(key, lines);
        return lines;
    }

    async _searchLyrics(title, artist, duration) {
        if (!this._session) return null;

        try {
            const url   = `https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}`;
            const msg   = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
            const data  = JSON.parse(decode(bytes.get_data()));

            const match = data.find(item => item.syncedLyrics && Math.abs(item.duration - duration) < 3);
            return match?.syncedLyrics ? this._parseLRC(match.syncedLyrics) : null;

        } catch (e) {
            return null;
        }
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