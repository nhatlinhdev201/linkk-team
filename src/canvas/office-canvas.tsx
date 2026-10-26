import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OfficeEventBus } from '../events/event-bus.js';
import { OfficeScene } from './office-scene.js';

export interface OfficeCanvasProps {
  bus: OfficeEventBus;
  width?: number;
  height?: number;
  className?: string;
}

export const OfficeCanvas: React.FC<OfficeCanvasProps> = ({
  bus,
  width = 800,
  height = 600,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new OfficeScene(bus);
    sceneRef.current = scene;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width,
      height,
      backgroundColor: '#0f172a',
      scene: [scene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    return () => {
      scene.destroy();
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [bus, width, height]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="office-canvas-container"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};
