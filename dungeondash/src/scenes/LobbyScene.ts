import Phaser from "phaser";
import Graphics from "../assets/Graphics";
import { network } from "../network/NetworkManager";
import RemotePlayer from "../entities/RemotePlayer";

const LOBBY_W = 20;
const LOBBY_H = 14;
const PLAYER_SPEED = 100;

export default class LobbyScene extends Phaser.Scene {
  private state: "menu" | "connecting" | "lobby" = "menu";
  private playerName = "";
  private serverAddress = "";

  // Menu UI
  private menuGroup!: Phaser.GameObjects.Group;

  // Lobby room
  private lobbyPlayer!: Phaser.Physics.Arcade.Sprite;
  private remotePlayers: globalThis.Map<number, RemotePlayer> = new Map();
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private lastNetSync = 0;

  // Lobby UI
  private roomCodeText!: Phaser.GameObjects.Text;
  private playersText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private startPortal!: Phaser.GameObjects.Sprite | null;
  private startText!: Phaser.GameObjects.Text | null;

  // Movement keys
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  constructor() {
    super("LobbyScene");
  }

  preload() {
    this.load.image(Graphics.environment.name, Graphics.environment.file);
    this.load.image(Graphics.util.name, Graphics.util.file);
    this.load.spritesheet(Graphics.player.name, Graphics.player.file, {
      frameHeight: Graphics.player.height,
      frameWidth: Graphics.player.width
    });
  }

  create() {
    this.state = "menu";
    this.remotePlayers = new Map();
    this.startPortal = null;
    this.startText = null;

    this.cameras.main.setBackgroundColor("#0a0a1a");

    // Create player animations if not yet
    if (!this.anims.exists(Graphics.player.animations.idle.key)) {
      Object.values(Graphics.player.animations).forEach((anim: any) => {
        if (!this.anims.exists(anim.key)) {
          this.anims.create({
            key: anim.key,
            frames: this.anims.generateFrameNumbers(Graphics.player.name, anim.frames),
            frameRate: anim.frameRate || 8,
            repeat: anim.repeat !== undefined ? anim.repeat : -1
          });
        }
      });
    }

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard.addKey("W"),
      A: this.input.keyboard.addKey("A"),
      S: this.input.keyboard.addKey("S"),
      D: this.input.keyboard.addKey("D")
    };

    this.playerName = "Player" + Phaser.Math.Between(1, 99);
    const host = window.location.hostname || "localhost";
    this.serverAddress = `ws://${host}:3002`;

    // Show menu
    this.showMenu();
    this.setupKeys();
    this.setupNetworkHandlers();
  }

  // ===== MENU =====
  private showMenu() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.menuGroup = this.add.group();

    const title = this.add.text(W / 2, H / 2 - 100, "⚔ DUNGEON DASH ⚔", {
      fontSize: "32px", fontFamily: "monospace", color: "#ffcc00",
      stroke: "#000000", strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    const sub = this.add.text(W / 2, H / 2 - 60, "MULTIPLAYER", {
      fontSize: "16px", fontFamily: "monospace", color: "#8888cc"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    const opts = this.add.text(W / 2, H / 2 + 20, [
      "[1] Co-op Room",
      "[2] PvP Room",
      "[3] Join Room",
      "[S] Solo Play",
    ].join("\n"), {
      fontSize: "16px", fontFamily: "monospace", color: "#aaaacc", align: "center"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    const server = this.add.text(W / 2, H / 2 + 120, `Server: ${this.serverAddress}`, {
      fontSize: "12px", fontFamily: "monospace", color: "#444466"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    this.menuGroup.addMultiple([title, sub, opts, server]);
  }

  private hideMenu() {
    this.menuGroup.clear(true, true);
  }

  // ===== LOBBY ROOM =====
  private buildLobbyRoom() {
    this.hideMenu();

    // Build a small tile room
    const tW = Graphics.environment.width;
    const tH = Graphics.environment.height;

    this.tilemap = this.make.tilemap({
      tileWidth: tW, tileHeight: tH,
      width: LOBBY_W, height: LOBBY_H
    });

    const tileset = this.tilemap.addTilesetImage(
      Graphics.environment.name, Graphics.environment.name,
      tW, tH, Graphics.environment.margin, Graphics.environment.spacing
    );

    // Ground
    const ground = this.tilemap.createBlankLayer("Ground", tileset, 0, 0)!;
    for (let y = 0; y < LOBBY_H; y++) {
      for (let x = 0; x < LOBBY_W; x++) {
        const floorIdx = Graphics.environment.indices.floor.outer;
        ground.putTileAt(floorIdx[Phaser.Math.Between(0, floorIdx.length - 1)], x, y);
      }
    }
    ground.forEachTile(t => { t.tint = 0x8888aa; });
    ground.setDepth(1);

    // Walls
    this.wallLayer = this.tilemap.createBlankLayer("Wall", tileset, 0, 0)!;
    for (let x = 0; x < LOBBY_W; x++) {
      this.wallLayer.putTileAt(Graphics.environment.indices.block, x, 0);
      this.wallLayer.putTileAt(Graphics.environment.indices.block, x, LOBBY_H - 1);
    }
    for (let y = 0; y < LOBBY_H; y++) {
      this.wallLayer.putTileAt(Graphics.environment.indices.block, 0, y);
      this.wallLayer.putTileAt(Graphics.environment.indices.block, LOBBY_W - 1, y);
    }
    this.wallLayer.setCollisionBetween(0, 0x7f);
    this.wallLayer.forEachTile(t => { t.tint = 0xaaaacc; });
    this.wallLayer.setDepth(2);

    // Player sprite in center
    const cx = this.tilemap.tileToWorldX(Math.floor(LOBBY_W / 2));
    const cy = this.tilemap.tileToWorldY(Math.floor(LOBBY_H / 2));
    this.lobbyPlayer = this.physics.add.sprite(cx, cy, Graphics.player.name, 0);
    this.lobbyPlayer.setDepth(9);
    this.lobbyPlayer.anims.play(Graphics.player.animations.idle.key);
    const body = this.lobbyPlayer.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10);
    body.setCollideWorldBounds(false);

    // Collision with walls
    this.physics.add.collider(this.lobbyPlayer, this.wallLayer);

    // Camera
    this.cameras.main.startFollow(this.lobbyPlayer, true, 0.1, 0.1);
    this.cameras.main.setZoom(3);
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Player name above head
    const nameTag = this.add.text(cx, cy - 12, this.playerName, {
      fontSize: "6px", fontFamily: "monospace", color: "#44ff44",
      stroke: "#000", strokeThickness: 1
    }).setOrigin(0.5).setDepth(200);
    // Follow player
    this.events.on("update", () => {
      if (this.lobbyPlayer) {
        nameTag.setPosition(this.lobbyPlayer.x, this.lobbyPlayer.y - 12);
      }
    });

    // ===== IN-ROOM INFO BOARDS =====

    // Room code — board on top wall center
    const codeX = this.tilemap.tileToWorldX(Math.floor(LOBBY_W / 2)) + tW / 2;
    const codeY = this.tilemap.tileToWorldY(1) + tH / 2;
    // Board background
    const codeBg = this.add.rectangle(codeX, codeY, 60, 16, 0x222244, 0.9);
    codeBg.setDepth(3).setStrokeStyle(1, 0x4444aa);
    this.roomCodeText = this.add.text(codeX, codeY, "", {
      fontSize: "7px", fontFamily: "monospace", color: "#00ff88",
      stroke: "#000", strokeThickness: 1, align: "center"
    }).setOrigin(0.5).setDepth(4);

    // Mode — above code board
    this.modeText = this.add.text(codeX, codeY - 11, "", {
      fontSize: "6px", fontFamily: "monospace", color: "#ffcc00",
      stroke: "#000", strokeThickness: 1
    }).setOrigin(0.5).setDepth(4);

    // Players board — on left wall
    const plX = this.tilemap.tileToWorldX(1) + tW / 2 + 2;
    const plY = this.tilemap.tileToWorldY(3) + tH / 2;
    const plBg = this.add.rectangle(plX + 16, plY + 10, 40, 36, 0x222244, 0.85);
    plBg.setDepth(3).setStrokeStyle(1, 0x4444aa);
    // "Players" label on board
    this.add.text(plX + 16, plY - 4, "PLAYERS", {
      fontSize: "5px", fontFamily: "monospace", color: "#888899"
    }).setOrigin(0.5).setDepth(4);
    this.playersText = this.add.text(plX + 2, plY + 2, "", {
      fontSize: "5px", fontFamily: "monospace", color: "#aaddff",
      stroke: "#000", strokeThickness: 1
    }).setDepth(4);

    // Hint text — on floor near start portal area
    const hintX = this.tilemap.tileToWorldX(LOBBY_W - 4) + tW / 2;
    const hintY = this.tilemap.tileToWorldY(LOBBY_H - 3) + tH / 2;
    this.hintText = this.add.text(hintX, hintY, "", {
      fontSize: "5px", fontFamily: "monospace", color: "#666688",
      align: "center"
    }).setOrigin(0.5).setDepth(4);

    // Decorations — weapon racks, torches, etc
    const decors = [
      { x: 4, y: 1, text: "⚔" },
      { x: LOBBY_W - 5, y: 1, text: "🛡" },
      { x: 2, y: LOBBY_H - 2, text: "🔥" },
      { x: LOBBY_W - 3, y: LOBBY_H - 2, text: "🔥" },
      { x: Math.floor(LOBBY_W / 2) - 4, y: 1, text: "🏮" },
      { x: Math.floor(LOBBY_W / 2) + 4, y: 1, text: "🏮" },
    ];
    for (const d of decors) {
      this.add.text(
        this.tilemap.tileToWorldX(d.x) + tW / 2,
        this.tilemap.tileToWorldY(d.y) + tH / 2,
        d.text, { fontSize: "8px" }
      ).setOrigin(0.5).setDepth(3);
    }

    // Start portal (host only) — in center-right
    if (network.isHost) {
      this.createStartPortal();
    }
  }

  private createStartPortal() {
    const tW = Graphics.environment.width;
    const tH = Graphics.environment.height;
    const px = this.tilemap.tileToWorldX(LOBBY_W - 3) + tW / 2;
    const py = this.tilemap.tileToWorldY(Math.floor(LOBBY_H / 2)) + tH / 2;

    // Portal glow
    const glow = this.add.circle(px, py, 12, 0x00ff88, 0.2);
    glow.setDepth(3);
    this.tweens.add({
      targets: glow, alpha: 0.4, scaleX: 1.3, scaleY: 1.3,
      duration: 800, yoyo: true, repeat: -1
    });

    // Portal text
    this.startText = this.add.text(px, py - 14, "▶ START", {
      fontSize: "7px", fontFamily: "monospace", color: "#00ff88",
      stroke: "#000", strokeThickness: 2
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({
      targets: this.startText, y: (this.startText as any).y - 3,
      duration: 600, yoyo: true, repeat: -1
    });

    // Portal zone (invisible sprite for overlap)
    this.startPortal = this.physics.add.sprite(px, py, Graphics.util.name);
    this.startPortal.setVisible(false);
    (this.startPortal.body as Phaser.Physics.Arcade.Body).setSize(18, 18);

    // Detect player overlap
    this.physics.add.overlap(this.lobbyPlayer, this.startPortal, () => {
      if (network.isHost && network.players.length >= 1) {
        network.startGame();
        this.startPortal!.destroy();
        this.startPortal = null;
      }
    });
  }

  // ===== KEYS =====
  private setupKeys() {
    this.input.keyboard.on("keydown-S", () => {
      if (this.state !== "menu") return;
      this.scene.start("DungeonScene");
    });
    this.input.keyboard.on("keydown-ONE", () => {
      if (this.state !== "menu") return;
      this.createRoom("coop");
    });
    this.input.keyboard.on("keydown-TWO", () => {
      if (this.state !== "menu") return;
      this.createRoom("pvp");
    });
    this.input.keyboard.on("keydown-THREE", () => {
      if (this.state !== "menu") return;
      this.promptJoinRoom();
    });
    this.input.keyboard.on("keydown-ENTER", () => {
      if (this.state === "lobby" && network.isHost) {
        network.startGame();
      }
    });
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.state === "lobby") {
        network.disconnect();
        this.state = "menu";
        this.scene.restart();
      }
    });
  }

  // ===== NETWORK =====
  private async createRoom(mode: "coop" | "pvp") {
    this.state = "connecting";
    this.hideMenu();

    const W = this.cameras.main.width;
    const loadingText = this.add.text(W / 2, this.cameras.main.height / 2, "Connecting...", {
      fontSize: "16px", fontFamily: "monospace", color: "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(600);

    try {
      await network.connect(this.serverAddress);
      network.createRoom(this.playerName, mode);
      loadingText.destroy();
    } catch (e) {
      loadingText.setText("Failed to connect!\nMake sure server.js is running\nnode server.js");
      this.time.delayedCall(2000, () => this.scene.restart());
    }
  }

  private async promptJoinRoom() {
    const code = prompt("Enter room code:");
    if (!code) return;

    this.state = "connecting";
    this.hideMenu();

    try {
      await network.connect(this.serverAddress);
      network.joinRoom(code.trim(), this.playerName);
    } catch (e) {
      this.scene.restart();
    }
  }

  private setupNetworkHandlers() {
    network.on("room_created", (msg) => {
      this.state = "lobby";
      network.playerId = msg.playerId;
      network.isHost = true;
      network.roomCode = msg.code;
      network.mode = msg.mode;

      this.buildLobbyRoom();
      this.roomCodeText.setText(`Room: ${msg.code}`);
      this.modeText.setText(msg.mode.toUpperCase());
      this.hintText.setText("Walk to ▶ START or press ENTER | ESC = back");
      this.updatePlayerList([{ id: msg.playerId, name: this.playerName }]);
    });

    network.on("room_joined", (msg) => {
      this.state = "lobby";
      network.playerId = msg.playerId;
      network.isHost = false;
      network.roomCode = msg.code;
      network.mode = msg.mode;
      network.players = msg.players;

      this.buildLobbyRoom();
      this.roomCodeText.setText(`Room: ${msg.code}`);
      this.modeText.setText(msg.mode.toUpperCase());
      this.hintText.setText("Waiting for host... | ESC = back");
      this.updatePlayerList(msg.players);
    });

    network.on("player_joined", (msg) => {
      network.players = msg.players;
      this.updatePlayerList(msg.players);
    });

    network.on("player_left", (msg) => {
      // Remove remote player sprite
      const rp = this.remotePlayers.get(msg.id || msg.playerId);
      if (rp) {
        rp.destroy();
        this.remotePlayers.delete(msg.id || msg.playerId);
      }
      if (msg.players) {
        network.players = msg.players;
        this.updatePlayerList(msg.players);
      }
    });

    network.on("player_update", (msg) => {
      if (this.state !== "lobby") return;
      let remote = this.remotePlayers.get(msg.id);
      if (!remote) {
        const pl = network.players.find((pp: any) => pp.id === msg.id);
        const name = pl ? pl.name : `Player${msg.id}`;
        remote = new RemotePlayer(msg.id, name, msg.x, msg.y, this);
        this.remotePlayers.set(msg.id, remote);
      }
      remote.updatePosition(msg.x, msg.y, msg.anim, msg.flipX);
    });

    network.on("game_start", (msg) => {
      this.scene.start("DungeonScene", {
        multiplayer: true,
        seed: msg.seed,
        mode: msg.mode,
        floor: msg.floor
      });
    });

    network.on("error", () => {
      this.scene.restart();
    });
  }

  private updatePlayerList(players: { id: number; name: string }[]) {
    if (!this.playersText) return;
    const names = players.map((p) =>
      `${p.name}${p.id === network.playerId ? " (you)" : ""}`
    ).join("\n");
    this.playersText.setText(`Players:\n${names}`);
  }

  // ===== UPDATE =====
  update(time: number, _delta: number) {
    if (this.state !== "lobby" || !this.lobbyPlayer) return;

    // Movement
    const body = this.lobbyPlayer.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    let moving = false;
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      body.setVelocityX(-PLAYER_SPEED);
      this.lobbyPlayer.setFlipX(true);
      moving = true;
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      body.setVelocityX(PLAYER_SPEED);
      this.lobbyPlayer.setFlipX(false);
      moving = true;
    }
    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      body.setVelocityY(-PLAYER_SPEED);
      moving = true;
    } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
      body.setVelocityY(PLAYER_SPEED);
      moving = true;
    }

    // Animation
    const anim = moving ? Graphics.player.animations.walk.key : Graphics.player.animations.idle.key;
    if (this.lobbyPlayer.anims.currentAnim?.key !== anim) {
      this.lobbyPlayer.anims.play(anim, true);
    }

    // Update remote players
    this.remotePlayers.forEach(r => r.update());

    // Network sync position
    if (network.connected && time > this.lastNetSync + 50) {
      this.lastNetSync = time;
      network.sendPlayerUpdate(
        this.lobbyPlayer.x,
        this.lobbyPlayer.y,
        anim,
        this.lobbyPlayer.flipX,
        10, 10
      );
    }
  }
}
