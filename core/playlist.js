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


export class PlaylistManager {

    constructor() {
        const configDir    = GLib.get_user_config_dir();
        const extensionDir = GLib.build_filenamev([configDir, 'spotify-controller@narkagni']);

        if (GLib.mkdir_with_parents(extensionDir, 0o755) === -1)
            console.warn('[SpotifyController] Warning: Could not create playlist directory!');

        this.filePath      = GLib.build_filenamev([extensionDir, 'spotify-playlist.json']);
        this.likedFilePath = GLib.build_filenamev([extensionDir, 'spotify-liked.json']);

        this.playlists  = this._loadPlaylists();
        this.likedSongs = this._loadLiked();
    }

    _loadPlaylists() {
        const file = Gio.File.new_for_path(this.filePath);
        if (!file.query_exists(null)) return { 'My Playlist': [] };

        try {
            const [, contents] = file.load_contents(null);
            const data         = JSON.parse(new TextDecoder('utf-8').decode(contents));

            // Migrate legacy format (plain array → named playlist object)
            if (Array.isArray(data)) return { 'My Playlist': data };
            return data;

        } catch (e) {
            console.warn('Playlist Load Error:', e);
            return { 'My Playlist': [] };
        }
    }

    _savePlaylists() {
        const file = Gio.File.new_for_path(this.filePath);
        try {
            const data = JSON.stringify(this.playlists, null, 2);
            file.replace_contents(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.warn('Playlist Save Error:', e);
        }
    }

    getPlaylistNames() {
        return Object.keys(this.playlists);
    }

    createPlaylist(name) {
        if (!name || name.trim() === '') return false;
        if (this.playlists[name])         return false;

        this.playlists[name] = [];
        this._savePlaylists();
        return true;
    }

    deletePlaylist(name) {
        if (this.playlists[name]) {
            delete this.playlists[name];
            this._savePlaylists();
        }
    }

    renamePlaylist(oldName, newName) {
        if (!oldName || !newName)           return false;
        if (oldName === newName)            return false;
        if (newName.trim() === '')          return false;
        if (!this.playlists[oldName])       return false;
        if (this.playlists[newName])        return false;

        const rebuilt = {};
        for (const key in this.playlists) {
            rebuilt[key === oldName ? newName : key] = this.playlists[key];
        }

        this.playlists = rebuilt;
        this._savePlaylists();
        return true;
    }

    addTrack(playlistName, info) {
        if (!this.playlists[playlistName]) this.createPlaylist(playlistName);

        const cleanUri  = this._normaliseUri(info.trackId || '');
        const trackId   = cleanUri || (info.title + info.artist);
        const isDuplicate = this.playlists[playlistName].some(t => t.id === trackId);
        if (isDuplicate) return false;

        const durationSec = info.length ? Math.floor(info.length / 1_000_000) : 0;
        this.playlists[playlistName].push({
            id:          trackId,
            title:       info.title,
            artist:      info.artist,
            spotifyUri:  cleanUri,
            duration:    durationSec,
        });

        this._savePlaylists();
        return true;
    }

    removeTrack(playlistName, trackId) {
        if (!this.playlists[playlistName]) return;
        this.playlists[playlistName] = this.playlists[playlistName].filter(t => t.id !== trackId);
        this._savePlaylists();
    }

    getTracks(playlistName) {
        return this.playlists[playlistName] || [];
    }

    _loadLiked() {
        const file = Gio.File.new_for_path(this.likedFilePath);
        if (!file.query_exists(null)) return [];

        try {
            const [, contents] = file.load_contents(null);
            return JSON.parse(new TextDecoder('utf-8').decode(contents)) || [];
        } catch (e) {
            console.warn('Liked Load Error:', e);
            return [];
        }
    }

    _saveLiked() {
        const file = Gio.File.new_for_path(this.likedFilePath);
        try {
            const data = JSON.stringify(this.likedSongs, null, 2);
            file.replace_contents(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.warn('Liked Save Error:', e);
        }
    }

    getLikedSongs() {
        return this.likedSongs;
    }

    isLiked(info) {
        const trackId = this._resolveTrackId(info);
        return this.likedSongs.some(t => t.id === trackId);
    }

    toggleLike(info) {
        const trackId = this._resolveTrackId(info);
        const idx     = this.likedSongs.findIndex(t => t.id === trackId);

        if (idx !== -1) {
            this.likedSongs.splice(idx, 1);
            this._saveLiked();
            return false;
        }

        const cleanUri    = this._normaliseUri(info.trackId || '');
        const durationSec = info.length ? Math.floor(info.length / 1_000_000) : 0;
        this.likedSongs.push({
            id:         trackId,
            title:      info.title,
            artist:     info.artist,
            spotifyUri: cleanUri,
            duration:   durationSec,
        });

        this._saveLiked();
        return true;
    }

    removeLiked(trackId) {
        this.likedSongs = this.likedSongs.filter(t => t.id !== trackId);
        this._saveLiked();
    }

    _normaliseUri(uri) {
        if (uri.includes('/com/spotify/track/'))
            return uri.replace('/com/spotify/track/', 'spotify:track:');
        return uri;
    }

    _resolveTrackId(info) {
        const cleanUri = this._normaliseUri(info.trackId || '');
        return cleanUri || (info.title + info.artist);
    }
}