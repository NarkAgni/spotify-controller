<div align="center">
  <img src="icons/logo.png" alt="Spotify Controller Logo" width="128" height="128">
  <h1>Spotify Controller</h1>
  <p><strong>A powerful and highly customizable Spotify integration for GNOME Shell</strong></p>
  <p>Developed by <strong>Narkagni</strong></p>
</div>

<hr>

<h2>Overview</h2>
<p>
  Spotify Controller integrates your music directly into the GNOME Shell top panel. 
  It features a fully customizable UI, a rich popup player with ambient backgrounds, 
  and synchronized lyrics support—all without needing a Premium account.
</p>

<h2>Gallery</h2>
<p>
  <strong>The Panel & Popup Player:</strong> Clean integration with ambient art.
</p>
<div align="center">
  <img src="media/panel.png" alt="Panel View" width="100%" style="border-radius: 8px; border: 1px solid #333; margin-bottom: 10px;">
  <img src="media/popup.png" alt="Popup Player" width="48%" style="border-radius: 8px; border: 1px solid #333;">
  <img src="media/lyrics.png" alt="Lyrics View" width="48%" style="border-radius: 8px; border: 1px solid #333;">
</div>

<hr>

<h2>Key Features</h2>

<details>
  <summary><strong>Top Panel Media Controls</strong></summary>
  <ul>
    <li>Play/Pause, Next, and Previous buttons directly on the panel.</li>
    <li>Mouse wheel scroll on the panel to adjust volume.</li>
    <li>Flexible positioning (Left, Center, or Right side of the panel).</li>
    <li>Toggle visibility of individual buttons.</li>
  </ul>
</details>

<details>
  <summary><strong>Rich Popup Player</strong></summary>
  <ul>
    <li>Album art display with an <strong>ambient background</strong> effect.</li>
    <li>Track title, artist info, and playback controls (Shuffle/Repeat).</li>
    <li>Large, touch-friendly UI.</li>
  </ul>
</details>

<details>
  <summary><strong>Animated Progress Slider</strong></summary>
  <ul>
    <li>Choose between <strong>Wavy</strong> or <strong>Straight</strong> slider styles.</li>
    <li>Smooth, real-time animation linked to track progress.</li>
    <li>Click and drag to seek.</li>
    <li>Customize thickness, speed, and colors.</li>
  </ul>
</details>

<details>
  <summary><strong>Synchronized Lyrics</strong></summary>
  <ul>
    <li>Automatically fetches synced lyrics for the current track.</li>
    <li>Smooth auto-scrolling view.</li>
    <li>Toggle lyrics view simply by clicking the album art.</li>
  </ul>
</details>

<details>
  <summary><strong>Deep Customization</strong></summary>
  <ul>
    <li>Adjust button spacing, margins, and icon sizes.</li>
    <li>Customize fonts, font sizes, and text colors.</li>
    <li>Toggle the vinyl rotation animation for cover art.</li>
  </ul>
</details>

<hr>

<h2>Installation</h2>

<h3>Requirements</h3>
<ul>
  <li>GNOME Shell 45 - 49</li>
  <li>Spotify (App or Web Player)</li>
  <li><code>libglib2.0-bin</code> (Required for schema compilation)</li>
</ul>

<h3>Install from Source</h3>

<p><strong>1. Clone the repository</strong></p>
<pre>
git clone https://github.com/NarkAgni/spotify-controller.git
cd spotify-controller
</pre>

<p><strong>2. Install using Make</strong></p>
<pre>
make install
</pre>

<p><strong>3. Restart GNOME Shell</strong></p>
<p>For X11: Press <code>Alt+F2</code>, type <code>r</code>, and hit Enter.<br>
For Wayland: Log out and log back in.</p>

<p><strong>4. Enable the extension</strong></p>
<pre>
gnome-extensions enable spotify-controller@narkagni
</pre>

<hr>

<h2>Support Development</h2>
<p>
  This extension is free and open-source. If you enjoy using it, consider supporting the development.
</p>

<div align="center">
  <a href="https://github.com/sponsors/NarkAgni">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors" height="40">
  </a>
  &nbsp;&nbsp;
  <a href="https://buymeacoffee.com/narkagni">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40">
  </a>
</div>

<br>

<details>
  <summary><strong>Crypto Addresses</strong></summary>
  <br>
  <p><strong>Bitcoin (BTC):</strong></p>
  <pre>1GSHkxfhYjk1Qe4AQSHg3aRN2jg2GQWAcV</pre>

  <p><strong>Ethereum (ETH):</strong></p>
  <pre>0xf43c3f83e53495ea06676c0d9d4fc87ce627ffa3</pre>

  <p><strong>Tether (USDT - TRC20):</strong></p>
  <pre>THnqG9nchLgaf1LzGK3CqdmNpRxw59hs82</pre>
</details>

<hr>

<p align="center">
  License: GPL-3.0
</p>