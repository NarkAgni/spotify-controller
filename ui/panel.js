/*
* Spotify Controller GNOME Extension
* Copyright (C) 2026 NarkAgni
* * This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* any later version.
* * This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
* GNU General Public License for more details.
* * You should have received a copy of the GNU General Public License
* along with this program. If not, see https://www.gnu.org/licenses/. */


import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { MediaPopup } from './popup.js';
import { SpotifyProxy } from '../core/spotifyProxy.js';


export const MediaIndicator = GObject.registerClass(
    class MediaIndicator extends PanelMenu.Button {
        
        _init(settings) {
            super._init(0.5, 'Media Controller');
            this.add_style_class_name('spotify-controller-panel');
            this._settings = settings;

            this._buildPanelUI();

            this._popup = new MediaPopup(this.menu, this._settings, {
                prev: () => {
                    this.activeProxy?.controls().previous();
                },
                playPause: () => {
                    this.activeProxy?.controls().playPause();
                },
                next: () => {
                    this.activeProxy?.controls().next();
                },
                shuffle: () => {
                    this.activeProxy?.toggleShuffle();
                },
                repeat: () => {
                    this.activeProxy?.toggleRepeat();
                },
                seek: (val) => {
                    if (this.activeProxy) {
                        this.activeProxy.controls().seek(val);
                    }
                }
            });

            this._settings.connect('changed::button-spacing', () => this._applySpacing());
            this._settings.connect('changed::label-margin', () => this._applySpacing());
            this._settings.connect('changed::show-play-pause', () => this._applyVisibility());
            this._settings.connect('changed::show-prev', () => this._applyVisibility());
            this._settings.connect('changed::show-next', () => this._applyVisibility());
            this._settings.connect('changed::show-panel-title', () => this._updateState());
            this._settings.connect('changed::show-panel-artist', () => this._updateState());

            this._demandsAttentionId = global.display.connect('window-demands-attention', (display, window) => {
                if (this._isFocusGrabbed) {
                    const wmClass = window.get_wm_class() ? window.get_wm_class().toLowerCase() : '';
                    if (wmClass.includes('spotify')) {
                        this._releaseFocusLock(false);
                    }
                }
            });

            this._previewTimeoutId = null;
            this._openDebounceId = null;

            const visualKeys = [
                'bg-mode', 'custom-bg-color', 'cover-art-size', 'cover-art-radius',
                'header-text-color', 'header-font-size', 'custom-font-family',
                'title-text-color', 'title-font-size', 'artist-text-color', 'artist-font-size',
                'time-text-color', 'time-font-size', 'popup-button-color', 'popup-icon-size',
                'slider-track-color', 'slider-color', 'thumb-color',
                'art-pad-top', 'art-pad-right', 'art-pad-bottom', 'art-pad-left',
                'text-margin-top', 'text-margin-right', 'text-margin-bottom', 'text-margin-left',
                'slider-pad-top', 'slider-pad-right', 'slider-pad-bottom', 'slider-pad-left',
                'ctrl-pad-top', 'ctrl-pad-right', 'ctrl-pad-bottom', 'ctrl-pad-left',
                'lyrics-active-color', 'lyrics-neighbor-color', 'lyrics-inactive-color',
                'lyrics-active-size', 'lyrics-neighbor-size', 'lyrics-inactive-size',
                'lyrics-line-spacing'
            ];

            visualKeys.forEach(key => {
                this._settings.connect(`changed::${key}`, () => {
                    if (!this.activeProxy) return;

                    const isLyricsKey = key.startsWith('lyrics-');
                    if (isLyricsKey) {
                        if (!this._popup.hasLyrics()) return;
                        this._popup.forceLyricsView(true);
                    } else {
                        if (this._popup) this._popup.forceLyricsView(false);
                    }

                    if (this._openDebounceId) {
                        GLib.source_remove(this._openDebounceId);
                        this._openDebounceId = null;
                    }

                    this._openDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                        this._openDebounceId = null;

                        if (!this.menu.isOpen) {
                            this._previewOpen = true;
                            this.menu.open(true);
                        }

                        if (this._previewTimeoutId) {
                            GLib.source_remove(this._previewTimeoutId);
                            this._previewTimeoutId = null;
                        }

                        this._previewTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                            this._previewTimeoutId = null;
                            if (this.menu.isOpen && this._previewOpen) {
                                this._previewOpen = false;
                                this.menu.close(true);
                            }
                            return GLib.SOURCE_REMOVE;
                        });

                        return GLib.SOURCE_REMOVE;
                    });
                });
            });

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

        _releaseFocusLock(isFromTimeout = false) {
            if (this._isFocusGrabbed) {
                try {
                    if (this._grabObject) {
                        Main.popModal(this._grabObject);
                    } else if (this.focusGrabber) {
                        Main.popModal(this.focusGrabber);
                    }
                } catch (e) {
                    console.error("Error popping modal:", e);
                }
                this._grabObject = null;
                this._isFocusGrabbed = false;
            }
            
            if (!isFromTimeout && this._focusTimeoutId) {
                let tempId = this._focusTimeoutId;
                this._focusTimeoutId = null;
                try { 
                    GLib.source_remove(tempId); 
                } catch(e) { }
            }
        }

        _preventSpotifyPopup() {
            if (!this.focusGrabber || this._isFocusGrabbed) return;
            
            try {
                let grabResult = Main.pushModal(this.focusGrabber);

                if (grabResult) {
                    this._isFocusGrabbed = true;
                    
                    if (typeof grabResult === 'object') {
                        this._grabObject = grabResult;
                    }

                    if (this._focusTimeoutId) {
                        try { GLib.source_remove(this._focusTimeoutId); } catch(e) {}
                        this._focusTimeoutId = null;
                    }
                    
                    this._focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                        this._focusTimeoutId = null;
                        this._releaseFocusLock(true);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            } catch (e) {
                console.error("Push modal failed:", e);
                this._releaseFocusLock(false);
            }
        }
        
        _buildPanelUI() {
            this.box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
            this.box.set_reactive(true);
            this.box.connect('scroll-event', (actor, event) => {
                if (!this.activeProxy) return Clutter.EVENT_PROPAGATE;
                const direction = event.get_scroll_direction();
                if (direction === Clutter.ScrollDirection.UP) {
                    this.activeProxy.changeVolume(0.05);
                } else if (direction === Clutter.ScrollDirection.DOWN) {
                    this.activeProxy.changeVolume(-0.05);
                }
                return Clutter.EVENT_STOP;
            });

            this.box.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.box.connect('button-release-event', (actor, event) => {
                const button = event.get_button();
                this._executeMouseAction(button);
                return Clutter.EVENT_STOP;
            });

            this.btnBox = new St.BoxLayout();

            this.focusGrabber = new St.Widget({ reactive: true, can_focus: true, width: 0, height: 0, opacity: 0 });
            Main.uiGroup.add_child(this.focusGrabber);

            this._isFocusGrabbed = false;
            this._grabObject = null;

            let prevIcon = new St.Icon({ icon_name: 'media-skip-backward-symbolic', style_class: 'system-status-icon' });
            this.prevBtn = new St.Button({ child: prevIcon, style_class: 'media-ctrl-btn media-ctrl-btn-inline' });
            this.prevBtn.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.prevBtn.connect('button-release-event', (actor, event) => {
                this._preventSpotifyPopup();
                if (this._popup) this._popup.triggerPrev();
                return Clutter.EVENT_STOP;
            });

            this.playIcon = new St.Icon({ icon_name: 'media-playback-start-symbolic', style_class: 'system-status-icon' });
            this.playBtn = new St.Button({ child: this.playIcon, style_class: 'media-ctrl-btn media-ctrl-btn-inline' });
            this.playBtn.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.playBtn.connect('button-release-event', (actor, event) => {
                this.activeProxy?.controls().playPause();
                return Clutter.EVENT_STOP;
            });

            let nextIcon = new St.Icon({ icon_name: 'media-skip-forward-symbolic', style_class: 'system-status-icon' });
            this.nextBtn = new St.Button({ child: nextIcon, style_class: 'media-ctrl-btn media-ctrl-btn-inline' });
            this.nextBtn.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.nextBtn.connect('button-release-event', (actor, event) => {
                this._preventSpotifyPopup();
                if (this._popup) this._popup.triggerNext();
                return Clutter.EVENT_STOP;
            });

            this.btnBox.add_child(this.prevBtn);
            this.btnBox.add_child(this.playBtn);
            this.btnBox.add_child(this.nextBtn);

            this.labelBtn = new St.Button({
                style_class: 'spotify-panel-label',
                reactive: true,
                can_focus: true,
                track_hover: true
            });
            
            this.label = new St.Label({ text: 'Spotify', y_align: Clutter.ActorAlign.CENTER });
            this.labelBtn.set_child(this.label);
            
            this.labelBtn.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.labelBtn.connect('button-release-event', (actor, event) => {
                const button = event.get_button();
                this._executeMouseAction(button);
                return Clutter.EVENT_STOP;
            });

            const layoutOrder = this._settings.get_string('layout-order');
            if (layoutOrder === 'buttons-end') {
                this.box.add_child(this.labelBtn);
                this.box.add_child(this.btnBox);
                this.labelBtn.x_align = Clutter.ActorAlign.END;
            } else {
                this.box.add_child(this.btnBox);
                this.box.add_child(this.labelBtn);
                this.labelBtn.x_align = Clutter.ActorAlign.START;
            }

            this.add_child(this.box);
            this._applySpacing();
            this._applyVisibility();

            this._settings.connect('changed::layout-order', () => {
                this.box.remove_child(this.labelBtn);
                this.box.remove_child(this.btnBox);
                
                const layoutOrder = this._settings.get_string('layout-order');
                if (layoutOrder === 'buttons-end') {
                    this.box.add_child(this.labelBtn);
                    this.box.add_child(this.btnBox);
                    this.labelBtn.x_align = Clutter.ActorAlign.END;
                } else {
                    this.box.add_child(this.btnBox);
                    this.box.add_child(this.labelBtn);
                    this.labelBtn.x_align = Clutter.ActorAlign.START;
                }
                this._applySpacing();
            });
        }

        _executeMouseAction(button) {
            let action = 'none';
            try {
                if (button === 1) action = this._settings.get_string('left-click-action');
                if (button === 3) action = this._settings.get_string('right-click-action');
            } catch(e) {
                action = (button === 1) ? 'menu' : 'none';
            }

            if (action === 'none') return;

            switch(action) {
                case 'menu':
                    this._previewOpen = false;
                    if (this._previewTimeoutId) {
                        GLib.source_remove(this._previewTimeoutId);
                        this._previewTimeoutId = null;
                    }
                    this.menu.toggle();
                    break;
                case 'play-pause':
                    this.activeProxy?.controls().playPause();
                    break;
                case 'next':
                    this._preventSpotifyPopup();
                    if (this._popup) this._popup.triggerNext();
                    break;
                case 'prev':
                    this._preventSpotifyPopup();
                    if (this._popup) this._popup.triggerPrev();
                    break;
                case 'playlist':
                    if (!this.menu.isOpen) this.menu.open();
                    this._popup?.togglePlaylistView();
                    break;
            }
        }

        _applySpacing() {
            let spacing = this._settings.get_int('button-spacing');
            let margin = this._settings.get_int('label-margin');
            
            this.btnBox.style = `spacing: ${spacing}px;`;
            
            const layoutOrder = this._settings.get_string('layout-order');
            if (layoutOrder === 'buttons-end') {
                this.labelBtn.style = `margin-right: ${margin}px; margin-left: 10px;`;
            } else {
                this.labelBtn.style = `margin-left: ${margin}px; margin-right: 10px;`;
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
            } catch (e) {
                console.warn("MediaExtension: Update error", e);
            }
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

            if (text.length > 40) {
                text = text.substring(0, 37) + '...';
            }
            
            this.label.set_text(text);
            this.labelBtn.visible = (text !== "");
        }

        destroy() {
            if (this._demandsAttentionId) {
                global.display.disconnect(this._demandsAttentionId);
                this._demandsAttentionId = null;
            }

            this._releaseFocusLock();
            
            if (this.focusGrabber) {
                Main.uiGroup.remove_child(this.focusGrabber);
                this.focusGrabber.destroy();
                this.focusGrabber = null;
            }

            if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
            }
            if (this._previewTimeoutId) {
                GLib.source_remove(this._previewTimeoutId);
                this._previewTimeoutId = null;
            }
            if (this._openDebounceId) {
                GLib.source_remove(this._openDebounceId);
                this._openDebounceId = null;
            }
            if (this.proxies) {
                this.proxies.forEach(p => { if (p.destroy) p.destroy(); });
            }
            if (this._popup) {
                this._popup.destroy();
            }
            super.destroy();
        }
    }
);