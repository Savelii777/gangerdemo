---
name: Phaser.js Game Development
description: Build 2D browser games using Phaser 3 — roguelikes, dungeon crawlers, top-down shooters, and action games with pixel art
---

# Phaser.js Game Development Skill

Expert-level guidance for building 2D browser games with Phaser 3 framework, specifically optimized for roguelike dungeon crawlers similar to Soul Knight.

## When to Use This Skill

Use this skill when you need to:
- Create 2D browser-based games using Phaser 3
- Build roguelike or dungeon crawler games
- Implement procedural level generation
- Create top-down shooter mechanics
- Work with pixel art sprites and animations
- Handle game physics, collisions, and combat systems
- Build enemy AI and boss patterns

## Technology Stack

### Core
- **Phaser 3** (latest) — 2D game framework
- **Vite** — build tool and dev server
- **JavaScript/TypeScript** — game logic

### Project Structure
```
soul-knight-game/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js              # Entry point, Phaser config
│   ├── scenes/
│   │   ├── BootScene.js      # Asset preloading
│   │   ├── MenuScene.js      # Main menu
│   │   ├── GameScene.js      # Core gameplay
│   │   ├── UIScene.js        # HUD overlay
│   │   └── GameOverScene.js  # Death/restart screen
│   ├── entities/
│   │   ├── Player.js         # Player character
│   │   ├── Enemy.js          # Base enemy class
│   │   ├── Boss.js           # Boss enemies
│   │   └── Projectile.js     # Bullets/projectiles
│   ├── weapons/
│   │   ├── WeaponBase.js     # Base weapon class
│   │   ├── MeleeWeapon.js    # Swords, hammers
│   │   └── RangedWeapon.js   # Guns, bows
│   ├── systems/
│   │   ├── DungeonGenerator.js  # Procedural level gen
│   │   ├── LootSystem.js        # Item drops
│   │   ├── WaveManager.js       # Enemy waves per room
│   │   └── CameraSystem.js      # Camera follow + shake
│   ├── ui/
│   │   ├── HealthBar.js      # HP display
│   │   ├── ManaBar.js        # Energy/mana
│   │   └── MiniMap.js        # Dungeon minimap
│   ├── utils/
│   │   ├── Constants.js      # Game constants
│   │   └── MathUtils.js      # Helper functions
│   └── assets/
│       ├── sprites/          # Character & enemy sprites
│       ├── tilesets/          # Dungeon tiles
│       ├── effects/          # Particle effects
│       ├── ui/               # UI elements
│       └── audio/            # Sound effects & music
└── public/
    └── assets/               # Static assets served as-is
```

## Phaser 3 Configuration

```javascript
const config = {
  type: Phaser.AUTO,
  width: 480,
  height: 320,
  zoom: 2,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }, // Top-down, no gravity
      debug: false
    }
  },
  scene: [BootScene, MenuScene, GameScene, UIScene, GameOverScene],
  parent: 'game-container'
};
```

### Key Settings for Soul Knight-like Games
- `pixelArt: true` — disables anti-aliasing for crisp pixels
- `roundPixels: true` — prevents sub-pixel rendering
- `zoom: 2` or `3` — scales up pixel art
- `physics: 'arcade'` — lightweight physics for top-down shooter
- `gravity.y: 0` — top-down perspective

## Core Game Mechanics Implementation

### 1. Player Movement (8-directional)
```javascript
class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.speed = 120;
    this.hp = 6;
    this.maxHp = 6;
    this.mana = 200;
    this.maxMana = 200;
    this.body.setSize(12, 12);
    this.body.setOffset(2, 4);
  }

  update(cursors) {
    this.body.setVelocity(0);
    if (cursors.left.isDown) this.body.setVelocityX(-this.speed);
    if (cursors.right.isDown) this.body.setVelocityX(this.speed);
    if (cursors.up.isDown) this.body.setVelocityY(-this.speed);
    if (cursors.down.isDown) this.body.setVelocityY(this.speed);
    this.body.velocity.normalize().scale(this.speed);
  }
}
```

### 2. Procedural Dungeon Generation (BSP)
```javascript
class DungeonGenerator {
  constructor(width, height, minRoomSize = 6, maxRoomSize = 12) {
    this.width = width;
    this.height = height;
    this.minRoomSize = minRoomSize;
    this.maxRoomSize = maxRoomSize;
    this.rooms = [];
    this.corridors = [];
    this.grid = [];
  }

  generate() {
    // 1. Init grid with walls
    this.grid = Array(this.height).fill(null)
      .map(() => Array(this.width).fill(1));

    // 2. BSP split into rooms
    this.splitBSP({ x: 1, y: 1, w: this.width - 2, h: this.height - 2 });

    // 3. Connect rooms with corridors
    this.connectRooms();

    // 4. Place doors between rooms and corridors
    this.placeDoors();

    return { grid: this.grid, rooms: this.rooms, corridors: this.corridors };
  }
}
```

### 3. Weapon System
```javascript
class WeaponBase {
  constructor(scene, owner) {
    this.scene = scene;
    this.owner = owner;
    this.damage = 1;
    this.fireRate = 300; // ms between shots
    this.lastFired = 0;
    this.manaCost = 5;
    this.projectileSpeed = 250;
  }

  fire(targetX, targetY) {
    if (this.scene.time.now < this.lastFired + this.fireRate) return;
    if (this.owner.mana < this.manaCost) return;
    this.owner.mana -= this.manaCost;
    this.lastFired = this.scene.time.now;
    // Create projectile toward target
    const bullet = this.scene.bullets.get(this.owner.x, this.owner.y, 'bullet');
    if (bullet) {
      const angle = Phaser.Math.Angle.Between(
        this.owner.x, this.owner.y, targetX, targetY
      );
      bullet.setActive(true).setVisible(true);
      this.scene.physics.velocityFromRotation(
        angle, this.projectileSpeed, bullet.body.velocity
      );
      bullet.damage = this.damage;
      bullet.setRotation(angle);
    }
  }
}
```

### 4. Enemy AI States
```javascript
class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type) {
    super(scene, x, y, type);
    this.state = 'patrol'; // patrol | chase | attack | flee
    this.hp = 3;
    this.speed = 60;
    this.detectionRange = 100;
    this.attackRange = 40;
  }

  update(player) {
    const dist = Phaser.Math.Distance.Between(
      this.x, this.y, player.x, player.y
    );
    switch (this.state) {
      case 'patrol': this.patrol(); if (dist < this.detectionRange) this.state = 'chase'; break;
      case 'chase': this.chase(player); if (dist < this.attackRange) this.state = 'attack'; break;
      case 'attack': this.attack(player); if (dist > this.attackRange) this.state = 'chase'; break;
    }
  }
}
```

## Pixel Art Guidelines

### Sprite Sizes (Soul Knight style)
- Player: 16×16 or 24×24 pixels
- Enemies: 16×16 to 32×32
- Boss: 32×32 to 64×64
- Tiles: 16×16
- Projectiles: 4×4 to 8×8
- Items: 12×12 to 16×16
- UI icons: 16×16

### Color Palette
Use limited palettes (16-32 colors) for consistency:
- Dungeon floors: dark grays, browns
- Walls: darker versions + highlights
- Player: bright, distinct colors
- Enemies: red/purple tones
- Projectiles: bright yellow, cyan, magenta
- Items/loot: gold, green, blue

## Performance Tips

1. Use **object pools** for bullets and particles (`scene.physics.add.group()`)
2. Enable **culling** — only render visible sprites
3. Use **tilemaps** for dungeon rendering, not individual sprites
4. Limit **particle effects** — use sprite-based effects when possible
5. Use **scene.physics.overlap** instead of `collide` where possible
6. Keep sprite sheets **power-of-2** sizes (256×256, 512×512)

## Common Patterns

### Room-Based Combat (Soul Knight style)
1. Player enters room → doors lock
2. Spawn enemies in waves
3. All enemies dead → doors unlock, loot drops
4. Player can proceed to next room

### Loot Table System
```javascript
const LOOT_TABLE = {
  common: { weight: 60, items: ['coin', 'small_potion'] },
  uncommon: { weight: 25, items: ['weapon_crate', 'medium_potion'] },
  rare: { weight: 10, items: ['rare_weapon'] },
  legendary: { weight: 5, items: ['legendary_weapon', 'full_heal'] }
};
```

## References
- [Phaser 3 Docs](https://photonstorm.github.io/phaser3-docs/)
- [Phaser 3 Examples](https://phaser.io/examples)
- [Dungeon Generation BSP](http://www.roguebasin.com/index.php/Basic_BSP_Dungeon_generation)
