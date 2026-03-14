import Tile, { TileType } from "./Tile";
import Slime from "./Slime";
import BossYarik from "./BossYarik";
import Graphics from "../assets/Graphics";
import DungeonScene from "../scenes/DungeonScene";
import Phaser from "phaser";

// ===== Room types =====
export enum RoomType {
  Spawn = "spawn",
  Enemy = "enemy",
  Elite = "elite",
  Shop = "shop",
  Chest = "chest",
  Boss = "boss"
}

export interface DungeonRoom {
  x: number;
  y: number;
  width: number;
  height: number;
  type: RoomType;
  connections: number[];
  cleared: boolean;
  index: number;
  doorTiles: { x: number; y: number }[]; // corridor entrance positions
}

// ===== Biome themes =====
export interface BiomeTheme {
  name: string;
  wallTint: number;
  floorTint: number;
  corridorTint: number;
  fogTint: number;
  ambientColor: string;
}

export const BIOMES: BiomeTheme[] = [
  {
    name: "Dungeon",
    wallTint: 0xaaaacc,
    floorTint: 0x8888aa,
    corridorTint: 0x666688,
    fogTint: 0x111122,
    ambientColor: "#1a1a2e"
  },
  {
    name: "Forest",
    wallTint: 0x66aa55,
    floorTint: 0x558844,
    corridorTint: 0x446633,
    fogTint: 0x0a1a0a,
    ambientColor: "#0d1f0d"
  },
  {
    name: "Glacier",
    wallTint: 0x99ccee,
    floorTint: 0x88bbdd,
    corridorTint: 0x6699bb,
    fogTint: 0x0a1520,
    ambientColor: "#0e1e2e"
  },
  {
    name: "Volcano",
    wallTint: 0xcc6644,
    floorTint: 0xaa5533,
    corridorTint: 0x883322,
    fogTint: 0x1a0800,
    ambientColor: "#2a0e00"
  },
  {
    name: "Ruins",
    wallTint: 0xbb99dd,
    floorTint: 0x9977bb,
    corridorTint: 0x775599,
    fogTint: 0x110822,
    ambientColor: "#1a0e2e"
  }
];

export default class Map {
  public readonly tiles: Tile[][];
  public readonly width: number;
  public readonly height: number;
  public readonly tilemap: Phaser.Tilemaps.Tilemap;
  public readonly wallLayer: Phaser.Tilemaps.TilemapLayer;
  public readonly startingX: number;
  public readonly startingY: number;
  public readonly slimes: Slime[];
  public readonly rooms: DungeonRoom[];
  public readonly biome: BiomeTheme;

  private rng: () => number;

  constructor(width: number, height: number, scene: DungeonScene, biomeIndex?: number, seed?: number, isPvP?: boolean) {
    this.width = width;
    this.height = height;

    // Seeded RNG (mulberry32)
    const s = seed ?? Math.floor(Math.random() * 999999);
    let state = s | 0;
    this.rng = () => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 10; i++) this.rng();

    const bIdx = biomeIndex !== undefined ? biomeIndex % BIOMES.length : this.seededBetween(0, BIOMES.length - 1);
    this.biome = BIOMES[bIdx];
    this.slimes = [];
    this.rooms = [];

    if (isPvP) {
      // === PVP ARENA ===
      this.tiles = this.generatePvPArena(width, height);
    } else {
      // === DUNGEON ===
      this.tiles = this.generateGrid(width, height);
    }

    // Find spawn
    const spawnRoom = this.rooms.find(r => r.type === RoomType.Spawn)!;
    this.startingX = Math.floor(spawnRoom.x + spawnRoom.width / 2);
    this.startingY = Math.floor(spawnRoom.y + spawnRoom.height / 2);

    // Build tilemap
    this.tilemap = scene.make.tilemap({
      tileWidth: Graphics.environment.width,
      tileHeight: Graphics.environment.height,
      width: width,
      height: height
    });

    const dungeonTiles = this.tilemap.addTilesetImage(
      Graphics.environment.name,
      Graphics.environment.name,
      Graphics.environment.width,
      Graphics.environment.height,
      Graphics.environment.margin,
      Graphics.environment.spacing
    );

    // Ground layer
    const groundLayer = this.tilemap
      .createBlankLayer("Ground", dungeonTiles, 0, 0)!
      .fill(Graphics.environment.indices.block);

    // Paint floors based on room vs corridor
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.tiles[y][x].type === TileType.None) {
          const inRoom = this.rooms.some(r =>
            x >= r.x && x < r.x + r.width &&
            y >= r.y && y < r.y + r.height
          );
          const indices = inRoom
            ? Graphics.environment.indices.floor.outer
            : Graphics.environment.indices.floor.outerCorridor;
          groundLayer.putTileAt(
            indices[this.seededBetween(0, indices.length - 1)],
            x, y
          );
        }
      }
    }

    // Apply biome tint to ground
    groundLayer.forEachTile(t => { t.tint = this.biome.floorTint; });
    groundLayer.setDepth(1);

    // Wall layer
    const wallLayer = this.tilemap.createBlankLayer("Wall", dungeonTiles, 0, 0)!;

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const tile = this.tiles[y][x];
        if (tile.type === TileType.Wall) {
          wallLayer.putTileAt(tile.spriteIndex(), x, y);
        }
      }
    }

    wallLayer.setCollisionBetween(0, 0x7f);
    wallLayer.forEachTile(t => { t.tint = this.biome.wallTint; });
    wallLayer.setDepth(2);
    this.wallLayer = wallLayer;

    // Set camera background to match biome
    scene.cameras.main.setBackgroundColor(this.biome.ambientColor);

    // 4. Spawn enemies in non-spawn, non-shop rooms
    for (const room of this.rooms) {
      if (room.type === RoomType.Spawn || room.type === RoomType.Shop) continue;

      if (room.type === RoomType.Boss) {
        // Spawn boss in center of room
        const bx = this.tilemap.tileToWorldX(room.x + Math.floor(room.width / 2));
        const by = this.tilemap.tileToWorldY(room.y + Math.floor(room.height / 2));
        const boss = new BossYarik(bx, by, scene);
        (boss as any).roomIndex = room.index;
        this.slimes.push(boss as any);
        continue;
      }

      const numEnemies = room.type === RoomType.Elite
        ? this.seededBetween(3, 5)
        : this.seededBetween(2, 4);

      for (let i = 0; i < numEnemies; i++) {
        const ex = this.tilemap.tileToWorldX(
          room.x + 2 + this.seededBetween(0, Math.max(0, room.width - 4))
        );
        const ey = this.tilemap.tileToWorldY(
          room.y + 2 + this.seededBetween(0, Math.max(0, room.height - 4))
        );
        const slime = new Slime(ex, ey, scene);
        (slime as any).roomIndex = room.index;
        this.slimes.push(slime);
      }
    }
  }

  // ===== SEEDED RANDOM HELPERS =====
  private seededRandom(): number {
    return this.rng();
  }

  private seededBetween(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  // ===== PVP ARENA =====
  private generatePvPArena(width: number, height: number): Tile[][] {
    const tiles: Tile[][] = [];
    for (let y = 0; y < height; y++) {
      tiles.push([]);
      for (let x = 0; x < width; x++) {
        tiles[y][x] = new Tile(TileType.Wall, x, y, this);
      }
    }

    // Arena dimensions
    const arenaW = 30;
    const arenaH = 24;
    const ax = Math.floor((width - arenaW) / 2);
    const ay = Math.floor((height - arenaH) / 2);

    // Carve arena floor
    for (let y = ay; y < ay + arenaH; y++) {
      for (let x = ax; x < ax + arenaW; x++) {
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          tiles[y][x] = new Tile(TileType.None, x, y, this);
        }
      }
    }

    // Add symmetrical cover pillars (2x2 walls)
    const pillars = [
      // Corners
      { x: ax + 5, y: ay + 4 },
      { x: ax + arenaW - 7, y: ay + 4 },
      { x: ax + 5, y: ay + arenaH - 6 },
      { x: ax + arenaW - 7, y: ay + arenaH - 6 },
      // Center cross
      { x: ax + Math.floor(arenaW / 2) - 1, y: ay + 4 },
      { x: ax + Math.floor(arenaW / 2) - 1, y: ay + arenaH - 6 },
      { x: ax + 5, y: ay + Math.floor(arenaH / 2) - 1 },
      { x: ax + arenaW - 7, y: ay + Math.floor(arenaH / 2) - 1 },
      // Center block
      { x: ax + Math.floor(arenaW / 2) - 1, y: ay + Math.floor(arenaH / 2) - 1 },
    ];

    for (const p of pillars) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = p.x + dx;
          const py = p.y + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            tiles[py][px] = new Tile(TileType.Wall, px, py, this);
          }
        }
      }
    }

    // Single arena room
    this.rooms.push({
      x: ax, y: ay,
      width: arenaW, height: arenaH,
      type: RoomType.Spawn,
      connections: [],
      cleared: true,
      index: 0,
      doorTiles: []
    });

    // Build walls around floor tiles
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (tiles[y][x].type !== TileType.None) {
          let adjFloor = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                if (tiles[ny][nx].type === TileType.None) adjFloor = true;
              }
            }
          }
          if (adjFloor) {
            tiles[y][x] = new Tile(TileType.Wall, x, y, this);
          }
        }
      }
    }

    return tiles;
  }

  // ===== SOUL KNIGHT ROOM GENERATION =====
  private generateGrid(width: number, height: number): Tile[][] {
    // Init all as TileType.None (empty)
    const tiles: Tile[][] = [];
    for (let y = 0; y < height; y++) {
      tiles.push([]);
      for (let x = 0; x < width; x++) {
        tiles[y][x] = new Tile(TileType.Wall, x, y, this);
      }
    }

    // Room interior sizes
    const roomW = 12;
    const roomH = 10;
    const padX = 8;
    const padY = 8;

    // Grid positions
    const gridCols = Math.floor((width - 4) / (roomW + padX));
    const gridRows = Math.floor((height - 4) / (roomH + padY));

    interface GridCell { col: number; row: number; x: number; y: number; }
    const cells: GridCell[] = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        cells.push({
          col, row,
          x: 3 + col * (roomW + padX),
          y: 3 + row * (roomH + padY)
        });
      }
    }

    // Pick 5-8 rooms
    const numRooms = Math.min(this.seededBetween(5, 8), cells.length);
    const centerCol = Math.floor(gridCols / 2);
    const centerRow = Math.floor(gridRows / 2);
    const startCell = cells.find(c => c.col === centerCol && c.row === centerRow) || cells[0];

    const usedCells: GridCell[] = [startCell];
    const usedSet = new Set<string>([`${startCell.col},${startCell.row}`]);

    // BFS expansion
    while (usedCells.length < numRooms) {
      const parent = usedCells[this.seededBetween(0, usedCells.length - 1)];
      const neighbors = cells.filter(c => {
        if (usedSet.has(`${c.col},${c.row}`)) return false;
        const dx = Math.abs(c.col - parent.col);
        const dy = Math.abs(c.row - parent.row);
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
      });
      if (neighbors.length === 0) break;
      const next = neighbors[this.seededBetween(0, neighbors.length - 1)];
      usedCells.push(next);
      usedSet.add(`${next.col},${next.row}`);
    }

    // Create rooms with slight size variation
    for (let i = 0; i < usedCells.length; i++) {
      const cell = usedCells[i];
      let rw = roomW + this.seededBetween(-1, 2);
      let rh = roomH + this.seededBetween(-1, 1);

      let type: RoomType;
      if (i === 0) type = RoomType.Spawn;
      else if (i === usedCells.length - 1) type = RoomType.Boss;
      else if (i === Math.floor(usedCells.length / 2)) type = RoomType.Shop;
      else if (this.seededRandom() < 0.2) type = RoomType.Elite;
      else if (this.seededRandom() < 0.15) type = RoomType.Chest;
      else type = RoomType.Enemy;

      // Boss room is much bigger
      if (type === RoomType.Boss) {
        rw = 18;
        rh = 14;
      }

      this.rooms.push({
        x: cell.x, y: cell.y,
        width: rw, height: rh,
        type, connections: [],
        cleared: type === RoomType.Spawn,
        index: i,
        doorTiles: []
      });

      // Carve room floor
      for (let ry = cell.y; ry < cell.y + rh; ry++) {
        for (let rx = cell.x; rx < cell.x + rw; rx++) {
          if (rx > 0 && rx < width - 1 && ry > 0 && ry < height - 1) {
            tiles[ry][rx] = new Tile(TileType.None, rx, ry, this);
          }
        }
      }
    }

    // Connect adjacent rooms with wide corridors (4 tiles, no doors)
    const corridorWidth = 4;
    for (let i = 0; i < usedCells.length; i++) {
      for (let j = i + 1; j < usedCells.length; j++) {
        const a = usedCells[i];
        const b = usedCells[j];
        const dx = Math.abs(a.col - b.col);
        const dy = Math.abs(a.row - b.row);
        if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) continue;

        this.rooms[i].connections.push(j);
        this.rooms[j].connections.push(i);

        const roomA = this.rooms[i];
        const roomB = this.rooms[j];

        if (a.row === b.row) {
          // Horizontal corridor
          const leftRoom = a.col < b.col ? roomA : roomB;
          const rightRoom = a.col < b.col ? roomB : roomA;
          const startX = leftRoom.x + leftRoom.width;
          const endX = rightRoom.x;
          const midY = Math.floor(
            (leftRoom.y + leftRoom.height / 2 + rightRoom.y + rightRoom.height / 2) / 2
          ) - Math.floor(corridorWidth / 2);

          for (let cy = midY; cy < midY + corridorWidth; cy++) {
            for (let cx = startX - 1; cx <= endX; cx++) {
              if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                tiles[cy][cx] = new Tile(TileType.None, cx, cy, this);
              }
            }
          }
        } else {
          // Vertical corridor
          const topRoom = a.row < b.row ? roomA : roomB;
          const bottomRoom = a.row < b.row ? roomB : roomA;
          const startY = topRoom.y + topRoom.height;
          const endY = bottomRoom.y;
          const midX = Math.floor(
            (topRoom.x + topRoom.width / 2 + bottomRoom.x + bottomRoom.width / 2) / 2
          ) - Math.floor(corridorWidth / 2);

          for (let cx = midX; cx < midX + corridorWidth; cx++) {
            for (let cy = startY - 1; cy <= endY; cy++) {
              if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                tiles[cy][cx] = new Tile(TileType.None, cx, cy, this);
              }
            }
          }
        }
      }
    }

    // Build walls around all floor tiles
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (tiles[y][x].type !== TileType.None) {
          let adjFloor = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                if (tiles[ny][nx].type === TileType.None) adjFloor = true;
              }
            }
          }
          if (adjFloor) {
            tiles[y][x] = new Tile(TileType.Wall, x, y, this);
          }
        }
      }
    }

    return tiles;
  }

  tileAt(x: number, y: number): Tile | null {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return null;
    return this.tiles[y][x];
  }

  withinRoom(x: number, y: number): boolean {
    return this.rooms.some(r =>
      y >= r.y - 1 && y <= r.y + r.height &&
      x >= r.x - 1 && x <= r.x + r.width
    );
  }

  getRoomAt(worldX: number, worldY: number): DungeonRoom | null {
    const tx = this.tilemap.worldToTileX(worldX);
    const ty = this.tilemap.worldToTileY(worldY);
    return this.rooms.find(r =>
      tx >= r.x && tx < r.x + r.width &&
      ty >= r.y && ty < r.y + r.height
    ) || null;
  }
}
