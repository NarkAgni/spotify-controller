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
import { MediaIndicator } from './ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';


export default class MyMediaExtension extends Extension {

    // -----------------------------------------------------------------------
    // Extension lifecycle
    // -----------------------------------------------------------------------

    enable() {
        this._settings = this.getSettings();
        this._setupIndicator();

        // Re-create the indicator whenever the panel position setting changes
        this._posId = this._settings.connect('changed::position', () => this._reload());
    }

    disable() {
        if (this._posId) this._settings.disconnect(this._posId);
        this._removeIndicator();
        this._settings = null;
    }


    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /** Destroys the current indicator and builds a fresh one. */
    _reload() {
        this._removeIndicator();
        this._setupIndicator();
    }

    /**
     * Creates the MediaIndicator and places it in the correct panel section.
     *
     * The 'position' setting supports the following values:
     *   'left'          → left panel box, index 1
     *   'center-before' → centre panel box, prepended  (index 0)
     *   'center'        → centre panel box, appended   (index last)
     *   anything else   → right panel box, index 1
     *
     * A one-second deferred timeout is used for centre placement because
     * GNOME Shell's panel layout is not fully settled at enable() time.
     */
    _setupIndicator() {
        this._indicator = new MediaIndicator(this._settings);

        const pos = this._settings.get_string('position');
        let section = 'right';
        let index   = 1;

        if (pos === 'left') {
            section = 'left';
        } else if (pos.startsWith('center')) {
            section = 'center';
            index   = pos === 'center-before' ? 0 : 1;
        }

        Main.panel.addToStatusArea('spotify-controller', this._indicator, index, section);

        // Deferred re-index for centre placement
        if (this._bootTimeout) {
            GLib.source_remove(this._bootTimeout);
            this._bootTimeout = null;
        }

        this._bootTimeout = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
            this._bootTimeout = null;

            if (!this._indicator || !this._indicator.container) return GLib.SOURCE_REMOVE;

            if (section === 'center') {
                const box = Main.panel._centerBox;

                if (pos === 'center-before') {
                    box.set_child_at_index(this._indicator.container, 0);
                } else {
                    box.set_child_at_index(this._indicator.container, box.get_n_children() - 1);
                }
            }

            return GLib.SOURCE_REMOVE;
        });
    }

    /** Cancels any pending boot timeout and destroys the indicator. */
    _removeIndicator() {
        if (this._bootTimeout) {
            GLib.source_remove(this._bootTimeout);
            this._bootTimeout = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}