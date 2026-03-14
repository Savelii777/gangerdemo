// Dungeon Dash — LAN Multiplayer Server (Full Sync)
// Run: node server.js
// Players connect via ws://<your-ip>:3002

const { WebSocketServer } = require("ws");
const os = require("os");

const PORT = 3002;
const wss = new WebSocketServer({ port: PORT });

// Rooms: { roomCode: { host, clients: [{ws, id, name}], mapSeed, state } }
const rooms = {};
let nextPlayerId = 1;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcast(room, msg, excludeWs) {
  const data = JSON.stringify(msg);
  room.clients.forEach((c) => {
    if (c.ws !== excludeWs && c.ws.readyState === 1) {
      c.ws.send(data);
    }
  });
}

function broadcastAll(room, msg) {
  const data = JSON.stringify(msg);
  room.clients.forEach((c) => {
    if (c.ws.readyState === 1) c.ws.send(data);
  });
}

wss.on("connection", (ws) => {
  const playerId = nextPlayerId++;
  let currentRoom = null;
  let playerName = `Player${playerId}`;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      // ===== LOBBY =====
      case "create_room": {
        const code = generateRoomCode();
        const seed = Math.floor(Math.random() * 999999);
        playerName = msg.name || playerName;
        const room = {
          code,
          hostId: playerId,
          mapSeed: seed,
          mode: msg.mode || "coop",
          clients: [{ ws, id: playerId, name: playerName }],
          state: "lobby",
          floor: 1,
        };
        rooms[code] = room;
        currentRoom = room;
        ws.send(
          JSON.stringify({
            type: "room_created",
            code,
            playerId,
            seed,
            mode: room.mode,
            isHost: true,
          })
        );
        console.log(
          `Room ${code} created by ${playerName} (${room.mode})`
        );
        break;
      }

      case "join_room": {
        const code = (msg.code || "").toUpperCase();
        const room = rooms[code];
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
          return;
        }
        if (room.clients.length >= 4) {
          ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
          return;
        }
        playerName = msg.name || playerName;
        room.clients.push({ ws, id: playerId, name: playerName });
        currentRoom = room;

        ws.send(
          JSON.stringify({
            type: "room_joined",
            code,
            playerId,
            seed: room.mapSeed,
            mode: room.mode,
            isHost: false,
            players: room.clients.map((c) => ({
              id: c.id,
              name: c.name,
            })),
          })
        );

        broadcast(room, {
          type: "player_joined",
          playerId,
          name: playerName,
          players: room.clients.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        }, ws);

        console.log(
          `${playerName} joined room ${code} (${room.clients.length} players)`
        );
        break;
      }

      case "start_game": {
        if (!currentRoom || currentRoom.hostId !== playerId) return;
        currentRoom.state = "playing";
        broadcastAll(currentRoom, {
          type: "game_start",
          seed: currentRoom.mapSeed,
          mode: currentRoom.mode,
          floor: currentRoom.floor,
        });
        console.log(`Room ${currentRoom.code} game started`);
        break;
      }

      // ===== IN-GAME SYNC =====
      case "player_update": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "player_update",
          id: playerId,
          x: msg.x,
          y: msg.y,
          anim: msg.anim,
          flipX: msg.flipX,
          hp: msg.hp,
          maxHp: msg.maxHp,
        }, ws);
        break;
      }

      case "bullet_fired": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "bullet_fired",
          id: playerId,
          x: msg.x,
          y: msg.y,
          vx: msg.vx,
          vy: msg.vy,
          damage: msg.damage || 1,
          texture: msg.texture || "bullet",
        }, ws);
        break;
      }

      case "enemy_damage": {
        if (!currentRoom) return;
        broadcastAll(currentRoom, {
          type: "enemy_damage",
          enemyIdx: msg.enemyIdx,
          damage: msg.damage,
          kbX: msg.kbX || 0,
          kbY: msg.kbY || 0,
          fromPlayer: playerId,
        });
        break;
      }

      case "enemy_sync": {
        // Host sends periodic enemy state
        if (!currentRoom || currentRoom.hostId !== playerId) return;
        broadcast(currentRoom, {
          type: "enemy_sync",
          enemies: msg.enemies,
        }, ws);
        break;
      }

      case "enemy_killed": {
        if (!currentRoom) return;
        broadcastAll(currentRoom, {
          type: "enemy_killed",
          enemyIdx: msg.enemyIdx,
          x: msg.x,
          y: msg.y,
          fromPlayer: playerId,
        });
        break;
      }

      // Room lock/unlock events
      case "room_locked": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "room_locked",
          roomIndex: msg.roomIndex,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      case "room_unlocked": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "room_unlocked",
          roomIndex: msg.roomIndex,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      // Boss events
      case "boss_phase": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "boss_phase",
          phase: msg.phase,
          hp: msg.hp,
          maxHp: msg.maxHp,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      case "boss_ability": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "boss_ability",
          ability: msg.ability,
          x: msg.x,
          y: msg.y,
          targetX: msg.targetX,
          targetY: msg.targetY,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      case "boss_defeated": {
        if (!currentRoom) return;
        broadcastAll(currentRoom, {
          type: "boss_defeated",
          x: msg.x,
          y: msg.y,
          fromPlayer: playerId,
        });
        break;
      }

      // Loot / items
      case "item_spawned": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "item_spawned",
          x: msg.x,
          y: msg.y,
          itemType: msg.itemType,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      case "item_picked": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "item_picked",
          itemIdx: msg.itemIdx,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      // PvP specific
      case "pvp_hit": {
        if (!currentRoom || currentRoom.mode !== "pvp") return;
        broadcast(currentRoom, {
          type: "pvp_hit",
          targetId: msg.targetId,
          damage: msg.damage,
          fromPlayer: playerId,
        }, ws);
        break;
      }

      case "pvp_kill": {
        if (!currentRoom || currentRoom.mode !== "pvp") return;
        broadcastAll(currentRoom, {
          type: "pvp_kill",
          killerId: playerId,
          killerName: playerName,
          victimId: msg.victimId,
          victimName: msg.victimName,
        });
        break;
      }

      case "player_died": {
        if (!currentRoom) return;
        broadcastAll(currentRoom, {
          type: "player_died",
          id: playerId,
          name: playerName,
        });
        break;
      }

      case "player_respawn": {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: "player_respawn",
          id: playerId,
          x: msg.x,
          y: msg.y,
        }, ws);
        break;
      }

      case "chat": {
        if (!currentRoom) return;
        broadcastAll(currentRoom, {
          type: "chat",
          id: playerId,
          name: playerName,
          text: msg.text,
        });
        break;
      }

      case "next_floor": {
        if (!currentRoom || currentRoom.hostId !== playerId) return;
        currentRoom.floor++;
        currentRoom.mapSeed = Math.floor(Math.random() * 999999);
        broadcastAll(currentRoom, {
          type: "next_floor",
          floor: currentRoom.floor,
          seed: currentRoom.mapSeed,
        });
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong", time: msg.time }));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!currentRoom) return;
    currentRoom.clients = currentRoom.clients.filter(
      (c) => c.ws !== ws
    );
    broadcast(currentRoom, {
      type: "player_left",
      id: playerId,
      name: playerName,
      players: currentRoom.clients.map((c) => ({
        id: c.id,
        name: c.name,
      })),
    });
    console.log(`${playerName} disconnected from room ${currentRoom.code}`);

    // Clean up empty rooms
    if (currentRoom.clients.length === 0) {
      delete rooms[currentRoom.code];
      console.log(`Room ${currentRoom.code} deleted (empty)`);
    }
  });
});

const ip = getLocalIP();
console.log(`\n🎮 Dungeon Dash Multiplayer Server (Full Sync)`);
console.log(`   Local:   ws://localhost:${PORT}`);
console.log(`   Network: ws://${ip}:${PORT}`);
console.log(`\n   Share the Network address with other players on your WiFi!\n`);
