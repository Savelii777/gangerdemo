import Phaser from "phaser";
import EnemyBase from "./EnemyBase";
import BossYarikSheet from "../../assets/fongoose/BossYarik.png";
import ShockwaveSheet from "../../assets/fongoose/shockwave.png";
import ProjectileSheet from "../../assets/fongoose/boss_projectile.png";

/**
 * BOSS: Ярик (Yarik) — Bald Green Goblin
 *
 * Spritesheet: 556x936 PNG, 4 columns × 9 rows = 33 frames, 139x104 per frame
 * Frames 0-6: Idle (7 frames)
 * Frames 7-12: Walk (6 frames)
 * Frames 13-16: Run/Charge (4 frames)
 * Frames 17-20: Slam Attack (4 frames)
 * Frames 21-24: Spit Attack (4 frames)
 * Frames 25-28: Enraged (4 frames)
 * Frames 29-32: Death (4 frames)
 */

const FRAME_W = 139;
const FRAME_H = 104;

export default class BossYarik extends EnemyBase {
  private phase: number;
  private nextAbilityTime: number;
  private abilityCooldown: number;
  private isPerformingAbility: boolean;
  private abilityStartTime: number;
  private bossName: string;
  private attackPatternIndex: number;

  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpBarBorder: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private phaseText: Phaser.GameObjects.Text;
  private shadowCircle: Phaser.GameObjects.Ellipse;

  // Floating HP bar above head
  private floatingBarBg: Phaser.GameObjects.Rectangle;
  private floatingBarFill: Phaser.GameObjects.Rectangle;
  private floatingBarBorder: Phaser.GameObjects.Rectangle;
  private floatingName: Phaser.GameObjects.Text;

  // === CHEATER MECHANICS ===
  private isInvincible: boolean;
  private hasFakeDied: boolean;
  private parryChance: number;

  // Call this from DungeonScene.preload()
  static preloadAssets(scene: Phaser.Scene) {
    if (!scene.textures.exists("boss_yarik_sheet")) {
      scene.load.spritesheet("boss_yarik_sheet", BossYarikSheet, {
        frameWidth: FRAME_W,
        frameHeight: FRAME_H
      });
    }
    if (!scene.textures.exists("boss_shockwave")) {
      scene.load.spritesheet("boss_shockwave", ShockwaveSheet, {
        frameWidth: 64,
        frameHeight: 64
      });
    }
    if (!scene.textures.exists("boss_projectile_sheet")) {
      scene.load.spritesheet("boss_projectile_sheet", ProjectileSheet, {
        frameWidth: 32,
        frameHeight: 32
      });
    }
  }

  constructor(x: number, y: number, scene: Phaser.Scene) {
    BossYarik.registerAnimations(scene);

    super(x, y, scene, "boss_yarik_sheet", 0);

    this.bossName = "ЯРИК";
    this.hp = 500;
    this.maxHp = 500;
    this.damage = 5;
    this.speed = 50;
    this.detectionRange = 500;
    this.attackRange = 40;
    this.attackCooldown = 600;
    this.coinValue = 50;

    this.phase = 1;
    this.nextAbilityTime = 0;
    this.abilityCooldown = 2500;
    this.isPerformingAbility = false;
    this.abilityStartTime = 0;
    this.attackPatternIndex = 0;

    // Cheater flags
    this.isInvincible = false;
    this.hasFakeDied = false;
    this.parryChance = 0;

    // 2X BIGGER
    this.sprite.setScale(0.6);
    this.sprite.setDepth(12);
    this.sprite.setSize(50, 60);
    this.sprite.setOffset(45, 25);
    this.sprite.play("yarik_idle");

    // Bigger shadow
    this.shadowCircle = scene.add.ellipse(x, y + 20, 40, 12, 0x000000, 0.35);
    this.shadowCircle.setDepth(4);

    // Poison pool fallback texture
    if (!scene.textures.exists("poison_pool")) {
      const gfx = scene.make.graphics({ x: 0, y: 0, add: false });
      gfx.fillStyle(0x33aa00, 0.6);
      gfx.fillCircle(8, 8, 8);
      gfx.fillStyle(0x66ff00, 0.3);
      gfx.fillCircle(5, 5, 4);
      gfx.generateTexture("poison_pool", 16, 16);
      gfx.destroy();
    }

    // Boss HP bar (fixed on screen) — bigger
    const cam = scene.cameras.main;
    const barWidth = 250;
    const barHeight = 14;
    const barX = cam.width / 2 / cam.zoom;
    const barY = 14;

    this.hpBarBorder = scene.add.rectangle(barX, barY, barWidth + 6, barHeight + 6, 0x222222);
    this.hpBarBorder.setScrollFactor(0).setDepth(300).setOrigin(0.5);
    this.hpBarBorder.setStrokeStyle(1, 0x666666);

    this.hpBarBg = scene.add.rectangle(barX, barY, barWidth, barHeight, 0x440000);
    this.hpBarBg.setScrollFactor(0).setDepth(301).setOrigin(0.5);

    this.hpBarFill = scene.add.rectangle(barX, barY, barWidth, barHeight, 0xff2200);
    this.hpBarFill.setScrollFactor(0).setDepth(302).setOrigin(0.5);

    this.nameText = scene.add.text(barX, barY - 14, `👹 ${this.bossName}`, {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#ff4444",
      stroke: "#000000",
      strokeThickness: 2
    });
    this.nameText.setScrollFactor(0).setDepth(303).setOrigin(0.5);

    this.phaseText = scene.add.text(barX + barWidth / 2 + 5, barY, "Фаза 1", {
      fontSize: "7px",
      fontFamily: "monospace",
      color: "#888888",
      stroke: "#000000",
      strokeThickness: 1
    });
    this.phaseText.setScrollFactor(0).setDepth(303).setOrigin(0, 0.5);

    // === Floating HP bar above boss head ===
    const fbW = 40;
    const fbH = 4;
    this.floatingBarBorder = scene.add.rectangle(x, y - 28, fbW + 2, fbH + 2, 0x000000);
    this.floatingBarBorder.setDepth(13).setOrigin(0.5);

    this.floatingBarBg = scene.add.rectangle(x, y - 28, fbW, fbH, 0x330000);
    this.floatingBarBg.setDepth(13).setOrigin(0.5);

    this.floatingBarFill = scene.add.rectangle(x, y - 28, fbW, fbH, 0xff2200);
    this.floatingBarFill.setDepth(14).setOrigin(0.5);

    this.floatingName = scene.add.text(x, y - 35, `👹 ${this.bossName}`, {
      fontSize: "6px",
      fontFamily: "monospace",
      color: "#ff4444",
      stroke: "#000000",
      strokeThickness: 2
    });
    this.floatingName.setDepth(14).setOrigin(0.5);
  }

  static registerAnimations(scene: Phaser.Scene) {
    if (scene.anims.exists("yarik_idle")) return;

    scene.anims.create({
      key: "yarik_idle",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 0, end: 6 }),
      frameRate: 6,
      repeat: -1
    });

    scene.anims.create({
      key: "yarik_walk",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 7, end: 12 }),
      frameRate: 8,
      repeat: -1
    });

    scene.anims.create({
      key: "yarik_run",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 13, end: 16 }),
      frameRate: 10,
      repeat: -1
    });

    scene.anims.create({
      key: "yarik_slam",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 17, end: 20 }),
      frameRate: 6,
      repeat: 0
    });

    scene.anims.create({
      key: "yarik_spit",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 21, end: 24 }),
      frameRate: 6,
      repeat: 0
    });

    scene.anims.create({
      key: "yarik_enraged",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 25, end: 28 }),
      frameRate: 8,
      repeat: -1
    });

    scene.anims.create({
      key: "yarik_death",
      frames: scene.anims.generateFrameNumbers("boss_yarik_sheet", { start: 29, end: 32 }),
      frameRate: 4,
      repeat: 0
    });

    // VFX animations
    if (!scene.anims.exists("shockwave_expand")) {
      scene.anims.create({
        key: "shockwave_expand",
        frames: scene.anims.generateFrameNumbers("boss_shockwave", { start: 0, end: 7 }),
        frameRate: 14,
        repeat: 0
      });
    }

    if (!scene.anims.exists("projectile_fly")) {
      scene.anims.create({
        key: "projectile_fly",
        frames: scene.anims.generateFrameNumbers("boss_projectile_sheet", { start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1
      });
      scene.anims.create({
        key: "projectile_impact",
        frames: scene.anims.generateFrameNumbers("boss_projectile_sheet", { start: 3, end: 3 }),
        frameRate: 6,
        repeat: 0
      });
    }
  }

  // ===== UPDATE =====
  update(time: number, playerX: number, playerY: number) {
    if (this.state === "dead") return;

    this.shadowCircle.setPosition(this.sprite.x, this.sprite.y + 20);

    // HP bar (HUD)
    const hpPct = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.setScale(hpPct, 1);

    // Floating bar follows boss
    const fbY = this.sprite.y - 28;
    this.floatingBarBorder.setPosition(this.sprite.x, fbY);
    this.floatingBarBg.setPosition(this.sprite.x, fbY);
    this.floatingBarFill.setPosition(this.sprite.x, fbY);
    this.floatingBarFill.setScale(hpPct, 1);
    this.floatingName.setPosition(this.sprite.x, fbY - 7);

    // Color changes based on HP
    if (hpPct < 0.2) {
      this.hpBarFill.setFillStyle(0xff0000);
      this.floatingBarFill.setFillStyle(0xff0000);
    } else if (hpPct < 0.5) {
      this.hpBarFill.setFillStyle(0xff6600);
      this.floatingBarFill.setFillStyle(0xff6600);
    } else if (hpPct < 0.75) {
      this.hpBarFill.setFillStyle(0xff8800);
      this.floatingBarFill.setFillStyle(0xff8800);
    }

    // Phase transitions
    if (hpPct < 0.6 && this.phase === 1) this.enterPhase2();
    if (hpPct < 0.25 && this.phase === 2) this.enterPhase3();

    if (this.isPerformingAbility) {
      // SAFETY: Force-reset if ability is stuck for >5 seconds
      if (this.abilityStartTime > 0 && time - this.abilityStartTime > 5000) {
        this.isPerformingAbility = false;
        this.isInvincible = false;
        this.abilityStartTime = 0;
        this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      }
      return;
    }

    // Use ability
    if (time > this.nextAbilityTime) {
      this.useAbilityPattern(time, playerX, playerY);
      return;
    }

    // Normal AI — chase player
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y, playerX, playerY
    );
    if (dist < this.detectionRange) {
      const animKey = this.phase >= 2 ? "yarik_enraged" : "yarik_walk";
      if (this.sprite.anims.currentAnim?.key !== animKey) {
        this.sprite.play(animKey, true);
      }
    } else {
      const idleKey = this.phase >= 2 ? "yarik_enraged" : "yarik_idle";
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.play(idleKey, true);
      }
    }

    super.update(time, playerX, playerY);
  }

  // ===== CHEATER: OVERRIDE TAKE DAMAGE =====
  takeDamage(amount: number, knockbackX: number = 0, knockbackY: number = 0) {
    if (this.state === "dead") return;

    // Invincibility check (during rush, etc.)
    if (this.isInvincible) {
      const blockText = this.scene.add.text(
        this.sprite.x, this.sprite.y - 20, "БЛОК!",
        { fontSize: "8px", fontFamily: "monospace", color: "#aaaaaa", stroke: "#000000", strokeThickness: 2 }
      );
      blockText.setOrigin(0.5).setDepth(200);
      this.scene.tweens.add({
        targets: blockText, y: blockText.y - 15, alpha: 0, duration: 400,
        onComplete: () => blockText.destroy()
      });
      return;
    }

    // Parry chance — reflects bullet!
    if (this.parryChance > 0 && Math.random() < this.parryChance) {
      // Parry flash
      this.sprite.setTintFill(0xffff00);
      this.scene.time.delayedCall(100, () => {
        if (this.state !== "dead") {
          this.sprite.clearTint();
          if (this.phase >= 2) this.sprite.setTint(0xff4444);
        }
      });

      const parryText = this.scene.add.text(
        this.sprite.x, this.sprite.y - 25, "⚔️ ПАРИРОВАЛ!",
        { fontSize: "8px", fontFamily: "monospace", color: "#ffff00", stroke: "#000000", strokeThickness: 2 }
      );
      parryText.setOrigin(0.5).setDepth(200);
      this.scene.tweens.add({
        targets: parryText, y: parryText.y - 20, alpha: 0, duration: 600,
        onComplete: () => parryText.destroy()
      });

      // Reflect — fire projectile back at player
      if (knockbackX !== 0 || knockbackY !== 0) {
        const proj = this.scene.physics.add.sprite(
          this.sprite.x, this.sprite.y, "boss_projectile_sheet"
        );
        proj.setDepth(10).setScale(1.5);
        proj.play("projectile_fly");
        const reflectAngle = Math.atan2(knockbackX, knockbackY);
        (proj.body as Phaser.Physics.Arcade.Body).setVelocity(
          Math.sin(reflectAngle) * -120, Math.cos(reflectAngle) * -120
        );
        this.scene.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
        this.scene.events.emit("bossProjectile", proj, this.damage);
      }
      return;
    }

    // Normal damage
    super.takeDamage(amount, knockbackX, knockbackY);
  }

  // ===== PHASE TRANSITIONS =====
  private enterPhase2() {
    this.phase = 2;
    this.speed = 70;
    this.abilityCooldown = 1800;
    this.damage = 7;
    this.sprite.play("yarik_enraged");

    this.scene.cameras.main.shake(300, 0.006);
    this.phaseText.setText("Фаза 2").setColor("#ff6600");

    const scream = this.scene.add.text(
      this.sprite.x, this.sprite.y - 40, "ЯРИК ЗЛИТСЯ!!!",
      { fontSize: "12px", fontFamily: "monospace", color: "#ff4400", stroke: "#000000", strokeThickness: 3 }
    );
    scream.setOrigin(0.5).setDepth(300);
    this.scene.tweens.add({
      targets: scream, y: scream.y - 40, alpha: 0, scaleX: 2.5, scaleY: 2.5,
      duration: 1500, onComplete: () => scream.destroy()
    });

    // Phase 2 shockwave
    this.spawnExpandingRings(this.sprite.x, this.sprite.y, 3, 0xff4400);

    // Cheater: enable parry
    this.parryChance = 0.15; // 15% chance to parry in phase 2
  }

  private enterPhase3() {
    this.phase = 3;
    this.speed = 95;
    this.abilityCooldown = 1200;
    this.damage = 10;
    this.sprite.play("yarik_enraged");
    this.sprite.setTint(0xff4444);

    this.scene.cameras.main.shake(500, 0.01);
    this.phaseText.setText("ЯРОСТЬ!").setColor("#ff0000");

    const scream = this.scene.add.text(
      this.sprite.x, this.sprite.y - 40, "☠️ ФИНАЛЬНАЯ ЯРОСТЬ ☠️",
      { fontSize: "14px", fontFamily: "monospace", color: "#ff0000", stroke: "#000000", strokeThickness: 4 }
    );
    scream.setOrigin(0.5).setDepth(300);
    this.scene.tweens.add({
      targets: scream, y: scream.y - 50, alpha: 0, scaleX: 3, scaleY: 3,
      duration: 2000, onComplete: () => scream.destroy()
    });

    // Massive transition shockwave
    this.spawnExpandingRings(this.sprite.x, this.sprite.y, 5, 0xff0000);
    this.scene.events.emit("bossShockwave", this.sprite.x, this.sprite.y, 100, this.damage);

    // Cheater: higher parry in phase 3
    this.parryChance = 0.25; // 25% chance to parry in phase 3
  }

  // ===== ATTACK PATTERN SYSTEM =====
  private useAbilityPattern(time: number, playerX: number, playerY: number) {
    if (this.phase === 1) {
      // Phase 1: Simple rotation
      const patterns = [
        () => this.abilityGroundSlam(),
        () => this.abilityToxicSpit(playerX, playerY),
        () => this.abilityGoblinRush(playerX, playerY),
        () => this.abilityToxicSpit(playerX, playerY),
      ];
      patterns[this.attackPatternIndex % patterns.length]();
      this.attackPatternIndex++;
    } else if (this.phase === 2) {
      // Phase 2: Combos + cheater abilities
      const patterns = [
        () => this.abilityTripleSlam(),
        () => this.abilityTeleportBehind(playerX, playerY),
        () => this.abilitySpitBarrage(playerX, playerY),
        () => this.abilityGoblinRush(playerX, playerY),
        () => this.abilitySummonMinions(),
        () => this.abilityEatMinions(),
        () => this.abilityPoisonRain(playerX, playerY),
        () => this.abilityGroundSlam(),
        () => this.abilityGoblinRush(playerX, playerY),
      ];
      patterns[this.attackPatternIndex % patterns.length]();
      this.attackPatternIndex++;
    } else {
      // Phase 3: Relentless + all cheater abilities
      const patterns = [
        () => this.abilityTripleSlam(),
        () => this.abilityTeleportBehind(playerX, playerY),
        () => this.abilityGoblinRush(playerX, playerY),
        () => this.abilitySpitBarrage(playerX, playerY),
        () => this.abilityTeleportBehind(playerX, playerY),
        () => this.abilityGoblinRush(playerX, playerY),
        () => this.abilitySummonMinions(),
        () => this.abilityEatMinions(),
        () => this.abilityPoisonRain(playerX, playerY),
        () => this.abilityTripleSlam(),
        () => this.abilitySpitBarrage(playerX, playerY),
        () => this.abilityTeleportBehind(playerX, playerY),
        () => this.abilityGoblinRush(playerX, playerY),
      ];
      patterns[this.attackPatternIndex % patterns.length]();
      this.attackPatternIndex++;
    }

    this.nextAbilityTime = time + this.abilityCooldown + Phaser.Math.Between(-300, 300);
  }

  // ===== EXPANDING RING SHOCKWAVES (sprite-based) =====
  private spawnExpandingRings(x: number, y: number, count: number, _color: number) {
    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(i * 180, () => {
        const ring = this.scene.add.sprite(x, y, "boss_shockwave", 0);
        ring.setDepth(11);
        ring.setScale(0.5 + i * 0.3);
        ring.setAlpha(0.9 - i * 0.1);
        ring.play("shockwave_expand");

        // Scale up while animating
        this.scene.tweens.add({
          targets: ring,
          scaleX: 2 + i * 0.8,
          scaleY: 2 + i * 0.8,
          alpha: 0,
          duration: 500 + i * 80,
          ease: "Quad.easeOut",
          onUpdate: () => {
            const radius = 32 * ring.scaleX;
            this.scene.events.emit("bossShockwave", x, y, radius, this.damage);
          },
          onComplete: () => ring.destroy()
        });
      });
    }
  }

  // === ABILITY 1: Ground Slam — expanding shockwave rings ===
  private abilityGroundSlam() {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    // Jump up
    this.sprite.play("yarik_slam");
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 25,
      duration: 200,
      yoyo: true,
      ease: "Quad.easeOut",
    });

    this.sprite.once("animationcomplete-yarik_slam", () => {
      // Impact — multiple expanding rings
      this.scene.cameras.main.shake(150, 0.008);
      const ringCount = this.phase >= 3 ? 5 : this.phase >= 2 ? 4 : 3;
      this.spawnExpandingRings(this.sprite.x, this.sprite.y, ringCount, 0xffaa00);

      // Crack lines on ground
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const line = this.scene.add.rectangle(
          this.sprite.x, this.sprite.y, 2, 3, 0x888800, 0.7
        );
        line.setDepth(3).setRotation(angle);
        this.scene.tweens.add({
          targets: line,
          x: this.sprite.x + Math.cos(angle) * 50,
          y: this.sprite.y + Math.sin(angle) * 50,
          scaleX: 2, scaleY: 8, alpha: 0,
          duration: 500, onComplete: () => line.destroy()
        });
      }

      this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      this.isPerformingAbility = false;
    });
  }

  // === ABILITY: Triple Slam (Phase 2+) ===
  private abilityTripleSlam() {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    let slamCount = 0;
    const totalSlams = this.phase >= 3 ? 4 : 3;

    const doSlam = () => {
      this.sprite.play("yarik_slam");
      this.scene.tweens.add({
        targets: this.sprite, y: this.sprite.y - 20,
        duration: 150, yoyo: true, ease: "Quad.easeOut"
      });

      this.sprite.once("animationcomplete-yarik_slam", () => {
        this.scene.cameras.main.shake(100, 0.006);
        this.spawnExpandingRings(this.sprite.x, this.sprite.y, 2, 0xff6600);
        slamCount++;

        if (slamCount < totalSlams) {
          this.scene.time.delayedCall(300, doSlam);
        } else {
          this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
          this.isPerformingAbility = false;
        }
      });
    };

    doSlam();
  }

  // === ABILITY 2: Projectile Ring — stomp and blast projectiles in all directions ===
  private abilityToxicSpit(_playerX: number, _playerY: number) {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    this.sprite.play("yarik_slam");
    this.scene.tweens.add({
      targets: this.sprite, y: this.sprite.y - 15,
      duration: 150, yoyo: true, ease: "Quad.easeOut"
    });

    this.sprite.once("animationcomplete-yarik_slam", () => {
      this.scene.cameras.main.shake(80, 0.004);
      // Fire projectiles in a full ring
      const numProj = this.phase >= 3 ? 12 : this.phase >= 2 ? 8 : 6;
      const speed = this.phase >= 3 ? 140 : 100;

      for (let i = 0; i < numProj; i++) {
        const angle = (i / numProj) * Math.PI * 2;
        const proj = this.scene.physics.add.sprite(
          this.sprite.x, this.sprite.y, "boss_projectile_sheet"
        );
        proj.setDepth(10).setScale(1.5);
        proj.play("projectile_fly");
        (proj.body as Phaser.Physics.Arcade.Body).setVelocity(
          Math.cos(angle) * speed, Math.sin(angle) * speed
        );
        this.scene.time.delayedCall(4000, () => { if (proj.active) proj.destroy(); });
        this.scene.events.emit("bossProjectile", proj, this.damage);
      }

      // Visual ring effect
      this.spawnExpandingRings(this.sprite.x, this.sprite.y, 1, 0x44ff00);

      this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      this.isPerformingAbility = false;
    });
  }

  // === ABILITY: Projectile Wave Barrage — multiple expanding rings of projectiles ===
  private abilitySpitBarrage(_playerX: number, _playerY: number) {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    const waves = this.phase >= 3 ? 4 : 3;
    let waveCount = 0;

    const fireWave = () => {
      this.sprite.play("yarik_slam");
      this.scene.tweens.add({
        targets: this.sprite, y: this.sprite.y - 10,
        duration: 100, yoyo: true
      });

      this.sprite.once("animationcomplete-yarik_slam", () => {
        this.scene.cameras.main.shake(50, 0.003);
        // Each wave has offset rotation
        const numProj = this.phase >= 3 ? 10 : 8;
        const offset = waveCount * (Math.PI / numProj); // rotate each wave
        const speed = 90 + waveCount * 20;

        for (let i = 0; i < numProj; i++) {
          const angle = offset + (i / numProj) * Math.PI * 2;
          const proj = this.scene.physics.add.sprite(
            this.sprite.x, this.sprite.y, "boss_projectile_sheet"
          );
          proj.setDepth(10).setScale(1.2);
          proj.play("projectile_fly");
          (proj.body as Phaser.Physics.Arcade.Body).setVelocity(
            Math.cos(angle) * speed, Math.sin(angle) * speed
          );
          this.scene.time.delayedCall(4000, () => { if (proj.active) proj.destroy(); });
          this.scene.events.emit("bossProjectile", proj, this.damage);
        }

        this.spawnExpandingRings(this.sprite.x, this.sprite.y, 1, 0x88ff00);
        waveCount++;

        if (waveCount < waves) {
          this.scene.time.delayedCall(500, fireWave);
        } else {
          this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
          this.isPerformingAbility = false;
        }
      });
    };

    fireWave();
  }

  // === ABILITY: Poison Rain (Phase 2+) ===
  private abilityPoisonRain(playerX: number, playerY: number) {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    this.sprite.play("yarik_slam");

    const count = this.phase >= 3 ? 10 : 6;

    this.sprite.once("animationcomplete-yarik_slam", () => {
      for (let i = 0; i < count; i++) {
        this.scene.time.delayedCall(i * 200, () => {
          // Target area near player with some randomness
          const tx = playerX + Phaser.Math.Between(-60, 60);
          const ty = playerY + Phaser.Math.Between(-60, 60);

          // Warning circle
          const warn = this.scene.add.circle(tx, ty, 12, 0xff0000, 0.2);
          warn.setDepth(3);
          this.scene.tweens.add({
            targets: warn, scaleX: 1.5, scaleY: 1.5, alpha: 0.5,
            duration: 500, yoyo: false,
            onComplete: () => {
              warn.destroy();
              // Impact — poison pool
              const pool = this.scene.physics.add.sprite(tx, ty, "poison_pool");
              pool.setDepth(3).setScale(2).setAlpha(0.7);
              this.scene.events.emit("bossProjectile", pool, this.damage);

              // Pool expands and fades
              this.scene.tweens.add({
                targets: pool, scaleX: 3, scaleY: 3, alpha: 0,
                duration: 2000, onComplete: () => pool.destroy()
              });

              // Small shockwave on impact
              const ring = this.scene.add.circle(tx, ty, 3, 0x44ff00, 0.4);
              ring.setDepth(11);
              this.scene.tweens.add({
                targets: ring, scaleX: 4, scaleY: 4, alpha: 0,
                duration: 300, onComplete: () => ring.destroy()
              });
            }
          });
        });
      }

      this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      this.isPerformingAbility = false;
    });
  }

  // === ABILITY 3: Goblin Rush — charge with damage trail ===
  private abilityGoblinRush(playerX: number, playerY: number) {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    this.sprite.setTint(0xff8800);
    const warning = this.scene.add.text(this.sprite.x, this.sprite.y - 30, "⚡", { fontSize: "18px" });
    warning.setOrigin(0.5).setDepth(300);

    // Charge up
    this.scene.tweens.add({
      targets: this.sprite, scaleX: 0.65, scaleY: 0.55,
      duration: 400, yoyo: true, ease: "Sine.easeInOut"
    });

    this.scene.time.delayedCall(500, () => {
      warning.destroy();
      this.sprite.clearTint();
      this.sprite.play("yarik_run");

      // CHEATER: Invincible during rush
      this.isInvincible = true;

      const angle = Phaser.Math.Angle.Between(
        this.sprite.x, this.sprite.y, playerX, playerY
      );
      const chargeSpeed = this.phase >= 3 ? this.speed * 6 : this.speed * 4.5;
      body.setVelocity(Math.cos(angle) * chargeSpeed, Math.sin(angle) * chargeSpeed);

      // Trail with damage
      const trailEvent = this.scene.time.addEvent({
        delay: 40, repeat: 18,
        callback: () => {
          // Green fire trail
          const trail = this.scene.add.circle(
            this.sprite.x + Phaser.Math.Between(-5, 5),
            this.sprite.y + Phaser.Math.Between(-3, 3),
            Phaser.Math.Between(3, 6), 0x44ff00, 0.5
          );
          trail.setDepth(3);
          this.scene.tweens.add({
            targets: trail, alpha: 0, scaleX: 0, scaleY: 0,
            duration: 400, onComplete: () => trail.destroy()
          });
        }
      });

      const rushDuration = this.phase >= 3 ? 800 : 600;

      this.scene.time.delayedCall(rushDuration, () => {
        body.setVelocity(0);
        trailEvent.destroy();

        // End invincibility
        this.isInvincible = false;

        // Impact shockwave on stop
        if (this.phase >= 2) {
          this.spawnExpandingRings(this.sprite.x, this.sprite.y, 2, 0x44ff00);
          this.scene.cameras.main.shake(80, 0.004);
        }

        this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
        this.isPerformingAbility = false;
      });
    });
  }

  // === ABILITY 4: Summon Minions ===
  private abilitySummonMinions() {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    this.sprite.setTint(0xaa00ff);
    this.sprite.play("yarik_slam");

    const summonText = this.scene.add.text(
      this.sprite.x, this.sprite.y - 30, "⚔️ ПРИЗЫВ! ⚔️",
      { fontSize: "10px", fontFamily: "monospace", color: "#aa00ff", stroke: "#000000", strokeThickness: 3 }
    );
    summonText.setOrigin(0.5).setDepth(300);
    this.scene.tweens.add({
      targets: summonText, y: summonText.y - 25, alpha: 0, duration: 1200,
      onComplete: () => summonText.destroy()
    });

    const numMinions = this.phase >= 3 ? 5 : this.phase >= 2 ? 4 : 2;

    this.scene.time.delayedCall(600, () => {
      this.sprite.clearTint();
      for (let i = 0; i < numMinions; i++) {
        const angle = (i / numMinions) * Math.PI * 2;
        const dist = 35 + (this.phase >= 3 ? 15 : 0);
        const ox = Math.cos(angle) * dist;
        const oy = Math.sin(angle) * dist;

        // Spawn VFX
        const spawnFx = this.scene.add.circle(
          this.sprite.x + ox, this.sprite.y + oy, 10, 0xaa00ff, 0.7
        );
        spawnFx.setDepth(11);
        this.scene.tweens.add({
          targets: spawnFx, scaleX: 3, scaleY: 3, alpha: 0,
          duration: 400, onComplete: () => spawnFx.destroy()
        });

        this.scene.time.delayedCall(100 + i * 150, () => {
          this.scene.events.emit("bossSummon", this.sprite.x + ox, this.sprite.y + oy);
        });
      }

      this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      this.isPerformingAbility = false;
    });
  }

  // ===== DEATH (with fake death mechanic) =====
  die() {
    if (this.state === "dead") return;

    // === FAKE DEATH: First time "dying" — revive! ===
    if (!this.hasFakeDied) {
      this.hasFakeDied = true;
      this.isPerformingAbility = true;
      this.abilityStartTime = this.scene.time.now;
      this.isInvincible = true;

      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0);
      this.sprite.play("yarik_death");

      // Fake "victory" text
      const fakeVictory = this.scene.add.text(
        this.sprite.x, this.sprite.y - 30, "💀 ЯРИК ПОВЕРЖЕН! 💀",
        { fontSize: "14px", fontFamily: "monospace", color: "#ffcc00", stroke: "#000000", strokeThickness: 4 }
      );
      fakeVictory.setOrigin(0.5).setDepth(300);

      this.scene.tweens.add({
        targets: this.sprite, alpha: 0.3, duration: 800
      });

      // After 2 seconds — SURPRISE!
      this.scene.time.delayedCall(2000, () => {
        fakeVictory.destroy();

        // Revive at 30% HP
        this.hp = Math.ceil(this.maxHp * 0.3);
        this.sprite.setAlpha(1);
        this.sprite.play("yarik_enraged");
        this.sprite.setTint(0xff0000);

        // Ultra phase
        this.phase = 3;
        this.speed = 110;
        this.abilityCooldown = 800;
        this.damage = 12;
        this.parryChance = 0.3;

        this.isInvincible = false;
        this.isPerformingAbility = false;

        // Explosion shockwave
        this.spawnExpandingRings(this.sprite.x, this.sprite.y, 6, 0xff0000);
        this.scene.events.emit("bossShockwave", this.sprite.x, this.sprite.y, 120, this.damage);
        this.scene.cameras.main.shake(400, 0.01);

        const reviveText = this.scene.add.text(
          this.sprite.x, this.sprite.y - 40, "😈 ВЫ ДУМАЛИ?! 😈",
          { fontSize: "16px", fontFamily: "monospace", color: "#ff0000", stroke: "#000000", strokeThickness: 4 }
        );
        reviveText.setOrigin(0.5).setDepth(300);
        this.scene.tweens.add({
          targets: reviveText, y: reviveText.y - 50, alpha: 0, scaleX: 3, scaleY: 3,
          duration: 2000, onComplete: () => reviveText.destroy()
        });

        this.phaseText.setText("УЛЬТРА!").setColor("#ff0000");
        this.floatingName.setText("💀 ЯРИК БЕССМЕРТНЫЙ");
      });

      return; // Don't actually die
    }

    // === REAL DEATH ===
    this.state = "dead";
    this.isInvincible = false;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);
    this.sprite.clearTint();

    this.sprite.play("yarik_death");
    this.scene.cameras.main.shake(500, 0.012);

    // Epic death explosions
    for (let p = 0; p < 20; p++) {
      this.scene.time.delayedCall(p * 60, () => {
        const ox = Phaser.Math.Between(-30, 30);
        const oy = Phaser.Math.Between(-30, 30);
        const boom = this.scene.add.circle(
          this.sprite.x + ox, this.sprite.y + oy,
          Phaser.Math.Between(4, 10),
          Phaser.Math.RND.pick([0xff4400, 0xffaa00, 0x44ff00, 0xffffff, 0xff0000]), 1
        );
        boom.setDepth(200);
        this.scene.tweens.add({
          targets: boom, scaleX: 4, scaleY: 4, alpha: 0,
          duration: 500, onComplete: () => boom.destroy()
        });
      });
    }

    // ROOM-WIDE DEATH EXPLOSION — damages player!
    this.scene.time.delayedCall(300, () => {
      // Giant shockwave covering entire room
      this.spawnExpandingRings(this.sprite.x, this.sprite.y, 8, 0xff4400);
      this.scene.events.emit("bossShockwave", this.sprite.x, this.sprite.y, 200, this.damage * 2);
      this.scene.cameras.main.flash(300, 255, 100, 0);
    });

    // Final expanding rings
    this.scene.time.delayedCall(400, () => {
      this.spawnExpandingRings(this.sprite.x, this.sprite.y, 6, 0x44ff00);
    });

    // Victory text
    this.scene.time.delayedCall(1200, () => {
      const victory = this.scene.add.text(
        this.sprite.x, this.sprite.y - 30, "💀 ЯРИК НАКОНЕЦ МЁРТВ! 💀",
        { fontSize: "14px", fontFamily: "monospace", color: "#ffcc00", stroke: "#000000", strokeThickness: 4 }
      );
      victory.setOrigin(0.5).setDepth(300);
      this.scene.tweens.add({
        targets: victory, y: victory.y - 50, scaleX: 2, scaleY: 2,
        duration: 2500, onComplete: () => {
          this.scene.tweens.add({
            targets: victory, alpha: 0, duration: 1500,
            onComplete: () => victory.destroy()
          });
        }
      });
    });

    // Cleanup
    this.scene.time.delayedCall(1500, () => {
      this.sprite.destroy();
      this.shadowCircle.destroy();
      this.hpBarBg.destroy();
      this.hpBarFill.destroy();
      this.hpBarBorder.destroy();
      this.nameText.destroy();
      this.phaseText.destroy();
      this.floatingBarBg.destroy();
      this.floatingBarFill.destroy();
      this.floatingBarBorder.destroy();
      this.floatingName.destroy();
    });

    this.scene.events.emit("enemyDied", this);
    this.scene.events.emit("bossDefeated", this.sprite.x, this.sprite.y);
  }

  // ===== CHEATER ABILITY: TELEPORT BEHIND PLAYER =====
  private abilityTeleportBehind(playerX: number, playerY: number) {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    // Disappear effect
    this.sprite.setTint(0x000000);
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scaleX: 0.1, scaleY: 0.1,
      duration: 200
    });

    // Smoke poof at departure
    for (let i = 0; i < 5; i++) {
      const smoke = this.scene.add.circle(
        this.sprite.x + Phaser.Math.Between(-10, 10),
        this.sprite.y + Phaser.Math.Between(-10, 10),
        Phaser.Math.Between(4, 8), 0x333333, 0.7
      );
      smoke.setDepth(11);
      this.scene.tweens.add({
        targets: smoke, scaleX: 3, scaleY: 3, alpha: 0,
        duration: 400, onComplete: () => smoke.destroy()
      });
    }

    this.scene.time.delayedCall(300, () => {
      // Teleport BEHIND player (opposite of facing direction)
      const angleToPlayer = Phaser.Math.Angle.Between(
        this.sprite.x, this.sprite.y, playerX, playerY
      );
      const behindDist = 25;
      const newX = playerX + Math.cos(angleToPlayer) * behindDist;
      const newY = playerY + Math.sin(angleToPlayer) * behindDist;

      this.sprite.setPosition(newX, newY);
      body.reset(newX, newY);

      // Appear effect
      this.sprite.setAlpha(1);
      this.sprite.setScale(0.6);
      this.sprite.clearTint();
      if (this.phase >= 2) this.sprite.setTint(0xff4444);

      // "Nothing personnel" smoke at arrival
      for (let i = 0; i < 5; i++) {
        const smoke = this.scene.add.circle(
          newX + Phaser.Math.Between(-10, 10),
          newY + Phaser.Math.Between(-10, 10),
          Phaser.Math.Between(4, 8), 0x660066, 0.7
        );
        smoke.setDepth(11);
        this.scene.tweens.add({
          targets: smoke, scaleX: 3, scaleY: 3, alpha: 0,
          duration: 400, onComplete: () => smoke.destroy()
        });
      }

      const tpText = this.scene.add.text(
        newX, newY - 25, "⚡ СЗАДИ!",
        { fontSize: "9px", fontFamily: "monospace", color: "#ff00ff", stroke: "#000000", strokeThickness: 2 }
      );
      tpText.setOrigin(0.5).setDepth(300);
      this.scene.tweens.add({
        targets: tpText, y: tpText.y - 20, alpha: 0, duration: 800,
        onComplete: () => tpText.destroy()
      });

      // Immediate slam attack after teleport!
      this.scene.time.delayedCall(150, () => {
        this.spawnExpandingRings(newX, newY, 2, 0xff00ff);
        this.scene.events.emit("bossShockwave", newX, newY, 40, this.damage);
        this.sprite.play("yarik_slam");
        this.sprite.once("animationcomplete-yarik_slam", () => {
          this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
          this.isPerformingAbility = false;
        });
      });
    });
  }

  // ===== CHEATER ABILITY: EAT MINIONS TO HEAL =====
  private abilityEatMinions() {
    this.isPerformingAbility = true;
    this.abilityStartTime = this.scene.time.now;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    this.sprite.play("yarik_slam");

    const eatText = this.scene.add.text(
      this.sprite.x, this.sprite.y - 30, "🍖 ГОЛОДЕН...",
      { fontSize: "8px", fontFamily: "monospace", color: "#00ff00", stroke: "#000000", strokeThickness: 2 }
    );
    eatText.setOrigin(0.5).setDepth(300);
    this.scene.tweens.add({
      targets: eatText, y: eatText.y - 20, alpha: 0, duration: 1000,
      onComplete: () => eatText.destroy()
    });

    // Summon 2 minions first
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(20, 40);
      this.scene.events.emit(
        "bossSummon",
        this.sprite.x + Math.cos(angle) * dist,
        this.sprite.y + Math.sin(angle) * dist
      );
    }

    // After a moment, "eat" them — heal!
    this.scene.time.delayedCall(800, () => {
      // Visual: suck in effect
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const particle = this.scene.add.circle(
          this.sprite.x + Math.cos(angle) * 40,
          this.sprite.y + Math.sin(angle) * 40,
          3, 0x44ff00, 1
        );
        particle.setDepth(11);
        this.scene.tweens.add({
          targets: particle,
          x: this.sprite.x, y: this.sprite.y,
          alpha: 0, duration: 400,
          onComplete: () => particle.destroy()
        });
      }

      // Heal
      const healAmount = Math.ceil(this.maxHp * 0.1); // 10% max HP
      this.hp = Math.min(this.hp + healAmount, this.maxHp);

      const healText = this.scene.add.text(
        this.sprite.x, this.sprite.y - 15, `+${healAmount} HP`,
        { fontSize: "10px", fontFamily: "monospace", color: "#00ff00", stroke: "#000000", strokeThickness: 2 }
      );
      healText.setOrigin(0.5).setDepth(300);
      this.scene.tweens.add({
        targets: healText, y: healText.y - 25, alpha: 0, duration: 800,
        onComplete: () => healText.destroy()
      });

      this.sprite.setTintFill(0x00ff00);
      this.scene.time.delayedCall(200, () => {
        if (this.state !== "dead") {
          this.sprite.clearTint();
          if (this.phase >= 2) this.sprite.setTint(0xff4444);
        }
      });

      this.sprite.play(this.phase >= 2 ? "yarik_enraged" : "yarik_idle");
      this.isPerformingAbility = false;
    });
  }
}
