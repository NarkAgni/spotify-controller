import { MediaIndicator } from './ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MyMediaExtension extends Extension {

    // ========== EXTENSION ENTRY POINT ==========
    enable() {
        this._settings = this.getSettings();
        this._setupIndicator();
        this._posId = this._settings.connect('changed::position', () => this._reload());
    }

    _reload() {
        this._removeIndicator();
        this._setupIndicator();
    }

    // ========== INDICATOR SETUP ==========
    _setupIndicator() {
        this._indicator = new MediaIndicator(this._settings);
        const pos = this._settings.get_string('position');
        let section = 'right', index = 1;

        if (pos === 'left') section = 'left';
        else if (pos.startsWith('center')) {
            section = 'center';
            index = pos === 'center-before' ? 0 : 1;
        }

        Main.panel.addToStatusArea('spotify-controller', this._indicator, index, section);
    }

    _removeIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    disable() {
        if (this._posId) this._settings.disconnect(this._posId);
        this._removeIndicator();
        this._settings = null;
    }
}