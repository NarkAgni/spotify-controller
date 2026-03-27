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


import { MprisClient } from './mprisClient.js';


const SpotifyKeys = {
    BUS_NAME: 'org.mpris.MediaPlayer2.spotify',
    TRACK_ID: 'mpris:trackid',
    TITLE:    'xesam:title',
    ARTIST:   'xesam:artist',
    ALBUM:    'xesam:album',
    ART_URL:  'mpris:artUrl',
    LENGTH:   'mpris:length',
};


export class SpotifyProxy {

    constructor(onChange) {
        this.client           = new MprisClient(SpotifyKeys.BUS_NAME, onChange);
        this._seekedCallback  = null;
    }

    async init() {
        await this.client.init();

        if (this.client._proxy) {
            this.client._proxy.connectSignal('Seeked', (proxy, sender, [position]) => {
                if (this._seekedCallback) this._seekedCallback(position);
            });
        }
    }

    onSeeked(callback) {
        this._seekedCallback = callback;
    }

    getInfo() {
        if (!this.client) return null;

        const meta = this.client.Metadata;
        if (!meta) return null;

        return {
            source:      'Spotify',
            status:      this.client.Status,
            title:       meta[SpotifyKeys.TITLE]           || 'Unknown Track',
            artist:      meta[SpotifyKeys.ARTIST]?.join(', ') || 'Unknown Artist',
            album:       meta[SpotifyKeys.ALBUM]            || '',
            artUrl:      meta[SpotifyKeys.ART_URL],
            trackId:     meta[SpotifyKeys.TRACK_ID],
            length:      meta[SpotifyKeys.LENGTH]           || 0,
            position:    this.client.Position,
            shuffle:     this.client.Shuffle,
            loopStatus:  this.client.LoopStatus,
            rate:        1.0,
        };
    }

    seek(percent) {
        const info = this.getInfo();
        if (info?.length) {
            const newPosMicro = Math.floor(percent * info.length);
            this.client.seek(info.trackId, newPosMicro);
        }
    }

    controls() {
        return {
            playPause: ()        => this.client.playPause(),
            next:      ()        => this.client.next(),
            previous:  ()        => this.client.previous(),
            seek:      (percent) => this.seek(percent),
        };
    }

    toggleShuffle() {
        this.client.Shuffle = !this.client.Shuffle;
    }

    toggleRepeat() {
        const cycle = { 'None': 'Playlist', 'Playlist': 'Track', 'Track': 'None' };
        this.client.LoopStatus = cycle[this.client.LoopStatus] || 'None';
    }

    changeVolume(delta) {
        const current        = this.client.Volume || 1.0;
        this.client.Volume   = Math.max(0.0, Math.min(1.0, current + delta));
    }

    destroy() {
        if (this.client) this.client.destroy();
        this._seekedCallback = null;
    }
}