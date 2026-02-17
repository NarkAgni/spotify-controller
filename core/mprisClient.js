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
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Volume" type="d" access="readwrite"/> 
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
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

    // ========= DESTROY & CLEANUP =========
    destroy() {
        if (this._signalId) this._proxy.disconnect(this._signalId);
        if (this._seekedId) this._proxy.disconnect(this._seekedId);
        this._proxy = null;
    }

    async init() { return true; }

    // ========= GETTERS & SETTERS =========
    get Metadata() {
        if (!this._proxy) return null;
        try {
            let meta = this._proxy.Metadata;
            if (!meta) return null;
            let cleanMeta = {};
            for (let key in meta) {
                let val = meta[key];
                cleanMeta[key] = (val instanceof GLib.Variant) ? val.recursiveUnpack() : val;
            }
            return cleanMeta;
        } catch (e) { return null; }
    }

    get Status() {
        try { return this._proxy?.PlaybackStatus || 'Stopped'; } catch (e) { return 'Stopped'; }
    }

    get Position() {
        try {
            let pos = this._proxy.get_cached_property('Position');
            return pos ? pos.unpack() : 0;
        } catch (e) { return 0; }
    }

    get Volume() { return this._proxy?.Volume || 1.0; }
    set Volume(val) { if (this._proxy) this._proxy.Volume = val; }

    get LoopStatus() { return this._proxy?.LoopStatus || 'None'; }
    set LoopStatus(val) { if (this._proxy) this._proxy.LoopStatus = val; }

    get Shuffle() { return this._proxy?.Shuffle || false; }
    set Shuffle(val) { if (this._proxy) this._proxy.Shuffle = val; }

    // ========= MEDIA CONTROLS =========
    seek(trackId, position) {
        try { this._proxy?.SetPositionRemote(trackId, position); } catch (e) { }
    }

    playPause() { this._proxy?.PlayPauseRemote(); }
    next() { this._proxy?.NextRemote(); }
    previous() { this._proxy?.PreviousRemote(); }
}