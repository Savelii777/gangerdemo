import Phaser from "phaser";

export default class EnemyBase {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public hp: number;
  public maxHp: number;
  public damage: number;
  public speed: number;
  public state: "idle" | "chase" | "attack" | "hurt" | "dead" | "flank" | "retreat";
  public detectionRange: number;
  public attackRange: number;
  public attackCooldown: number;
  public lastAttack: number;
  public coinValue: number;
  protected scene: Phaser.Scene;
  protected body: Phaser.Physics.Arcade.Body;
  private hurtUntil: number;

  // Smart AI fields
  private strafeAngle: number;
  private strafeDir: number;
  private strafeCooldown: number;
  private lastPlayerX: number;
  private lastPlayerY: number;
  private playerVelX: number;
  private playerVelY: number;

  constructor(
    x: number,
    y: number,
    scene: Phaser.Scene,
    texture: string,
    frame: number = 0
  ) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, texture, frame);
    this.sprite.setDepth(5);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;

    // Defaults
    this.hp = 3;
    this.maxHp = 3;
    this.damage = 1;
    this.speed = 40;
    this.state = "idle";
    this.detectionRange = 120;
    this.attackRange = 16;
    this.attackCooldown = 1000;
    this.lastAttack = 0;
    this.coinValue = 1;
    this.hurtUntil = 0;

    // Smart AI
    this.strafeAngle = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeCooldown = 0;
    this.lastPlayerX = x;
    this.lastPlayerY = y;
    this.playerVelX = 0;
    this.playerVelY = 0;

    // Link back
    (this.sprite as any).enemyRef = this;
  }

  takeDamage(amount: number, knockbackX: number = 0, knockbackY: number = 0) {
    if (this.state === "dead") return;

    this.hp -= amount;

    // Hit flash
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.state !== "dead") this.sprite.clearTint();
    });

    // Knockback
    if (knockbackX !== 0 || knockbackY !== 0) {
      const kbAngle = Math.atan2(knockbackY, knockbackX);
      this.body.setVelocity(
        Math.cos(kbAngle) * 150,
        Math.sin(kbAngle) * 150
      );
    }

    this.showDamageNumber(amount);

    if (this.hp <= 0) {
      this.die();
    } else {
      this.state = "hurt";
      this.hurtUntil = this.scene.time.now + 200;
      // After hurt, sometimes retreat
      if (this.hp <= this.maxHp * 0.3 && Math.random() < 0.5) {
        this.scene.time.delayedCall(200, () => {
          if (this.state !== "dead") this.state = "retreat";
        });
      }
    }
  }

  private showDamageNumber(amount: number) {
    const ox = Phaser.Math.Between(-5, 5);
    const text = this.scene.add.text(
      this.sprite.x + ox,
      this.sprite.y - 10,
      `-${amount}`,
      {
        fontSize: "9px",
        fontFamily: "monospace",
        color: "#ffff00",
        stroke: "#000000",
        strokeThickness: 2
      }
    );
    text.setDepth(200).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 22,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 600,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy()
    });
  }

  die() {
    this.state = "dead";
    this.body.setVelocity(0);
    this.sprite.setTint(0xff0000);

    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 300,
      ease: "Back.easeIn",
      onComplete: () => this.sprite.destroy()
    });

    this.scene.events.emit("enemyDied", this);
  }

  update(time: number, playerX: number, playerY: number) {
    if (this.state === "dead") return;

    // Track player velocity for prediction
    this.playerVelX = (playerX - this.lastPlayerX) * 0.5 + this.playerVelX * 0.5;
    this.playerVelY = (playerY - this.lastPlayerY) * 0.5 + this.playerVelY * 0.5;
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;

    // Hurt stun
    if (this.state === "hurt") {
      if (time > this.hurtUntil) {
        this.state = "chase";
        this.body.setVelocity(0);
      }
      return;
    }

    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y,
      playerX, playerY
    );

    switch (this.state) {
      case "idle":
        this.body.setVelocity(0);
        if (dist < this.detectionRange) this.state = "chase";
        break;

      case "chase":
        // Predict player position
        const predX = playerX + this.playerVelX * 10;
        const predY = playerY + this.playerVelY * 10;
        this.moveToward(predX, predY);

        if (dist < this.attackRange) this.state = "attack";
        else if (dist < this.attackRange * 3 && Math.random() < 0.01) this.state = "flank";
        if (dist > this.detectionRange * 2) this.state = "idle";
        break;

      case "flank":
        // Circle-strafe around player
        if (time > this.strafeCooldown) {
          this.strafeDir = -this.strafeDir;
          this.strafeCooldown = time + Phaser.Math.Between(800, 2000);
        }
        this.strafeAngle = Phaser.Math.Angle.Between(
          playerX, playerY, this.sprite.x, this.sprite.y
        );
        const flankAngle = this.strafeAngle + this.strafeDir * 1.2;
        const flankDist = this.attackRange * 2;
        const flankX = playerX + Math.cos(flankAngle) * flankDist;
        const flankY = playerY + Math.sin(flankAngle) * flankDist;
        this.moveToward(flankX, flankY, this.speed * 1.1);

        if (dist < this.attackRange) this.state = "attack";
        if (Math.random() < 0.005) this.state = "chase"; // occasionally re-engage
        break;

      case "retreat":
        // Run away from player briefly
        const awayAngle = Phaser.Math.Angle.Between(
          playerX, playerY, this.sprite.x, this.sprite.y
        );
        this.body.setVelocity(
          Math.cos(awayAngle) * this.speed * 1.3,
          Math.sin(awayAngle) * this.speed * 1.3
        );
        this.sprite.setFlipX(playerX < this.sprite.x);
        if (dist > this.detectionRange * 0.8 || Math.random() < 0.01) {
          this.state = "chase";
        }
        break;

      case "attack":
        this.body.setVelocity(0);
        if (time > this.lastAttack + this.attackCooldown) {
          this.performAttack(playerX, playerY);
          this.lastAttack = time;
        }
        if (dist > this.attackRange * 1.5) this.state = "chase";
        break;
    }
  }

  protected moveToward(targetX: number, targetY: number, spd?: number) {
    const s = spd || this.speed;
    const angle = Phaser.Math.Angle.Between(
      this.sprite.x, this.sprite.y, targetX, targetY
    );
    this.body.setVelocity(
      Math.cos(angle) * s,
      Math.sin(angle) * s
    );
    this.sprite.setFlipX(targetX < this.sprite.x);
  }

  protected performAttack(_targetX: number, _targetY: number) {
    // Override in subclass
  }
}
