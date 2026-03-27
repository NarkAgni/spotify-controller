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


import GLib from 'gi://GLib';
import Gio  from 'gi://Gio';


export class QueueManager {

    constructor(onTrackChange) {
        this.onTrackChange = onTrackChange;

        this.tracks         = [];
        this.originalTracks = [];
        this.currentIndex   = -1;
        this.isActive       = false;

        this.expectedTrackId   = null;
        this.transitionEndTime = 0;
        this.wasNearEnd        = false;

        this.shuffleMode = false;
        this.repeatMode  = 'Playlist';

        const configDir    = GLib.get_user_config_dir();
        const extensionDir = GLib.build_filenamev([configDir, 'spotify-controller@narkagni']);
        GLib.mkdir_with_parents(extensionDir, 0o755);
        this.stateFile = GLib.build_filenamev([extensionDir, 'spotify-queue-state.json']);

        this._loadState();
    }

    _loadState() {
        const file = Gio.File.new_for_path(this.stateFile);
        if (!file.query_exists(null)) return;

        try {
            const [, contents] = file.load_contents(null);
            const data         = JSON.parse(new TextDecoder('utf-8').decode(contents));

            if (data && data.isActive) {
                this.tracks          = data.tracks          || [];
                this.originalTracks  = data.originalTracks  || [];
                this.currentIndex    = data.currentIndex    || 0;
                this.isActive        = data.isActive        || false;
                this.expectedTrackId = data.expectedTrackId || null;
                this.shuffleMode     = data.shuffleMode     || false;
                this.repeatMode      = data.repeatMode      || 'Playlist';
            }
        } catch (e) {
            console.warn('[QueueManager] State load error:', e);
        }
    }

    _saveState() {
        const file = Gio.File.new_for_path(this.stateFile);
        try {
            const data = JSON.stringify({
                isActive:        this.isActive,
                tracks:          this.tracks,
                originalTracks:  this.originalTracks,
                currentIndex:    this.currentIndex,
                expectedTrackId: this.expectedTrackId,
                shuffleMode:     this.shuffleMode,
                repeatMode:      this.repeatMode,
            }, null, 2);
            file.replace_contents(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.warn('[QueueManager] State save error:', e);
        }
    }

    startQueue(tracks, shuffle = false) {
        if (!tracks || tracks.length === 0) return;

        this.isActive        = true;
        this.wasNearEnd      = false;
        this.shuffleMode     = shuffle;
        this.repeatMode      = 'Playlist';
        this.originalTracks  = [...tracks];

        this.tracks = [...tracks];

        if (shuffle) this._shuffleInPlace(this.tracks);

        this.currentIndex = 0;
        this._playCurrent();
    }

    stop() {
        this.isActive        = false;
        this.tracks          = [];
        this.originalTracks  = [];
        this.currentIndex    = -1;
        this.expectedTrackId = null;
        this.wasNearEnd      = false;
        this._saveState();
    }

    toggleShuffle() {
        if (!this.isActive) return;

        this.shuffleMode = !this.shuffleMode;

        if (this.shuffleMode) {
            const currentTrack = this.tracks[this.currentIndex];
            const remaining    = this.tracks.filter((_, i) => i !== this.currentIndex);
            this._shuffleInPlace(remaining);
            this.tracks       = [currentTrack, ...remaining];
            this.currentIndex = 0;
        } else {
            const currentTrack = this.tracks[this.currentIndex];
            this.tracks        = [...this.originalTracks];
            this.currentIndex  = this.tracks.findIndex(t => t.id === currentTrack.id);
            if (this.currentIndex === -1) this.currentIndex = 0;
        }

        this._saveState();
    }

    toggleRepeat() {
        if (!this.isActive) return;

        const cycle = { 'Playlist': 'Track', 'Track': 'None', 'None': 'Playlist' };
        this.repeatMode = cycle[this.repeatMode] || 'Playlist';
        this._saveState();
    }

    next() {
        if (!this.isActive || this.tracks.length === 0) return false;

        if (this.repeatMode !== 'Track') {
            this.currentIndex++;

            if (this.currentIndex >= this.tracks.length) {
                if (this.repeatMode === 'None') {
                    this.stop();
                    return false;
                }
                this.currentIndex = 0;
            }
        }

        this._playCurrent();
        return true;
    }

    prev() {
        if (!this.isActive || this.tracks.length === 0) return false;

        if (this.repeatMode !== 'Track') {
            this.currentIndex--;

            if (this.currentIndex < 0) {
                this.currentIndex = this.repeatMode === 'None'
                    ? 0
                    : this.tracks.length - 1;
            }
        }

        this._playCurrent();
        return true;
    }

    checkTrackChange(currentTrackId, positionMicro, lengthMicro) {
        if (!this.isActive || !this.expectedTrackId) return;

        const cleanCurrent = currentTrackId
            ? currentTrackId.replace('/com/spotify/track/', 'spotify:track:')
            : '';

        const now = GLib.get_monotonic_time();
        if (this.transitionEndTime > 0 && now < this.transitionEndTime) return;

        if (cleanCurrent !== this.expectedTrackId) {
            if (this.wasNearEnd) {
                this.next();
            } else {
                this.stop();
            }
            this.wasNearEnd = false;
            return;
        }

        this.wasNearEnd = lengthMicro > 0 && (lengthMicro - positionMicro) < 3_000_000;
    }

    _playCurrent() {
        const track = this.tracks[this.currentIndex];
        if (!track || !this.onTrackChange) return;

        let uri = track.spotifyUri;
        if (uri.startsWith('/com/')) {
            uri = uri.replace('/com/spotify/track/', 'spotify:track:');
        }

        this.expectedTrackId   = uri;
        this.transitionEndTime = GLib.get_monotonic_time() + 3_000_000; // 3 s grace period
        this.wasNearEnd        = false;

        this._saveState();
        this.onTrackChange(uri);
    }

    _shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}