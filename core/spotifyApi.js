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
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import { SpotifyAuth } from './spotifyAuth.js';


try {
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
} catch (e) { }

const API_BASE = 'https://api.spotify.com/v1';


/** Extracts the base62 track id from an MPRIS trackid or Spotify URI. */
export function trackIdFromMpris(mprisId) {
    if (!mprisId) return null;
    const m = String(mprisId).match(/(?:spotify:track:|\/com\/spotify\/track\/)([A-Za-z0-9]+)/);
    return m ? m[1] : null;
}

export function trackUriFromId(id) {
    return `spotify:track:${id}`;
}


export class SpotifyApi {

    constructor(settings) {
        this._settings = settings;
        this._session = new Soup.Session();
        this._auth = new SpotifyAuth(this._port());
        this._refreshing = null;
    }

    _port() {
        try { return this._settings.get_int('spotify-redirect-port'); }
        catch (e) { return 8888; }
    }

    // ---- Token / connection state ----------------------------------------

    isConnected() {
        return !!this._settings.get_string('spotify-client-id')
            && !!this._settings.get_string('spotify-refresh-token');
    }

    storeTokens(bundle) {
        this._settings.set_string('spotify-access-token', bundle.accessToken || '');
        if (bundle.refreshToken) this._settings.set_string('spotify-refresh-token', bundle.refreshToken);
        this._settings.set_double('spotify-token-expiry', bundle.expiresAt || 0);
    }

    clearTokens() {
        this._settings.set_string('spotify-access-token', '');
        this._settings.set_string('spotify-refresh-token', '');
        this._settings.set_double('spotify-token-expiry', 0);
    }

    /** Runs the interactive login and persists the resulting tokens. */
    async connect(openUri) {
        const clientId = this._settings.get_string('spotify-client-id');
        if (!clientId) throw new Error('missing_client_id');

        const auth = new SpotifyAuth(this._port());
        try {
            const bundle = await auth.login(clientId, openUri);
            this.storeTokens(bundle);
            return await this.getMe();
        } finally {
            auth.destroy();
        }
    }

    async _ensureToken() {
        const access = this._settings.get_string('spotify-access-token');
        const expiry = this._settings.get_double('spotify-token-expiry');
        const now = GLib.get_real_time() / 1000000;

        if (access && now < expiry - 30) return access;
        return this._doRefresh();
    }

    _doRefresh() {
        // Collapse concurrent refreshes into one in-flight request.
        if (this._refreshing) return this._refreshing;

        this._refreshing = (async () => {
            const clientId = this._settings.get_string('spotify-client-id');
            const refreshToken = this._settings.get_string('spotify-refresh-token');
            if (!clientId || !refreshToken) throw new Error('not_connected');

            const bundle = await this._auth.refresh(clientId, refreshToken);
            this.storeTokens(bundle);
            return bundle.accessToken;
        })();

        this._refreshing.finally(() => { this._refreshing = null; });
        return this._refreshing;
    }

    // ---- Low-level request -----------------------------------------------

    async _request(method, path, bodyObj, _retried = false) {
        const token = await this._ensureToken();
        const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
        const msg = Soup.Message.new(method, url);
        msg.request_headers.append('Authorization', `Bearer ${token}`);

        if (bodyObj !== undefined && bodyObj !== null) {
            const json = JSON.stringify(bodyObj);
            msg.set_request_body_from_bytes('application/json',
                new GLib.Bytes(new TextEncoder().encode(json)));
        }

        const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
        const status = msg.get_status();
        const text = bytes ? new TextDecoder().decode(bytes.get_data()) : '';

        if (status === 401 && !_retried) {
            await this._doRefresh();
            return this._request(method, path, bodyObj, true);
        }

        if (status >= 200 && status < 300) {
            return text ? JSON.parse(text) : {};
        }

        throw new Error(`spotify_api ${status}: ${text}`);
    }

    async _paginate(path) {
        const items = [];
        let next = path;
        while (next) {
            const page = await this._request('GET', next);
            if (Array.isArray(page.items)) items.push(...page.items);
            next = page.next; // absolute URL or null
        }
        return items;
    }

    // ---- High-level endpoints --------------------------------------------

    async getMe() {
        return this._request('GET', '/me');
    }

    async getPlaylists() {
        const items = await this._paginate('/me/playlists?limit=50');
        return items.map(p => ({
            id: p.id,
            name: p.name,
            owner: p.owner ? p.owner.id : null,
            trackCount: p.tracks ? p.tracks.total : 0,
            editable: true,
        }));
    }

    async getPlaylistTracks(playlistId) {
        const items = await this._paginate(
            `/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,uri,name,duration_ms,artists(name)))`);
        return items
            .filter(it => it.track)
            .map(it => ({
                id: it.track.id,
                uri: it.track.uri,
                spotifyUri: it.track.uri,
                title: it.track.name,
                artist: (it.track.artists || []).map(a => a.name).join(', '),
                duration: Math.floor((it.track.duration_ms || 0) / 1000),
            }));
    }

    async createPlaylist(name, isPublic = false) {
        const me = await this.getMe();
        return this._request('POST', `/users/${me.id}/playlists`, {
            name,
            public: isPublic,
        });
    }

    async renamePlaylist(playlistId, name) {
        return this._request('PUT', `/playlists/${playlistId}`, { name });
    }

    async addTrackToPlaylist(playlistId, uri) {
        return this._request('POST', `/playlists/${playlistId}/tracks`, { uris: [uri] });
    }

    async removeTrackFromPlaylist(playlistId, uri) {
        return this._request('DELETE', `/playlists/${playlistId}/tracks`, { tracks: [{ uri }] });
    }

    async unfollowPlaylist(playlistId) {
        return this._request('DELETE', `/playlists/${playlistId}/followers`);
    }

    // ---- Liked Songs ------------------------------------------------------

    async getSavedTracks() {
        const items = await this._paginate('/me/tracks?limit=50');
        return items
            .filter(it => it.track)
            .map(it => ({
                id: it.track.id,
                uri: it.track.uri,
                spotifyUri: it.track.uri,
                title: it.track.name,
                artist: (it.track.artists || []).map(a => a.name).join(', '),
                duration: Math.floor((it.track.duration_ms || 0) / 1000),
            }));
    }

    async saveTrack(id) {
        return this._request('PUT', `/me/tracks?ids=${id}`);
    }

    async removeSavedTrack(id) {
        return this._request('DELETE', `/me/tracks?ids=${id}`);
    }

    async isSaved(id) {
        const res = await this._request('GET', `/me/tracks/contains?ids=${id}`);
        return Array.isArray(res) ? !!res[0] : false;
    }

    destroy() {
        if (this._auth) { this._auth.destroy(); this._auth = null; }
        if (this._session) { this._session.abort(); this._session = null; }
    }
}
