import Phaser from "phaser";
import Graphics from "../assets/Graphics";
import FOVLayer from "../entities/FOVLayer";
import Player from "../entities/Player";

import EnemyBase from "../entities/EnemyBase";
import Item from "../entities/Item";
import DungeonMap from "../entities/Map";
import { DungeonRoom, RoomType } from "../entities/Map";
import { TileType } from "../entities/Tile";
import RemotePlayer from "../entities/RemotePlayer";
import Slime, { SlimeSize } from "../entities/Slime";
import BossYarik from "../entities/BossYarik";
import { network } from "../network/NetworkManager";

const worldTileHeight = 81;
const worldTileWidth = 81;

export default class DungeonScene extends Phaser.Scene {
  lastX: number;
  lastY: number;
  player: Player | null;
  enemies: EnemyBase[];
  enemyGroup: Phaser.Physics.Arcade.Group | null;
  fov: FOVLayer | null;
  tilemap: Phaser.Tilemaps.Tilemap | null;
  map: DungeonMap | null;
  roomDebugGraphics?: Phaser.GameObjects.Graphics;

  // Combat
  items: Item[];
  itemGroup: Phaser.GameObjects.Group | null;
  currentFloor: number;

  // Room tracking
  currentRoom: DungeonRoom | null;
  clearedRooms: Set<number>;

  // Room lock system
  roomLocked: boolean;
  lockedRoom: DungeonRoom | null;
  doorSprites: Phaser.Physics.Arcade.Sprite[];
  doorCollider: Phaser.Physics.Arcade.Collider | null;

  // Boss cutscene
  bossCutsceneActive: boolean;

  // Multiplayer
  remotePlayers: globalThis.Map<number, RemotePlayer>;
  isMultiplayer: boolean;
  lastNetSync: number;
  mapSeed: number = 0;

  // PvP dash hit cooldown
  dashHitCooldown: globalThis.Map<number, number> | null = null;

  preload(): void {
    this.load.image(Graphics.environment.name, Graphics.environment.file);
    this.load.image(Graphics.util.name, Graphics.util.file);
    this.load.spritesheet(Graphics.player.name, Graphics.player.file, {
      frameHeight: Graphics.player.height,
      frameWidth: Graphics.player.width
    });
    this.load.spritesheet(Graphics.slime.name, Graphics.slime.file, {
      frameHeight: Graphics.slime.height,
      frameWidth: Graphics.slime.width
    });
    this.load.spritesheet(Graphics.items.name, Graphics.items.file, {
      frameWidth: Graphics.items.width,
      frameHeight: Graphics.items.height
    });
    BossYarik.preloadAssets(this);
  }

  constructor() {
    super("DungeonScene");
    this.lastX = -1;
    this.lastY = -1;
    this.player = null;
    this.fov = null;
    this.tilemap = null;
    this.map = null;
    this.enemies = [];
    this.enemyGroup = null;
    this.items = [];
    this.itemGroup = null;
    this.currentFloor = 1;
    this.currentRoom = null;
    this.clearedRooms = new Set();
    this.roomLocked = false;
    this.lockedRoom = null;
    this.doorSprites = [];
    this.doorCollider = null;
    this.bossCutsceneActive = false;
    this.remotePlayers = new globalThis.Map();
    this.isMultiplayer = false;
    this.lastNetSync = 0;
  }

  create(): void {
    // Reset state
    this.enemies = [];
    this.items = [];
    this.clearedRooms = new Set();
    this.roomLocked = false;
    this.lockedRoom = null;
    this.doorSprites = [];
    this.doorCollider = null;
    this.bossCutsceneActive = false;

    // Generate procedural bullet textures
    if (!this.textures.exists("bullet")) {
      const gfx = this.make.graphics({ x: 0, y: 0, add: false });
      // Yellow bullet (pistol/rifle/shotgun)
      gfx.fillStyle(0xffff44, 1);
      gfx.fillCircle(3, 3, 3);
      gfx.fillStyle(0xffffff, 0.8);
      gfx.fillCircle(2, 2, 1);
      gfx.generateTexture("bullet", 6, 6);
      gfx.clear();

      // Blue magic bullet (staff)
      gfx.fillStyle(0x4488ff, 1);
      gfx.fillCircle(4, 4, 4);
      gfx.fillStyle(0xaaddff, 0.8);
      gfx.fillCircle(3, 3, 2);
      gfx.generateTexture("bullet_magic", 8, 8);
      gfx.clear();

      // Coin
      gfx.fillStyle(0xffd700, 1);
      gfx.fillCircle(4, 4, 4);
      gfx.fillStyle(0xffee88, 1);
      gfx.fillCircle(3, 3, 2);
      gfx.lineStyle(1, 0xcc9900, 1);
      gfx.strokeCircle(4, 4, 4);
      gfx.generateTexture("coin_drop", 8, 8);
      gfx.clear();

      // Health potion (green)
      gfx.fillStyle(0x00cc44, 1);
      gfx.fillRoundedRect(1, 2, 6, 8, 2);
      gfx.fillStyle(0x00ff66, 1);
      gfx.fillRoundedRect(2, 3, 4, 3, 1);
      gfx.fillStyle(0x888888, 1);
      gfx.fillRect(2, 0, 4, 3);
      gfx.generateTexture("health_drop", 8, 12);
      gfx.clear();

      // Energy orb (blue glow)
      gfx.fillStyle(0x2266ff, 0.6);
      gfx.fillCircle(5, 5, 5);
      gfx.fillStyle(0x44aaff, 1);
      gfx.fillCircle(5, 5, 3);
      gfx.fillStyle(0xaaddff, 0.8);
      gfx.fillCircle(4, 4, 1);
      gfx.generateTexture("energy_drop", 10, 10);
      gfx.destroy();
    }

    // Door texture
    if (!this.textures.exists("door_block")) {
      const gfx = this.make.graphics({ x: 0, y: 0, add: false });
      gfx.fillStyle(0x664422, 1);
      gfx.fillRect(0, 0, 16, 16);
      gfx.fillStyle(0x553311, 1);
      gfx.fillRect(2, 2, 12, 12);
      gfx.fillStyle(0x886633, 1);
      gfx.fillRect(4, 4, 8, 8);
      gfx.lineStyle(1, 0x443311, 1);
      gfx.strokeRect(1, 1, 14, 14);
      gfx.generateTexture("door_block", 16, 16);
      gfx.destroy();
    }

    this.events.on("wake", () => {
      this.scene.run("UIScene");
    });

    // Register animations
    Object.values(Graphics.player.animations).forEach(anim => {
      if (!this.anims.get(anim.key)) {
        this.anims.create({
          ...anim,
          frames: this.anims.generateFrameNumbers(
            Graphics.player.name,
            anim.frames
          )
        });
      }
    });

    Object.values(Graphics.slime.animations).forEach(anim => {
      if (!this.anims.get(anim.key)) {
        this.anims.create({
          ...anim,
          frames: this.anims.generateFrameNumbers(
            Graphics.slime.name,
            anim.frames
          )
        });
      }
    });

    // Build map (pass floor as biome index, use shared seed for multiplayer)
    const initData = this.scene.settings.data as any;
    if (initData?.seed) {
      this.mapSeed = initData.seed;
    } else if (!this.mapSeed) {
      this.mapSeed = Math.floor(Math.random() * 999999);
    }
    const isPvP = network.connected && network.mode === "pvp";
    const map = new DungeonMap(worldTileWidth, worldTileHeight, this, this.currentFloor - 1, this.mapSeed, isPvP);
    this.tilemap = map.tilemap;
    this.map = map;

    // FOV (disabled in PvP — full arena visibility)
    if (!isPvP) {
      this.fov = new FOVLayer(map);
    } else {
      this.fov = null;
    }

    // Player
    this.player = new Player(
      this.tilemap.tileToWorldX(map.startingX),
      this.tilemap.tileToWorldY(map.startingY),
      this
    );

    // Scale difficulty per floor
    const hpMult = 1 + (this.currentFloor - 1) * 0.15;

    // Setup enemies from map
    this.enemies = map.slimes.map(s => s as unknown as EnemyBase);
    // Scale enemy HP
    for (const enemy of this.enemies) {
      enemy.hp = Math.ceil(enemy.hp * hpMult);
      enemy.maxHp = enemy.hp;
    }

    this.enemyGroup = this.physics.add.group(
      this.enemies.map(e => e.sprite)
    );

    // Camera
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(4);
    this.cameras.main.setBounds(
      0,
      0,
      map.width * Graphics.environment.width,
      map.height * Graphics.environment.height
    );
    this.cameras.main.startFollow(this.player.sprite);

    // Collisions: player vs walls
    this.physics.add.collider(this.player.sprite, map.wallLayer);

    // Collisions: enemies vs walls
    this.physics.add.collider(this.enemyGroup, map.wallLayer);

    // Player <-> Enemy collision (melee attack or take damage)
    this.physics.add.collider(
      this.player.sprite,
      this.enemyGroup,
      undefined,
      (_playerObj, enemyObj) => {
        const enemySprite = enemyObj as Phaser.Physics.Arcade.Sprite;
        const enemy = (enemySprite as any).enemyRef as EnemyBase;
        if (!enemy || enemy.state === "dead") return false;

        if (this.player!.isAttacking()) {
          // Dash attack kills
          const kbX = enemySprite.x - this.player!.sprite.x;
          const kbY = enemySprite.y - this.player!.sprite.y;
          enemy.takeDamage(3, kbX, kbY);
          return false;
        } else {
          // Enemy damages player
          this.player!.stagger();
          return true;
        }
      },
      this
    );

    // Bullets vs enemies
    this.physics.add.overlap(
      this.player.bulletGroup,
      this.enemyGroup,
      (bulletObj, enemyObj) => {
        const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
        const enemySprite = enemyObj as Phaser.Physics.Arcade.Sprite;
        const enemy = (enemySprite as any).enemyRef as EnemyBase;

        if (!enemy || enemy.state === "dead") return;
        if (!bullet.active) return;

        const damage = (bullet as any).damage || 1;
        const kbX = enemySprite.x - bullet.x;
        const kbY = enemySprite.y - bullet.y;
        enemy.takeDamage(damage, kbX, kbY);

        // Deactivate bullet
        bullet.setActive(false).setVisible(false);
        bullet.body.stop();
      },
      undefined,
      this
    );

    // Bullets vs walls
    this.physics.add.collider(
      this.player.bulletGroup,
      map.wallLayer,
      (bulletObj, _tileObj) => {
        const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
        bullet.setActive(false).setVisible(false);
        bullet.body.stop();
      }
    );

    // Enemy died → drop loot
    this.events.on("enemyDied", (enemy: EnemyBase) => {
      Item.dropRandom(
        enemy.sprite.x,
        enemy.sprite.y,
        this,
        this.items
      );

      // Remove from enemies array
      this.enemies = this.enemies.filter(e => e !== enemy);

      // Check if room cleared — only enemies in same room
      if (this.roomLocked && this.lockedRoom) {
        const roomEnemies = this.enemies.filter(e => {
          return (e as any).roomIndex === this.lockedRoom!.index;
        });
        if (roomEnemies.length === 0) {
          this.unlockRoom();
        }
      }
    });

    // Slime split: register new child slimes
    this.events.on("slimeSpawned", (child: EnemyBase) => {
      // Give child same room as parent
      if (this.lockedRoom) {
        (child as any).roomIndex = this.lockedRoom.index;
      }
      this.enemies.push(child);
      if (this.enemyGroup) {
        this.enemyGroup.add(child.sprite);
      }
      if (this.player) {
        this.physics.add.overlap(
          this.player.bulletGroup,
          child.sprite,
          (bulletObj, enemyObj) => {
            const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
            const enemySprite = enemyObj as Phaser.Physics.Arcade.Sprite;
            const enemy = (enemySprite as any).enemyRef as EnemyBase;
            if (!enemy || enemy.state === "dead") return;
            if (!bullet.active) return;
            const damage = (bullet as any).damage || 1;
            const kbX = enemySprite.x - bullet.x;
            const kbY = enemySprite.y - bullet.y;
            enemy.takeDamage(damage, kbX, kbY);
            bullet.setActive(false).setVisible(false);
            bullet.body.stop();
          },
          undefined,
          this
        );
      }
    });

    // Slime burst — REDUCED SHAKE
    this.events.on("slimeBurst", (x: number, y: number, range: number, _dmg: number) => {
      if (!this.player || this.player.dead) return;
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y,
        x, y
      );
      if (dist < range) {
        this.player.stagger();
        this.cameras.main.shake(60, 0.002);
      }
    });

    // === BOSS EVENTS ===

    // Boss ground slam shockwave
    this.events.on("bossShockwave", (x: number, y: number, range: number, _dmg: number) => {
      if (!this.player || this.player.dead) return;
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y, x, y
      );
      if (dist < range) {
        this.player.stagger();
      }
    });

    // Boss projectile — add wall collision
    this.events.on("bossProjectile", (proj: Phaser.Physics.Arcade.Sprite, _dmg: number) => {
      if (!this.player) return;
      this.physics.add.overlap(proj, this.player.sprite, () => {
        this.player!.stagger();
        proj.destroy();
      });
      // Projectiles collide with walls
      this.physics.add.collider(proj, map.wallLayer, () => {
        proj.destroy();
      });
    });

    // Boss summon minions
    this.events.on("bossSummon", (x: number, y: number) => {
      const minion = new Slime(x, y, this, SlimeSize.Small);
      if (this.lockedRoom) {
        (minion as any).roomIndex = this.lockedRoom.index;
      }
      this.enemies.push(minion as EnemyBase);
      if (this.enemyGroup) {
        this.enemyGroup.add(minion.sprite);
      }
      if (this.player) {
        this.physics.add.overlap(
          this.player.bulletGroup, minion.sprite,
          (_bObj: any, eObj: any) => {
            const enemy = (eObj as any).enemyRef as EnemyBase;
            if (!enemy || enemy.state === "dead") return;
            enemy.takeDamage(1, eObj.x - _bObj.x, eObj.y - _bObj.y);
            (_bObj as Phaser.Physics.Arcade.Sprite).setActive(false).setVisible(false);
          },
          undefined, this
        );
      }
    });

    // Boss defeated — spawn loot chest + portal
    this.events.on("bossDefeated", (bossX: number, bossY: number) => {
      this.unlockRoom();

      // === LOOT CHEST at boss death location ===
      this.time.delayedCall(1800, () => {
        // Create chest texture if needed
        if (!this.textures.exists("boss_chest")) {
          const gfx = this.make.graphics({ x: 0, y: 0, add: false });
          gfx.fillStyle(0xcc8800, 1);
          gfx.fillRoundedRect(0, 4, 20, 14, 2);
          gfx.fillStyle(0xffaa00, 1);
          gfx.fillRoundedRect(2, 6, 16, 10, 1);
          gfx.fillStyle(0xffdd44, 1);
          gfx.fillRect(7, 0, 6, 6);
          gfx.fillStyle(0xffffff, 0.8);
          gfx.fillRect(8, 1, 4, 4);
          gfx.lineStyle(1, 0x886600, 1);
          gfx.strokeRoundedRect(0, 4, 20, 14, 2);
          gfx.generateTexture("boss_chest", 20, 18);
          gfx.destroy();
        }

        const chest = this.add.sprite(bossX, bossY, "boss_chest");
        chest.setDepth(15);
        chest.setScale(0);

        // Pop-in animation
        this.tweens.add({
          targets: chest, scaleX: 1.5, scaleY: 1.5,
          duration: 400, ease: "Back.easeOut"
        });

        // Golden glow
        const glow = this.add.circle(bossX, bossY, 14, 0xffdd00, 0.3);
        glow.setDepth(14);
        this.tweens.add({
          targets: glow, scaleX: 2, scaleY: 2, alpha: 0.1,
          duration: 800, yoyo: true, repeat: -1
        });

        // Sparkle particles
        for (let i = 0; i < 8; i++) {
          this.time.delayedCall(i * 100, () => {
            const spark = this.add.circle(
              bossX + Phaser.Math.Between(-12, 12),
              bossY + Phaser.Math.Between(-12, 12),
              2, 0xffff00, 1
            );
            spark.setDepth(16);
            this.tweens.add({
              targets: spark, y: spark.y - 15, alpha: 0, duration: 600,
              onComplete: () => spark.destroy()
            });
          });
        }

        // Chest text
        const chestLabel = this.add.text(bossX, bossY - 18, "🎁 СУНДУК БОССА", {
          fontSize: "6px", fontFamily: "monospace", color: "#ffdd00",
          stroke: "#000000", strokeThickness: 2
        });
        chestLabel.setOrigin(0.5).setDepth(300);

        // Auto-open chest after 1s — drop big loot
        this.time.delayedCall(1000, () => {
          chestLabel.destroy();

          // Open animation
          this.tweens.add({
            targets: chest, scaleX: 2, scaleY: 0.5, duration: 100,
            yoyo: true, onComplete: () => {
              chest.setTint(0x666666);
            }
          });

          // Drop lots of loot
          Item.dropCoins(bossX, bossY, this, 10, this.items);
          this.time.delayedCall(100, () => {
            this.items.push(new Item(bossX - 8, bossY, this, "healthPotion"));
            this.items.push(new Item(bossX + 8, bossY, this, "healthPotion"));
            this.items.push(new Item(bossX, bossY - 8, this, "energyOrb"));
          });
        });
      });

      // === TELEPORT PORTAL — appears after loot ===
      this.time.delayedCall(4000, () => {
        // Portal texture
        if (!this.textures.exists("portal")) {
          const gfx = this.make.graphics({ x: 0, y: 0, add: false });
          gfx.fillStyle(0x2244ff, 0.6);
          gfx.fillCircle(12, 12, 12);
          gfx.fillStyle(0x44aaff, 0.8);
          gfx.fillCircle(12, 12, 8);
          gfx.fillStyle(0xaaddff, 0.6);
          gfx.fillCircle(12, 12, 4);
          gfx.generateTexture("portal", 24, 24);
          gfx.destroy();
        }

        const portalY = bossY + 30;
        const portal = this.physics.add.sprite(bossX, portalY, "portal");
        portal.setDepth(15).setScale(0);
        (portal.body as Phaser.Physics.Arcade.Body).setImmovable(true);

        // Spawn animation
        this.tweens.add({
          targets: portal, scaleX: 1.5, scaleY: 1.5,
          duration: 600, ease: "Elastic.easeOut"
        });

        // Spinning + pulsing
        this.tweens.add({
          targets: portal, angle: 360,
          duration: 2000, repeat: -1
        });
        this.tweens.add({
          targets: portal, scaleX: 1.8, scaleY: 1.8,
          duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
        });

        // Inner glow
        const portalGlow = this.add.circle(bossX, portalY, 16, 0x4488ff, 0.3);
        portalGlow.setDepth(14);
        this.tweens.add({
          targets: portalGlow, scaleX: 2.5, scaleY: 2.5, alpha: 0.1,
          duration: 1000, yoyo: true, repeat: -1
        });

        // Label
        const portalText = this.add.text(bossX, portalY - 20, "⚡ СЛЕДУЮЩИЙ УРОВЕНЬ", {
          fontSize: "6px", fontFamily: "monospace", color: "#44aaff",
          stroke: "#000000", strokeThickness: 2
        });
        portalText.setOrigin(0.5).setDepth(300);
        this.tweens.add({
          targets: portalText, y: portalText.y - 3,
          duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
        });

        // Player touches portal → next floor
        this.physics.add.overlap(portal, this.player!.sprite, () => {
          // Prevent double-trigger
          portal.destroy();
          portalGlow.destroy();
          portalText.destroy();

          // Teleport effect
          this.cameras.main.flash(500, 100, 150, 255);
          this.cameras.main.fade(800, 0, 0, 0, false, (_cam: any, progress: number) => {
            if (progress >= 1) {
              if (this.isMultiplayer && network.isHost) {
                // Host tells server → server broadcasts new seed to everyone
                network.sendNextFloor();
              } else if (!this.isMultiplayer) {
                // Solo
                this.currentFloor++;
                this.mapSeed = 0; // regenerate random seed
                this.events.emit("floorChanged", this.currentFloor);
                this.scene.restart();
                this.scene.get("UIScene").scene.restart();
              }
              // Non-host multiplayer: wait for "next_floor" message from server
            }
          });
        });
      });
    });

    // Player died
    this.events.on("playerDied", () => {
      this.time.timeScale = 0.3;
      this.time.delayedCall(2000, () => {
        this.time.timeScale = 1;
      });
    });

    // Keyboard shortcuts
    this.input.keyboard.on("keydown-R", () => {
      if (this.player!.dead) {
        this.currentFloor = 1;
        this.scene.restart();
        this.scene.get("UIScene").scene.restart();
      } else {
        this.scene.stop("InfoScene");
        this.scene.run("ReferenceScene");
        this.scene.sleep();
      }
    });

    this.input.keyboard.on("keydown-Q", () => {
      // Q is handled by Player for weapon switch now
    });

    this.input.keyboard.on("keydown-F", () => {
      if (this.fov) this.fov.layer.setVisible(!this.fov.layer.visible);
    });

    // N = next floor/biome (for testing)
    this.input.keyboard.on("keydown-N", () => {
      this.currentFloor++;
      this.events.emit("floorChanged", this.currentFloor);
      this.scene.restart();
      this.scene.get("UIScene").scene.restart();
    });

    // K = kill boss (debug)
    this.input.keyboard.on("keydown-K", () => {
      const boss = this.enemies.find(e => e instanceof BossYarik);
      if (boss && boss.state !== "dead") {
        boss.hp = 0;
        boss.die();
      }
    });

    // Debug graphics
    this.roomDebugGraphics = this.add.graphics({ x: 0, y: 0 });
    this.roomDebugGraphics.setVisible(false);
    this.roomDebugGraphics.lineStyle(2, 0xff5500, 0.5);
    for (let room of map.rooms) {
      this.roomDebugGraphics.strokeRect(
        this.tilemap!.tileToWorldX(room.x),
        this.tilemap!.tileToWorldY(room.y),
        this.tilemap!.tileToWorldX(room.width),
        this.tilemap!.tileToWorldY(room.height)
      );
    }

    // Start UI + show floor
    this.scene.run("UIScene");
    this.events.emit("floorChanged", this.currentFloor);
    this.events.emit("playerStatsChanged");

    // === MULTIPLAYER SETUP ===
    this.isMultiplayer = network.connected;
    this.remotePlayers = new Map();
    this.lastNetSync = 0;

    if (this.isMultiplayer) {
      this.setupNetworkHandlers();
    }
  }

  // ===== ROOM LOCK/UNLOCK SYSTEM =====
  private lockRoom(room: DungeonRoom) {
    if (this.roomLocked) return;
    this.roomLocked = true;
    this.lockedRoom = room;

    // Find corridor entrance tiles and place door blocks
    const tileW = Graphics.environment.width;
    const tileH = Graphics.environment.height;

    // Check edges of room for corridor openings
    // Top edge
    for (let x = room.x; x < room.x + room.width; x++) {
      if (room.y > 0 && this.map!.tiles[room.y - 1]?.[x]?.type === TileType.None) { // TileType.None = 0
        const wx = this.tilemap!.tileToWorldX(x) + tileW / 2;
        const wy = this.tilemap!.tileToWorldY(room.y) - tileH / 2;
        this.placeDoor(wx, wy);
      }
    }
    // Bottom edge
    for (let x = room.x; x < room.x + room.width; x++) {
      const botY = room.y + room.height;
      if (botY < this.map!.height && this.map!.tiles[botY]?.[x]?.type === TileType.None) {
        const wx = this.tilemap!.tileToWorldX(x) + tileW / 2;
        const wy = this.tilemap!.tileToWorldY(botY) + tileH / 2;
        this.placeDoor(wx, wy);
      }
    }
    // Left edge
    for (let y = room.y; y < room.y + room.height; y++) {
      if (room.x > 0 && this.map!.tiles[y]?.[room.x - 1]?.type === TileType.None) {
        const wx = this.tilemap!.tileToWorldX(room.x) - tileW / 2;
        const wy = this.tilemap!.tileToWorldY(y) + tileH / 2;
        this.placeDoor(wx, wy);
      }
    }
    // Right edge
    for (let y = room.y; y < room.y + room.height; y++) {
      const rightX = room.x + room.width;
      if (rightX < this.map!.width && this.map!.tiles[y]?.[rightX]?.type === TileType.None) {
        const wx = this.tilemap!.tileToWorldX(rightX) + tileW / 2;
        const wy = this.tilemap!.tileToWorldY(y) + tileH / 2;
        this.placeDoor(wx, wy);
      }
    }

    // Add collision for doors vs player & enemies
    if (this.doorSprites.length > 0) {
      const doorGroup = this.physics.add.staticGroup();
      this.doorSprites.forEach(d => doorGroup.add(d));
      this.doorCollider = this.physics.add.collider(this.player!.sprite, doorGroup);
      this.physics.add.collider(this.enemyGroup!, doorGroup);
      // Bullets collide with doors too
      this.physics.add.collider(this.player!.bulletGroup, doorGroup, (bObj: any) => {
        bObj.setActive(false).setVisible(false);
        bObj.body.stop();
      });
    }

    // Camera effect — subtle
    this.cameras.main.shake(100, 0.003);

    // Network sync
    if (this.isMultiplayer) {
      network.sendRoomLocked(room.index);
    }

    // Teleport player into room if they're outside
    if (this.player) {
      const tm = this.tilemap!;
      const roomWorldX1 = tm.tileToWorldX(room.x);
      const roomWorldY1 = tm.tileToWorldY(room.y);
      const roomWorldX2 = tm.tileToWorldX(room.x + room.width);
      const roomWorldY2 = tm.tileToWorldY(room.y + room.height);
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;

      const isInside = px >= roomWorldX1 && px <= roomWorldX2 && py >= roomWorldY1 && py <= roomWorldY2;

      if (!isInside) {
        // Teleport to room center
        const cx = tm.tileToWorldX(room.x + Math.floor(room.width / 2));
        const cy = tm.tileToWorldY(room.y + Math.floor(room.height / 2));
        this.player.sprite.setPosition(cx, cy);
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
        body.reset(cx, cy);

        // VFX
        this.cameras.main.flash(200, 100, 100, 255);
        const tpText = this.add.text(cx, cy - 15, "⚡ ТЕЛЕПОРТ", {
          fontSize: "7px", fontFamily: "monospace", color: "#44aaff",
          stroke: "#000000", strokeThickness: 2
        });
        tpText.setOrigin(0.5).setDepth(300);
        this.tweens.add({
          targets: tpText, y: tpText.y - 20, alpha: 0, duration: 1000,
          onComplete: () => tpText.destroy()
        });
      }
    }
  }

  private placeDoor(x: number, y: number) {
    const door = this.physics.add.staticSprite(x, y, "door_block");
    door.setDepth(10);
    door.setImmovable(true);
    (door.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16);
    this.doorSprites.push(door);
  }

  private unlockRoom() {
    this.roomLocked = false;
    if (this.lockedRoom) {
      this.lockedRoom.cleared = true;
      this.clearedRooms.add(this.lockedRoom.index);
      // Network sync
      if (this.isMultiplayer) {
        network.sendRoomUnlocked(this.lockedRoom.index);
      }
    }
    this.lockedRoom = null;

    // Destroy door sprites with effect
    for (const door of this.doorSprites) {
      this.tweens.add({
        targets: door,
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: 300,
        onComplete: () => door.destroy()
      });
    }
    this.doorSprites = [];
    this.doorCollider = null;

    // "Room cleared!" text
    if (this.player) {
      const rc = this.add.text(
        this.player.sprite.x, this.player.sprite.y - 20,
        "✓ КОМНАТА ЗАЧИЩЕНА",
        { fontSize: "8px", fontFamily: "monospace", color: "#44ff44", stroke: "#000000", strokeThickness: 2 }
      );
      rc.setOrigin(0.5).setDepth(300);
      this.tweens.add({
        targets: rc, y: rc.y - 30, alpha: 0, duration: 1500,
        onComplete: () => rc.destroy()
      });
    }

    this.events.emit("roomCleared");
  }

  // ===== BOSS CUTSCENE =====
  private startBossCutscene(bossRoom: DungeonRoom) {
    this.bossCutsceneActive = true;

    // Lock room first
    this.lockRoom(bossRoom);

    // Find the boss enemy
    const boss = this.enemies.find(e => e instanceof BossYarik) as BossYarik | undefined;
    if (!boss) { this.bossCutsceneActive = false; return; }

    // Stop player input
    const body = this.player!.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    // Pan camera to boss
    this.cameras.main.stopFollow();

    // Zoom out slightly
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 2.5,
      duration: 800,
      ease: "Sine.easeInOut",
    });

    this.cameras.main.pan(
      boss.sprite.x, boss.sprite.y,
      800, "Sine.easeInOut", false,
      (_cam: any, progress: number) => {
        if (progress >= 1) {
          // Show boss name
          const nameText = this.add.text(
            boss.sprite.x, boss.sprite.y - 35,
            "👹 БОСС: ЯРИК 👹",
            { fontSize: "10px", fontFamily: "monospace", color: "#ff4444", stroke: "#000000", strokeThickness: 3 }
          );
          nameText.setOrigin(0.5).setDepth(400);

          const subtitleText = this.add.text(
            boss.sprite.x, boss.sprite.y - 22,
            "Лысый Зелёный Гоблин",
            { fontSize: "7px", fontFamily: "monospace", color: "#aaaaaa", stroke: "#000000", strokeThickness: 2 }
          );
          subtitleText.setOrigin(0.5).setDepth(400);

          // Dramatic pause, then pan back
          this.time.delayedCall(1500, () => {
            this.tweens.add({
              targets: [nameText, subtitleText],
              alpha: 0, y: "-=15",
              duration: 500,
              onComplete: () => { nameText.destroy(); subtitleText.destroy(); }
            });

            // Pan back to player & zoom back
            this.cameras.main.pan(
              this.player!.sprite.x, this.player!.sprite.y,
              600, "Sine.easeInOut", false,
              (_c: any, p2: number) => {
                if (p2 >= 1) {
                  this.cameras.main.startFollow(this.player!.sprite);
                  this.bossCutsceneActive = false;
                }
              }
            );

            this.tweens.add({
              targets: this.cameras.main,
              zoom: 3,
              duration: 600,
              ease: "Sine.easeInOut",
            });
          });
        }
      }
    );
  }

  private setupNetworkHandlers() {
    // Clear stale handlers from previous scenes (LobbyScene etc.)
    const eventTypes = [
      "player_update", "bullet_fired", "enemy_damage", "enemy_killed",
      "enemy_sync", "room_locked", "room_unlocked", "next_floor",
      "pvp_hit", "pvp_kill", "player_left", "player_died",
      "player_respawn", "chat", "disconnected"
    ];
    for (const evt of eventTypes) {
      network.off(evt);
    }

    // === Remote player positions ===
    network.on("player_update", (msg: any) => {
      let remote = this.remotePlayers.get(msg.id);
      if (!remote) {
        const pl = network.players.find((pp: any) => pp.id === msg.id);
        const name = pl ? pl.name : `Player${msg.id}`;
        remote = new RemotePlayer(msg.id, name, msg.x, msg.y, this);
        this.remotePlayers.set(msg.id, remote);
      }
      remote.updatePosition(msg.x, msg.y, msg.anim, msg.flipX);
      if (msg.hp !== undefined) remote.updateHp(msg.hp, msg.maxHp);
    });

    // === Remote bullets ===
    network.on("bullet_fired", (msg: any) => {
      const tex = msg.texture || "bullet";
      const bullet = this.physics.add.sprite(msg.x, msg.y, tex);
      bullet.setDepth(8);
      // PvP: red bullets, Coop: blue bullets
      bullet.setTint(network.mode === "pvp" ? 0xff4444 : 0x88aaff);
      const dmg = msg.damage || 1;
      (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(msg.vx, msg.vy);
      this.time.delayedCall(2000, () => { if (bullet.active) bullet.destroy(); });

      // Co-op: remote bullets hit enemies
      if (network.mode === "coop" && this.enemyGroup) {
        this.physics.add.overlap(bullet, this.enemyGroup, (_b: any, eObj: any) => {
          const es = eObj as Phaser.Physics.Arcade.Sprite;
          const enemy = (es as any).enemyRef as EnemyBase;
          if (!enemy || enemy.state === "dead") return;
          if (!bullet.active) return;
          enemy.takeDamage(dmg, es.x - bullet.x, es.y - bullet.y);
          bullet.setActive(false).setVisible(false);
          bullet.body.stop();
        });
      }

      // Bullets vs walls
      if (this.map?.wallLayer) {
        this.physics.add.collider(bullet, this.map.wallLayer, () => {
          bullet.setActive(false).setVisible(false);
          bullet.body.stop();
        });
      }

      // PvP: remote bullets hit local player directly
      if (network.mode === "pvp" && this.player && !this.player.dead) {
        this.physics.add.overlap(bullet, this.player.sprite, () => {
          if (!bullet.active) return;
          this.player!.takeDamage(dmg);
          bullet.setActive(false).setVisible(false);
          bullet.body.stop();
        });
      }
    });

    // === Enemy damage from remote player (coop) ===
    network.on("enemy_damage", (msg: any) => {
      if (msg.fromPlayer === network.playerId) return; // already applied locally
      const enemy = this.enemies[msg.enemyIdx];
      if (enemy && enemy.state !== "dead") {
        enemy.takeDamage(msg.damage, msg.kbX || 0, msg.kbY || 0);
      }
    });

    // === Enemy killed sync ===
    network.on("enemy_killed", (msg: any) => {
      if (msg.fromPlayer === network.playerId) return;
      const enemy = this.enemies[msg.enemyIdx];
      if (enemy && enemy.state !== "dead") {
        enemy.hp = 0;
        enemy.die();
      }
    });

    // === Host enemy sync (positions/HP) — non-host clients apply ===
    network.on("enemy_sync", (msg: any) => {
      if (network.isHost) return; // host doesn't need sync from self
      for (const data of msg.enemies) {
        const enemy = this.enemies[data.idx];
        if (enemy && enemy.state !== "dead") {
          // Smooth interpolation for positions
          const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
          if (body) {
            const dx = data.x - enemy.sprite.x;
            const dy = data.y - enemy.sprite.y;
            if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
              // Teleport if too far off
              enemy.sprite.setPosition(data.x, data.y);
              body.reset(data.x, data.y);
            }
          }
          enemy.hp = data.hp;
        }
      }
    });

    // === Room lock/unlock sync ===
    network.on("room_locked", (msg: any) => {
      if (msg.fromPlayer === network.playerId) return;
      const room = this.map?.rooms.find(r => r.index === msg.roomIndex);
      if (room && !this.roomLocked) {
        this.lockRoom(room);
      }
    });

    network.on("room_unlocked", (msg: any) => {
      if (msg.fromPlayer === network.playerId) return;
      if (this.roomLocked) {
        this.unlockRoom();
      }
    });

    // === Next floor sync ===
    network.on("next_floor", (msg: any) => {
      this.currentFloor = msg.floor;
      this.mapSeed = msg.seed;
      this.events.emit("floorChanged", this.currentFloor);
      this.scene.restart();
      this.scene.get("UIScene").scene.restart();
    });

    // === PvP hit ===
    network.on("pvp_hit", (msg: any) => {
      if (msg.targetId === network.playerId && this.player) {
        this.player.takeDamage(msg.damage);
      }
    });

    // === PvP kill notification ===
    network.on("pvp_kill", (msg: any) => {
      const killText = this.add.text(
        this.cameras.main.width / 6, 30,
        `☠ ${msg.killerName} убил ${msg.victimName}`,
        { fontSize: "8px", fontFamily: "monospace", color: "#ff4444", stroke: "#000", strokeThickness: 2 }
      );
      killText.setScrollFactor(0).setDepth(400).setOrigin(0.5);
      this.tweens.add({
        targets: killText, alpha: 0, y: killText.y - 10, duration: 3000,
        onComplete: () => killText.destroy()
      });
    });

    // === Player left ===
    network.on("player_left", (msg: any) => {
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.destroy();
        this.remotePlayers.delete(msg.id);
      }
    });

    // === Player died ===
    network.on("player_died", (msg: any) => {
      const rp2 = this.remotePlayers.get(msg.id);
      if (rp2) {
        rp2.sprite.setTint(0xff0000);
        rp2.sprite.setAlpha(0.4);
      }
    });

    // === Player respawn ===
    network.on("player_respawn", (msg: any) => {
      const rp3 = this.remotePlayers.get(msg.id);
      if (rp3) {
        rp3.sprite.clearTint();
        rp3.sprite.setAlpha(0.85);
        rp3.sprite.setTint(0x88aaff);
        rp3.updatePosition(msg.x, msg.y, "", false);
      }
    });

    // === Chat messages ===
    network.on("chat", (msg: any) => {
      const chatText = this.add.text(
        this.cameras.main.width / 6, 50,
        `${msg.name}: ${msg.text}`,
        { fontSize: "7px", fontFamily: "monospace", color: "#aaccff", stroke: "#000", strokeThickness: 1 }
      );
      chatText.setScrollFactor(0).setDepth(400).setOrigin(0.5);
      this.tweens.add({
        targets: chatText, alpha: 0, y: chatText.y - 15, duration: 5000,
        onComplete: () => chatText.destroy()
      });
    });

    // === Disconnected ===
    network.on("disconnected", () => {
      this.remotePlayers.forEach((rp4: RemotePlayer) => rp4.destroy());
      this.remotePlayers.clear();
      this.isMultiplayer = false;
    });
  }

  update(time: number, delta: number) {
    if (!this.player || this.player.dead) return;

    // During boss cutscene, freeze player
    if (this.bossCutsceneActive) return;

    this.player.update(time, delta);

    const camera = this.cameras.main;

    // Detect room entry
    const playerRoom = this.map?.getRoomAt(this.player.sprite.x, this.player.sprite.y) || null;

    if (playerRoom && playerRoom !== this.currentRoom) {
      this.currentRoom = playerRoom;

      // Check if room needs to be locked
      if (!playerRoom.cleared && playerRoom.type !== RoomType.Spawn && playerRoom.type !== RoomType.Shop) {
        // Check if room has enemies
        const roomEnemies = this.enemies.filter(e => (e as any).roomIndex === playerRoom.index);
        if (roomEnemies.length > 0) {
          if (playerRoom.type === RoomType.Boss) {
            // Boss cutscene!
            this.startBossCutscene(playerRoom);
          } else {
            this.lockRoom(playerRoom);
          }
        }
      }
    }

    // Update enemies — only if in same room as player (or room is locked)
    for (let enemy of this.enemies) {
      if (enemy.state !== "dead") {
        const enemyRoomIdx = (enemy as any).roomIndex;
        const inSameRoom = playerRoom && enemyRoomIdx === playerRoom.index;
        const inLockedRoom = this.roomLocked && this.lockedRoom && enemyRoomIdx === this.lockedRoom.index;

        if (inSameRoom || inLockedRoom) {
          enemy.update(time, this.player.sprite.x, this.player.sprite.y);
        } else {
          // Idle — stop moving
          const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
          if (body) body.setVelocity(0);
        }
      }
    }

    // Update remote players (interpolation)
    this.remotePlayers.forEach(r => r.update());

    // PvP: dash attack hits remote players (once per dash per target)
    if (network.connected && network.mode === "pvp" && this.player.isAttacking()) {
      if (!this.dashHitCooldown) this.dashHitCooldown = new Map();
      this.remotePlayers.forEach((remote) => {
        const lastHit = this.dashHitCooldown!.get(remote.id) || 0;
        if (time - lastHit < 500) return; // cooldown per target
        const dist = Phaser.Math.Distance.Between(
          this.player!.sprite.x, this.player!.sprite.y,
          remote.sprite.x, remote.sprite.y
        );
        if (dist < 20) {
          this.dashHitCooldown!.set(remote.id, time);
          // Send PvP hit
          network.sendPvpHit(remote.id, 3);
          // Visual feedback
          remote.sprite.setTint(0xff0000);
          this.time.delayedCall(150, () => {
            if (remote.sprite?.active) remote.sprite.setTint(0xff6666);
          });
        }
      });
    }

    // Network sync: send position every 50ms
    if (this.isMultiplayer && time > this.lastNetSync + 50) {
      this.lastNetSync = time;
      const anim = this.player.sprite.anims.currentAnim?.key || "";
      network.sendPlayerUpdate(
        this.player.sprite.x,
        this.player.sprite.y,
        anim,
        this.player.sprite.flipX,
        this.player.hp,
        this.player.maxHp
      );

      // Host sends enemy sync every 200ms
      if (network.isHost && time % 200 < 60) {
        const enemyData = this.enemies
          .map((e, idx) => ({
            idx,
            x: Math.round(e.sprite.x),
            y: Math.round(e.sprite.y),
            hp: e.hp,
            state: e.state
          }))
          .filter(e => e.state !== "dead");
        if (enemyData.length > 0) {
          network.sendEnemySync(enemyData);
        }
      }
    }

    // Item pickup
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.sprite.active) {
        this.items.splice(i, 1);
        continue;
      }
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        item.sprite.x,
        item.sprite.y
      );
      if (dist < 16) {
        switch (item.type) {
          case "coin":
            this.player.addCoins(item.value);
            break;
          case "healthPotion":
            this.player.heal(item.value);
            break;
          case "energyOrb":
            this.player.addMana(item.value);
            break;
        }
        item.pickup();
        this.items.splice(i, 1);
      }
    }

    // FOV (skipped in PvP)
    if (this.fov) {
      const playerTile = new Phaser.Math.Vector2({
        x: this.tilemap!.worldToTileX(this.player.sprite.body.x),
        y: this.tilemap!.worldToTileY(this.player.sprite.body.y)
      });

      const bounds = new Phaser.Geom.Rectangle(
        this.tilemap!.worldToTileX(camera.worldView.x) - 1,
        this.tilemap!.worldToTileY(camera.worldView.y) - 1,
        this.tilemap!.worldToTileX(camera.worldView.width) + 2,
        this.tilemap!.worldToTileX(camera.worldView.height) + 2
      );

      this.fov.update(playerTile, bounds, delta);
    }
  }
}
