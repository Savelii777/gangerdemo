import Phaser from "phaser";
import Graphics from "../assets/Graphics";
import { network } from "../network/NetworkManager";

// Renders a remote player in the game world
export default class RemotePlayer {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public nameTag: Phaser.GameObjects.Text;
  public hpBarBg: Phaser.GameObjects.Rectangle;
  public id: number;
  public name: string;
  public hp: number;
  public maxHp: number;
  private targetX: number;
  private targetY: number;

  constructor(id: number, name: string, x: number, y: number, scene: Phaser.Scene) {
    this.id = id;
    this.name = name;
    this.targetX = x;
    this.targetY = y;
    this.hp = 10;
    this.maxHp = 10;

    const isPvP = network.mode === "pvp";

    // Create sprite
    this.sprite = scene.physics.add.sprite(x, y, Graphics.player.name, 0);
    this.sprite.setDepth(9);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setSize(10, 10);

    if (isPvP) {
      // PvP: fully visible, red tint (enemy)
      this.sprite.setAlpha(1);
      this.sprite.setTint(0xff6666);
    } else {
      // Coop: blue tint, slightly transparent (ally)
      this.sprite.setAlpha(0.85);
      this.sprite.setTint(0x88aaff);
    }

    this.sprite.anims.play(Graphics.player.animations.idle.key);

    // Name tag
    const nameColor = isPvP ? "#ff6666" : "#88aaff";
    this.nameTag = scene.add.text(x, y - 14, name, {
      fontSize: "6px",
      fontFamily: "monospace",
      color: nameColor,
      stroke: "#000000",
      strokeThickness: 2
    });
    this.nameTag.setOrigin(0.5).setDepth(200);

    // HP bar (visible in PvP)
    this.hpBarBg = scene.add.rectangle(x, y - 10, 20, 3, 0x333333, 0.8);
    this.hpBarBg.setDepth(199);
    this.hpBarFill = scene.add.rectangle(x, y - 10, 20, 3, isPvP ? 0xff4444 : 0x44ff44, 1);
    this.hpBarFill.setDepth(200);

    // Store ref for collision
    (this.sprite as any).remotePlayerRef = this;
  }

  public hpBarFill: Phaser.GameObjects.Rectangle;

  updatePosition(x: number, y: number, anim: string, flipX: boolean) {
    this.targetX = x;
    this.targetY = y;

    if (anim && this.sprite.anims.currentAnim?.key !== anim) {
      try {
        this.sprite.anims.play(anim, true);
      } catch {}
    }

    this.sprite.setFlipX(flipX);
  }

  updateHp(hp: number, maxHp: number) {
    this.hp = hp;
    this.maxHp = maxHp;
  }

  update() {
    // Smooth interpolation
    const lerpFactor = 0.3;
    this.sprite.x += (this.targetX - this.sprite.x) * lerpFactor;
    this.sprite.y += (this.targetY - this.sprite.y) * lerpFactor;

    // Update name tag + hp bar
    this.nameTag.setPosition(this.sprite.x, this.sprite.y - 16);
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 11);
    this.hpBarFill.setPosition(this.sprite.x, this.sprite.y - 11);

    // HP bar width
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.setScale(pct, 1);
  }

  destroy() {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.hpBarBg.destroy();
    this.hpBarFill.destroy();
  }
}
