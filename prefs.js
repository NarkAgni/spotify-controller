import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Pango from 'gi://Pango';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SpotifyControllerPrefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.search_enabled = true;

        const createResetBtn = this._makeResetBtn(settings);
        const createGroupReset = this._makeGroupResetBtn(settings);
        this._buildGeneralPage(window, settings, createResetBtn);
        this._buildVisualsPage(window, settings, createResetBtn, createGroupReset);
        this._buildPaddingsPage(window, settings, createResetBtn, createGroupReset);
        this._buildAboutPage(window);
    }

    _makeResetBtn(settings) {
        return (key) => {
            const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            const divider = new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL });
            divider.set_margin_top(12);
            divider.set_margin_bottom(12);
            box.append(divider);

            const btn = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular'],
                tooltip_text: 'Reset to default'
            });

            const update = () => {
                const isDefault = settings.get_value(key).equal(settings.get_default_value(key));
                btn.set_sensitive(!isDefault);
                btn.set_opacity(isDefault ? 0.3 : 1.0);
            };

            btn.connect('clicked', () => settings.reset(key));
            settings.connect(`changed::${key}`, update);
            update();

            box.append(btn);
            return box;
        };
    }

    _makeGroupResetBtn(settings) {
        return (keys) => {
            const btn = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular'],
                tooltip_text: 'Reset all options in this group'
            });

            const update = () => {
                let anyChanged = false;
                for (const key of keys) {
                    if (settings.settings_schema.has_key(key)) {
                        if (!settings.get_value(key).equal(settings.get_default_value(key))) {
                            anyChanged = true;
                            break;
                        }
                    }
                }
                btn.set_sensitive(anyChanged);
                btn.set_opacity(anyChanged ? 1.0 : 0.3);
            };

            btn.connect('clicked', () => {
                for (const key of keys) {
                     if (settings.settings_schema.has_key(key)) settings.reset(key);
                }
            });

            for (const key of keys) {
                 if (settings.settings_schema.has_key(key)) {
                    settings.connect(`changed::${key}`, update);
                 }
            }
            update();

            return btn;
        };
    }

    _buildGeneralPage(window, settings, createResetBtn) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        this._buildPanelLayoutGroup(page, settings, createResetBtn);
        this._buildVisibilityGroup(page, settings);
    }

    _buildPanelLayoutGroup(page, settings, createResetBtn) {
        const group = new Adw.PreferencesGroup({ title: 'Top Panel Layout' });
        page.add(group);

        const posRow = new Adw.ComboRow({
            title: 'Panel Position',
            icon_name: 'view-dual-symbolic',
            model: new Gtk.StringList({ strings: ['Left', 'Center (Before)', 'Center (After)', 'Right'] })
        });
        const posValues = ['left', 'center-before', 'center-after', 'right'];
        const currentPos = settings.get_string('position');
        posRow.selected = Math.max(0, posValues.indexOf(currentPos));
        posRow.connect('notify::selected', () => settings.set_string('position', posValues[posRow.selected]));
        group.add(posRow);

        const layoutRow = new Adw.ComboRow({
            title: 'Layout Order',
            subtitle: 'Buttons before or after the track label',
            icon_name: 'format-justify-left-symbolic',
            model: new Gtk.StringList({ strings: ['Buttons → Label', 'Label → Buttons'] })
        });
        const layoutValues = ['buttons-start', 'buttons-end'];
        const currentLayout = settings.get_string('layout-order');
        layoutRow.selected = Math.max(0, layoutValues.indexOf(currentLayout));
        layoutRow.connect('notify::selected', () => settings.set_string('layout-order', layoutValues[layoutRow.selected]));
        group.add(layoutRow);

        const spacingRow = new Adw.SpinRow({
            title: 'Button Spacing',
            icon_name: 'view-more-horizontal-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 50, step_increment: 1 })
        });
        settings.bind('button-spacing', spacingRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        spacingRow.add_suffix(createResetBtn('button-spacing'));
        group.add(spacingRow);

        const marginRow = new Adw.SpinRow({
            title: 'Label Margin',
            icon_name: 'format-indent-more-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1 })
        });
        settings.bind('label-margin', marginRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        marginRow.add_suffix(createResetBtn('label-margin'));
        group.add(marginRow);
    }

    _buildVisibilityGroup(page, settings) {
        const group = new Adw.PreferencesGroup({ title: 'Visibility Toggles' });
        page.add(group);

        const addToggle = (key, title, icon) => {
            const row = new Adw.SwitchRow({ title, icon_name: icon });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };

        addToggle('show-prev', 'Show Previous Button', 'media-skip-backward-symbolic');
        addToggle('show-play-pause', 'Show Play/Pause Button', 'media-playback-start-symbolic');
        addToggle('show-next', 'Show Next Button', 'media-skip-forward-symbolic');
        addToggle('show-panel-title', 'Show Song Title', 'text-x-generic-symbolic');
        addToggle('show-panel-artist', 'Show Artist Name', 'avatar-default-symbolic');
    }

    _buildVisualsPage(window, settings, createResetBtn, createGroupReset) {
        const page = new Adw.PreferencesPage({
            title: 'Customizations',
            icon_name: 'preferences-desktop-theme-symbolic',
        });
        window.add(page);

        this._buildHeaderGroup(page, settings, createResetBtn);
        this._buildBackgroundGroup(page, settings);

        const expanderGroup = new Adw.PreferencesGroup();
        page.add(expanderGroup);

        this._buildCoverArtGroup(expanderGroup, settings, createResetBtn, createGroupReset);
        this._buildTypographyGroup(expanderGroup, settings, createResetBtn, createGroupReset);
        this._buildLyricsGroup(expanderGroup, settings, createResetBtn, createGroupReset);
        this._buildSliderGroup(expanderGroup, settings, createResetBtn, createGroupReset);
    }

    _buildHeaderGroup(page, settings, createResetBtn) {
        const group = new Adw.PreferencesGroup({ title: 'Header Settings' });
        page.add(group);

        const headerEntry = new Adw.EntryRow({ title: 'Popup Header Text' });
        settings.bind('custom-header-text', headerEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(headerEntry);

        const headerSizeRow = new Adw.SpinRow({
            title: 'Header Font Size',
            icon_name: 'format-text-larger-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 8, upper: 30, step_increment: 1 })
        });
        settings.bind('header-font-size', headerSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        headerSizeRow.add_suffix(createResetBtn('header-font-size'));
        group.add(headerSizeRow);

        const headerColorRow = new Adw.ActionRow({
            title: 'Header Text Color',
            icon_name: 'format-text-color-symbolic',
        });
        headerColorRow.add_suffix(this._colorBtn(settings, 'header-text-color', '#ffffff'));
        group.add(headerColorRow);
    }

    _buildBackgroundGroup(page, settings) {
        const group = new Adw.PreferencesGroup({ title: 'Popup Background' });
        page.add(group);

        const bgModeRow = new Adw.ComboRow({
            title: 'Background Mode',
            icon_name: 'preferences-desktop-wallpaper-symbolic',
            model: new Gtk.StringList({ strings: ['Ambient (Cover Art)', 'Custom Color'] })
        });
        const bgModes = ['ambient', 'custom'];
        let currentMode = settings.get_string('bg-mode');
        bgModeRow.selected = Math.max(0, bgModes.indexOf(currentMode));
        group.add(bgModeRow);

        const customColorRow = new Adw.ActionRow({
            title: 'Custom Background Color',
            icon_name: 'format-fill-color-symbolic',
        });
        customColorRow.add_suffix(this._colorBtn(settings, 'custom-bg-color', '#2e3440'));
        group.add(customColorRow);

        const updateBgVisibility = () => {
            const idx = bgModeRow.selected;
            customColorRow.visible = (idx === 1);
            if (settings.get_string('bg-mode') !== bgModes[idx])
                settings.set_string('bg-mode', bgModes[idx]);
        };
        bgModeRow.connect('notify::selected', updateBgVisibility);
        updateBgVisibility();
    }

    _buildCoverArtGroup(parentGroup, settings, createResetBtn, createGroupReset) {
        const keys = ['cover-art-size', 'cover-art-radius', 'art-rotate-speed', 'popup-icon-size'];
        
        const expander = new Adw.ExpanderRow({
            title: 'Cover Art &amp; Controls',
            subtitle: 'Size, roundness, vinyl effect and button sizes',
            icon_name: 'image-x-generic-symbolic',
            show_enable_switch: false
        });
        expander.add_suffix(createGroupReset(keys));
        parentGroup.add(expander);

        const artSizeRow = new Adw.SpinRow({
            title: 'Cover Art Size (px)',
            icon_name: 'image-x-generic-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 200, upper: 500, step_increment: 10 })
        });
        settings.bind('cover-art-size', artSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        artSizeRow.add_suffix(createResetBtn('cover-art-size'));
        expander.add_row(artSizeRow);

        const radiusRow = new Adw.SpinRow({
            title: 'Corner Roundness',
            icon_name: 'object-select-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 170, step_increment: 1 })
        });
        settings.bind('cover-art-radius', radiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        radiusRow.add_suffix(createResetBtn('cover-art-radius'));
        expander.add_row(radiusRow);

        const rotateRow = new Adw.SpinRow({
            title: 'Vinyl Rotation Speed',
            subtitle: 'Visible when roundness is 170',
            icon_name: 'media-playlist-repeat-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 50, step_increment: 1 })
        });
        try { settings.bind('art-rotate-speed', rotateRow, 'value', Gio.SettingsBindFlags.DEFAULT); } catch (e) { }
        rotateRow.add_suffix(createResetBtn('art-rotate-speed'));
        expander.add_row(rotateRow);

        const updateVinyl = () => { rotateRow.visible = (radiusRow.value >= 170); };
        radiusRow.connect('notify::value', updateVinyl);
        updateVinyl();

        const btnSizeRow = new Adw.SpinRow({
            title: 'Control Button Icon Size',
            icon_name: 'view-fullscreen-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 16, upper: 32, step_increment: 1 })
        });
        settings.bind('popup-icon-size', btnSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        btnSizeRow.add_suffix(createResetBtn('popup-icon-size'));
        expander.add_row(btnSizeRow);
    }

    _buildTypographyGroup(parentGroup, settings, createResetBtn, createGroupReset) {
        const keys = [
            'custom-font-family', 
            'title-font-size', 'title-text-color', 
            'artist-font-size', 'artist-text-color', 
            'time-font-size', 'time-text-color', 
            'popup-button-color'
        ];

        const expander = new Adw.ExpanderRow({
            title: 'Fonts &amp; Text Colors',
            subtitle: 'Manage font families, sizes and colors',
            icon_name: 'preferences-desktop-font-symbolic',
            show_enable_switch: false
        });
        expander.add_suffix(createGroupReset(keys));
        parentGroup.add(expander);

        const fontRow = new Adw.ActionRow({
            title: 'Global Font Family',
            icon_name: 'preferences-desktop-font-symbolic',
        });
        const fontDialog = new Gtk.FontDialog();
        const fontBtn = new Gtk.FontDialogButton({ dialog: fontDialog, valign: Gtk.Align.CENTER });
        const savedFont = settings.get_string('custom-font-family');
        if (savedFont) {
            try { fontBtn.set_font_desc(Pango.FontDescription.from_string(savedFont)); } catch (e) { }
        }
        fontBtn.connect('notify::font-desc', () => {
            const desc = fontBtn.get_font_desc();
            if (desc) settings.set_string('custom-font-family', desc.get_family());
        });
        fontRow.add_suffix(fontBtn);
        expander.add_row(fontRow);

        const addTextRow = (title, sizeKey, colorKey, defaultColor, sizeMin, sizeMax, icon) => {
            const sizeRow = new Adw.SpinRow({
                title: `${title} Size`,
                icon_name: icon,
                adjustment: new Gtk.Adjustment({ lower: sizeMin, upper: sizeMax, step_increment: 1 })
            });
            settings.bind(sizeKey, sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
            sizeRow.add_suffix(createResetBtn(sizeKey));
            expander.add_row(sizeRow);

            const colorRow = new Adw.ActionRow({ title: `${title} Color` });
            colorRow.add_suffix(this._colorBtn(settings, colorKey, defaultColor));
            expander.add_row(colorRow);
        };

        addTextRow('Song Title', 'title-font-size', 'title-text-color', '#ffffff', 8, 40, 'format-text-bold-symbolic');
        addTextRow('Artist', 'artist-font-size', 'artist-text-color', '#cccccc', 8, 30, 'format-text-italic-symbolic');
        addTextRow('Time Duration', 'time-font-size', 'time-text-color', '#ffffff', 8, 24, 'preferences-system-time-symbolic');

        const btnColorRow = new Adw.ActionRow({
            title: 'Media Buttons Color',
            icon_name: 'media-playback-start-symbolic',
        });
        btnColorRow.add_suffix(this._colorBtn(settings, 'popup-button-color', '#ffffff'));
        expander.add_row(btnColorRow);
    }

    _buildLyricsGroup(parentGroup, settings, createResetBtn, createGroupReset) {
        const keys = [
            'lyrics-active-color', 'lyrics-active-size',
            'lyrics-neighbor-color', 'lyrics-neighbor-size',
            'lyrics-inactive-color', 'lyrics-inactive-size',
            'lyrics-line-spacing'
        ];

        const expander = new Adw.ExpanderRow({
            title: 'Lyrics Appearance',
            subtitle: 'Line sizes, colors, and spacing',
            icon_name: 'format-text-symbolic',
            show_enable_switch: false
        });
        expander.add_suffix(createGroupReset(keys));
        parentGroup.add(expander);

        const addLyricRow = (title, colorKey, sizeKey, defaultColor, sizeMin, sizeMax) => {
            const colorRow = new Adw.ActionRow({ title: `${title} Color` });
            colorRow.add_suffix(this._colorBtn(settings, colorKey, defaultColor));
            expander.add_row(colorRow);

            const sizeRow = new Adw.SpinRow({
                title: `${title} Size`,
                icon_name: 'format-text-size-symbolic',
                adjustment: new Gtk.Adjustment({ lower: sizeMin, upper: sizeMax, step_increment: 1 })
            });
            settings.bind(sizeKey, sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
            sizeRow.add_suffix(createResetBtn(sizeKey));
            expander.add_row(sizeRow);
        };

        addLyricRow('Active Line', 'lyrics-active-color', 'lyrics-active-size', '#ffffff', 10, 40);
        addLyricRow('Neighbor Line', 'lyrics-neighbor-color', 'lyrics-neighbor-size', 'rgba(255,255,255,0.6)', 8, 30);
        addLyricRow('Inactive Line', 'lyrics-inactive-color', 'lyrics-inactive-size', 'rgba(255,255,255,0.25)', 8, 30);

        const spacingRow = new Adw.SpinRow({
            title: 'Line Spacing',
            icon_name: 'format-line-spacing-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 50, step_increment: 1 })
        });
        settings.bind('lyrics-line-spacing', spacingRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        spacingRow.add_suffix(createResetBtn('lyrics-line-spacing'));
        expander.add_row(spacingRow);
    }

    _buildSliderGroup(parentGroup, settings, createResetBtn, createGroupReset) {
        const keys = [
            'slider-style', 'wave-speed', 'slider-thickness', 
            'thumb-style', 'thumb-size', 'thumb-vertical-thickness',
            'slider-color', 'slider-track-color', 'thumb-color'
        ];

        const expander = new Adw.ExpanderRow({
            title: 'Slider Customization',
            subtitle: 'Wave effect, thickness, and colors',
            icon_name: 'preferences-system-windows-symbolic',
            show_enable_switch: false
        });
        expander.add_suffix(createGroupReset(keys));
        parentGroup.add(expander);

        const styleRow = new Adw.ComboRow({
            title: 'Slider Style',
            icon_name: 'audio-volume-high-symbolic',
            model: new Gtk.StringList({ strings: ['Wavy', 'Straight'] })
        });
        const styleValues = ['wavy', 'straight'];
        const currentStyle = settings.get_string('slider-style');
        styleRow.selected = Math.max(0, styleValues.indexOf(currentStyle));
        expander.add_row(styleRow);

        const speedRow = new Adw.SpinRow({
            title: 'Wave Speed',
            icon_name: 'media-playback-start-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 0.01, upper: 0.2, step_increment: 0.01 }),
            digits: 2
        });
        settings.bind('wave-speed', speedRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        speedRow.add_suffix(createResetBtn('wave-speed'));
        expander.add_row(speedRow);

        const updateSpeedVisibility = () => { speedRow.visible = (styleValues[styleRow.selected] === 'wavy'); };
        styleRow.connect('notify::selected', () => {
            settings.set_string('slider-style', styleValues[styleRow.selected]);
            updateSpeedVisibility();
        });
        updateSpeedVisibility();

        const thickRow = new Adw.SpinRow({
            title: 'Line Thickness',
            icon_name: 'format-stroke-width-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 })
        });
        settings.bind('slider-thickness', thickRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thickRow.add_suffix(createResetBtn('slider-thickness'));
        expander.add_row(thickRow);

        const thumbRow = new Adw.ComboRow({
            title: 'Thumb Shape',
            icon_name: 'media-record-symbolic',
            model: new Gtk.StringList({ strings: ['Round Circle', 'Vertical Line'] })
        });
        const thumbValues = ['round', 'vertical'];
        const currentThumb = settings.get_string('thumb-style');
        thumbRow.selected = Math.max(0, thumbValues.indexOf(currentThumb));
        expander.add_row(thumbRow);

        const thumbSizeRow = new Adw.SpinRow({
            title: 'Thumb Size',
            icon_name: 'object-resize-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 4, upper: 30, step_increment: 1 })
        });
        settings.bind('thumb-size', thumbSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thumbSizeRow.add_suffix(createResetBtn('thumb-size'));
        expander.add_row(thumbSizeRow);

        const thumbThickRow = new Adw.SpinRow({
            title: 'Vertical Thickness',
            icon_name: 'format-stroke-width-symbolic',
            adjustment: new Gtk.Adjustment({ lower: 2, upper: 15, step_increment: 1 })
        });
        settings.bind('thumb-vertical-thickness', thumbThickRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thumbThickRow.add_suffix(createResetBtn('thumb-vertical-thickness'));
        expander.add_row(thumbThickRow);

        const updateThumbUI = () => {
            const style = thumbValues[thumbRow.selected];
            if (style === 'round') {
                thumbSizeRow.title = 'Thumb Radius';
                thumbThickRow.visible = false;
            } else {
                thumbSizeRow.title = 'Thumb Height';
                thumbThickRow.visible = true;
            }
        };
        thumbRow.connect('notify::selected', () => {
            settings.set_string('thumb-style', thumbValues[thumbRow.selected]);
            updateThumbUI();
        });
        updateThumbUI();

        const sliderColorRow = new Adw.ActionRow({ title: 'Active Line Color' });
        sliderColorRow.add_suffix(this._colorBtn(settings, 'slider-color', '#ffffff'));
        expander.add_row(sliderColorRow);

        const trackColorRow = new Adw.ActionRow({ title: 'Track (Background) Color' });
        trackColorRow.add_suffix(this._colorBtn(settings, 'slider-track-color', 'rgba(255, 255, 255, 0.3)'));
        expander.add_row(trackColorRow);

        const thumbColorRow = new Adw.ActionRow({ title: 'Thumb Color' });
        thumbColorRow.add_suffix(this._colorBtn(settings, 'thumb-color', '#ffffff'));
        expander.add_row(thumbColorRow);
    }

    _buildPaddingsPage(window, settings, createResetBtn, createGroupReset) {
        const page = new Adw.PreferencesPage({
            title: 'Paddings',
            icon_name: 'view-fullscreen-symbolic',
        });
        window.add(page);

        const mainGroup = new Adw.PreferencesGroup();
        page.add(mainGroup);

        const addPadExpander = (title, prefix, icon, subtitle) => {
            const keys = [
                `${prefix}-top`, `${prefix}-bottom`,
                `${prefix}-left`, `${prefix}-right`
            ];

            const expander = new Adw.ExpanderRow({
                title: title,
                subtitle: subtitle,
                icon_name: icon,
                show_enable_switch: false
            });
            expander.add_suffix(createGroupReset(keys));
            mainGroup.add(expander);

            const dirs = [
                { label: 'Top', suffix: 'top', icon: 'go-up-symbolic' },
                { label: 'Bottom', suffix: 'bottom', icon: 'go-down-symbolic' },
                { label: 'Left', suffix: 'left', icon: 'go-previous-symbolic' },
                { label: 'Right', suffix: 'right', icon: 'go-next-symbolic' }
            ];

            for (let d of dirs) {
                const row = new Adw.SpinRow({
                    title: `${d.label} Spacing`,
                    icon_name: d.icon,
                    adjustment: new Gtk.Adjustment({ lower: 0, upper: 150, step_increment: 1 })
                });
                try { settings.bind(`${prefix}-${d.suffix}`, row, 'value', Gio.SettingsBindFlags.DEFAULT); } catch (e) { }
                row.add_suffix(createResetBtn(`${prefix}-${d.suffix}`));
                expander.add_row(row);
            }
        };

        addPadExpander('Cover Art Padding', 'art-pad', 'image-x-generic-symbolic', 'Spacing around the album art');
        addPadExpander('Text Info Margin', 'text-margin', 'format-text-symbolic', 'Margins for title and artist text');
        addPadExpander('Slider Padding', 'slider-pad', 'preferences-system-windows-symbolic', 'Spacing around the progress bar');
        addPadExpander('Media Buttons Padding', 'ctrl-pad', 'media-playback-start-symbolic', 'Spacing for control buttons');
    }

    _buildAboutPage(window) {
        const page = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        window.add(page);

        this._buildAboutHero(page);
        this._buildAboutLinks(page, window);
        this._buildAboutFeatures(page);
        this._buildAboutAuthor(page);
        this._buildAboutDonations(page, window);
    }

    _buildAboutHero(page) {
        const group = new Adw.PreferencesGroup();
        page.add(group);

        const heroBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 12,
        });

        const logoFile = `${this.path}/icons/logo.png`;
        const logo = Gtk.Image.new_from_file(logoFile);
        logo.set_pixel_size(128);
        heroBox.append(logo);

        heroBox.append(new Gtk.Label({
            label: '<span size="xx-large" weight="bold">Spotify Controller</span>',
            use_markup: true,
            margin_top: 8,
        }));

        heroBox.append(new Gtk.Label({
            label: 'A feature-rich Spotify controller for GNOME Shell',
            css_classes: ['dim-label'],
            margin_bottom: 4,
            justify: Gtk.Justification.CENTER,
            wrap: true,
        }));

        heroBox.append(new Gtk.Label({
            label: 'Version 4  •  GPL-2.0-or-later',
            css_classes: ['dim-label', 'caption'],
        }));

        const row = new Adw.ActionRow();
        row.set_child(heroBox);
        group.add(row);
    }

    _buildAboutLinks(page, window) {
        const group = new Adw.PreferencesGroup({ title: 'Links' });
        page.add(group);

        const addLink = (title, subtitle, icon, url) => {
            const row = new Adw.ActionRow({ title, subtitle, icon_name: icon, activatable: true });
            row.add_suffix(new Gtk.Image({
                icon_name: 'adw-external-link-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['dim-label'],
            }));
            row.connect('activated', () => {
                try {
                    Gio.AppInfo.launch_default_for_uri(url, window.get_display().get_app_launch_context());
                } catch (e) {
                    try { imports.gi.GLib.spawn_command_line_async(`xdg-open ${url}`); } catch (_) { }
                }
            });
            group.add(row);
        };

        addLink('GitHub Repository', 'github.com/NarkAgni/spotify-controller',
            'system-software-install-symbolic', 'https://github.com/NarkAgni/spotify-controller');

        addLink('GNOME Extensions', 'extensions.gnome.org',
            'application-x-addon-symbolic', 'https://extensions.gnome.org/extension/9315/spotify-controller/');
    }

    _buildAboutFeatures(page) {
        const group = new Adw.PreferencesGroup({ title: 'Features' });
        page.add(group);

        const features = [
            { title: 'Synchronized Lyrics', subtitle: 'Real-time lyrics powered by lrclib.net', icon: 'format-text-symbolic' },
            { title: 'Ambient Background', subtitle: 'Dynamic background that adapts to the cover art colors', icon: 'preferences-desktop-wallpaper-symbolic' },
            { title: 'Animated Vinyl Cover Art', subtitle: 'Spinning vinyl disc when corner roundness is set to 170', icon: 'media-optical-symbolic' },
            { title: 'Wavy Progress Slider', subtitle: 'Unique animated wave slider with full seek support', icon: 'audio-volume-high-symbolic' },
            { title: 'Volume Control', subtitle: 'Scroll on the panel indicator to change volume', icon: 'audio-speakers-symbolic' },
            { title: 'Fully Customizable', subtitle: 'Fonts, colors, sizes, paddings, and panel layout', icon: 'applications-graphics-symbolic' },
        ];

        for (let f of features) {
            group.add(new Adw.ActionRow({ title: f.title, subtitle: f.subtitle, icon_name: f.icon }));
        }
    }

    _buildAboutAuthor(page) {
        const group = new Adw.PreferencesGroup({ title: 'Credits' });
        page.add(group);

        group.add(new Adw.ActionRow({
            title: 'Narkagni',
            subtitle: 'Author & Maintainer',
            icon_name: 'avatar-default-symbolic',
        }));

        group.add(new Adw.ActionRow({
            title: 'Lyrics powered by lrclib.net',
            subtitle: 'Free, open-source synced lyrics API',
            icon_name: 'format-text-symbolic',
        }));

        group.add(new Adw.ActionRow({
            title: 'Disclaimer',
            subtitle: 'Not affiliated with Spotify AB or any other mentioned service',
            icon_name: 'dialog-information-symbolic',
        }));
    }

    _buildAboutDonations(page, window) {
        const group = new Adw.PreferencesGroup({
            title: 'Support Development',
            description: 'If Spotify Controller brings you joy, consider buying me a coffee ☕',
        });
        page.add(group);

        const coffeeRow = new Adw.ActionRow({
            title: 'Buy Me a Coffee',
            subtitle: 'buymeacoffee.com/narkagni',
            icon_name: 'emoji-food-symbolic',
            activatable: true,
        });
        coffeeRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));
        coffeeRow.connect('activated', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('https://buymeacoffee.com/narkagni',
                    window.get_display().get_app_launch_context());
            } catch (e) {
                try { imports.gi.GLib.spawn_command_line_async('xdg-open https://buymeacoffee.com/narkagni'); } catch (_) { }
            }
        });
        group.add(coffeeRow);

        const addCrypto = (coin, icon, address) => {
            const short = address.length > 24
                ? address.substring(0, 12) + '…' + address.slice(-8)
                : address;

            const row = new Adw.ActionRow({ title: coin, subtitle: short, icon_name: icon });

            const copyBtn = new Gtk.Button({
                icon_name: 'edit-copy-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular'],
                tooltip_text: `Copy ${coin} address`,
            });

            copyBtn.connect('clicked', () => {
                const provider = Gdk.ContentProvider.new_for_value(address);
                window.get_display().get_clipboard().set_content(provider);
                try { window.add_toast(new Adw.Toast({ title: `${coin} address copied!`, timeout: 2 })); } catch (_) { }
            });

            row.add_suffix(copyBtn);
            group.add(row);
        };

        addCrypto('Bitcoin (BTC)', 'security-high-symbolic', '1GSHkxfhYjk1Qe4AQSHg3aRN2jg2GQWAcV');
        addCrypto('Ethereum (ETH)', 'emblem-shared-symbolic', '0xf43c3f83e53495ea06676c0d9d4fc87ce627ffa3');
        addCrypto('Tether (USDT - TRC20)', 'security-medium-symbolic', 'THnqG9nchLgaf1LzGK3CqdmNpRxw59hs82');
    }

    _colorBtn(settings, key, defaultHex) {
        const dialog = new Gtk.ColorDialog();
        const btn = new Gtk.ColorDialogButton({ dialog, valign: Gtk.Align.CENTER });
        const rgba = new Gdk.RGBA();
        let saved = defaultHex;
        try { saved = settings.get_string(key); } catch (e) { }
        if (!saved || !rgba.parse(saved)) rgba.parse(defaultHex);
        btn.set_rgba(rgba);
        btn.connect('notify::rgba', () => settings.set_string(key, btn.get_rgba().to_string()));
        settings.connect(`changed::${key}`, () => {
            const newRgba = new Gdk.RGBA();
            if (newRgba.parse(settings.get_string(key))) btn.set_rgba(newRgba);
        });
        return btn;
    }
}