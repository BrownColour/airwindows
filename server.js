// Minimal WebRTC signaling server.
// It never sees file contents — it only relays connection setup messages
// (offer/answer/ICE candidates) between exactly two peers in a "room".
// Once the WebRTC connection is established, files flow directly
// peer-to-peer and this server is no longer involved.

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// room code -> { sockets: Set<ws>, createdAt: number }
const rooms = new Map();

function makeRoomCode() {
  // 6-character, human-friendly (no ambiguous chars like 0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      alphabet[crypto.randomInt(alphabet.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function otherPeer(room, ws) {
  for (const peer of room.sockets) {
    if (peer !== ws) return peer;
  }
  return null;
}

function cleanupEmptyRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.sockets.size === 0 && now - room.createdAt > 5 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}
setInterval(cleanupEmptyRooms, 60 * 1000).unref();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('P2P file transfer signaling server is running.\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create': {
        const code = makeRoomCode();
        rooms.set(code, { sockets: new Set([ws]), createdAt: Date.now() });
        ws.roomCode = code;
        send(ws, { type: 'created', room: code });
        break;
      }

      case 'join': {
        const code = (msg.room || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found.' });
          return;
        }
        if (room.sockets.size >= 2) {
          send(ws, { type: 'error', message: 'Room is already full.' });
          return;
        }
        room.sockets.add(ws);
        ws.roomCode = code;
        send(ws, { type: 'joined', room: code });
        const peer = otherPeer(room, ws);
        if (peer) send(peer, { type: 'peer-joined' });
        break;
      }

      // Opaque relay for SDP offers/answers and ICE candidates.
      case 'signal': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const peer = otherPeer(room, ws);
        if (peer) send(peer, { type: 'signal', data: msg.data });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.sockets.delete(ws);
    const peer = otherPeer(room, ws);
    if (peer) send(peer, { type: 'peer-left' });
    if (room.sockets.size === 0) room.createdAt = Date.now();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
