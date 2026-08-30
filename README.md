<div align="center">

<img src="icons/logo.png" alt="Spotify Controller Logo" width="150" height="150">

# Spotify Controller

**Premium Spotify integration for GNOME Shell**

A deeply customizable music player that lives in your panel - with ambient visuals, synced lyrics, smart playlists, and a glassmorphism UI built for modern desktops.

[![GNOME Shell](https://img.shields.io/badge/GNOME_Shell-45_|_46_|_47_|_48_|_49_|_50-4A86CF?style=flat-square&logo=gnome&logoColor=white)](https://extensions.gnome.org/extension/9315/spotify-controller/)
[![License](https://img.shields.io/badge/License-GPL_3.0-green?style=flat-square)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-❤️-EA4AAA?style=flat-square)](https://github.com/sponsors/NarkAgni)

<br>

[Installation](#installation) · [Features](#features) · [Usage](#usage) · [Support](#support)

</div>

---

## Overview

Spotify Controller is a premium GNOME Shell extension that transforms your music experience. It brings a full-featured player directly into your desktop - complete with ambient album art backgrounds, real-time synchronized lyrics, a manager for your real Spotify playlists and Liked Songs, and a glassmorphic UI that looks stunning against any wallpaper. Built for aesthetics, power, and zero friction.

<div align="center">
  <img src="media/panel.png" alt="Panel View" width="100%" style="border-radius: 10px; margin: 12px 0;">
  <sub>The Panel - Clean media controls integrated directly into GNOME Shell</sub>
</div>

<br>

<div align="center">
  <img src="media/popup.png" alt="Popup Player" width="48%" style="border-radius: 10px; margin: 12px 0;">
  <img src="media/lyrics.png" alt="Lyrics View" width="48%" style="border-radius: 10px; margin: 12px 0;">
  <sub>Popup Player with ambient art · Real-time synchronized lyrics overlay</sub>
</div>

<br>

<div align="center">
  <img src="media/playlist.png" alt="Playlist Manager" width="48%" style="border-radius: 10px; margin: 12px 0;">
  <img src="media/liked.png" alt="Liked Songs" width="48%" style="border-radius: 10px; margin: 12px 0;">
  <sub>Multi-Playlist Manager · Liked Songs collection</sub>
</div>

---

## Features

### Premium UI & Glassmorphism Design

A visual experience unlike any other GNOME extension.

- **Translucent Glass Look** - The popup, buttons, and lists all feature a sleek glassmorphic effect that adapts beautifully to light and dark wallpapers
- **Dynamic Ambient Background** - Dominant colors are extracted from the current track's cover art and applied as a live gradient across the popup
- **Spinning Cover Art** - Album art rotates like a vinyl record while music plays; speed and radius are fully adjustable in settings
- **Polished Hover Effects** - Every button and list item has smooth, custom hover states - YouTube Red on "Play All", Vibrant Purple on "Shuffle", Soft Red on the Heart icon
- **Pin to Keep Open** - Click the pin icon in the popup header to keep it open while you switch to other windows; click again to return to normal auto-close

### Real Spotify Playlist Manager

Manage your actual Spotify library, right from the panel. *(Requires linking your account once — see [Connecting Your Spotify Account](#connecting-your-spotify-account).)*

- **Your Real Playlists** - Browse, create, rename, and delete (unfollow) the playlists in your Spotify account
- **Quick Add** - Save the currently playing song to any playlist instantly with the `+` button
- **Smart Search** - A search bar automatically appears once a list grows beyond 5 items, so you can filter fast
- **Track Intelligence** - Each playlist displays its song count and total playback time (e.g., `5 songs • 19 min`)

> **Note:** Everything syncs directly with your Spotify account via the Spotify Web API. Creating a playlist, adding a song, or tapping the heart updates your real library.

### Liked Songs System

Your favorites, always one tap away.

- **In-Player Heart Button** - A dedicated Heart icon next to the playback slider saves the current track to Liked Songs with a single click; the icon glows with a glassy soft-red color when active
- **Dedicated Liked Songs Page** - A separate section collects all your favorite tracks in one easy-to-access list

> **Note:** The heart syncs with your real Spotify **Liked Songs** — liking here saves to your account, and songs you've already liked on Spotify show up in the list.

### Smart Playback & Queue Control

Full control over what plays and when.

- **Direct Play** - Clicking any song in a playlist or Liked Songs instantly triggers playback in Spotify
- **Play All & Shuffle** - Every playlist has dedicated action buttons at the top to play in order or at random
- **Full Media Controls** - Play, Pause, Next, Previous, and Repeat, all wired up and ready
- **Smooth Seek Slider** - A buttery-smooth progress slider lets you seek precisely through any track
- **Volume Slider & Mute** - Adjust volume from an in-popup slider with a one-click mute toggle (or scroll on the panel)
- **Sleep Timer** - Tap the alarm icon to auto-pause playback after 15, 30, 45, or 60 minutes

### Real-Time Synchronized Lyrics

One click to sing along.

- **One-Tap View Toggle** - A dedicated button in the popup header flips between the cover art and the synchronized lyrics view (tapping the cover still opens lyrics too)
- **Auto-Scroll** - Lyrics scroll automatically in sync with the track's current timestamp - no manual interaction needed
- **Click to Seek** - Tap any lyric line to jump playback straight to that moment
- **Manual Scroll** - Scroll through the lyrics yourself with the mouse wheel; it auto-resumes following the song after a few seconds
- **Instant on Revisit** - Lyrics are cached in memory and on disk, so a song you've already opened loads instantly and works offline

### Desktop Notifications

- **Track-Change Toasts** - Optionally show a desktop notification with cover art whenever the song changes (enable in Preferences → Behavior)

### Smart Backend & Optimization

Fast, lean, and built to last.

- **Secure Account Link** - Your Spotify connection uses OAuth (PKCE); access tokens refresh automatically and the extension never sees your password
- **Image Caching** - Cover art is cached to a `.cache` folder after the first download, saving bandwidth and reducing RAM usage on every subsequent play
- **Auto Garbage Collector** - Old, unused cached images are silently purged over time, keeping your storage clean

### Deep Customization

Open the Spotify Controller preferences to fine-tune everything:

- Customize fonts, font sizes, and text colors
- Adjust button spacing, margins, and icon sizes
- Toggle the vinyl rotation animation for cover art
- Choose between **Wavy** or **Straight** progress slider styles with custom thickness, speed, and colors
- Reposition the panel widget to the Left, Center, or Right side
- Show or hide individual panel buttons independently

---

## Usage

| Action | How |
|--------|-----|
| Play / Pause | Click the panel button or use the popup |
| Next / Previous | Panel buttons or popup controls |
| Adjust Volume | Panel scroll, or the in-popup volume slider + mute |
| Seek through track | Click and drag the progress slider |
| View Lyrics | Click the album art, or the toggle button in the popup header |
| Back to cover art | Click the toggle button in the popup header |
| Jump to a lyric | Click any line in the lyrics view |
| Keep popup open | Click the pin icon in the popup header |
| Set a sleep timer | Click the alarm icon next to the slider |
| Like current song | Click the Heart icon next to the slider (syncs to Spotify) |
| Manage playlists | Open the popup → navigate to Playlists |
| Connect Spotify | Preferences → Spotify Account → Connect |

---

## Installation

### From GNOME Extensions *(recommended)*

<div align="center">

[![Get it on GNOME Extensions](https://img.shields.io/badge/GNOME_Extensions-Install_Spotify_Controller-4A86CF?style=for-the-badge&logo=gnome&logoColor=white)](https://extensions.gnome.org/extension/9315/spotify-controller/)

</div>

### From Source

**Requirements:** GNOME Shell 45–50 · `libglib2.0-bin` · Spotify (App or Web Player) · a free Spotify Developer Client ID for playlist/Liked features (see [below](#connecting-your-spotify-account))

```bash
# 1. Clone the repository
git clone https://github.com/NarkAgni/spotify-controller.git
cd spotify-controller

# 2. Install
make install

# 3. Restart GNOME Shell
#    On X11:     Press Alt+F2, type 'r', press Enter
#    On Wayland: Log out and back in

# 4. Enable the extension
gnome-extensions enable spotify-controller@narkagni
```

---

## Connecting Your Spotify Account

Playlists and Liked Songs use the Spotify Web API, so you link a free Spotify app **once**:

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and click **Create app** (free).
2. In the app's **Settings**, add this exact **Redirect URI**:
   ```
   http://127.0.0.1:8888/callback
   ```
3. Copy the app's **Client ID**.
4. Open **Spotify Controller Preferences → General → Spotify Account**, paste the Client ID, and click **Connect**.
5. Approve access in the browser — the row updates to *"Connected as &lt;you&gt;"*.

> Creating playlists and saving Liked Songs work on **free** Spotify accounts. Playback runs through your local Spotify app (MPRIS), so it works regardless of plan. The Client ID is public to the PKCE flow and is stored locally; the extension never sees your password.

---

## Support

Spotify Controller is free and open-source. If it enhances your music experience, consider supporting development:

<div align="center">

[![Sponsor on GitHub](https://img.shields.io/badge/❤️_Sponsor-NarkAgni-EA4AAA?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/NarkAgni)
&nbsp;
[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/narkagni)

</div>

<details>
<summary><b>Crypto donations</b></summary>

<br>

| Network | Address |
|---------|---------|
| Bitcoin (BTC) | `1GSHkxfhYjk1Qe4AQSHg3aRN2jg2GQWAcV` |
| Ethereum (ETH) | `0xf43c3f83e53495ea06676c0d9d4fc87ce627ffa3` |
| Tether USDT (TRC20) | `THnqG9nchLgaf1LzGK3CqdmNpRxw59hs82` |

</details>

---

<div align="center">

Made with ❤️ by **[NarkAgni](https://github.com/NarkAgni)** · GPL-3.0

</div>