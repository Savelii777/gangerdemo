import Phaser from "phaser";

export interface WeaponConfig {
  name: string;
  damage: number;
  fireRate: number;       // ms between shots
  manaCost: number;
  projectileSpeed: number;
  inaccuracy: number;     // degrees of spread
  bulletsPerShot: number;
  range: number;          // max bullet travel in px
  rarity: number;         // 0=common .. 6=mythical
  type: "pistol" | "shotgun" | "staff" | "rifle" | "sword";
}

export const WEAPONS: { [key: string]: WeaponConfig } = {
  pistol: {
    name: "Pistol",
    damage: 2,
    fireRate: 350,
    manaCost: 3,
    projectileSpeed: 300,
    inaccuracy: 5,
    bulletsPerShot: 1,
    range: 200,
    rarity: 0,
    type: "pistol"
  },
  shotgun: {
    name: "Shotgun",
    damage: 2,
    fireRate: 700,
    manaCost: 8,
    projectileSpeed: 250,
    inaccuracy: 15,
    bulletsPerShot: 5,
    range: 120,
    rarity: 1,
    type: "shotgun"
  },
  staff: {
    name: "Magic Staff",
    damage: 3,
    fireRate: 500,
    manaCost: 10,
    projectileSpeed: 200,
    inaccuracy: 3,
    bulletsPerShot: 1,
    range: 250,
    rarity: 2,
    type: "staff"
  },
  rifle: {
    name: "Assault Rifle",
    damage: 1,
    fireRate: 150,
    manaCost: 2,
    projectileSpeed: 350,
    inaccuracy: 8,
    bulletsPerShot: 1,
    range: 220,
    rarity: 1,
    type: "rifle"
  }
};

export const RARITY_COLORS = [
  0xffffff, // Common - white
  0x00ff00, // Uncommon - green
  0x0088ff, // Rare - blue
  0xaa00ff, // Very Rare - purple
  0xff8800, // Epic - orange
  0xff0000, // Legendary - red
  0xff00ff  // Mythical - pink
];

export const RARITY_MULT = [1.0, 1.2, 1.5, 1.8, 2.2, 2.8, 3.5];

export default class Weapon {
  public config: WeaponConfig;
  public lastFired: number;

  constructor(config: WeaponConfig) {
    this.config = config;
    this.lastFired = 0;
  }

  canFire(time: number, mana: number): boolean {
    return (
      time > this.lastFired + this.config.fireRate &&
      mana >= this.config.manaCost
    );
  }

  fire(
    scene: Phaser.Scene,
    bullets: Phaser.Physics.Arcade.Group,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    time: number
  ): { manaCost: number; firedBullets: { x: number; y: number; vx: number; vy: number; damage: number }[] } {
    if (!this.canFire(time, Infinity)) return { manaCost: 0, firedBullets: [] };
    this.lastFired = time;

    const baseAngle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const cfg = this.config;
    const firedBullets: { x: number; y: number; vx: number; vy: number; damage: number }[] = [];

    for (let i = 0; i < cfg.bulletsPerShot; i++) {
      const spread = Phaser.Math.DegToRad(
        Phaser.Math.FloatBetween(-cfg.inaccuracy, cfg.inaccuracy)
      );
      const angle = baseAngle + spread;

      const bullet = bullets.get(fromX, fromY) as Phaser.Physics.Arcade.Sprite;
      if (!bullet) continue;

      bullet.setActive(true).setVisible(true);
      bullet.setScale(0.8);
      bullet.setDepth(7);
      bullet.setRotation(angle);

      // Store metadata on bullet
      const dmg = cfg.damage * RARITY_MULT[cfg.rarity];
      (bullet as any).damage = dmg;
      (bullet as any).maxRange = cfg.range;
      (bullet as any).startX = fromX;
      (bullet as any).startY = fromY;
      (bullet as any).isPlayerBullet = true;

      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setSize(4, 4);
      scene.physics.velocityFromRotation(
        angle,
        cfg.projectileSpeed,
        body.velocity
      );

      firedBullets.push({ x: fromX, y: fromY, vx: body.velocity.x, vy: body.velocity.y, damage: dmg });
    }

    return { manaCost: cfg.manaCost, firedBullets };
  }
}
