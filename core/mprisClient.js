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


const MprisInterface = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="SetPosition">
      <arg type="o" name="TrackId" direction="in"/>
      <arg type="x" name="Position" direction="in"/>
    </method>
    <property name="Metadata"       type="a{sv}" access="read"/>
    <property name="PlaybackStatus" type="s"     access="read"/>
    <property name="Volume"         type="d"     access="readwrite"/>
    <property name="LoopStatus"     type="s"     access="readwrite"/>
    <property name="Shuffle"        type="b"     access="readwrite"/>
    <property name="Position"       type="x"     access="read"/>
  </interface>
</node>`;

const MprisProxyWrapper = Gio.DBusProxy.makeProxyWrapper(MprisInterface);

export class MprisClient {
    constructor(busName, onChange) {
        this.busName = busName;

        this._proxy = new MprisProxyWrapper(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2'
        );

        this._signalId = this._proxy.connect('g-properties-changed', () => {
            if (onChange) onChange();
        });

        this._seekedId = this._proxy.connectSignal('Seeked', (proxy, sender, [position]) => {
            if (onChange) onChange(position);
        });
    }

    async init() {
        return true;
    }

    get Metadata() {
        if (!this._proxy) return null;

        try {
            const meta = this._proxy.Metadata;
            if (!meta) return null;

            const cleanMeta = {};
            for (const key in meta) {
                const val = meta[key];
                cleanMeta[key] = (val instanceof GLib.Variant) ? val.recursiveUnpack() : val;
            }
            return cleanMeta;

        } catch (e) {
            return null;
        }
    }

    get Status() {
        try {
            return this._proxy?.PlaybackStatus || 'Stopped';
        } catch (e) {
            return 'Stopped';
        }
    }

    get Position() {
        try {
            const pos = this._proxy.get_cached_property('Position');
            return pos ? pos.unpack() : 0;
        } catch (e) {
            return 0;
        }
    }

    get Volume() {
        return this._proxy?.Volume || 1.0;
    }

    set Volume(val) {
        if (this._proxy) this._proxy.Volume = val;
    }

    get LoopStatus() {
        return this._proxy?.LoopStatus || 'None';
    }

    set LoopStatus(val) {
        if (this._proxy) this._proxy.LoopStatus = val;
    }


    get Shuffle() {
        return this._proxy?.Shuffle || false;
    }

    set Shuffle(val) {
        if (this._proxy) this._proxy.Shuffle = val;
    }

    seek(trackId, position) {
        try {
            this._proxy?.SetPositionRemote(trackId, position);
        } catch (e) {
        }
    }

    playPause() {
        this._proxy?.PlayPauseRemote();
    }

    next() {
        this._proxy?.NextRemote();
    }

    previous() {
        this._proxy?.PreviousRemote();
    }

    destroy() {
        if (this._signalId) this._proxy.disconnect(this._signalId);
        if (this._seekedId) this._proxy.disconnect(this._seekedId);
        this._proxy = null;
    }
}