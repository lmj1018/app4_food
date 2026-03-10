import { MapEntity } from '../types/MapEntity.type';

export type StageSpawnDef = {
  x: number;
  y: number;
  columns?: number;
  spacingX?: number;
  visibleRows?: number;
};

export type StageDef = {
  title: string;
  entities?: MapEntity[];
  goalY: number;
  zoomY: number;
  spawn?: StageSpawnDef;
};
