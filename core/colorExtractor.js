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


import GdkPixbuf from 'gi://GdkPixbuf';


/**
 * Extracts a representative "ambient" colour from an image file.
 *
 * The image is decoded at a tiny 24x24 size (fast, negligible memory) and the
 * pixels are averaged with a bias towards saturated colours so the result is a
 * vibrant hue rather than a muddy grey. Falls back to a plain average for
 * largely greyscale art. Returns an "r, g, b" string ready for an rgba() CSS
 * value, or null on any failure (caller treats null as "no ambient colour").
 */
export function extractDominantColor(path) {
    try {
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 24, 24, false);
        const pixels = pixbuf.get_pixels();
        const channels = pixbuf.get_n_channels();
        const rowstride = pixbuf.get_rowstride();
        const width = pixbuf.get_width();
        const height = pixbuf.get_height();

        let avgR = 0, avgG = 0, avgB = 0, n = 0;
        let satR = 0, satG = 0, satB = 0, satSum = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const off = y * rowstride + x * channels;
                const r = pixels[off];
                const g = pixels[off + 1];
                const b = pixels[off + 2];

                avgR += r; avgG += g; avgB += b; n++;

                const sat = Math.max(r, g, b) - Math.min(r, g, b);
                satR += r * sat; satG += g * sat; satB += b * sat; satSum += sat;
            }
        }

        if (n === 0) return null;

        let r, g, b;
        // If the art carries meaningful colour, weight towards saturated pixels;
        // otherwise fall back to the plain average for greyscale covers.
        if (satSum > n * 8) {
            r = Math.round(satR / satSum);
            g = Math.round(satG / satSum);
            b = Math.round(satB / satSum);
        } else {
            r = Math.round(avgR / n);
            g = Math.round(avgG / n);
            b = Math.round(avgB / n);
        }

        return `${r}, ${g}, ${b}`;
    } catch (e) {
        return null;
    }
}
