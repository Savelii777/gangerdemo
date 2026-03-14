import Phaser from "phaser";
import Graphics from "../assets/Graphics";
import EnemyBase from "./EnemyBase";

// Slime tiers: Large → Medium → Small
// Large splits into 2 Medium on death
// Medium splits into 2 Small on death
// Small doesn't split
export enum SlimeSize {
  Large = 0,
  Medium = 1,
  Small = 2
}

const SLIME_CONFIGS = {
  [SlimeSize.Large]: {
    hp: 7,
    damage: 1,
    speed: 70,
    scale: 1.0,
    tint: 0xffffff,
    coinValue: 2,
    splitCount: 2,
    detectionRange: 300,
    burstDamageRange: 40
  },
  [SlimeSize.Medium]: {
    hp: 4,
    damage: 1,
    speed: 90,
    scale: 0.7,
    tint: 0x88ff88,
    coinValue: 1,
    splitCount: 2,
    detectionRange: 280,
    burstDamageRange: 24
  },
  [SlimeSize.Small]: {
    hp: 2,
    damage: 1,
    speed: 110,
    scale: 0.45,
    tint: 0x55ff55,
    coinValue: 1,
    splitCount: 0,
    detectionRange: 250,
    burstDamageRange: 0
  }
};

export default class Slime extends EnemyBase {
  private nextAction: number;
  public size: SlimeSize;
  private burstDamageRange: number;
  private splitCount: number;

  // AI behavior
  private jumpCooldown: number;
  private isJumping: boolean;
  private wanderAngle: number;

  constructor(x: number, y: number, scene: Phaser.Scene, size: SlimeSize = SlimeSize.Large) {
    super(x, y, scene, Graphics.slime.name, 0);

    this.size = size;
    const cfg = SLIME_CONFIGS[size];

    this.sprite.setSize(12, 10);
    this.sprite.setOffset(10, 14);
    this.sprite.anims.play(Graphics.slime.animations.idle.key);
    this.sprite.setDepth(10);
    this.sprite.setScale(cfg.scale);

    if (cfg.tint !== 0xffffff) {
      this.sprite.setTint(cfg.tint);
    }

    // Stats from tier config
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.damage = cfg.damage;
    this.speed = cfg.speed;
    this.detectionRange = cfg.detectionRange;
    this.attackRange = 16;
    this.coinValue = cfg.coinValue;
    this.splitCount = cfg.splitCount;
    this.burstDamageRange = cfg.burstDamageRange;

    this.body.bounce.set(0, 0);
    this.body.setImmovable(true);
    this.nextAction = 0;

    // Smart AI
    this.jumpCooldown = 0;
    this.isJumping = false;
    this.wanderAngle = Math.random() * Math.PI * 2;
  }

  update(time: number, playerX: number, playerY: number) {
    if (this.state === "dead") return;

    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y,
      playerX, playerY
    );

    // ===== SMART SLIME AI =====

    // Jump attack: periodically leap toward player
    if (dist < this.detectionRange && time > this.jumpCooldown && !this.isJumping) {
      if (Math.random() < 0.04) {
        this.jumpAttack(playerX, playerY);
        return;
      }
    }

    // Different behavior based on size
    if (this.size === SlimeSize.Small) {
      // Small slimes are aggressive kamikazes
      if (dist < this.detectionRange) {
        this.sprite.anims.play(Graphics.slime.animations.move.key, true);
        // Zigzag toward player
        const angle = Phaser.Math.Angle.Between(
          this.sprite.x, this.sprite.y, playerX, playerY
        );
        const zigzag = Math.sin(time * 0.008) * 0.7;
        this.body.setVelocity(
          Math.cos(angle + zigzag) * this.speed,
          Math.sin(angle + zigzag) * this.speed
        );
        this.sprite.setFlipX(playerX < this.sprite.x);
        return;
      }
    } else if (this.size === SlimeSize.Medium) {
      // Medium: cautious, circles then dashes
      if (dist < this.detectionRange && dist > this.attackRange * 2) {
        // Circle the player
        this.sprite.anims.play(Graphics.slime.animations.move.key, true);
        const circleAngle = Phaser.Math.Angle.Between(
          playerX, playerY, this.sprite.x, this.sprite.y
        );
        const orbitalSpeed = this.speed * 0.8;
        const tangent = circleAngle + Math.PI / 2;
        this.body.setVelocity(
          Math.cos(tangent) * orbitalSpeed,
          Math.sin(tangent) * orbitalSpeed
        );
        this.sprite.setFlipX(playerX < this.sprite.x);
        return;
      } else if (dist <= this.attackRange * 2 && dist > 0) {
        // Dash in
        super.update(time, playerX, playerY);
        this.sprite.anims.play(Graphics.slime.animations.move.key, true);
        return;
      }
    }

    // Large slimes: use base AI with wander
    if (dist < this.detectionRange) {
      super.update(time, playerX, playerY);
      this.sprite.anims.play(Graphics.slime.animations.move.key, true);
      return;
    }

    // Wander when idle (all sizes)
    if (time < this.nextAction) return;

    if (Phaser.Math.Between(0, 2) === 0) {
      // Pause
      this.body.setVelocity(0);
      this.sprite.anims.play(Graphics.slime.animations.idle.key, true);
    } else {
      // Wander in a semi-random direction (not fully random)
      this.wanderAngle += Phaser.Math.FloatBetween(-0.8, 0.8);
      this.sprite.anims.play(Graphics.slime.animations.move.key, true);
      const wSpeed = 18;
      this.body.setVelocity(
        Math.cos(this.wanderAngle) * wSpeed,
        Math.sin(this.wanderAngle) * wSpeed
      );
    }

    this.nextAction = time + Phaser.Math.Between(800, 2500);
  }

  private jumpAttack(playerX: number, playerY: number) {
    this.isJumping = true;
    this.jumpCooldown = this.scene.time.now + Phaser.Math.Between(2000, 4000);

    // Wind-up: squash
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.sprite.scaleX * 0.6,
      scaleX: this.sprite.scaleX * 1.2,
      duration: 200,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (this.state === "dead") return;
        // Leap toward player
        const angle = Phaser.Math.Angle.Between(
          this.sprite.x, this.sprite.y, playerX, playerY
        );
        const jumpSpeed = this.speed * 3.5;
        this.body.setVelocity(
          Math.cos(angle) * jumpSpeed,
          Math.sin(angle) * jumpSpeed
        );

        // Land after short delay
        this.scene.time.delayedCall(350, () => {
          if (this.state === "dead") return;
          this.body.setVelocity(0);
          this.isJumping = false;

          // Landing squish
          const cfg = SLIME_CONFIGS[this.size];
          this.scene.tweens.add({
            targets: this.sprite,
            scaleY: cfg.scale * 0.7,
            scaleX: cfg.scale * 1.2,
            duration: 100,
            yoyo: true
          });
        });
      }
    });
  }

  die() {
    if (this.state === "dead") return;
    this.state = "dead";

    // Check burst damage to player
    if (this.burstDamageRange > 0) {
      this.scene.events.emit("slimeBurst", this.sprite.x, this.sprite.y, this.burstDamageRange, this.damage);
    }

    // Split visual: flash + pop
    this.sprite.setTintFill(0xffffff);

    // Manual burst particles (works in all Phaser 3 versions)
    const burstColor = SLIME_CONFIGS[this.size].tint === 0xffffff ? 0x44ff44 : SLIME_CONFIGS[this.size].tint;
    for (let p = 0; p < 6; p++) {
      const angle = (p / 6) * Math.PI * 2 + Math.random() * 0.5;
      const pSpd = Phaser.Math.Between(30, 80);
      const dot = this.scene.add.circle(
        this.sprite.x, this.sprite.y,
        Phaser.Math.Between(2, 4),
        burstColor, 1
      );
      dot.setDepth(15);
      this.scene.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * pSpd,
        y: dot.y + Math.sin(angle) * pSpd,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 400,
        ease: "Quad.easeOut",
        onComplete: () => dot.destroy()
      });
    }

    // Spawn children if can split
    if (this.splitCount > 0) {
      const nextSize = this.size === SlimeSize.Large ? SlimeSize.Medium : SlimeSize.Small;

      for (let i = 0; i < this.splitCount; i++) {
        const offsetAngle = (i / this.splitCount) * Math.PI * 2 + Math.random() * 0.5;
        const ox = Math.cos(offsetAngle) * 12;
        const oy = Math.sin(offsetAngle) * 12;

        // Delay slightly for visual effect
        this.scene.time.delayedCall(50 + i * 80, () => {
          const child = new Slime(
            this.sprite.x + ox,
            this.sprite.y + oy,
            this.scene,
            nextSize
          );

          // Launch children outward
          const childBody = child.sprite.body as Phaser.Physics.Arcade.Body;
          childBody.setVelocity(
            Math.cos(offsetAngle) * 80,
            Math.sin(offsetAngle) * 80
          );

          // Register child with scene
          this.scene.events.emit("slimeSpawned", child);
        });
      }
    }

    // Die animation
    this.body.setVelocity(0);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SLIME_CONFIGS[this.size].scale * 1.5,
      scaleY: SLIME_CONFIGS[this.size].scale * 0.3,
      alpha: 0,
      duration: 200,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.sprite.destroy();
      }
    });

    this.scene.events.emit("enemyDied", this);
  }
}
