import Phaser from "phaser";
import ReferenceScene from "./scenes/ReferenceScene";
import DungeonScene from "./scenes/DungeonScene";
import InfoScene from "./scenes/InfoScene";
import UIScene from "./scenes/UIScene";
import LobbyScene from "./scenes/LobbyScene";

new Phaser.Game({
  type: Phaser.WEBGL,
  width: 1280,
  height: 720,
  render: { pixelArt: true, antialias: false, roundPixels: true },
  physics: { default: "arcade", arcade: { debug: false, gravity: { y: 0 } } },
  scene: [LobbyScene, DungeonScene, InfoScene, ReferenceScene, UIScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
