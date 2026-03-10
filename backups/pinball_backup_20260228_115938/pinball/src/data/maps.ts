import { newStages } from './newMaps';
import type { StageDef } from './stageDef';

export type { StageDef } from './stageDef';

export const stages: StageDef[] = [
  ...newStages,
];
