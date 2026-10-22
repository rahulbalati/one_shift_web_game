import Phaser from 'phaser';
import { SCENE } from '../config.ts';
import { platform } from '../platform/index.ts';
import { progress } from '../game/Progress.ts';

// No title screen: new players land straight on level 1, returning players on the map.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE.BOOT });
  }

  create() {
    platform.loadingStop();
    if (progress.maxLevel() <= 1) {
      this.scene.start(SCENE.GAME, { mode: 'level', level: 1 });
    } else {
      this.scene.start(SCENE.MAP);
    }
  }
}
