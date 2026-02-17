import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import { MediaSlider } from './slider.js';
import { LyricsWidget } from './LyricsWidget.js';
import { LyricsClient } from '../core/LyricsClient.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

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

        this._lyricsClient = new LyricsClient();
        this._isLyricsMode = false;
        this._currentLyricsData = null;
        this._lyricsTimerId = null;
        this._overlayTimeoutId = null;

        this._httpSession = new Soup.Session();
        this._httpSession.timeout = 10;
        this._httpSession.user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';

        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "spotify-controller-art"]);
        if (GLib.mkdir_with_parents(this._cacheDir, 0o755) === -1) { }

        this._buildUI();

        // Listen for all style changes
        const styleKeys = [
            'popup-button-color', 'time-text-color', 'title-text-color', 'artist-text-color',
            'custom-font-family', 'title-font-size', 'artist-font-size', 'time-font-size',
            'cover-art-size', 'popup-icon-size',
            'art-pad-top', 'art-pad-bottom', 'art-pad-left', 'art-pad-right',
            'text-margin-top', 'text-margin-bottom', 'text-margin-left', 'text-margin-right',
            'slider-pad-top', 'slider-pad-bottom', 'slider-pad-left', 'slider-pad-right',
            'ctrl-pad-top', 'ctrl-pad-bottom', 'ctrl-pad-left', 'ctrl-pad-right',
            'header-font-size', 'header-text-color',
            'lyrics-active-color', 'lyrics-neighbor-color', 'lyrics-inactive-color',
            'lyrics-active-size', 'lyrics-neighbor-size', 'lyrics-inactive-size', 'lyrics-line-spacing'
        ];

        styleKeys.forEach(key => {
            if (this._settings) this._settings.connect(`changed::${key}`, () => this._updateStyles());
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

        if (this._currentTrackHash !== newHash) {
            this._resetAnimation();
            this._currentLyricsData = null;
            if (this._isLyricsMode) this._fetchLyrics(info);
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

        this._updateStyles();
        this._updateBackground();
        this._checkRotationState();
    }

    _updateBackground() {
        const mode = this._settings.get_string('bg-mode');
        let fallbackColor = this._settings.get_string('custom-bg-color') || '#2e3440';
        let style = `border-radius: 16px; box-shadow: none; background-color: ${fallbackColor};`;

        if (mode === 'custom') {
            const color = this._settings.get_string('custom-bg-color');
            style = `border-radius: 16px; box-shadow: none; background-color: ${color};`;
        } else if (mode === 'ambient' && this._currentRGB) {
            style = `
                border-radius: 16px; box-shadow: none;
                background-gradient-direction: vertical;
                background-gradient-start: rgba(${this._currentRGB}, 0.95);
                background-gradient-end: rgba(0, 0, 0, 0.95);
            `;
        }
        this._menu.box.style = style;
    }

    _buildUI() {
        // --- HEADER ---
        this._headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'popup-header-item'
        });
        
        this.headerLabel = new St.Label({
            text: this._settings.get_string('custom-header-text') || 'Spotify',
            style_class: 'popup-header-label',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this._headerItem.actor.add_child(this.headerLabel);
        this._menu.addMenuItem(this._headerItem);

        // --- ART ---
        this._artItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false, style_class: 'album-art-item-container', can_focus: false
        });
        this._artItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const contentBox = new St.BoxLayout({
            vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'art-content-box'
        });

        this._artStack = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true, y_expand: true, reactive: true, 
        });

        this._artWrapper = new St.Bin({
            style_class: 'album-art-wrapper',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            x_expand: true, y_expand: true,
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
            text: "Show Lyrics", style_class: 'lyrics-overlay-label', 
            opacity: 0, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        });

        this._artStack.add_child(this._artWrapper);
        this._artStack.add_child(this.lyricsWidget);
        this._artStack.add_child(this.lyricsOverlayLabel);

        this._artStack.connect('button-release-event', () => {
            this._toggleLyricsView();
            return Clutter.EVENT_STOP;
        });

        this._artStack.connect('notify::hover', () => {
            if (this._artStack.hover) {
                this.lyricsOverlayLabel.text = this._isLyricsMode ? "Hide Lyrics" : "Show Lyrics";
                if (this._overlayTimeoutId) GLib.source_remove(this._overlayTimeoutId);
                this.lyricsOverlayLabel.ease({ opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                this._overlayTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    this.lyricsOverlayLabel.ease({ opacity: 0, duration: 1000, mode: Clutter.AnimationMode.EASE_IN_QUAD });
                    this._overlayTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                if (this._overlayTimeoutId) { GLib.source_remove(this._overlayTimeoutId); this._overlayTimeoutId = null; }
                this.lyricsOverlayLabel.opacity = 0;
            }
        });

        contentBox.add_child(this._artStack);

        const textBox = new St.BoxLayout({
            vertical: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'text-info-box'
        });

        this.titleLabel = new St.Label({ style_class: 'track-title-label', x_align: Clutter.ActorAlign.CENTER });
        this.titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.detailsLabel = new St.Label({ style_class: 'track-artist-label', x_align: Clutter.ActorAlign.CENTER });
        this.detailsLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        textBox.add_child(this.titleLabel);
        textBox.add_child(this.detailsLabel);
        contentBox.add_child(textBox);

        this._artItem.add_child(contentBox);
        this._menu.addMenuItem(this._artItem);

        this._sliderItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'slider-item' });
        const sliderBox = new St.BoxLayout({ vertical: true, x_expand: true });
        const timeBox = new St.BoxLayout({ x_expand: true, style_class: 'time-box' });
        this.elapsedLabel = new St.Label({ text: '0:00', style_class: 'time-label' });
        const spacer = new St.Widget({ x_expand: true });
        this.totalLabel = new St.Label({ text: '0:00', style_class: 'time-label' });

        timeBox.add_child(this.elapsedLabel);
        timeBox.add_child(spacer);
        timeBox.add_child(this.totalLabel);
        this.slider = new MediaSlider((val) => this._callbacks.seek(val), this.elapsedLabel, this._settings);

        sliderBox.add_child(timeBox);
        sliderBox.add_child(this.slider);
        this._sliderItem.add_child(sliderBox);
        this._menu.addMenuItem(this._sliderItem);

        this._buildControls();
        this._updateStyles();
        this._updateIconSizes();
    }

    _buildControls() {
        this._controlItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false, can_focus: false, style_class: 'media-controls-item'
        });
        this._controlItem.actor.x_align = Clutter.ActorAlign.CENTER;

        const box = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER, style_class: 'media-controls-box'
        });

        const createBtn = (iconName, cb, styleClass) => {
            const icon = new St.Icon({ icon_name: iconName });
            const btn = new St.Button({
                child: icon, style_class: `popup-control-btn ${styleClass}`,
                x_expand: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                reactive: true, can_focus: true, button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO
            });
            btn.connect('clicked', cb);
            return { btn, icon };
        };

        this.shuffle = createBtn('media-playlist-shuffle-symbolic', () => this._callbacks.shuffle(), 'small-control-btn');
        this.prev = createBtn('media-skip-backward-symbolic', () => { this._callbacks.prev(); this.resetPosition(); }, 'small-control-btn');
        this.play = createBtn('media-playback-start-symbolic', () => this._callbacks.playPause(), 'large-control-btn');
        this.next = createBtn('media-skip-forward-symbolic', () => { this._callbacks.next(); this.resetPosition(); }, 'small-control-btn');
        this.repeat = createBtn('media-playlist-repeat-symbolic', () => this._callbacks.repeat(), 'small-control-btn');

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
        this._menu.addMenuItem(this._controlItem);
    }

    _updateIconSizes() {
        let baseSize = 24;
        try { baseSize = this._settings.get_int('popup-icon-size'); } catch (e) { }
        if (baseSize > 32) baseSize = 32;

        this.shuffle.icon.set_icon_size(baseSize);
        this.prev.icon.set_icon_size(baseSize + 4);
        this.next.icon.set_icon_size(baseSize + 4);
        this.repeat.icon.set_icon_size(baseSize);
        const playSize = Math.floor(baseSize * 1.6);
        this.play.icon.set_icon_size(playSize);
    }

    _toggleLyricsView() {
        this._isLyricsMode = !this._isLyricsMode;
        const duration = 500;

        if (this._isLyricsMode) {
            this._freezeAnimation(); 
            this.lyricsWidget.show();
            this.lyricsWidget.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this._artWrapper.ease({ 
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._artWrapper.hide()
            });

            if (this._lastTrackInfo) this._fetchLyrics(this._lastTrackInfo);
            this._manageLyricsTimer();
        } else {
            this._artWrapper.show();
            this._artWrapper.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            this.lyricsWidget.ease({ 
                opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.lyricsWidget.hide()
            });

            this._removeLyricsTimer();
            this._checkRotationState();
        }
    }

    _updateHeaderText() {
        if (this.headerLabel) {
            const text = this._settings.get_string('custom-header-text');
            this.headerLabel.set_text(text || 'Spotify');
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
        if (this.lyricsWidget && this.slider) {
            const posSeconds = this.slider._position; 
            if (posSeconds !== undefined) {
                this.lyricsWidget.updatePosition(posSeconds * 1000);
            }
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
        if (this._isLyricsMode && this.lyricsWidget) this.lyricsWidget.updatePosition(posMicro/1000);
    }

    _checkRotationState() {
        if (!this._artWrapper || this._isLyricsMode) return;

        const radius = this._settings.get_int('cover-art-radius');
        let speedVal = 0;
        try { speedVal = this._settings.get_int('art-rotate-speed'); } catch (e) { }
        
        
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

        // Check duplicate transition
        const existing = this._artWrapper.get_transition('rotate-infinite');
        if (existing) {
             if (Math.abs(existing.get_duration() - duration) < 50) return; 
             this._artWrapper.remove_transition('rotate-infinite');
        }

        let currentAngle = this._artWrapper.rotation_angle_z % 360;
        this._artWrapper.rotation_angle_z = currentAngle;

        // Explicit Clutter Transition
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
        const getInt = (k, def = 0) => { try { return s.get_int(k); } catch(e) { return def; } };
        const getStr = (k, def = '#ffffff') => { try { return s.get_string(k); } catch(e) { return def; } };

        this._updateIconSizes();

        // Padding application
        this._artItem.set_style(`padding: ${getInt('art-pad-top')}px ${getInt('art-pad-right')}px ${getInt('art-pad-bottom')}px ${getInt('art-pad-left')}px !important;`);
        const textBox = this.titleLabel.get_parent();
        if (textBox) textBox.set_style(`margin: ${getInt('text-margin-top')}px ${getInt('text-margin-right')}px ${getInt('text-margin-bottom')}px ${getInt('text-margin-left')}px !important;`);
        this._sliderItem.set_style(`padding: ${getInt('slider-pad-top')}px ${getInt('slider-pad-right')}px ${getInt('slider-pad-bottom')}px ${getInt('slider-pad-left')}px !important;`);
        this._controlItem.set_style(`padding: ${getInt('ctrl-pad-top')}px ${getInt('ctrl-pad-right')}px ${getInt('ctrl-pad-bottom')}px ${getInt('ctrl-pad-left')}px !important;`);

        const btnColor = getStr('popup-button-color');
        const artSize = getInt('cover-art-size', 300);
        const radius = getInt('cover-art-radius', 16);

        // Header Styling
        const headerFont = getStr('custom-font-family');
        const headerSize = getInt('header-font-size', 12);
        const headerColor = getStr('header-text-color', '#ffffff');
        const headerFontCSS = headerFont ? `font-family: '${headerFont}';` : '';
        this.headerLabel.style = `color: ${headerColor}; font-size: ${headerSize}pt; ${headerFontCSS}`;

        // Lyrics Widget Configuration update
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

        this.controlIcons.forEach(icon => {
            icon.style = (icon === this.playIcon) ? "color: #000000 !important;" : `color: ${btnColor};`;
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

        this.titleLabel.set_text(info.title || 'Unknown Title');
        const artist = info.artist || 'Unknown Artist';
        let album = info.album;
        if (!album || album === 'Unknown Album' || album === '') album = null;
        else if (album.length > 30) album = album.substring(0, 30) + '...';
        const subText = album ? `${artist} / ${album}` : artist;
        this.detailsLabel.set_text(subText);

        const isPlaying = info.status === 'Playing' || info.status === 'playing';
        if (this._isPlaying !== isPlaying) {
            this._isPlaying = isPlaying;
            this._checkRotationState();
            this._manageLyricsTimer();
        }

        this.playIcon.icon_name = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this.shuffleBtn.opacity = info.shuffle ? 255 : 120;
        if (info.loopStatus === 'Track') {
            this.repeatIcon.icon_name = 'media-playlist-repeat-song-symbolic';
            this.repeatBtn.opacity = 255;
        } else {
            this.repeatIcon.icon_name = 'media-playlist-repeat-symbolic';
            this.repeatBtn.opacity = info.loopStatus === 'Playlist' ? 255 : 120;
        }

        if (info.length > 0) {
            this.totalLabel.text = this._formatTime(info.length);
            this.slider.updateMetadata(info.length, info.rate || 1.0, info.trackId, isPlaying, info.position);
        } else {
            this.totalLabel.text = '0:00';
            this.slider.updateMetadata(1, 1.0, null, false, 0);
        }
        
        if (this._isLyricsMode) {
             this._fetchLyrics(info);
        }
    }

    syncPosition(position) { this.slider.syncPosition(position); if(this._isLyricsMode && this.lyricsWidget) this.lyricsWidget.updatePosition(position/1000); }
    resetPosition() { this.slider.resetToZero(); }

    _extractColor(pixbuf) {
        try {
            const scaled = pixbuf.scale_simple(1, 1, GdkPixbuf.InterpType.TILES);
            const pixels = scaled.get_pixels();
            return `${pixels[0]}, ${pixels[1]}, ${pixels[2]}`;
        } catch (e) { return null; }
    }

    async loadImage(artUrl) {
        if (!artUrl) return null;

        try {
            // 1. Ensure Cache Directory
            if (GLib.mkdir_with_parents(this._cacheDir, 0o755) !== 0) {
                 if (!GLib.file_test(this._cacheDir, GLib.FileTest.IS_DIR)) return null;
            }

            // 2. Prepare Filename
            const urlParts = artUrl.split('/');
            let uniqueID = urlParts[urlParts.length - 1].split('?')[0].replace(/[^a-z0-9]/gi, '_');
            if (!uniqueID || uniqueID.length < 2) uniqueID = "image_" + Math.floor(Math.random() * 10000);

            const fileName = `${uniqueID}.jpg`;
            const filePath = GLib.build_filenamev([this._cacheDir, fileName]);
            const file = Gio.File.new_for_path(filePath);
            
            let isLocal = artUrl.startsWith('file://');
            let fileReady = false;

            // 3. Download or Verify Existence
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

            // 4. Extract Color & Return
            if (fileReady) {
                const targetFile = isLocal ? Gio.File.new_for_uri(artUrl) : file;
                let resultColor = null;

                try {
                    // Try Synchronous Load (More Reliable for Local Files)
                    const path = targetFile.get_path();
                    if (path) {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
                        resultColor = this._extractColor(pixbuf);
                    } else {
                        // Fallback for URIs without paths
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
                    // Delete old files
                    const child = dir.get_child(name);
                    try { child.delete(null); } catch(e) {}
                }
            }
        } catch (e) { }
    }

    destroy() {
        if (this._httpSession) { this._httpSession.abort(); this._httpSession = null; }
        if (this._overlayTimeoutId) {
            GLib.source_remove(this._overlayTimeoutId);
            this._overlayTimeoutId = null;
        }
        this._removeLyricsTimer();
        
        if (this._lyricsClient) {
            this._lyricsClient.destroy();
        }

        this._artItem.destroy();
        this._controlItem.destroy();
        this._sliderItem.destroy();
        this.garbageCollect(null);
    }
}