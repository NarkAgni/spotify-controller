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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { MediaSlider } from './slider.js';
import { PlaylistUI } from './playlistUI.js';
import { LyricsWidget } from './LyricsWidget.js';
import { PlaylistManager } from '../core/playlist.js';
import { LyricsClient } from '../core/LyricsClient.js';
import { QueueManager } from '../core/queueManager.js';


Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_bytes_async", "replace_contents_finish");
Gio._promisify(GdkPixbuf.Pixbuf, "new_from_stream_async", "new_from_stream_finish");

export class MediaPopup {
    constructor(menu, settings, controlsCallback) {
        this._menu = menu;
        this._settings = settings;
        this._callbacks = controlsCallback;

        this._isPlaying = false;
        this._menu.box.add_style_class_name('spotify-popup-menu');

        this._currentTrackHash = null;
        this._currentRGB = null;
        this._currentImageUri = null;

        this._playlistManager = new PlaylistManager();
        this._popupMode = 'normal';

        this._lyricsClient = new LyricsClient();
        this._isLyricsMode = false;
        this._currentLyricsData = null;
        this._lyricsTimerId = null;
        this._overlayTimeoutId = null;

        this._httpSession = new Soup.Session();
        this._httpSession.timeout = 10;
        this._httpSession.user_agent = 'Mozilla/5.0';

        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "spotify-controller-art"]);
        if (GLib.mkdir_with_parents(this._cacheDir, 0o755) === -1) { }

        this._queueManager = new QueueManager((uri) => this._openUri(uri));
        this._playlistUI = new PlaylistUI(this._playlistManager, this._settings, {
            setPopupMode: (mode) => this.setPopupMode(mode),
            playQueue: (tracks, shuffle) => {
                this._queueManager.startQueue(tracks, shuffle);
                this.updateControls(this._lastTrackInfo);
            },
            openUri: (uri) => {
                this._queueManager.stop();
                this._openUri(uri);
            },
            getLastTrackInfo: () => this._lastTrackInfo,
            onCurrentUnliked: () => {
                this._currentLiked = false;
                this._updateLikedBtnStyle();
            }
        });

        this._buildUI();

        const styleKeys = [
            'popup-button-color', 'time-text-color', 'title-text-color', 'artist-text-color',
            'custom-font-family', 'title-font-size', 'artist-font-size', 'time-font-size',
            'cover-art-size', 'popup-icon-size', 'art-pad-top', 'art-pad-bottom',
            'art-pad-left', 'art-pad-right', 'text-margin-top', 'text-margin-bottom',
            'text-margin-left', 'text-margin-right', 'slider-pad-top', 'slider-pad-bottom',
            'slider-pad-left', 'slider-pad-right', 'ctrl-pad-top', 'ctrl-pad-bottom',
            'ctrl-pad-left', 'ctrl-pad-right', 'header-font-size', 'header-text-color',
            'lyrics-active-color', 'lyrics-neighbor-color', 'lyrics-inactive-color',
            'lyrics-active-size', 'lyrics-neighbor-size', 'lyrics-inactive-size',
            'lyrics-line-spacing'
        ];

        styleKeys.forEach(key => {
            if (this._settings) {
                this._settings.connect(`changed::${key}`, () => this._updateStyles());
            }
        });

        this._settings.connect('changed::cover-art-radius', () => {
            this._updateStyles();
            this._checkRotationState();
        });
        
        this._settings.connect('changed::art-rotate-speed', () => this._checkRotationState());
        this._settings.connect('changed::bg-mode', () => this._updateBackground());
        this._settings.connect('changed::custom-bg-color', () => this._updateBackground());
        this._settings.connect('changed::custom-header-text', () => this._updateHeaderText());

        this._menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._checkRotationState();
                this._manageLyricsTimer();
            } else {
                this._freezeAnimation();
                this._removeLyricsTimer();
            }
        });
    }

    async updateTrack(info) {
        const newHash = info.title + info.artist;

        this._queueManager.checkTrackChange(info.trackId, info.position, info.length);

        if (this._currentTrackHash !== newHash) {
            this._resetAnimation();
            this._currentLyricsData = null;
            if (this._isLyricsMode) this._fetchLyrics(info);
            if (this._popupMode === 'playlist' || this._popupMode === 'liked') {
                this._playlistUI.setMode(this._popupMode);
            }
        }

        if (this._currentTrackHash === newHash) {
            this._checkRotationState();
            return;
        }

        this._currentTrackHash = newHash;
        this._currentRGB = null;

        try {
            const result = await this.loadImage(info.artUrl);
            if (result) {
                this._currentImageUri = result.uri;
                if (result.color) this._currentRGB = result.color;
                this.garbageCollect(result.id);
            } else {
                this._currentImageUri = null;
                this.garbageCollect('LOCAL');
            }
        } catch (e) {
            this._currentImageUri = null;
        }

        this._playlistUI.updateMiniArt(this._currentImageUri);
        this._updateStyles();
        this._updateBackground();
        this._checkRotationState();
    }

    _updateBackground() {
        if (!this._bgLayer) return;

        const mode = this._settings.get_string('bg-mode');
        const customColorStr = this._settings.get_string('custom-bg-color');
        const fallbackColor = (customColorStr && customColorStr.trim() !== '') ? customColorStr : '#2e3440';
        
        if (mode === 'custom') {
            this._bgLayer.set_style(`background-color: ${fallbackColor}; border-radius: 16px; min-width: 360px;`);
        } else if (mode === 'ambient') {
            let targetRGB = this._currentRGB ? this._currentRGB : '46, 52, 64';
            this._bgLayer.set_style(`background-gradient-direction: vertical; background-gradient-start: rgba(${targetRGB}, 0.95); background-gradient-end: rgba(0, 0, 0, 0.95); border-radius: 16px; min-width: 360px;`);
        } else {
            this._bgLayer.set_style(`background-color: #2e3440; border-radius: 16px; min-width: 360px;`);
        }
    }

    _buildUI() {
        this._masterContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true
        });
        this._menu.box.add_child(this._masterContainer);

        this._bgLayer = new St.Widget({
            x_expand: true,
            y_expand: true
        });
        this._masterContainer.add_child(this._bgLayer);

        this._contentBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true
        });
        this._masterContainer.add_child(this._contentBox);

        this._headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false, can_focus: false, style_class: 'popup-header-item'
        });
        this._headerItem.actor.x_align = Clutter.ActorAlign.CENTER;
        
        this.headerLabel = new St.Label({ style_class: 'popup-header-label' });
        this._headerItem.add_child(this.headerLabel);
        
        this._contentBox.add_child(this._headerItem.actor);

        this._updateHeaderText();

        this._artItem = new PopupMenu.PopupBaseMenuItem({
            reactive: true, style_class: 'album-art-item-container', can_focus: false
        });
        this._artItem.activate = () => { };
        this._artItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const contentBox = new St.BoxLayout({
            vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'art-content-box'
        });
        this._artStack = new St.Widget({
            layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true, reactive: true
        });

        this._artWrapper = new St.Bin({
            style_class: 'album-art-wrapper', x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true
        });
        this._artWrapper.set_pivot_point(0.5, 0.5);
        
        this._artIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic', style_class: 'album-art-icon',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER
        });
        this._artWrapper.set_child(this._artIcon);

        this.lyricsWidget = new LyricsWidget(300, 300);
        this.lyricsWidget.opacity = 0;
        this.lyricsWidget.visible = false;

        this.lyricsOverlayLabel = new St.Label({
            text: "Show Lyrics", style_class: 'lyrics-overlay-label', opacity: 0,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER
        });

        this._artStack.add_child(this._artWrapper);
        this._artStack.add_child(this.lyricsWidget);
        this._artStack.add_child(this.lyricsOverlayLabel);

        this._artStack.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 1 && (this._popupMode === 'normal' || this._popupMode === 'lyrics')) {
                this._toggleLyricsView();
            }
            return Clutter.EVENT_STOP;
        });

        this._artStack.connect('notify::hover', () => {
            if (this._artStack.hover) {
                this.lyricsOverlayLabel.text = this._isLyricsMode ? "Hide Lyrics" : "Show Lyrics";
                if (this._overlayTimeoutId) GLib.source_remove(this._overlayTimeoutId);
                
                this.lyricsOverlayLabel.ease({
                    opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
                
                this._overlayTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    this.lyricsOverlayLabel.ease({
                        opacity: 0, duration: 1000, mode: Clutter.AnimationMode.EASE_IN_QUAD
                    });
                    this._overlayTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                if (this._overlayTimeoutId) {
                    GLib.source_remove(this._overlayTimeoutId);
                    this._overlayTimeoutId = null;
                }
                this.lyricsOverlayLabel.opacity = 0;
            }
        });

        contentBox.add_child(this._artStack);

        const textBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'text-info-box' });
        
        this.titleLabel = new St.Label({ style_class: 'track-title-label', x_align: Clutter.ActorAlign.CENTER });
        this.titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        
        this.detailsLabel = new St.Label({ style_class: 'track-artist-label', x_align: Clutter.ActorAlign.CENTER });
        this.detailsLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        textBox.add_child(this.titleLabel);
        textBox.add_child(this.detailsLabel);
        contentBox.add_child(textBox);

        this._artItem.add_child(contentBox);
        this._contentBox.add_child(this._artItem.actor);

        this._sliderItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: false, style_class: 'slider-item' });
        this._sliderItem.activate = () => { };
        
        const sliderBox = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'popup-slider-box' });
        const timeBox = new St.BoxLayout({ x_expand: true, style_class: 'popup-time-box', y_align: Clutter.ActorAlign.CENTER });
        const elapsedBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        
        this.elapsedLabel = new St.Label({ text: '0:00', style_class: 'time-label' });
        elapsedBox.add_child(this.elapsedLabel);

        const spacer = new St.Widget({ x_expand: true });
        const plusBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style_class: 'popup-time-inner-box' });

        this.likedBtn = new St.Button({
            child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', icon_size: 14 }),
            style_class: 'playlist-icon-btn btn-pink-hover',
            reactive: true,
            track_hover: true
        });
        
        this.likedBtn.connect('clicked', () => {
            if (!this._lastTrackInfo) return;
            const nowLiked = this._playlistManager.toggleLike(this._lastTrackInfo);
            this._currentLiked = nowLiked;
            this._updateLikedBtnStyle();
            if (this._popupMode === 'liked') this._playlistUI.setMode('liked');
        });
        
        this.likedBtn.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 3) {
                this.setPopupMode('liked');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.addPlaylistBtn = new St.Button({
            child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 14 }),
            style_class: 'playlist-icon-btn btn-green-hover',
            reactive: true,
            track_hover: true
        });
        
        this.addPlaylistBtn.connect('clicked', () => {
            if (this._popupMode === 'playlist' || this._popupMode === 'liked') {
                this.setPopupMode('normal');
            } else {
                this.setPopupMode('playlist');
            }
        });

        plusBox.add_child(this.likedBtn);
        plusBox.add_child(this.addPlaylistBtn);

        const totalBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style_class: 'popup-total-box' });
        this.totalLabel = new St.Label({ text: '0:00', style_class: 'time-label' });
        totalBox.add_child(this.totalLabel);

        timeBox.add_child(elapsedBox);
        timeBox.add_child(spacer);
        timeBox.add_child(plusBox);
        timeBox.add_child(totalBox);

        this.slider = new MediaSlider((val) => this._callbacks.seek(val), this.elapsedLabel, this._settings);
        
        sliderBox.add_child(timeBox);
        sliderBox.add_child(this.slider);
        this._sliderItem.add_child(sliderBox);
        
        this._playlistItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        this._playlistItem.actor.add_child(this._playlistUI.container);
        
        this._contentBox.add_child(this._playlistItem.actor);
        this._contentBox.add_child(this._sliderItem.actor);
        
        this._buildControls();
        
        this._playlistItem.actor.hide();
        this._updateStyles();
        this._updateIconSizes();
    }

    triggerNext() {
        if (this._queueManager && this._queueManager.isActive) {
            this._queueManager.next();
        } else {
            this._callbacks.next();
        }
        this.resetPosition();
    }

    triggerPrev() {
        if (this._queueManager && this._queueManager.isActive) {
            this._queueManager.prev();
        } else {
            this._callbacks.prev();
        }
        this.resetPosition();
    }

    triggerShuffle() {
        if (this._queueManager && this._queueManager.isActive) {
            this._queueManager.toggleShuffle();
            this.updateControls(this._lastTrackInfo);
        } else {
            this._callbacks.shuffle();
        }
    }

    triggerRepeat() {
        if (this._queueManager && this._queueManager.isActive) {
            this._queueManager.toggleRepeat();
            this.updateControls(this._lastTrackInfo);
        } else {
            this._callbacks.repeat();
        }
    }

    _buildControls() {
        this._controlItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: false, style_class: 'media-controls-item' });
        this._controlItem.activate = () => { };
        this._controlItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const box = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER, style_class: 'media-controls-box' });

        const createBtn = (iconName, cb, styleClass) => {
            const icon = new St.Icon({ icon_name: iconName });
            const btn = new St.Button({
                child: icon,
                style_class: `popup-control-btn ${styleClass}`,
                x_expand: false,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                reactive: true,
                can_focus: true,
                button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO
            });
            btn.connect('clicked', cb);
            return { btn, icon };
        };

        this.shuffle = createBtn('media-playlist-shuffle-symbolic', () => this.triggerShuffle(), 'small-control-btn');
        this.prev = createBtn('media-skip-backward-symbolic', () => this.triggerPrev(), 'small-control-btn');
        this.play = createBtn('media-playback-start-symbolic', () => this._callbacks.playPause(), 'large-control-btn');
        this.next = createBtn('media-skip-forward-symbolic', () => this.triggerNext(), 'small-control-btn');
        this.repeat = createBtn('media-playlist-repeat-symbolic', () => this.triggerRepeat(), 'small-control-btn');

        this.controlIcons = [this.shuffle.icon, this.prev.icon, this.play.icon, this.next.icon, this.repeat.icon];
        this.playIcon = this.play.icon;
        this.shuffleBtn = this.shuffle.btn;
        this.repeatIcon = this.repeat.icon;
        this.repeatBtn = this.repeat.btn;

        box.add_child(this.shuffle.btn);
        box.add_child(this.prev.btn);
        box.add_child(this.play.btn);
        box.add_child(this.next.btn);
        box.add_child(this.repeat.btn);
        this._controlItem.add_child(box);
        this._contentBox.add_child(this._controlItem.actor);
    }

    _updateIconSizes() {
        let baseSize = 18;
        try {
            baseSize = this._settings.get_int('popup-icon-size');
        } catch (e) { }
        
        if (baseSize > 32) baseSize = 32;

        this.shuffle.icon.set_icon_size(baseSize);
        this.prev.icon.set_icon_size(baseSize + 4);
        this.next.icon.set_icon_size(baseSize + 4);
        this.repeat.icon.set_icon_size(baseSize);
        this.play.icon.set_icon_size(Math.floor(baseSize * 1.6));
    }

    _toggleLyricsView() {
        this._isLyricsMode = !this._isLyricsMode;
        this._popupMode = this._isLyricsMode ? 'lyrics' : 'normal';
        const duration = 500;

        if (this._isLyricsMode) {
            this._freezeAnimation();
            this.lyricsWidget.show();
            this.lyricsWidget.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this._artWrapper.ease({
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onComplete: () => this._artWrapper.hide()
            });

            if (this._lastTrackInfo) this._fetchLyrics(this._lastTrackInfo);
            this._manageLyricsTimer();
        } else {
            this._artWrapper.show();
            this._artWrapper.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this.lyricsWidget.ease({
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onComplete: () => this.lyricsWidget.hide()
            });

            this._removeLyricsTimer();
            this._checkRotationState();
        }
    }

    setPopupMode(mode) {
        this._popupMode = mode;
        if (mode === 'playlist' || mode === 'liked') {
            if (this._isLyricsMode) this._toggleLyricsView();
            this._playlistUI.setMode(mode);
            this._updatePlaylistPagesVisibility(true);
        } else {
            this._isLyricsMode = false;
            this.lyricsWidget.hide();
            this.lyricsWidget.opacity = 0;
            this._artWrapper.show();
            this._artWrapper.opacity = 255;
            this._checkRotationState();
            this._updatePlaylistPagesVisibility(false);
        }
    }

    _updatePlaylistPagesVisibility(isListMode) {
        if (isListMode) {
            this._artItem.actor.hide();
            this._playlistItem.actor.show();
            this._sliderItem.actor.show();
            this._controlItem.actor.show();
        } else {
            this._playlistItem.actor.hide();
            this._artItem.actor.show();
            this._sliderItem.actor.show();
            this._controlItem.actor.show();
        }
    }

    _openUri(spotifyUri) {
        if (!spotifyUri) return;
        try {
            let finalUri = spotifyUri;
            if (finalUri.startsWith('/com/')) {
                finalUri = finalUri.replace('/com/spotify/track/', 'spotify:track:');
            }
            Gio.DBus.session.call(
                'org.mpris.MediaPlayer2.spotify',
                '/org/mpris/MediaPlayer2',
                'org.mpris.MediaPlayer2.Player',
                'OpenUri',
                GLib.Variant.new('(s)', [finalUri]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null
            );
        } catch (e) {
            console.error("OpenUri Error:", e);
        }
    }

    _updateLikedBtnStyle() {
        if (!this.likedBtn) return;
        if (this._currentLiked) {
            this.likedBtn.add_style_class_name('liked-btn-active');
        } else {
            this.likedBtn.remove_style_class_name('liked-btn-active');
        }
    }

    _updateHeaderText() {
        if (this.headerLabel) {
            this.headerLabel.set_text(this._settings.get_string('custom-header-text') || 'Spotify');
        }
    }

    _manageLyricsTimer() {
        if (this._isLyricsMode && this._isPlaying && this._menu.isOpen) {
            if (!this._lyricsTimerId) {
                this._lyricsTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._onLyricsTick();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        } else {
            this._removeLyricsTimer();
        }
    }

    _removeLyricsTimer() {
        if (this._lyricsTimerId) {
            GLib.source_remove(this._lyricsTimerId);
            this._lyricsTimerId = null;
        }
    }

    _onLyricsTick() {
        if (this.lyricsWidget && this.slider && this.slider._position !== undefined) {
            this.lyricsWidget.updatePosition(this.slider._position * 1000);
        }
    }

    async _fetchLyrics(info) {
        if (!info) return;
        const requestTrackId = info.title + info.artist;
        if (this._currentLyricsData && this._currentLyricsData.id === requestTrackId) return;

        this._currentLyricsData = { id: requestTrackId };
        this.lyricsWidget.showLoading();

        const durationSec = info.length ? info.length / 1000000 : 0;
        const lyrics = await this._lyricsClient.getLyrics(info.title, info.artist, info.album, durationSec);

        const currentPlayingId = this._lastTrackInfo ? (this._lastTrackInfo.title + this._lastTrackInfo.artist) : null;
        if (requestTrackId !== currentPlayingId) return;

        if (lyrics && lyrics.length > 0) {
            this.lyricsWidget.setLyrics(lyrics);
        } else {
            this.lyricsWidget.showEmpty();
        }
    }

    syncPosition(posMicro) {
        this.slider.syncPosition(posMicro);
        if (this._isLyricsMode && this.lyricsWidget) {
            this.lyricsWidget.updatePosition(posMicro / 1000);
        }
    }
    
    resetPosition() {
        this.slider.resetToZero();
    }

    _checkRotationState() {
        if (!this._artWrapper || this._isLyricsMode) return;
        
        const radius = this._settings.get_int('cover-art-radius');
        let speedVal = 0;
        try {
            speedVal = this._settings.get_int('art-rotate-speed');
        } catch (e) { }

        if (radius < 170 || speedVal <= 0) {
            this._resetAnimation();
            return;
        }
        
        if (!this._menu.isOpen) {
            this._freezeAnimation();
            return;
        }
        
        if (this._isPlaying) {
            this._startSpinning(speedVal);
        } else {
            this._freezeAnimation();
        }
    }

    _resetAnimation() {
        if (!this._artWrapper) return;
        this._artWrapper.remove_transition('rotate-infinite');
        this._artWrapper.rotation_angle_z = 0;
    }
    
    _freezeAnimation() {
        if (!this._artWrapper) return;
        const currentAngle = this._artWrapper.rotation_angle_z;
        this._artWrapper.remove_transition('rotate-infinite');
        this._artWrapper.rotation_angle_z = currentAngle;
    }

    _startSpinning(speedVal) {
        if (!this._artWrapper) return;
        
        this._artWrapper.set_pivot_point(0.5, 0.5);
        this._artWrapper.reactive = true;
        const duration = (60 / speedVal) * 1000;
        const existing = this._artWrapper.get_transition('rotate-infinite');
        
        if (existing && Math.abs(existing.get_duration() - duration) < 50) return;
        
        this._artWrapper.remove_transition('rotate-infinite');

        let currentAngle = this._artWrapper.rotation_angle_z % 360;
        this._artWrapper.rotation_angle_z = currentAngle;
        
        const transition = new Clutter.PropertyTransition({
            property_name: 'rotation-angle-z',
            interval: new Clutter.Interval({
                value_type: GObject.TYPE_DOUBLE,
                initial: currentAngle,
                final: currentAngle + 360
            }),
            duration: duration,
            progress_mode: Clutter.AnimationMode.LINEAR,
            repeat_count: -1
        });
        
        this._artWrapper.add_transition('rotate-infinite', transition);
    }

    _updateStyles() {
        const s = this._settings;
        const getInt = (k, def = 0) => { try { return s.get_int(k); } catch (e) { return def; } };
        const getStr = (k, def = '#ffffff') => { try { return s.get_string(k); } catch (e) { return def; } };

        this._updateIconSizes();

        this._artItem.set_style(`padding: ${getInt('art-pad-top')}px ${getInt('art-pad-right')}px ${getInt('art-pad-bottom')}px ${getInt('art-pad-left')}px !important;`);
        
        const textBox = this.titleLabel.get_parent();
        if (textBox) {
            textBox.set_style(`margin: ${getInt('text-margin-top')}px ${getInt('text-margin-right')}px ${getInt('text-margin-bottom')}px ${getInt('text-margin-left')}px !important;`);
        }
        
        const sliderPadTop = getInt('slider-pad-top');
        const isListMode = this._popupMode === 'playlist' || this._popupMode === 'liked';
        const sliderTopPad = isListMode ? Math.max(sliderPadTop, 12) : sliderPadTop;
        
        this._sliderItem.set_style(`padding: ${sliderTopPad}px ${getInt('slider-pad-right')}px ${getInt('slider-pad-bottom')}px ${getInt('slider-pad-left')}px !important;`);
        this._controlItem.set_style(`padding: ${getInt('ctrl-pad-top')}px ${getInt('ctrl-pad-right')}px ${getInt('ctrl-pad-bottom')}px ${getInt('ctrl-pad-left')}px !important;`);

        const btnColor = getStr('popup-button-color');
        const artSize = getInt('cover-art-size', 300);
        const radius = getInt('cover-art-radius', 16);

        const headerFont = getStr('custom-font-family');
        const headerSize = getInt('header-font-size', 12);
        const headerColor = getStr('header-text-color', '#ffffff');
        const headerFontCSS = headerFont ? `font-family: '${headerFont}';` : '';
        this.headerLabel.style = `color: ${headerColor}; font-size: ${headerSize}pt; ${headerFontCSS}`;

        if (this.lyricsWidget) {
            this.lyricsWidget.set_width(artSize);
            this.lyricsWidget.set_height(artSize);
            this.lyricsWidget.updateAppearance({
                activeColorStr: getStr('lyrics-active-color'),
                neighborColorStr: getStr('lyrics-neighbor-color'),
                inactiveColorStr: getStr('lyrics-inactive-color'),
                activeSize: getInt('lyrics-active-size'),
                neighborSize: getInt('lyrics-neighbor-size'),
                inactiveSize: getInt('lyrics-inactive-size'),
                spacing: getInt('lyrics-line-spacing')
            });
        }

        if (this._artWrapper) {
            let wrapperStyle = `width: ${artSize}px; height: ${artSize}px; border-radius: ${radius}px; box-shadow: none;`;
            if (this._currentImageUri) {
                wrapperStyle += `background-image: url("${this._currentImageUri}"); background-size: cover; background-position: center;`;
                this._artIcon.visible = false;
            } else {
                wrapperStyle += `background-image: none;`;
                this._artIcon.visible = true;
                this._artIcon.set_icon_size(artSize / 2);
            }
            this._artWrapper.style = wrapperStyle;
        }

        this._playlistUI.updateStyles(artSize);

        this.controlIcons.forEach(icon => {
            icon.style = (icon === this.playIcon) ? "color: var(--color-play-btn-icon) !important;" : `color: ${btnColor};`;
        });
        
        const fontCSS = headerFont ? `font-family: '${headerFont}';` : '';
        const alignStyle = `width: ${artSize}px; text-align: center;`;
        
        this.titleLabel.style = `color: ${getStr('title-text-color')}; font-size: ${getInt('title-font-size')}pt; ${fontCSS} ${alignStyle}`;
        this.detailsLabel.style = `color: ${getStr('artist-text-color')}; font-size: ${getInt('artist-font-size')}pt; ${fontCSS} ${alignStyle}`;
        
        const timeStyle = `color: ${getStr('time-text-color')}; font-size: ${getInt('time-font-size')}pt; ${fontCSS}`;
        this.elapsedLabel.style = timeStyle;
        this.totalLabel.style = timeStyle;
    }

    _formatTime(microseconds) {
        if (microseconds === undefined || microseconds === null || microseconds < 0) return '0:00';
        let totalSeconds = Math.floor(microseconds / 1000000);
        let mins = Math.floor(totalSeconds / 60);
        let secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateControls(info) {
        if (!info) return;
        
        this._lastTrackInfo = info;
        const nowLiked = this._playlistManager.isLiked(info);
        
        if (this._currentLiked !== nowLiked) {
            this._currentLiked = nowLiked;
            this._updateLikedBtnStyle();
        }

        const currentHash = info.title + info.artist;
        if (this._firstSyncHash !== currentHash) {
            if (info.position > 1000 || (info.position === 0 && info.status !== 'Playing')) {
                this.syncPosition(info.position);
                this._firstSyncHash = currentHash;
            }
        }

        this.titleLabel.set_text(info.title || 'Unknown Title');
        
        const artist = info.artist || 'Unknown Artist';
        let album = info.album;
        
        if (!album || album === 'Unknown Album' || album === '') {
            album = null;
        } else if (album.length > 30) {
            album = album.substring(0, 30) + '...';
        }
        
        this.detailsLabel.set_text(album ? `${artist} / ${album}` : artist);

        const isPlaying = info.status === 'Playing' || info.status === 'playing';
        if (this._isPlaying !== isPlaying) {
            this._isPlaying = isPlaying;
            this._checkRotationState();
            this._manageLyricsTimer();
        }

        this.playIcon.icon_name = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        
        let isShuffle = info.shuffle;
        let loopStatus = info.loopStatus;

        if (this._queueManager && this._queueManager.isActive) {
            isShuffle = this._queueManager.shuffleMode;
            loopStatus = this._queueManager.repeatMode;
        }

        this.shuffleBtn.opacity = isShuffle ? 255 : 120;
        
        if (loopStatus === 'Track') {
            this.repeatIcon.icon_name = 'media-playlist-repeat-song-symbolic';
            this.repeatBtn.opacity = 255;
        } else {
            this.repeatIcon.icon_name = 'media-playlist-repeat-symbolic';
            this.repeatBtn.opacity = loopStatus === 'Playlist' ? 255 : 120;
        }

        if (info.length > 0) {
            this.totalLabel.text = this._formatTime(info.length);
            this.slider.updateMetadata(info.length, info.rate || 1.0, info.trackId, isPlaying, info.position);
        } else {
            this.totalLabel.text = '0:00';
            this.slider.updateMetadata(1, 1.0, null, false, 0);
        }

        if (this._isLyricsMode) this._fetchLyrics(info);
    }

    _extractColor(pixbuf) {
        try {
            const scaled = pixbuf.scale_simple(1, 1, GdkPixbuf.InterpType.TILES);
            const pixels = scaled.get_pixels();
            return `${pixels[0]}, ${pixels[1]}, ${pixels[2]}`;
        } catch (e) {
            return null;
        }
    }

    async loadImage(artUrl) {
        if (!artUrl) return null;
        
        try {
            if (GLib.mkdir_with_parents(this._cacheDir, 0o755) !== 0) {
                if (!GLib.file_test(this._cacheDir, GLib.FileTest.IS_DIR)) return null;
            }
            
            const urlParts = artUrl.split('/');
            let uniqueID = urlParts[urlParts.length - 1].split('?')[0].replace(/[^a-z0-9]/gi, '_');
            
            if (!uniqueID || uniqueID.length < 2) {
                uniqueID = "image_" + Math.floor(Math.random() * 10000);
            }
            
            const fileName = `${uniqueID}.jpg`;
            const filePath = GLib.build_filenamev([this._cacheDir, fileName]);
            const file = Gio.File.new_for_path(filePath);
            
            let isLocal = artUrl.startsWith('file://');
            let fileReady = false;

            if (isLocal) {
                const localFile = Gio.File.new_for_uri(artUrl);
                if (localFile.query_exists(null)) {
                    uniqueID = 'LOCAL';
                    fileReady = true;
                }
            } else {
                if (file.query_exists(null)) {
                    fileReady = true;
                } else {
                    const msg = Soup.Message.new('GET', artUrl);
                    msg.request_headers.append('User-Agent', 'Mozilla/5.0');
                    const bytes = await this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                    
                    if (msg.status_code === 200) {
                        const [success] = file.replace_contents(bytes.get_data(), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                        if (success) fileReady = true;
                    }
                }
            }

            if (fileReady) {
                const targetFile = isLocal ? Gio.File.new_for_uri(artUrl) : file;
                let resultColor = null;
                
                try {
                    const path = targetFile.get_path();
                    if (path) {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
                        resultColor = this._extractColor(pixbuf);
                    } else {
                        const inputStream = await targetFile.read_async(null, null);
                        const pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_async(inputStream, null);
                        if (pixbuf) resultColor = this._extractColor(pixbuf);
                    }
                } catch (e) {
                    console.warn("[SpotifyController] Pixbuf load failed:", e);
                }
                
                return { uri: targetFile.get_uri(), id: uniqueID, color: resultColor };
            }
        } catch (e) {
            console.warn(`[SpotifyController] loadImage Error: ${e.message}`);
        }
        return null;
    }

    garbageCollect(keepID) {
        try {
            const dir = Gio.File.new_for_path(this._cacheDir);
            if (!dir.query_exists(null)) return;
            
            const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            
            while ((info = enumerator.next_file(null))) {
                const name = info.get_name();
                if (name.endsWith('.jpg')) {
                    if (keepID && name === `${keepID}.jpg`) continue;
                    const child = dir.get_child(name);
                    try {
                        child.delete(null);
                    } catch (e) { }
                }
            }
        } catch (e) { }
    }

    hasLyrics() {
        return this.lyricsWidget && this.lyricsWidget._state === 'lyrics';
    }
    
    forceLyricsView(show) {
        if (show && !this._isLyricsMode && this.hasLyrics()) {
            this._toggleLyricsView();
        } else if (!show && this._isLyricsMode) {
            this._toggleLyricsView();
        }
    }

    destroy() {
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }
        if (this._overlayTimeoutId) {
            GLib.source_remove(this._overlayTimeoutId);
            this._overlayTimeoutId = null;
        }
        
        this._removeLyricsTimer();
        
        if (this._lyricsClient) {
            this._lyricsClient.destroy();
        }
        
        this._headerItem.destroy();
        this._artItem.destroy();
        this._controlItem.destroy();
        this._sliderItem.destroy();
        this._playlistItem.destroy();
        this.garbageCollect(null);
    }
}