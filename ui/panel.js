import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { SpotifyProxy } from '../core/spotifyProxy.js';
import { MediaPopup } from './popup.js';

export const MediaIndicator = GObject.registerClass(
    class MediaIndicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.5, 'Media Controller');
            this._settings = settings;

            this._buildPanelUI();

            this._popup = new MediaPopup(this.menu, this._settings, {
                prev: () => {
                    this.activeProxy?.controls().previous();
                },
                playPause: () => this.activeProxy?.controls().playPause(),
                next: () => this.activeProxy?.controls().next(),
                shuffle: () => this.activeProxy?.toggleShuffle(),
                repeat: () => this.activeProxy?.toggleRepeat(),
                seek: (val) => {
                    if (this.activeProxy) this.activeProxy.controls().seek(val);
                }
            });

            // Listeners for dynamic updates
            this._settings.connect('changed::button-spacing', () => this._applySpacing());
            this._settings.connect('changed::label-margin', () => this._applySpacing());
            this._settings.connect('changed::show-play-pause', () => this._applyVisibility());
            this._settings.connect('changed::show-prev', () => this._applyVisibility());
            this._settings.connect('changed::show-next', () => this._applyVisibility());
            
            this._settings.connect('changed::show-panel-title', () => this._updateState());
            this._settings.connect('changed::show-panel-artist', () => this._updateState());

            const onUpdate = () => {
                if (!this.label || !this.get_parent()) return;
                this._updateState();
            };

            this.proxies = [new SpotifyProxy(onUpdate)];
            
            this.proxies.forEach(p => {
                p.init();
                if (p.onSeeked) {
                    p.onSeeked((position) => {
                        if (p === this.activeProxy) {
                            this._popup.syncPosition(position);
                        }
                    });
                }
            });
            this.activeProxy = null;

            this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this._updateState();
                return GLib.SOURCE_CONTINUE;
            });
        }
        
        _buildPanelUI() {
            this.box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
            this.box.set_reactive(true);
            this.box.connect('scroll-event', (actor, event) => {
                if (!this.activeProxy) return Clutter.EVENT_PROPAGATE;
                const direction = event.get_scroll_direction();
                if (direction === Clutter.ScrollDirection.UP) this.activeProxy.changeVolume(0.05);
                else if (direction === Clutter.ScrollDirection.DOWN) this.activeProxy.changeVolume(-0.05);
                return Clutter.EVENT_STOP;
            });

            this.btnBox = new St.BoxLayout();
            let prevIcon = new St.Icon({ icon_name: 'media-skip-backward-symbolic', style_class: 'system-status-icon' });
            this.prevBtn = new St.Button({ child: prevIcon, style_class: 'media-ctrl-btn' });
            
            this.prevBtn.connect('clicked', () => {
                this.activeProxy?.controls().previous();
                if (this._popup) this._popup.resetPosition();
            });

            this.playIcon = new St.Icon({ icon_name: 'media-playback-start-symbolic', style_class: 'system-status-icon' });
            this.playBtn = new St.Button({ child: this.playIcon, style_class: 'media-ctrl-btn' });
            this.playBtn.connect('clicked', () => this.activeProxy?.controls().playPause());

            let nextIcon = new St.Icon({ icon_name: 'media-skip-forward-symbolic', style_class: 'system-status-icon' });
            this.nextBtn = new St.Button({ child: nextIcon, style_class: 'media-ctrl-btn' });
            
            this.nextBtn.connect('clicked', () => {
                this.activeProxy?.controls().next();
                if (this._popup) this._popup.resetPosition();
            });

            this.btnBox.add_child(this.prevBtn);
            this.btnBox.add_child(this.playBtn);
            this.btnBox.add_child(this.nextBtn);

            this.label = new St.Label({ text: 'Spotify', y_align: Clutter.ActorAlign.CENTER });

            const layoutOrder = this._settings.get_string('layout-order');
            if (layoutOrder === 'buttons-end') {
                this.box.add_child(this.label);
                this.box.add_child(this.btnBox);
                this.label.x_align = Clutter.ActorAlign.END;
            } else {
                this.box.add_child(this.btnBox);
                this.box.add_child(this.label);
                this.label.x_align = Clutter.ActorAlign.START;
            }

            this.add_child(this.box);
            this._applySpacing();
            this._applyVisibility();
        }

        _applySpacing() {
            let spacing = this._settings.get_int('button-spacing');
            let margin = this._settings.get_int('label-margin');
            this.btnBox.style = `spacing: ${spacing}px;`;
            const layoutOrder = this._settings.get_string('layout-order');
            if (layoutOrder === 'buttons-end') {
                this.label.style = `margin-right: ${margin}px; margin-left: 10px;`;
            } else {
                this.label.style = `margin-left: ${margin}px; margin-right: 10px;`;
            }
        }

        _applyVisibility() {
            this.playBtn.visible = this._settings.get_boolean('show-play-pause');
            this.prevBtn.visible = this._settings.get_boolean('show-prev');
            this.nextBtn.visible = this._settings.get_boolean('show-next');
        }

        _updateState() {
            try {
                if (!this.label || !this.get_parent()) return;

                let spotifyProxy = this.proxies[0];
                let info = spotifyProxy.getInfo();

                if (info && info.status !== 'Stopped') {
                    this.activeProxy = spotifyProxy;
                    this.show();
                    
                    const isPlaying = info.status === 'Playing';
                    this.playIcon.icon_name = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';

                    this._popup.updateControls(info);
                    this._popup.updateTrack(info);

                    this._updateLabel(info);
                } else {
                    this.hide();
                    this.activeProxy = null;
                }
            } catch (e) { console.warn("MediaExtension: Update error", e); }
        }

        _updateLabel(info) {
            const showTitle = this._settings.get_boolean('show-panel-title');
            const showArtist = this._settings.get_boolean('show-panel-artist');

            let text = "";

            if (showTitle && showArtist) {
                text = `${info.title} - ${info.artist}`;
            } else if (showTitle) {
                text = info.title;
            } else if (showArtist) {
                text = info.artist;
            } else {
                text = "";
            }

            if (text.length > 40) text = text.substring(0, 37) + '...';
            
            this.label.set_text(text);
            this.label.visible = (text !== "");
        }

        destroy() {
            if (this._timeout) { GLib.source_remove(this._timeout); this._timeout = null; }
            if (this.proxies) { this.proxies.forEach(p => { if (p.destroy) p.destroy(); }); }
            if (this._popup) { this._popup.destroy(); }
            super.destroy();
        }
    });