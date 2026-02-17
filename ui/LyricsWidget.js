import GObject from 'gi://GObject';
import St from 'gi://St';
import PangoCairo from 'gi://PangoCairo';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

export const LyricsWidget = GObject.registerClass({
    GTypeName: 'LyricsWidget'
}, class LyricsWidget extends St.DrawingArea {

    _init(width, height) {
        super._init({
            style_class: 'lyrics-widget',
            reactive: false,
            can_focus: false,
            x_expand: true,
            y_expand: true,
            width,
            height
        });

        this.set_style(`padding: 0; margin: 0;`);

        this._lyrics = [];
        this._lineGeometries = [];
        this._totalHeight = 0;

        this._activeIndex = -1;
        this._currentTime = 0;

        this._scrollOffset = 0;
        this._targetScrollOffset = 0;
        this._tickId = 0;

        this._state = 'loading';

        this._config = {
            activeColor: {r:1, g:1, b:1, a:1},
            neighborColor: {r:1, g:1, b:1, a:0.6},
            inactiveColor: {r:1, g:1, b:1, a:0.25},
            activeSize: 18,
            neighborSize: 12,
            inactiveSize: 11,
            spacing: 8
        };
    }
    
    _parseColor(col) {
        if (!col) return { r: 1, g: 1, b: 1, a: 1 };
        if (col.startsWith('#')) {
            let hex = col.substring(1);
            if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
            if (hex.length === 6) hex += 'FF';
            const bigint = parseInt(hex, 16);
            return {
                r: ((bigint >> 24) & 255) / 255,
                g: ((bigint >> 16) & 255) / 255,
                b: ((bigint >> 8) & 255) / 255,
                a: (bigint & 255) / 255
            };
        }
        const match = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            return {
                r: parseInt(match[1]) / 255,
                g: parseInt(match[2]) / 255,
                b: parseInt(match[3]) / 255,
                a: match[4] ? parseFloat(match[4]) : 1.0
            };
        }
        return { r: 1, g: 1, b: 1, a: 1 };
    }

    updateAppearance(config) {
        this._config = {
            activeColor: this._parseColor(config.activeColorStr),
            neighborColor: this._parseColor(config.neighborColorStr),
            inactiveColor: this._parseColor(config.inactiveColorStr),
            activeSize: config.activeSize,
            neighborSize: config.neighborSize,
            inactiveSize: config.inactiveSize,
            spacing: config.spacing
        };
        this.queue_repaint();
    }

    showLoading() {
        this._state = 'loading';
        this._lyrics = [];
        this.queue_repaint();
    }

    showEmpty() {
        this._state = 'empty';
        this._lyrics = [];
        this.queue_repaint();
    }

    setLyrics(lyrics) {
        if (!lyrics || lyrics.length === 0) {
            this.showEmpty();
            return;
        }

        this._state = 'lyrics';
        this._lyrics = lyrics;
        this._activeIndex = -1;
        this._currentTime = 0;
        this._scrollOffset = 0;
        this._targetScrollOffset = 0;
        this._lineGeometries = [];
        this.queue_repaint();
    }

    updatePosition(timeInMs) {
        if (this._state !== 'lyrics') return;

        this._currentTime = timeInMs;

        let newIndex = -1;
        for (let i = 0; i < this._lyrics.length; i++) {
            if (this._lyrics[i].time <= timeInMs)
                newIndex = i;
            else
                break;
        }

        if (this._activeIndex !== newIndex) {
            this._activeIndex = newIndex;
            this._startAnimation();
            this.queue_repaint();
        }
    }

    _startAnimation() {
        if (this._tickId) return;
        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => this._onTick());
    }

    _onTick() {
        const diff = this._targetScrollOffset - this._scrollOffset;
        if (Math.abs(diff) < 0.5) {
            this._scrollOffset = this._targetScrollOffset;
            this.queue_repaint();
            this._tickId = 0;
            return GLib.SOURCE_REMOVE;
        }
        this._scrollOffset += diff * 0.06;
        this.queue_repaint();
        return GLib.SOURCE_CONTINUE;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const layout = PangoCairo.create_layout(cr);

        if (this._state !== 'lyrics') {
            const text = this._state === 'loading' ? 'Fetching lyrics...' : 'No Lyrics Found';
            layout.set_text(text, -1);
            layout.set_alignment(Pango.Alignment.CENTER);
            
            const font = Pango.FontDescription.from_string(`Sans Bold ${this._config.activeSize}`);
            layout.set_font_description(font);

            const [, logical] = layout.get_extents();
            const textWidth = logical.width / Pango.SCALE;
            const textHeight = logical.height / Pango.SCALE;

            cr.setSourceRGBA(this._config.activeColor.r, this._config.activeColor.g, this._config.activeColor.b, 0.8);
            cr.moveTo((width - textWidth) / 2, (height - textHeight) / 2);
            PangoCairo.show_layout(cr, layout);
            cr.$dispose();
            return;
        }

        const PADDING_X = 20;
        const TEXT_WIDTH = width - (PADDING_X * 2);

        layout.set_width(TEXT_WIDTH * Pango.SCALE);
        layout.set_wrap(Pango.WrapMode.WORD_CHAR);
        layout.set_alignment(Pango.Alignment.CENTER);

        this._lineGeometries = [];
        let cursorY = 0;
        
        this._lyrics.forEach((line, index) => {
            const active = index === this._activeIndex;
            const neighbor = Math.abs(index - this._activeIndex) === 1;

            let fontSize = this._config.inactiveSize;
            if (active) fontSize = this._config.activeSize;
            else if (neighbor) fontSize = this._config.neighborSize;

            const font = Pango.FontDescription.from_string(`Sans Bold ${fontSize}`);

            layout.set_font_description(font);
            layout.set_text(line.text, -1);

            const [, logical] = layout.get_extents();
            const textHeight = logical.height / Pango.SCALE;

            this._lineGeometries.push({
                y: cursorY,
                height: textHeight,
                text: line.text,
                font,
                active,
                neighbor
            });

            cursorY += textHeight + this._config.spacing;
        });

        this._totalHeight = Math.max(cursorY - this._config.spacing, 0);

        if (this._activeIndex >= 0) {
            const geo = this._lineGeometries[this._activeIndex];
            if (geo) {
                const maxScroll = Math.max(0, this._totalHeight - height);
                const TOP_LOCK_PX = geo.height * 2.5;
                const BOTTOM_LOCK_PX = this._totalHeight - (geo.height * 2.5);

                let target;
                if (geo.y < TOP_LOCK_PX) target = 0;
                else if (geo.y > BOTTOM_LOCK_PX) target = maxScroll;
                else target = (geo.y + geo.height / 2) - (height / 2);

                this._targetScrollOffset = Math.min(Math.max(target, 0), maxScroll);
            }
        }

        this._lineGeometries.forEach(geo => {
            const y = geo.y - this._scrollOffset;
            if (y + geo.height < -30 || y > height + 30) return;

            layout.set_font_description(geo.font);
            layout.set_text(geo.text, -1);

            if (geo.active) {
                const c = this._config.activeColor;
                cr.setSourceRGBA(c.r, c.g, c.b, c.a);
            } else if (geo.neighbor) {
                const c = this._config.neighborColor;
                cr.setSourceRGBA(c.r, c.g, c.b, c.a);
            } else {
                const c = this._config.inactiveColor;
                cr.setSourceRGBA(c.r, c.g, c.b, c.a);
            }

            cr.moveTo(PADDING_X, y);
            PangoCairo.show_layout(cr, layout);
        });

        cr.$dispose();
    }

    destroy() {
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = 0;
        }
        super.destroy();
    }
});