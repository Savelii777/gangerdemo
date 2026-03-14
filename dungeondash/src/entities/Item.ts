import Phaser from "phaser";

export type ItemType = "coin" | "healthPotion" | "energyOrb";

interface ItemConfig {
  value: number;
  color: number;
  label: string;
  texture: string;
}

const ITEM_CONFIGS: { [key in ItemType]: ItemConfig } = {
  coin: { value: 1, color: 0xffd700, label: "+1 COIN", texture: "coin_drop" },
  healthPotion: { value: 2, color: 0x00ff00, label: "+2 HP", texture: "health_drop" },
  energyOrb: { value: 30, color: 0x4488ff, label: "+30 MANA", texture: "energy_drop" }
};

export default class Item {
  public sprite: Phaser.GameObjects.Sprite;
  public type: ItemType;
  public value: number;
  private scene: Phaser.Scene;

  constructor(x: number, y: number, scene: Phaser.Scene, type: ItemType) {
    this.scene = scene;
    this.type = type;
    const cfg = ITEM_CONFIGS[type];
    this.value = cfg.value;

    // Use procedural texture sprites
    this.sprite = scene.add.sprite(x, y, cfg.texture);
    this.sprite.setDepth(4);

    // Enable physics
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.setSize(6, 6);

    // Link back
    (this.sprite as any).itemRef = this;

    // Float animation
    scene.tweens.add({
      targets: this.sprite,
      y: y - 3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Spawn pop effect
    this.sprite.setScale(0);
    scene.tweens.add({
      targets: this.sprite,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: "Back.easeOut"
    });
  }

  pickup() {
    const cfg = ITEM_CONFIGS[this.type];

    // Floating pickup text
    const text = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - 8,
      cfg.label,
      {
        fontSize: "7px",
        fontFamily: "monospace",
        color: "#" + cfg.color.toString(16).padStart(6, "0"),
        stroke: "#000000",
        strokeThickness: 2
      }
    );
    text.setDepth(200);
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 16,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy()
    });

    // Pickup sparkle
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 150,
      ease: "Cubic.easeOut",
      onComplete: () => this.sprite.destroy()
    });
  }

  static dropCoins(
    x: number,
    y: number,
    scene: Phaser.Scene,
    count: number,
    items: Item[]
  ) {
    for (let i = 0; i < count; i++) {
      const ox = Phaser.Math.Between(-10, 10);
      const oy = Phaser.Math.Between(-10, 10);
      // Stagger drops slightly
      scene.time.delayedCall(i * 50, () => {
        items.push(new Item(x + ox, y + oy, scene, "coin"));
      });
    }
  }

  static dropRandom(
    x: number,
    y: number,
    scene: Phaser.Scene,
    items: Item[]
  ) {
    const roll = Math.random();
    if (roll < 0.05) {
      items.push(new Item(x, y, scene, "healthPotion"));
    } else if (roll < 0.35) {
      items.push(new Item(x, y, scene, "energyOrb"));
    }
    // Always drop coins
    Item.dropCoins(x, y, scene, Phaser.Math.Between(1, 3), items);
  }
}
