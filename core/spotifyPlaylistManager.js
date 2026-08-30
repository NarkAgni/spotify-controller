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


import { SpotifyApi, trackIdFromMpris, trackUriFromId } from './spotifyApi.js';


/**
 * A cached, UI-friendly adapter over SpotifyApi.
 *
 * The UI reads from in-memory caches synchronously (so render code stays
 * simple) and calls the async write methods fire-and-forget. Every cache
 * mutation calls the onChange callback so the popup can re-render. Writes are
 * applied optimistically to the cache and rolled back / re-fetched on failure.
 */
export class SpotifyPlaylistManager {

    constructor(settings) {
        this._settings = settings;
        this._api = new SpotifyApi(settings);

        this._playlists = [];          // [{ id, name, trackCount }]
        this._tracksCache = new Map(); // playlistId -> [track]
        this._liked = [];              // [track]
        this._likedIds = new Set();
        this._onChange = null;

        this._playlistsLoaded = false;
        this._likedLoaded = false;
    }

    setOnChange(cb) { this._onChange = cb; }
    _emit() { if (this._onChange) this._onChange(); }

    isConnected() { return this._api.isConnected(); }

    // ---- Loading ----------------------------------------------------------

    async loadPlaylists(force = false) {
        if (!this.isConnected()) return;
        if (this._playlistsLoaded && !force) return;
        try {
            this._playlists = await this._api.getPlaylists();
            this._playlistsLoaded = true;
            this._emit();
        } catch (e) {
            console.warn('[SpotifyController] loadPlaylists failed:', e.message);
        }
    }

    async loadLiked(force = false) {
        if (!this.isConnected()) return;
        if (this._likedLoaded && !force) return;
        try {
            this._liked = await this._api.getSavedTracks();
            this._likedIds = new Set(this._liked.map(t => t.id));
            this._likedLoaded = true;
            this._emit();
        } catch (e) {
            console.warn('[SpotifyController] loadLiked failed:', e.message);
        }
    }

    async loadTracks(playlistId, force = false) {
        if (!playlistId) return;
        if (this._tracksCache.has(playlistId) && !force) return;
        try {
            const tracks = await this._api.getPlaylistTracks(playlistId);
            this._tracksCache.set(playlistId, tracks);
            this._emit();
        } catch (e) {
            console.warn('[SpotifyController] loadTracks failed:', e.message);
        }
    }

    // ---- Synchronous reads (from cache) ----------------------------------

    getPlaylists() { return this._playlists; }
    getPlaylistById(id) { return this._playlists.find(p => p.id === id) || null; }
    /** Returns cached tracks, or null when not yet loaded. */
    getTracks(playlistId) { return this._tracksCache.has(playlistId) ? this._tracksCache.get(playlistId) : null; }
    getLiked() { return this._liked; }
    likedLoaded() { return this._likedLoaded; }

    isLikedId(trackId) { return this._likedIds.has(trackId); }
    isLikedInfo(info) {
        const id = trackIdFromMpris(info && info.trackId);
        return id ? this._likedIds.has(id) : false;
    }

    /** Builds a cache track object from the MPRIS "info" of the playing song. */
    _trackFromInfo(info) {
        const id = trackIdFromMpris(info.trackId);
        if (!id) return null;
        const uri = trackUriFromId(id);
        return {
            id,
            uri,
            spotifyUri: uri,
            title: info.title,
            artist: info.artist,
            duration: info.length ? Math.floor(info.length / 1000000) : 0,
        };
    }

    // ---- Playlist writes --------------------------------------------------

    async createPlaylist(name) {
        if (!name || !name.trim()) return;
        try {
            const p = await this._api.createPlaylist(name.trim());
            this._playlists.unshift({ id: p.id, name: p.name, trackCount: 0 });
            this._tracksCache.set(p.id, []);
            this._emit();
        } catch (e) {
            console.warn('[SpotifyController] createPlaylist failed:', e.message);
        }
    }

    async renamePlaylist(playlistId, newName) {
        if (!playlistId || !newName || !newName.trim()) return;
        const pl = this.getPlaylistById(playlistId);
        const prev = pl ? pl.name : null;
        if (pl) pl.name = newName.trim();        // optimistic
        this._emit();
        try {
            await this._api.renamePlaylist(playlistId, newName.trim());
        } catch (e) {
            if (pl && prev !== null) pl.name = prev; // rollback
            this._emit();
            console.warn('[SpotifyController] renamePlaylist failed:', e.message);
        }
    }

    async deletePlaylist(playlistId) {
        const idx = this._playlists.findIndex(p => p.id === playlistId);
        const removed = idx >= 0 ? this._playlists.splice(idx, 1)[0] : null; // optimistic
        this._tracksCache.delete(playlistId);
        this._emit();
        try {
            await this._api.unfollowPlaylist(playlistId);
        } catch (e) {
            if (removed) { this._playlists.splice(idx, 0, removed); this._emit(); } // rollback
            console.warn('[SpotifyController] deletePlaylist failed:', e.message);
        }
    }

    /** Adds the currently-playing song. Returns 'added' | 'duplicate' | 'error'. */
    async addCurrentToPlaylist(playlistId, info) {
        const track = this._trackFromInfo(info);
        if (!track) return 'error';

        const cached = this._tracksCache.get(playlistId);
        if (cached && cached.some(t => t.id === track.id)) return 'duplicate';

        if (cached) cached.push(track);
        const pl = this.getPlaylistById(playlistId);
        if (pl) pl.trackCount += 1;
        this._emit();

        try {
            await this._api.addTrackToPlaylist(playlistId, track.uri);
            return 'added';
        } catch (e) {
            if (cached) this._tracksCache.set(playlistId, cached.filter(t => t.id !== track.id));
            if (pl) pl.trackCount = Math.max(0, pl.trackCount - 1);
            this._emit();
            console.warn('[SpotifyController] addTrack failed:', e.message);
            return 'error';
        }
    }

    async removeTrack(playlistId, track) {
        const cached = this._tracksCache.get(playlistId);
        if (cached) this._tracksCache.set(playlistId, cached.filter(t => t.id !== track.id));
        const pl = this.getPlaylistById(playlistId);
        if (pl) pl.trackCount = Math.max(0, pl.trackCount - 1);
        this._emit();
        try {
            await this._api.removeTrackFromPlaylist(playlistId, track.uri);
        } catch (e) {
            console.warn('[SpotifyController] removeTrack failed:', e.message);
            this.loadTracks(playlistId, true);
        }
    }

    // ---- Liked Songs ------------------------------------------------------

    /** Toggles like for the playing song; returns the new liked state (bool). */
    async toggleLike(info) {
        const track = this._trackFromInfo(info);
        if (!track) return false;

        if (this._likedIds.has(track.id)) {
            this._likedIds.delete(track.id);
            this._liked = this._liked.filter(t => t.id !== track.id);
            this._emit();
            try { await this._api.removeSavedTrack(track.id); }
            catch (e) { console.warn('[SpotifyController] unlike failed:', e.message); }
            return false;
        }

        this._likedIds.add(track.id);
        this._liked.unshift(track);
        this._emit();
        try { await this._api.saveTrack(track.id); }
        catch (e) { console.warn('[SpotifyController] like failed:', e.message); }
        return true;
    }

    /** Accurately checks whether the playing song is in Liked Songs (one API call). */
    async refreshLikedState(info) {
        const id = trackIdFromMpris(info && info.trackId);
        if (!id || !this.isConnected()) return false;
        try {
            const saved = await this._api.isSaved(id);
            if (saved) this._likedIds.add(id);
            else this._likedIds.delete(id);
            return saved;
        } catch (e) {
            return this._likedIds.has(id);
        }
    }

    async removeLikedById(trackId) {
        this._likedIds.delete(trackId);
        this._liked = this._liked.filter(t => t.id !== trackId);
        this._emit();
        try { await this._api.removeSavedTrack(trackId); }
        catch (e) { console.warn('[SpotifyController] removeLiked failed:', e.message); }
    }

    destroy() {
        if (this._api) { this._api.destroy(); this._api = null; }
    }
}
