import Phaser from "phaser";
import Graphics from "../assets/Graphics";

// Frame indices from RogueItems16x16 spritesheet
const FRAMES = {
  heart: 5,
  shield: 14,
  bluePotion: 4,
  goldKey: 0,
  sword1: 12,
  bow: 16
};

export default class UIScene extends Phaser.Scene {
  private barsGfx!: Phaser.GameObjects.Graphics;
  private hpIcon!: Phaser.GameObjects.Sprite;
  private armorIcon!: Phaser.GameObjects.Sprite;
  private manaIcon!: Phaser.GameObjects.Sprite;
  private hpText!: Phaser.GameObjects.Text;
  private armorText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Sprite;
  private coinText!: Phaser.GameObjects.Text;
  private weaponIcon!: Phaser.GameObjects.Sprite;
  private weaponText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private roomClearedText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;

  private cachedHp = 7;
  private cachedMaxHp = 7;
  private cachedArmor = 7;
  private cachedMaxArmor = 7;
  private cachedMana = 200;
  private cachedMaxMana = 200;

  constructor() {
    super("UIScene");
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // === LAYOUT CONSTANTS (for 1280x720, same screen size as 640x360 values * 2) ===
    const padX = 12;
    const padY = 12;
    const iconSize = 2.2;
    const barX = padX + 36;
    const barW = 160;
    const barH = 18;
    const barGap = 26;
    const textSize = "14px";

    // === TOP-LEFT PANEL BACKGROUND ===
    const panelW = barX + barW + 56;
    const panelH = padY + barGap * 2 + barH + 12;
    const panel = this.add.graphics();
    panel.fillStyle(0x111122, 0.7);
    panel.fillRoundedRect(padX - 8, padY - 8, panelW, panelH, 6);
    panel.lineStyle(2, 0x334466, 0.5);
    panel.strokeRoundedRect(padX - 8, padY - 8, panelW, panelH, 6);
    panel.setScrollFactor(0).setDepth(100);

    // === ICONS (left of bars) ===
    const row1Y = padY + barH / 2;
    const row2Y = row1Y + barGap;
    const row3Y = row2Y + barGap;

    this.hpIcon = this.add.sprite(padX + 10, row1Y, Graphics.items.name, FRAMES.heart);
    this.hpIcon.setScrollFactor(0).setDepth(102).setScale(iconSize);

    this.armorIcon = this.add.sprite(padX + 10, row2Y, Graphics.items.name, FRAMES.shield);
    this.armorIcon.setScrollFactor(0).setDepth(102).setScale(iconSize * 0.9);

    this.manaIcon = this.add.sprite(padX + 10, row3Y, Graphics.items.name, FRAMES.bluePotion);
    this.manaIcon.setScrollFactor(0).setDepth(102).setScale(iconSize * 0.9);

    // === BAR GRAPHICS ===
    this.barsGfx = this.add.graphics();
    this.barsGfx.setScrollFactor(0).setDepth(101);

    // === TEXT (on bars) ===
    const barTextStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: textSize,
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3
    };

    // HP text centered on bar
    this.hpText = this.add.text(barX + barW / 2, row1Y, "7/7", barTextStyle);
    this.hpText.setOrigin(0.5).setScrollFactor(0).setDepth(103);

    this.armorText = this.add.text(barX + barW / 2, row2Y, "7/7", barTextStyle);
    this.armorText.setOrigin(0.5).setScrollFactor(0).setDepth(103);

    this.manaText = this.add.text(barX + barW / 2, row3Y, "200/200", barTextStyle);
    this.manaText.setOrigin(0.5).setScrollFactor(0).setDepth(103);

    // === TOP-RIGHT: COINS + WEAPON ===
    const rightPanelW = 140;
    const rightPanelX = W - rightPanelW - 12;
    const rightBg = this.add.graphics();
    rightBg.fillStyle(0x111122, 0.7);
    rightBg.fillRoundedRect(rightPanelX, padY - 8, rightPanelW, 64, 6);
    rightBg.lineStyle(2, 0x334466, 0.5);
    rightBg.strokeRoundedRect(rightPanelX, padY - 8, rightPanelW, 64, 6);
    rightBg.setScrollFactor(0).setDepth(100);

    // Coin row
    this.coinIcon = this.add.sprite(rightPanelX + 20, padY + 8, Graphics.items.name, FRAMES.goldKey);
    this.coinIcon.setScrollFactor(0).setDepth(102).setScale(1.6);

    this.coinText = this.add.text(rightPanelX + 40, padY, "0", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 3
    });
    this.coinText.setScrollFactor(0).setDepth(102);

    // Weapon row
    this.weaponIcon = this.add.sprite(rightPanelX + 20, padY + 32, Graphics.items.name, FRAMES.sword1);
    this.weaponIcon.setScrollFactor(0).setDepth(102).setScale(1.4);

    this.weaponText = this.add.text(rightPanelX + 40, padY + 24, "Pistol [Q]", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#cccccc",
      stroke: "#000000",
      strokeThickness: 2
    });
    this.weaponText.setScrollFactor(0).setDepth(102);

    // Floor
    this.floorText = this.add.text(rightPanelX + rightPanelW - 8, padY + 44, "F: 1-1", {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#888888",
      stroke: "#000000",
      strokeThickness: 2
    });
    this.floorText.setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    // === CENTER MESSAGES ===
    this.roomClearedText = this.add.text(W / 2, H / 2 - 40, "", {
      fontSize: "24px",
      fontFamily: "monospace",
      color: "#00ff44",
      stroke: "#000000",
      strokeThickness: 4
    });
    this.roomClearedText.setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

    this.messageText = this.add.text(W / 2, H / 2, "", {
      fontSize: "32px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5
    });
    this.messageText.setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

    // === EVENTS ===
    const ds = this.scene.get("DungeonScene");
    ds.events.on("playerStatsChanged", () => this.updateStats());
    ds.events.on("weaponChanged", () => this.updateStats());
    ds.events.on("roomCleared", () => this.showRoomCleared());
    ds.events.on("floorChanged", (floor: number) => {
      this.showFloorTitle(floor);
      this.updateStats();
    });
    ds.events.on("playerDied", () => this.showGameOver());

    this.drawBars();
  }

  private drawBars() {
    const padX = 12;
    const padY = 12;
    const barX = padX + 36;
    const barW = 160;
    const barH = 18;
    const barGap = 26;
    const r = 6;

    this.barsGfx.clear();

    // ---- HP BAR ----
    const hpY = padY + barH / 2 - barH / 2;
    const hpPct = Math.max(0, this.cachedHp / this.cachedMaxHp);
    this.barsGfx.fillStyle(0x440000, 0.9);
    this.barsGfx.fillRoundedRect(barX, hpY, barW, barH, r);
    if (hpPct > 0) {
      this.barsGfx.fillStyle(0xdd2222, 1);
      this.barsGfx.fillRoundedRect(barX + 1, hpY + 1, (barW - 2) * hpPct, barH - 2, r - 1);
      this.barsGfx.fillStyle(0xff5555, 0.5);
      this.barsGfx.fillRoundedRect(barX + 2, hpY + 2, (barW - 4) * hpPct, (barH - 4) / 2, r - 2);
    }
    this.barsGfx.lineStyle(2, 0x882222, 1);
    this.barsGfx.strokeRoundedRect(barX, hpY, barW, barH, r);

    // ---- ARMOR BAR ----
    const armorY = padY + barGap;
    const armorPct = Math.max(0, this.cachedArmor / this.cachedMaxArmor);
    this.barsGfx.fillStyle(0x222233, 0.9);
    this.barsGfx.fillRoundedRect(barX, armorY, barW, barH, r);
    if (armorPct > 0) {
      this.barsGfx.fillStyle(0x8888aa, 1);
      this.barsGfx.fillRoundedRect(barX + 1, armorY + 1, (barW - 2) * armorPct, barH - 2, r - 1);
      this.barsGfx.fillStyle(0xaaaacc, 0.4);
      this.barsGfx.fillRoundedRect(barX + 2, armorY + 2, (barW - 4) * armorPct, (barH - 4) / 2, r - 2);
    }
    this.barsGfx.lineStyle(2, 0x555577, 1);
    this.barsGfx.strokeRoundedRect(barX, armorY, barW, barH, r);

    // ---- MANA BAR ----
    const manaY = padY + barGap * 2;
    const manaPct = Math.max(0, this.cachedMana / this.cachedMaxMana);
    this.barsGfx.fillStyle(0x001144, 0.9);
    this.barsGfx.fillRoundedRect(barX, manaY, barW, barH, r);
    if (manaPct > 0) {
      this.barsGfx.fillStyle(0x2266dd, 1);
      this.barsGfx.fillRoundedRect(barX + 1, manaY + 1, (barW - 2) * manaPct, barH - 2, r - 1);
      this.barsGfx.fillStyle(0x44aaff, 0.4);
      this.barsGfx.fillRoundedRect(barX + 2, manaY + 2, (barW - 4) * manaPct, (barH - 4) / 2, r - 2);
    }
    this.barsGfx.lineStyle(2, 0x224488, 1);
    this.barsGfx.strokeRoundedRect(barX, manaY, barW, barH, r);
  }

  updateStats() {
    const ds = this.scene.get("DungeonScene") as any;
    const p = ds.player;
    if (!p) return;

    this.cachedHp = p.hp;
    this.cachedMaxHp = p.maxHp;
    this.cachedArmor = Math.floor(p.armor);
    this.cachedMaxArmor = p.maxArmor;
    this.cachedMana = p.mana;
    this.cachedMaxMana = p.maxMana;
    this.drawBars();

    this.hpText.setText(`${p.hp}/${p.maxHp}`);
    this.armorText.setText(`${Math.floor(p.armor)}/${p.maxArmor}`);
    this.manaText.setText(`${Math.floor(p.mana)}/${p.maxMana}`);
    this.coinText.setText(`${p.coins}`);

    const w = p.getCurrentWeapon();
    this.weaponText.setText(`${w.config.name} [Q]`);
    this.weaponIcon.setFrame(w.config.type === "sword" ? FRAMES.sword1 : FRAMES.bow);
    this.floorText.setText(`F: 1-${ds.currentFloor || 1}`);
  }

  showRoomCleared() {
    this.roomClearedText.setText("ROOM CLEARED!");
    this.roomClearedText.setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: this.roomClearedText, scaleX: 1, scaleY: 1, duration: 300, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.roomClearedText, alpha: 0, y: this.roomClearedText.y - 20, delay: 800, duration: 500, ease: "Cubic.easeOut", onComplete: () => { this.roomClearedText.y += 20; } });
  }

  showFloorTitle(floor: number) {
    this.messageText.setText(`FLOOR ${floor}`);
    this.messageText.setColor("#ffffff").setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.messageText, scaleX: 1, scaleY: 1, duration: 400, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.messageText, alpha: 0, delay: 1500, duration: 500 });
  }

  showGameOver() {
    this.messageText.setText("YOU DIED");
    this.messageText.setColor("#ff0000").setAlpha(1).setScale(1);
    this.time.delayedCall(2000, () => {
      const r = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 40, "Press R to restart", {
        fontSize: "16px", fontFamily: "monospace", color: "#aaaaaa", stroke: "#000000", strokeThickness: 3
      });
      r.setOrigin(0.5).setScrollFactor(0).setDepth(200);
      this.input.keyboard.once("keydown-R", () => { this.scene.get("DungeonScene").scene.restart(); this.scene.restart(); });
    });
  }
}
