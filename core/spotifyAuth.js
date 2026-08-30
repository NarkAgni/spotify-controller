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


import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';


// send_and_read_async may already be promisified elsewhere in the process;
// _promisify throws if called twice on the same method, so guard it.
try {
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
} catch (e) { }


export const SPOTIFY_SCOPES = [
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-library-read',
    'user-library-modify',
].join(' ');

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const PKCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';


export function redirectUri(port) {
    return `http://127.0.0.1:${port}/callback`;
}

/** application/x-www-form-urlencoded (and query string) encoder. */
function encodeForm(obj) {
    return Object.entries(obj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

function parseQuery(qs) {
    const out = {};
    if (!qs) return out;
    for (const pair of qs.split('&')) {
        if (!pair) continue;
        const idx = pair.indexOf('=');
        const k = idx >= 0 ? pair.slice(0, idx) : pair;
        const v = idx >= 0 ? pair.slice(idx + 1) : '';
        try {
            out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
        } catch (e) {
            out[k] = v;
        }
    }
    return out;
}

function randomString(len) {
    let out = '';
    for (let i = 0; i < len; i++) {
        out += PKCE_CHARS[GLib.random_int_range(0, PKCE_CHARS.length)];
    }
    return out;
}

/** Returns { verifier, challenge } for an OAuth PKCE exchange. */
export function generatePkce() {
    const verifier = randomString(64);

    // SHA-256 of the verifier, base64url-encoded (no padding).
    const hex = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, verifier, -1);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    const challenge = GLib.base64_encode(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return { verifier, challenge };
}

export function buildAuthUrl(clientId, port, challenge, state) {
    const params = encodeForm({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri(port),
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
        scope: SPOTIFY_SCOPES,
    });
    return `${AUTH_ENDPOINT}?${params}`;
}


export class SpotifyAuth {

    constructor(port = 8888) {
        this._port = port;
        this._session = new Soup.Session();
        this._server = null;
    }

    /**
     * Runs the full interactive login: starts a loopback server, opens the
     * browser to the consent page, waits for the redirect, then exchanges the
     * returned code for tokens.
     *
     * Returns a token bundle: { accessToken, refreshToken, expiresAt }.
     */
    async login(clientId, openUri) {
        const { verifier, challenge } = generatePkce();
        const state = randomString(16);

        const code = await this._awaitCallback(state, () => {
            const url = buildAuthUrl(clientId, this._port, challenge, state);
            openUri(url);
        });

        return await this.exchangeCode(clientId, code, verifier);
    }

    /** Starts the loopback server, invokes onReady(), resolves with the auth code. */
    _awaitCallback(expectedState, onReady) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                this._stopServer();
                fn(arg);
            };

            try {
                this._server = new Soup.Server();
                this._server.add_handler('/callback', (server, msg) => {
                    const query = msg.get_uri().get_query() || '';
                    const params = parseQuery(query);
                    const code = params.code;
                    const error = params.error;
                    const state = params.state;

                    const ok = !!code && !error && state === expectedState;
                    const html = ok
                        ? '<html><body style="font-family:sans-serif;background:#191414;color:#1db954;text-align:center;padding-top:80px"><h2>Spotify connected.</h2><p style="color:#fff">You can close this tab and return to GNOME.</p></body></html>'
                        : '<html><body style="font-family:sans-serif;background:#191414;color:#e74c3c;text-align:center;padding-top:80px"><h2>Authorization failed.</h2><p style="color:#fff">You can close this tab and try again.</p></body></html>';

                    msg.set_status(ok ? Soup.Status.OK : Soup.Status.BAD_REQUEST, null);
                    msg.set_response('text/html; charset=utf-8', Soup.MemoryUse.COPY,
                        new TextEncoder().encode(html));

                    if (ok) finish(resolve, code);
                    else finish(reject, new Error(error || 'state_mismatch'));
                });

                this._server.listen_local(this._port, Soup.ServerListenOptions.IPV4_ONLY);
            } catch (e) {
                finish(reject, e);
                return;
            }

            // Safety timeout so we never leak the server if the user walks away.
            this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 300, () => {
                this._timeoutId = 0;
                finish(reject, new Error('login_timeout'));
                return GLib.SOURCE_REMOVE;
            });

            try {
                onReady();
            } catch (e) {
                finish(reject, e);
            }
        });
    }

    _stopServer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._server) {
            this._server.disconnect();
            this._server = null;
        }
    }

    async exchangeCode(clientId, code, verifier) {
        const body = encodeForm({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri(this._port),
            client_id: clientId,
            code_verifier: verifier,
        });

        return this._tokenRequest(body);
    }

    async refresh(clientId, refreshToken) {
        const body = encodeForm({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        });

        const bundle = await this._tokenRequest(body);
        // Spotify may omit a new refresh token; keep the old one if so.
        if (!bundle.refreshToken) bundle.refreshToken = refreshToken;
        return bundle;
    }

    async _tokenRequest(body) {
        const msg = Soup.Message.new('POST', TOKEN_ENDPOINT);
        msg.set_request_body_from_bytes(
            'application/x-www-form-urlencoded',
            new GLib.Bytes(new TextEncoder().encode(body))
        );

        const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
        const text = new TextDecoder().decode(bytes.get_data());

        if (msg.get_status() !== Soup.Status.OK) {
            throw new Error(`token_request_failed (${msg.get_status()}): ${text}`);
        }

        const data = JSON.parse(text);
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            expiresAt: GLib.get_real_time() / 1000000 + (data.expires_in || 3600),
        };
    }

    destroy() {
        this._stopServer();
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
}
