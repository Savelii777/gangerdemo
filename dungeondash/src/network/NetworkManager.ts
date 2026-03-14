// Client-side WebSocket manager for LAN multiplayer (Full Sync)

export type MessageHandler = (msg: any) => void;

export default class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  public connected = false;
  public playerId = 0;
  public isHost = false;
  public roomCode = "";
  public mode: "coop" | "pvp" = "coop";
  public players: { id: number; name: string }[] = [];
  public latency = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect(address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(address);
        this.ws.onopen = () => {
          this.connected = true;
          // Start ping loop
          this.pingInterval = setInterval(() => this.sendPing(), 2000);
          resolve();
        };
        this.ws.onerror = (e) => {
          console.error("WS error:", e);
          reject(e);
        };
        this.ws.onclose = () => {
          this.connected = false;
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.emit("disconnected", {});
        };
        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "pong") {
              this.latency = Date.now() - msg.time;
              return;
            }
            this.emit(msg.type, msg);
          } catch {}
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string) {
    this.handlers.delete(type);
  }

  private emit(type: string, msg: any) {
    const list = this.handlers.get(type);
    if (list) list.forEach((h) => h(msg));
  }

  // === LOBBY API ===

  createRoom(name: string, mode: "coop" | "pvp" = "coop") {
    this.send({ type: "create_room", name, mode });
  }

  joinRoom(code: string, name: string) {
    this.send({ type: "join_room", code, name });
  }

  startGame() {
    this.send({ type: "start_game" });
  }

  // === PLAYER SYNC ===

  sendPlayerUpdate(x: number, y: number, anim: string, flipX: boolean, hp: number, maxHp: number) {
    this.send({ type: "player_update", x, y, anim, flipX, hp, maxHp });
  }

  sendBulletFired(x: number, y: number, vx: number, vy: number, damage: number = 1, texture: string = "bullet") {
    this.send({ type: "bullet_fired", x, y, vx, vy, damage, texture });
  }

  sendPlayerDied() {
    this.send({ type: "player_died" });
  }

  sendPlayerRespawn(x: number, y: number) {
    this.send({ type: "player_respawn", x, y });
  }

  // === ENEMY SYNC ===

  sendEnemyDamage(enemyIdx: number, damage: number, kbX: number = 0, kbY: number = 0) {
    this.send({ type: "enemy_damage", enemyIdx, damage, kbX, kbY });
  }

  sendEnemySync(enemies: { idx: number; x: number; y: number; hp: number; state: string }[]) {
    this.send({ type: "enemy_sync", enemies });
  }

  sendEnemyKilled(enemyIdx: number, x: number, y: number) {
    this.send({ type: "enemy_killed", enemyIdx, x, y });
  }

  // === ROOM SYNC ===

  sendRoomLocked(roomIndex: number) {
    this.send({ type: "room_locked", roomIndex });
  }

  sendRoomUnlocked(roomIndex: number) {
    this.send({ type: "room_unlocked", roomIndex });
  }

  // === BOSS SYNC ===

  sendBossPhase(phase: number, hp: number, maxHp: number) {
    this.send({ type: "boss_phase", phase, hp, maxHp });
  }

  sendBossAbility(ability: string, x: number, y: number, targetX: number = 0, targetY: number = 0) {
    this.send({ type: "boss_ability", ability, x, y, targetX, targetY });
  }

  sendBossDefeated(x: number, y: number) {
    this.send({ type: "boss_defeated", x, y });
  }

  // === ITEMS ===

  sendItemSpawned(x: number, y: number, itemType: string) {
    this.send({ type: "item_spawned", x, y, itemType });
  }

  sendItemPicked(itemIdx: number) {
    this.send({ type: "item_picked", itemIdx });
  }

  // === PVP ===

  sendPvpHit(targetId: number, damage: number) {
    this.send({ type: "pvp_hit", targetId, damage });
  }

  sendPvpKill(victimId: number, victimName: string) {
    this.send({ type: "pvp_kill", victimId, victimName });
  }

  // === FLOOR ===

  sendNextFloor() {
    this.send({ type: "next_floor" });
  }

  // === CHAT ===

  sendChat(text: string) {
    this.send({ type: "chat", text });
  }

  // === PING ===

  sendPing() {
    this.send({ type: "ping", time: Date.now() });
  }

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// Singleton
export const network = new NetworkManager();
