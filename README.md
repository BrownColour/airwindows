# Wire — direct P2P file transfer

Send files straight from one browser to another using WebRTC. No file ever
touches a server — a tiny local "signaling" server just helps the two
browsers find each other and set up a direct connection; once that's done,
the server isn't involved and could be turned off.

```
server/   → Node.js signaling server (run this locally)
public/   → the web app (index.html) — this is what you host on GitHub Pages
```

## How it works

1. Person A opens the page and clicks **Create room** → gets a 6-character code.
2. Person B opens the page, enters the code, clicks **Join**.
3. Both browsers exchange connection info through the signaling server, then
   open a direct WebRTC `RTCDataChannel` to each other.
4. Files are chunked (16 KB pieces) and streamed directly over that channel.
   The signaling server never sees file contents.

## 1. Run the signaling server locally

```bash
cd server
npm install
npm start
```

You should see:
```
Signaling server listening on http://localhost:8080
WebSocket endpoint: ws://localhost:8080
```

## 2. Try it locally

Just open `public/index.html` in two browser tabs/windows (or two different
computers on the same network, using your machine's LAN IP instead of
`localhost`). Leave the signaling server field as `ws://localhost:8080`
(or `ws://<your-lan-ip>:8080`), create a room in one tab, join it from the
other.

## 3. Hosting the frontend on GitHub Pages

Push the contents of `public/` to a repo and enable GitHub Pages
(Settings → Pages → deploy from branch, root or `/public`).

**Important — mixed content:** GitHub Pages serves over `https://`. Browsers
block an `https` page from opening a plain `ws://` connection, so the
signaling server address entered in the app must be `wss://`, not `ws://`,
once the page is loaded from GitHub Pages. Your options:

- **Tunnel your local server with TLS** (easiest): run the server locally as
  above, then in another terminal:
  ```bash
  npx ngrok http 8080
  ```
  ngrok gives you a `https://xxxx.ngrok-free.app` address — use the `wss://`
  version of that same hostname (`wss://xxxx.ngrok-free.app`) as the
  "Signaling server" value in the app. Share that value along with the room
  link with whoever you're sending files to.
- **Deploy the signaling server somewhere with TLS** (Render, Fly.io,
  Railway, a VPS behind Caddy/nginx, etc.) if you want a longer-lived
  address instead of a local + tunnel setup.
- **Test purely on your local network** by also serving `public/index.html`
  locally (e.g. `npx serve public`) instead of via GitHub Pages — then plain
  `ws://` to a LAN address works fine since there's no mixed-content
  restriction.

The room-creator's share link (the "Copy link" button in the app) already
bakes the signaling server address and room code into the URL, so the other
person just opens the link and clicks **Join**.

## Notes / limitations

- One room = exactly two peers. Create a new room for each pair of people.
- Rooms are only kept in memory and are cleaned up automatically once empty.
- Large files: the app streams in 16 KB chunks with backpressure handling,
  so it should hold up for large files, but very large transfers depend on
  both browser tabs staying open and the connection staying alive.
- WebRTC needs to negotiate a direct path between the two devices. The
  public STUN servers used here handle most home/office networks; on some
  restrictive corporate or symmetric-NAT networks you may additionally need
  a TURN server (not included) to relay traffic.
