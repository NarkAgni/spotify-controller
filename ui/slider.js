import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';

const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || seconds < 0 || isNaN(seconds)) return '0:00';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const WAVE_AMPLITUDE = 4.0;
const WAVE_FREQUENCY = 0.08;
const SLIDER_HEIGHT = 30;
const SIDE_PADDING = 15;

export const MediaSlider = GObject.registerClass(
    { GTypeName: 'MediaSlider' },
    class MediaSlider extends St.BoxLayout {

        constructor(onSeek, elapsedLabel, settings) {
            super({ vertical: true, x_expand: true, reactive: true });

            this._onSeek = onSeek;
            this._elapsedLabel = elapsedLabel;
            this._settings = settings;

            this._duration = 1;
            this._position = 0;
            this._rate = 1.0;
            this._isPlaying = false;
            this._isDragging = false;
            this._phase = 0;
            this._currentTrackId = null;
            this._lastFrameTime = 0;
            this._tickId = null;

            this._buildUI();
            
            this.connect('destroy', () => this.destroy());
        }

        _buildUI() {
            this._canvas = new St.DrawingArea({
                height: SLIDER_HEIGHT,
                x_expand: true,
                reactive: true,
            });

            const keys = ['slider-style', 'slider-color', 'thumb-color', 'slider-track-color', 
                          'slider-thickness', 'wave-speed', 'thumb-style', 'thumb-size', 'thumb-vertical-thickness'];
            
            if (this._settings) {
                keys.forEach(key => {
                    this._settings.connect(`changed::${key}`, () => this._canvas.queue_repaint());
                });
            }

            this._canvas.connect('repaint', () => this._draw());
            this._canvas.connect('button-press-event', (_, e) => this._onPress(e));
            this._canvas.connect('motion-event', (_, e) => this._onMotion(e));
            this._canvas.connect('button-release-event', (_, e) => this._onRelease(e));

            this.add_child(this._canvas);
        }

        _startAnimation() {
            this._stopAnimation();

            this._lastFrameTime = GLib.get_monotonic_time();
            this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                this._onTick();
                return GLib.SOURCE_CONTINUE;
            });
        }

        _stopAnimation() {
            if (this._tickId) {
                GLib.source_remove(this._tickId);
                this._tickId = null;
            }
        }

        _onTick() {
            const now = GLib.get_monotonic_time();
            const dt = (now - this._lastFrameTime) / 1000000;
            this._lastFrameTime = now;

            if (this._isPlaying && !this._isDragging) {
                this._position += dt * this._rate;
                if (this._position > this._duration + 2) this._position = this._duration;
                
                let speed = 0.04;
                try { speed = this._settings.get_double('wave-speed'); } catch(e) {}
                this._phase += speed;
            }

            if (this._elapsedLabel) {
                this._elapsedLabel.set_text(formatTime(this._position));
            }
            this._canvas.queue_repaint();
            return true;
        }

        updateMetadata(lenMicro, rate, trackId, isPlaying, currentPosMicro) {
            if (this._isDragging) return;

            this._duration = Math.max(1, lenMicro / 1000000);
            this._rate = rate || 1.0;
            const newPos = (currentPosMicro || 0) / 1000000;

            if (trackId && this._currentTrackId !== trackId) {
                if (this._currentTrackId === null) {
                    this._position = newPos; 
                } else {
                    this._position = 0; 
                }
                this._currentTrackId = trackId;
                this._phase = 0;
                if (this._elapsedLabel) this._elapsedLabel.set_text(formatTime(this._position));
            } 
            else if (trackId && this._currentTrackId === trackId) {
                // Same track: DO NOT sync position from metadata polling.
                // MPRIS often reports a stale '0' position during playback.
                // We rely on 'syncPosition' (Seeked signal) for jumps.
            }

            if (this._isPlaying !== isPlaying) {
                this._isPlaying = isPlaying;
                if (isPlaying) {
                    this._lastFrameTime = GLib.get_monotonic_time();
                    this._startAnimation();
                } else {
                    this._stopAnimation();
                    this._canvas.queue_repaint();
                }
            } else if (isPlaying && !this._tickId) {
                this._startAnimation();
            }
        }
        
        syncPosition(posMicro) {
            if (this._isDragging) return;
            const newPosSec = posMicro / 1000000;
            
            this._position = newPosSec;
            if (this._elapsedLabel) this._elapsedLabel.set_text(formatTime(this._position));
            this._canvas.queue_repaint();
        }

        resetToZero() {
             this._position = 0;
             this._phase = 0;
             if (this._elapsedLabel) this._elapsedLabel.set_text("0:00");
             this._canvas.queue_repaint();
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

        _draw() {
            try {
                const cr = this._canvas.get_context();
                const [w, h] = this._canvas.get_surface_size();
                if (w <= 0 || h <= 0) { cr.$dispose(); return; }

                const centerY = h / 2;
                const drawWidth = w - SIDE_PADDING * 2;
                const ratio = Math.min(1, Math.max(0, this._position / this._duration));
                const currentX = SIDE_PADDING + drawWidth * ratio;
                
                let style = 'wavy', thickness = 4, thumbSize = 8, thumbThickness = 4, thumbStyle = 'round';
                let sliderColorStr = '#ffffff', trackColorStr = 'rgba(255,255,255,0.3)', thumbColorStr = '#ffffff';

                if (this._settings) {
                    try { style = this._settings.get_string('slider-style'); } catch(e) {}
                    try { thickness = this._settings.get_int('slider-thickness') || 4; } catch(e) {}
                    try { thumbSize = this._settings.get_int('thumb-size') || 8; } catch(e) {}
                    try { thumbThickness = this._settings.get_int('thumb-vertical-thickness') || 4; } catch(e) {}
                    try { thumbStyle = this._settings.get_string('thumb-style'); } catch(e) {}
                    try { sliderColorStr = this._settings.get_string('slider-color'); } catch(e) {}
                    try { trackColorStr = this._settings.get_string('slider-track-color'); } catch(e) {}
                    try { thumbColorStr = this._settings.get_string('thumb-color'); } catch(e) {}
                }

                const lineC = this._parseColor(sliderColorStr);
                const trackC = this._parseColor(trackColorStr);
                const thumbC = this._parseColor(thumbColorStr);

                cr.setOperator(Cairo.Operator.CLEAR);
                cr.paint();
                cr.setOperator(Cairo.Operator.OVER);

                cr.setSourceRGBA(trackC.r, trackC.g, trackC.b, trackC.a); 
                cr.setLineWidth(thickness);
                cr.setLineCap(Cairo.LineCap.ROUND); 
                cr.moveTo(currentX, centerY); 
                cr.lineTo(w - SIDE_PADDING, centerY);
                cr.stroke();

                cr.setSourceRGBA(lineC.r, lineC.g, lineC.b, lineC.a);
                cr.setLineWidth(thickness);
                
                if (thumbStyle === 'vertical') {
                    cr.setLineCap(Cairo.LineCap.BUTT);
                    cr.newSubPath(); 
                    cr.arc(SIDE_PADDING, centerY, thickness / 2, 0, 2 * Math.PI); 
                    cr.fill();
                    cr.moveTo(SIDE_PADDING, centerY);
                } else {
                    cr.setLineCap(Cairo.LineCap.ROUND);
                    cr.moveTo(SIDE_PADDING, centerY);
                }

                const dist = currentX - SIDE_PADDING;
                if (style === 'straight') {
                    cr.lineTo(currentX, centerY);
                    cr.stroke();
                } else { 
                    for (let i = 0; i <= dist; i++) {
                        let x = SIDE_PADDING + i;
                        let y = centerY;
                        if (this._isPlaying && !this._isDragging) {
                            const damping = Math.min(1.0, i / 15.0);
                            y += Math.sin(i * WAVE_FREQUENCY - this._phase) * WAVE_AMPLITUDE * damping;
                        }
                        cr.lineTo(x, y);
                    }
                    cr.stroke();
                }

                cr.setSourceRGBA(thumbC.r, thumbC.g, thumbC.b, thumbC.a);
                if (thumbStyle === 'vertical') {
                    const h = thumbSize;          
                    const w = thumbThickness;     
                    const r = Math.min(w, h) / 2; 
                    const x = currentX - w / 2;
                    const y = centerY - h / 2;
                    cr.newSubPath();
                    cr.arc(x + w - r, y + r, r, -0.5 * Math.PI, 0);
                    cr.arc(x + w - r, y + h - r, r, 0, 0.5 * Math.PI);
                    cr.arc(x + r, y + h - r, r, 0.5 * Math.PI, Math.PI);
                    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
                    cr.closePath();
                    cr.fill();
                } else {
                    cr.arc(currentX, centerY, thumbSize, 0, Math.PI * 2);
                    cr.fill();
                }
                cr.$dispose();
            } catch (e) { }
        }

        _getPercent(event) {
            const [x] = event.get_coords();
            const [absX] = this._canvas.get_transformed_position();
            const rel = x - absX - SIDE_PADDING;
            const w = this._canvas.get_width() - SIDE_PADDING * 2;
            return Math.min(1, Math.max(0, rel / w));
        }

        _onPress(event) {
            this._isDragging = true;
            this._position = this._getPercent(event) * this._duration;
            this._canvas.queue_repaint();
            return Clutter.EVENT_STOP;
        }

        _onMotion(event) {
            if (!this._isDragging) return Clutter.EVENT_PROPAGATE;
            this._position = this._getPercent(event) * this._duration;
            this._canvas.queue_repaint();
            if(this._elapsedLabel) this._elapsedLabel.set_text(formatTime(this._position));
            return Clutter.EVENT_STOP;
        }

        _onRelease(event) {
            if (!this._isDragging) return Clutter.EVENT_PROPAGATE;
            this._isDragging = false;
            const pct = this._getPercent(event);
            this._position = pct * this._duration;
            if (this._onSeek) this._onSeek(pct);
            return Clutter.EVENT_STOP;
        }

        destroy() {
            this._stopAnimation();
            super.destroy();
        }
    }
);