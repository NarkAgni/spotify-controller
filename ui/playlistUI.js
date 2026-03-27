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
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';


export class PlaylistUI {
    constructor(playlistManager, settings, callbacks) {
        this._playlistManager = playlistManager;
        this._settings = settings;
        this._callbacks = callbacks;
        this._currentDetailPlaylist = null;
        this._buildUI();
    }

    _createSearchBox(hint, onSearch) {
        const entry = new St.Entry({
            hint_text: hint,
            style_class: 'playlist-search-entry',
            x_expand: true,
            visible: false
        });
        
        entry.clutter_text.connect('text-changed', () => onSearch(entry.get_text()));
        return entry;
    }

    _buildUI() {
        this.container = new St.BoxLayout({ vertical: true, x_expand: true, y_expand: true });

        this.playlistMainPage = new St.BoxLayout({ vertical: true, x_expand: true, y_expand: true });
        
        const headerBox = new St.BoxLayout({ vertical: true, style_class: 'playlist-header-box' });
        const titleRow = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style_class: 'playlist-header-title-row' });
        
        this.mainPlaylistBackBtn = new St.Button({
            child: new St.Icon({ icon_name: 'go-previous-symbolic', icon_size: 16 }),
            style_class: 'playlist-icon-btn playlist-icon-btn-large',
            reactive: true,
            track_hover: true
        });
        
        this.mainPlaylistBackBtn.connect('clicked', () => {
            this._callbacks.setPopupMode('normal');
        });

        this.playlistMainTitle = new St.Label({
            text: "Add to Playlist",
            style_class: 'playlist-main-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        const spacer = new St.Widget({ width: 32 });

        titleRow.add_child(this.mainPlaylistBackBtn);
        titleRow.add_child(this.playlistMainTitle);
        titleRow.add_child(spacer);

        const currentSongRow = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'playlist-current-song-row'
        });
        
        this.playlistMiniArt = new St.Bin({
            style_class: 'playlist-mini-art',
            width: 60, height: 60,
            x_align: Clutter.ActorAlign.CENTER
        });
        
        this.playlistCurrentSongLabel = new St.Label({
            text: "Current Song",
            style_class: 'playlist-current-song-label',
            x_align: Clutter.ActorAlign.CENTER
        });
        this.playlistCurrentSongLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        currentSongRow.add_child(this.playlistMiniArt);
        currentSongRow.add_child(this.playlistCurrentSongLabel);

        headerBox.add_child(titleRow);
        headerBox.add_child(currentSongRow);
        this.playlistMainPage.add_child(headerBox);

        const newBox = new St.BoxLayout({ style_class: 'playlist-new-box', x_expand: true });
        
        this.newPlaylistEntry = new St.Entry({
            hint_text: 'New Playlist Name...',
            style_class: 'playlist-new-entry',
            x_expand: true
        });
        
        const createBtn = new St.Button({
            child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 16 }),
            style_class: 'playlist-action-btn btn-green',
            reactive: true,
            track_hover: true
        });

        createBtn.connect('clicked', () => {
            const name = this.newPlaylistEntry.get_text();
            if (name && name.trim() !== '') {
                this._playlistManager.createPlaylist(name.trim());
                this.newPlaylistEntry.set_text('');
                this._renderPlaylists(this.playlistSearchEntry.get_text());
            }
        });
        
        newBox.add_child(this.newPlaylistEntry);
        newBox.add_child(createBtn);
        this.playlistMainPage.add_child(newBox);

        this.playlistSearchEntry = this._createSearchBox('Search Playlists...', (text) => this._renderPlaylists(text));
        this.playlistMainPage.add_child(this.playlistSearchEntry);

        this.mainScrollView = new St.ScrollView({ hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC, x_expand: true, y_expand: true });
        this.mainListContainer = new St.BoxLayout({ vertical: true, style_class: 'playlist-list-container' });
        this.mainScrollView.set_child(this.mainListContainer);
        this.playlistMainPage.add_child(this.mainScrollView);


        this.playlistDetailPage = new St.BoxLayout({ vertical: true, x_expand: true, y_expand: true, visible: false });

        const detailHeader = new St.BoxLayout({ style_class: 'playlist-detail-header', y_align: Clutter.ActorAlign.CENTER });
        this.playlistBackBtn = new St.Button({
            child: new St.Icon({ icon_name: 'go-previous-symbolic', icon_size: 16 }),
            style_class: 'playlist-icon-btn playlist-icon-btn-large',
            reactive: true,
            track_hover: true
        });
        this.playlistBackBtn.connect('clicked', () => {
            this.setMode('playlist', true);
        });

        const titleInfoBox = new St.BoxLayout({ vertical: true, x_expand: true });
        this.playlistDetailNameLabel = new St.Label({ text: "Tracks", style_class: 'playlist-detail-name' });
        this.playlistTrackCountLabel = new St.Label({ text: "0 tracks • 0 min", style_class: 'playlist-track-count' });
        titleInfoBox.add_child(this.playlistDetailNameLabel);
        titleInfoBox.add_child(this.playlistTrackCountLabel);

        detailHeader.add_child(this.playlistBackBtn);
        detailHeader.add_child(titleInfoBox);
        this.playlistDetailPage.add_child(detailHeader);

        this.detailAddBox = new St.BoxLayout({ vertical: true, x_expand: true, style: 'padding-right: 12px;' });
        this.playlistDetailPage.add_child(this.detailAddBox);

        this.detailSearchEntry = this._createSearchBox('Search Songs...', (text) => this._renderPlaylistDetail(this._currentDetailPlaylist, text));
        this.playlistDetailPage.add_child(this.detailSearchEntry);

        this.detailScrollView = new St.ScrollView({ hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC, x_expand: true, y_expand: true });
        this.detailListContainer = new St.BoxLayout({ vertical: true, style_class: 'playlist-list-container' });
        this.detailScrollView.set_child(this.detailListContainer);
        this.playlistDetailPage.add_child(this.detailScrollView);


        this.likedSongsPage = new St.BoxLayout({ vertical: true, x_expand: true, y_expand: true, visible: false });
        
        const likedHeader = new St.BoxLayout({ style_class: 'playlist-detail-header', y_align: Clutter.ActorAlign.CENTER });
        this.likedBackBtn = new St.Button({
            child: new St.Icon({ icon_name: 'go-previous-symbolic', icon_size: 16 }),
            style_class: 'playlist-icon-btn playlist-icon-btn-large',
            reactive: true,
            track_hover: true
        });
        this.likedBackBtn.connect('clicked', () => {
            this.setMode('playlist', true);
        });

        const likedTitleBox = new St.BoxLayout({ vertical: true, x_expand: true });
        likedTitleBox.add_child(new St.Label({ text: '♥ Liked Songs', style_class: 'playlist-detail-name playlist-liked-name' }));
        this.likedTrackCountLabel = new St.Label({ text: '0 songs', style_class: 'playlist-track-count' });
        likedTitleBox.add_child(this.likedTrackCountLabel);

        const likedActionsRow = new St.BoxLayout({ style_class: 'playlist-actions-row', y_align: Clutter.ActorAlign.CENTER });
        
        this.likedPlayAllBtn = new St.Button({
            child: new St.Icon({ icon_name: 'media-playback-start-symbolic', icon_size: 14 }),
            style_class: 'playlist-action-btn btn-glass btn-play-all',
            reactive: true, track_hover: true
        });
        this.likedPlayAllBtn.connect('clicked', () => {
            this._callbacks.playQueue(this._playlistManager.getLikedSongs(), false);
            this._callbacks.setPopupMode('normal');
        });

        this.likedShuffleBtn = new St.Button({
            child: new St.Icon({ icon_name: 'media-playlist-shuffle-symbolic', icon_size: 14 }),
            style_class: 'playlist-action-btn btn-glass btn-shuffle',
            reactive: true, track_hover: true
        });
        this.likedShuffleBtn.connect('clicked', () => {
            this._callbacks.playQueue(this._playlistManager.getLikedSongs(), true);
            this._callbacks.setPopupMode('normal');
        });

        likedActionsRow.add_child(this.likedPlayAllBtn);
        likedActionsRow.add_child(this.likedShuffleBtn);
        likedHeader.add_child(this.likedBackBtn);
        likedHeader.add_child(likedTitleBox);
        likedHeader.add_child(likedActionsRow);
        this.likedSongsPage.add_child(likedHeader);

        this.likedSearchEntry = this._createSearchBox('Search Liked...', (text) => this._renderLikedSongs(text));
        this.likedSongsPage.add_child(this.likedSearchEntry);

        this.likedScrollView = new St.ScrollView({ hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC, x_expand: true, y_expand: true });
        this.likedListContainer = new St.BoxLayout({ vertical: true, style_class: 'playlist-list-container' });
        this.likedScrollView.set_child(this.likedListContainer);
        this.likedSongsPage.add_child(this.likedScrollView);

        this.container.add_child(this.playlistMainPage);
        this.container.add_child(this.playlistDetailPage);
        this.container.add_child(this.likedSongsPage);
    }

    setMode(mode, forceMain = false) {
        this.playlistMainPage.hide();
        this.playlistDetailPage.hide();
        this.likedSongsPage.hide();

        if (forceMain) {
            this._currentDetailPlaylist = null;
            this.playlistSearchEntry.set_text('');
        }

        if (mode === 'liked') {
            this.likedSearchEntry.set_text('');
            this.likedSongsPage.show();
            this._renderLikedSongs();
        } else if (mode === 'playlist') {
            if (this._currentDetailPlaylist) {
                this.detailSearchEntry.set_text('');
                this.playlistDetailPage.show();
                this._renderPlaylistDetail(this._currentDetailPlaylist);
            } else {
                this.playlistMainPage.show();
                this._renderPlaylists();
            }
        }

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            global.sync_pointer();
            return GLib.SOURCE_REMOVE;
        });
    }

    updateStyles(artSize) {
        const scrollStyle = `max-height: 270px; margin-right: 2px;`;
        this.mainScrollView.style = scrollStyle;
        this.detailScrollView.style = scrollStyle;
        this.likedScrollView.style = scrollStyle;
        this.container.style = `min-height: 310px; max-height: 400px; width: ${artSize}px;`;
    }

    updateMiniArt(uri) {
        if (this.playlistMiniArt) {
            if (uri) {
                this.playlistMiniArt.style = `background-image: url("${uri}"); background-size: cover; background-position: center;`;
            } else {
                this.playlistMiniArt.style = `background-image: none;`;
            }
        }
    }

    _renderPlaylists(query = '') {
        this.mainListContainer.destroy_all_children();
        const allNames = this._playlistManager.getPlaylistNames();
        
        if (allNames.length > 5) {
            this.playlistSearchEntry.show();
        } else {
            this.playlistSearchEntry.hide();
        }

        const info = this._callbacks.getLastTrackInfo();
        const songName = info ? `${info.title} — ${info.artist}` : "Unknown Song";
        
        if (songName.length > 35) {
            this.playlistCurrentSongLabel.set_text(songName.substring(0, 32) + "...");
        } else {
            this.playlistCurrentSongLabel.set_text(songName);
        }

        const lowerQuery = query.toLowerCase();

        if (!lowerQuery || "liked songs".includes(lowerQuery)) {
            const likedRow = new St.BoxLayout({ style_class: 'playlist-item-row', x_expand: true, reactive: true, track_hover: true });
            const likedBtn = new St.Button({
                child: new St.Label({ text: "♥ Liked Songs", style_class: 'playlist-item-name playlist-liked-name playlist-item-bold', y_align: Clutter.ActorAlign.CENTER }),
                x_expand: true, reactive: true, track_hover: true, style_class: 'playlist-item-name-btn'
            });
            
            likedBtn.connect('clicked', () => {
                this._callbacks.setPopupMode('liked');
            });
            
            likedRow.add_child(likedBtn);
            this.mainListContainer.add_child(likedRow);
        }

        const filteredNames = allNames.filter(n => n.toLowerCase().includes(lowerQuery));

        if (allNames.length === 0) {
            this.mainListContainer.add_child(new St.Label({
                text: "No custom playlists yet. Create one above.",
                style_class: 'playlist-empty-label'
            }));
            return;
        }

        filteredNames.forEach(name => {
            const row = new St.BoxLayout({ style_class: 'playlist-item-row', x_expand: true, reactive: true, track_hover: true });
            const nameBtn = new St.Button({
                child: new St.Label({ text: name, style_class: 'playlist-item-name', y_align: Clutter.ActorAlign.CENTER }),
                x_expand: true, reactive: true, track_hover: true, style_class: 'playlist-item-name-btn'
            });
            
            nameBtn.connect('clicked', () => {
                this._currentDetailPlaylist = name;
                this.setMode('playlist');
            });
            row.add_child(nameBtn);

            const renameBtn = new St.Button({
                child: new St.Icon({ icon_name: 'document-edit-symbolic', icon_size: 14 }),
                style_class: 'playlist-icon-btn btn-orange-hover',
                y_align: Clutter.ActorAlign.CENTER, reactive: true, track_hover: true
            });
            
            let editEntry = null;
            
            const saveRename = () => {
                if (!editEntry) return;
                const newName = editEntry.get_text().trim();
                if (newName && newName !== name) {
                    if (this._playlistManager.renamePlaylist(name, newName)) {
                        if (this._currentDetailPlaylist === name) {
                            this._currentDetailPlaylist = newName;
                        }
                    }
                }
                this._renderPlaylists(this.playlistSearchEntry.get_text());
            };

            renameBtn.connect('clicked', () => {
                if (!editEntry) {
                    renameBtn.child.icon_name = 'object-select-symbolic';
                    renameBtn.add_style_class_name('btn-orange-hover'); 
                    nameBtn.hide();

                    editEntry = new St.Entry({
                        text: name,
                        style_class: 'playlist-edit-entry',
                        x_expand: true,
                        y_align: Clutter.ActorAlign.CENTER
                    });
                    row.insert_child_at_index(editEntry, 0);

                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        if (editEntry && editEntry.clutter_text) {
                            editEntry.clutter_text.grab_key_focus();
                            editEntry.clutter_text.set_selection(0, name.length);
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                    
                    editEntry.clutter_text.connect('activate', () => saveRename());
                } else {
                    saveRename();
                }
            });
            row.add_child(renameBtn);

            const quickAddBtn = new St.Button({
                child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 14 }),
                style_class: 'playlist-icon-btn btn-green-hover',
                y_align: Clutter.ActorAlign.CENTER, reactive: true, track_hover: true
            });
            
            quickAddBtn.connect('clicked', () => {
                const info = this._callbacks.getLastTrackInfo();
                if (!info) return;
                
                if (this._playlistManager.addTrack(name, info)) {
                    quickAddBtn.child.icon_name = 'object-select-symbolic';
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        if (quickAddBtn && quickAddBtn.child) {
                            quickAddBtn.child.icon_name = 'list-add-symbolic';
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
            row.add_child(quickAddBtn);

            const delBtn = new St.Button({
                child: new St.Icon({ icon_name: 'user-trash-symbolic', icon_size: 14 }),
                style_class: 'playlist-icon-btn btn-red-hover',
                y_align: Clutter.ActorAlign.CENTER, reactive: true, track_hover: true
            });
            
            delBtn.connect('clicked', () => {
                this._playlistManager.deletePlaylist(name);
                this._renderPlaylists(this.playlistSearchEntry.get_text());
            });
            row.add_child(delBtn);

            this.mainListContainer.add_child(row);
        });
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            global.sync_pointer();
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderPlaylistDetail(playlistName, query = '') {
        this.playlistDetailNameLabel.set_text(playlistName);
        this.detailListContainer.destroy_all_children();
        
        const allTracks = this._playlistManager.getTracks(playlistName);

        if (allTracks.length > 5) {
            this.detailSearchEntry.show();
        } else {
            this.detailSearchEntry.hide();
        }

        let totalSeconds = 0;
        allTracks.forEach(t => {
            totalSeconds += (t.duration || 0);
        });
        
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        this.playlistTrackCountLabel.set_text(`${allTracks.length} tracks • ${h > 0 ? `${h}h ${m}m` : `${m} min`}`);

        if (!this._detailActionsRow) {
            this._detailActionsRow = new St.BoxLayout({ style_class: 'playlist-actions-row', y_align: Clutter.ActorAlign.CENTER });
            
            const detailPlayAll = new St.Button({
                child: new St.Icon({ icon_name: 'media-playback-start-symbolic', icon_size: 14 }),
                style_class: 'playlist-action-btn btn-glass btn-play-all',
                reactive: true, track_hover: true
            });
            detailPlayAll.connect('clicked', () => {
                this._callbacks.playQueue(this._playlistManager.getTracks(this._currentDetailPlaylist), false);
                this._callbacks.setPopupMode('normal');
            });

            const detailShuffle = new St.Button({
                child: new St.Icon({ icon_name: 'media-playlist-shuffle-symbolic', icon_size: 14 }),
                style_class: 'playlist-action-btn btn-glass btn-shuffle',
                reactive: true, track_hover: true
            });
            detailShuffle.connect('clicked', () => {
                this._callbacks.playQueue(this._playlistManager.getTracks(this._currentDetailPlaylist), true);
                this._callbacks.setPopupMode('normal');
            });

            this._detailActionsRow.add_child(detailPlayAll);
            this._detailActionsRow.add_child(detailShuffle);
            
            const detailHeader = this.playlistDetailPage.get_first_child();
            if (detailHeader) detailHeader.add_child(this._detailActionsRow);
        }

        this.detailAddBox.destroy_all_children();
        
        const addRow = new St.Button({
            style_class: 'playlist-add-current-row',
            x_expand: true, reactive: true, track_hover: true
        });
        
        addRow.set_child(new St.Label({
            text: "+ Add Current Song Here",
            style_class: 'playlist-add-current-row-label'
        }));
        
        addRow.connect('clicked', () => {
            const info = this._callbacks.getLastTrackInfo();
            if (!info) return;
            
            if (this._playlistManager.addTrack(playlistName, info)) {
                addRow.set_child(new St.Label({ text: "Added! ✓", style_class: 'playlist-add-current-row-label' }));
                addRow.add_style_class_name('added');
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    this._renderPlaylistDetail(playlistName, this.detailSearchEntry.get_text());
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                addRow.set_child(new St.Label({ text: "Already in Playlist!", style_class: 'playlist-add-current-row-error-label' }));
                addRow.add_style_class_name('error');
            }
        });
        
        this.detailAddBox.add_child(addRow);

        const lowerQuery = query.toLowerCase();
        const filteredTracks = allTracks.filter(t => t.title.toLowerCase().includes(lowerQuery) || t.artist.toLowerCase().includes(lowerQuery));

        if (allTracks.length === 0) {
            this.detailListContainer.add_child(new St.Label({
                text: "Nothing here yet.",
                style_class: 'playlist-empty-label'
            }));
        } else if (filteredTracks.length === 0) {
            this.detailListContainer.add_child(new St.Label({
                text: "No songs match your search.",
                style_class: 'playlist-empty-label',
                style: 'margin-top: 10px;'
            }));
        } else {
            filteredTracks.forEach(track => {
                const row = new St.BoxLayout({ style_class: 'playlist-item-row', x_expand: true, reactive: true, track_hover: true });
                const textLayout = new St.BoxLayout({ vertical: true, x_expand: true });
                
                textLayout.add_child(new St.Label({ text: track.title, style_class: 'playlist-item-name playlist-item-bold' }));
                textLayout.add_child(new St.Label({ text: track.artist, style_class: 'playlist-item-sub' }));

                const trackPlayBtn = new St.Button({
                    child: textLayout,
                    x_expand: true, reactive: true, track_hover: true,
                    style_class: 'playlist-item-name-btn'
                });
                
                trackPlayBtn.connect('clicked', () => {
                    this._callbacks.openUri(track.spotifyUri);
                    this._callbacks.setPopupMode('normal');
                });

                const delSongBtn = new St.Button({
                    child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
                    style_class: 'playlist-icon-btn btn-red-hover',
                    y_align: Clutter.ActorAlign.CENTER, reactive: true, track_hover: true
                });
                delSongBtn.connect('clicked', () => {
                    this._playlistManager.removeTrack(playlistName, track.id);
                    this._renderPlaylistDetail(playlistName, this.detailSearchEntry.get_text());
                });

                row.add_child(trackPlayBtn);
                row.add_child(delSongBtn);
                this.detailListContainer.add_child(row);
            });
        }
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            global.sync_pointer();
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderLikedSongs(query = '') {
        this.likedListContainer.destroy_all_children();
        const allTracks = this._playlistManager.getLikedSongs();

        if (allTracks.length > 5) {
            this.likedSearchEntry.show();
        } else {
            this.likedSearchEntry.hide();
        }

        let totalSeconds = 0;
        allTracks.forEach(t => {
            totalSeconds += (t.duration || 0);
        });
        
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        this.likedTrackCountLabel.set_text(`${allTracks.length} songs • ${h > 0 ? `${h}h ${m}m` : `${m} min`}`);

        const lowerQuery = query.toLowerCase();
        const filteredTracks = allTracks.filter(t => t.title.toLowerCase().includes(lowerQuery) || t.artist.toLowerCase().includes(lowerQuery));

        if (allTracks.length === 0) {
            this.likedListContainer.add_child(new St.Label({
                text: "No liked songs yet.\nHeart a song from the player!",
                style_class: 'playlist-empty-label',
                style: 'margin-top: 30px;'
            }));
            return;
        } else if (filteredTracks.length === 0) {
            this.likedListContainer.add_child(new St.Label({
                text: "No songs match your search.",
                style_class: 'playlist-empty-label',
                style: 'margin-top: 10px;'
            }));
        }

        filteredTracks.forEach(track => {
            const row = new St.BoxLayout({ style_class: 'playlist-item-row', x_expand: true, reactive: true, track_hover: true });
            const textLayout = new St.BoxLayout({ vertical: true, x_expand: true });
            
            textLayout.add_child(new St.Label({ text: track.title, style_class: 'playlist-item-name playlist-item-bold' }));
            textLayout.add_child(new St.Label({ text: track.artist, style_class: 'playlist-item-sub' }));

            const trackPlayBtn = new St.Button({
                child: textLayout,
                x_expand: true, reactive: true, track_hover: true,
                style_class: 'playlist-item-name-btn'
            });
            
            trackPlayBtn.connect('clicked', () => {
                this._callbacks.openUri(track.spotifyUri);
                this._callbacks.setPopupMode('normal');
            });

            const unlikeBtn = new St.Button({
                child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', icon_size: 14 }),
                style_class: 'playlist-icon-btn liked-btn-active',
                y_align: Clutter.ActorAlign.CENTER, reactive: true, track_hover: true
            });
            
            unlikeBtn.connect('clicked', () => {
                this._playlistManager.removeLiked(track.id);
                this._renderLikedSongs(this.likedSearchEntry.get_text());
                const info = this._callbacks.getLastTrackInfo();
                if (info && (info.title + info.artist) === track.id) {
                    this._callbacks.onCurrentUnliked();
                }
            });

            row.add_child(trackPlayBtn);
            row.add_child(unlikeBtn);
            this.likedListContainer.add_child(row);
        });
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            global.sync_pointer();
            return GLib.SOURCE_REMOVE;
        });
    }
}