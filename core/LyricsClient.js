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
    }

    async getLyrics(title, artist, album, duration) {
        if (!this._session) return null;

        try {
            const url = `https://lrclib.net/api/get`
                + `?track_name=${encodeURIComponent(title)}`
                + `&artist_name=${encodeURIComponent(artist)}`
                + `&album_name=${encodeURIComponent(album)}`
                + `&duration=${duration}`;

            const msg   = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);

            if (msg.status_code !== Soup.Status.OK)
                return await this._searchLyrics(title, artist, duration);

            const data = JSON.parse(decode(bytes.get_data()));
            return data.syncedLyrics ? this._parseLRC(data.syncedLyrics) : null;

        } catch (e) {
            return null;
        }
    }

    async _searchLyrics(title, artist, duration) {
        if (!this._session) return null;

        try {
            const url   = `https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}`;
            const msg   = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
            const data  = JSON.parse(decode(bytes.get_data()));

            const match = data.find(item => Math.abs(item.duration - duration) < 3);
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