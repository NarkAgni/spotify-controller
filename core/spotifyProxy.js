import { MprisClient } from './mprisClient.js';

// ========= CONFIGURATION =========
const SpotifyKeys = {
    BUS_NAME: 'org.mpris.MediaPlayer2.spotify',
    TRACK_ID: 'mpris:trackid',
    TITLE: 'xesam:title',
    ARTIST: 'xesam:artist',
    ALBUM: 'xesam:album',
    ART_URL: 'mpris:artUrl',
    LENGTH: 'mpris:length'
};

export class SpotifyProxy {
    constructor(onChange) {
        this.client = new MprisClient(SpotifyKeys.BUS_NAME, onChange);
        this._seekedCallback = null;
    }

    // ========= INITIALIZATION =========
    async init() { 
        await this.client.init();
        if (this.client._proxy) {
            this.client._proxy.connectSignal('Seeked', (proxy, sender, [position]) => {
                if (this._seekedCallback) this._seekedCallback(position);
            });
        }
    }

    destroy() {
        if (this.client) this.client.destroy();
        this._seekedCallback = null;
    }

    onSeeked(callback) { this._seekedCallback = callback; }

    // ========= DATA FETCHING =========
    getInfo() {
        if (!this.client) return null;
        const meta = this.client.Metadata;
        if (!meta) return null;

        return {
            source: 'Spotify',
            status: this.client.Status,
            title: meta[SpotifyKeys.TITLE] || 'Unknown Track',
            artist: meta[SpotifyKeys.ARTIST]?.join(', ') || 'Unknown Artist',
            album: meta[SpotifyKeys.ALBUM] || '', 
            artUrl: meta[SpotifyKeys.ART_URL],
            trackId: meta[SpotifyKeys.TRACK_ID],
            length: meta[SpotifyKeys.LENGTH] || 0,
            position: this.client.Position,
            shuffle: this.client.Shuffle,
            loopStatus: this.client.LoopStatus,
            rate: 1.0
        };
    }

    // ========= PLAYER ACTIONS =========
    seek(percent) {
        const info = this.getInfo();
        if (info?.length) {
            const newPosMicro = Math.floor(percent * info.length);
            this.client.seek(info.trackId, newPosMicro);
        }
    }

    controls() {
        return {
            playPause: () => this.client.playPause(),
            next: () => this.client.next(),
            previous: () => this.client.previous(),
            seek: (percent) => this.seek(percent)
        };
    }

    toggleShuffle() { this.client.Shuffle = !this.client.Shuffle; }
    
    toggleRepeat() {
        const current = this.client.LoopStatus;
        let next = (current === 'None') ? 'Playlist' : (current === 'Playlist') ? 'Track' : 'None';
        this.client.LoopStatus = next;
    }

    changeVolume(delta) {
        let currentVol = this.client.Volume || 1.0;
        this.client.Volume = Math.max(0.0, Math.min(1.0, currentVol + delta));
    }
}