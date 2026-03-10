import { MapEntity } from '../../types/MapEntity.type';

type Point = [number, number];

export const W = (points: Point[], c = '#5c5470'): MapEntity => ({
  position: { x: 0, y: 0 },
  type: 'static',
  props: { density: 1, angularVelocity: 0, restitution: 0 },
  shape: { type: 'polyline', rotation: 0, points, color: c },
});

const B = (
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  c = '#818fb4',
): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'box', width: w, height: h, rotation: r, color: c },
  props: { density: 1, angularVelocity: 0, restitution: 0 },
});

export const C = (
  x: number,
  y: number,
  rad = 0.5,
  c = '#fff4b7',
  rest = 1.5,
  life = 1,
): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'circle', radius: rad, color: c },
  props: { angularVelocity: 0, density: 1, restitution: rest, life },
});

export const K = (x: number, y: number, w: number, av: number, c = '#9bec00'): MapEntity => ({
  position: { x, y },
  type: 'kinematic',
  shape: { type: 'box', width: w, height: 0.1, rotation: 0, color: c },
  props: { density: 1, angularVelocity: av, restitution: 0 },
});

export const D = (x: number, y: number, c = '#818fb4'): MapEntity => B(x, y, 0.2, 0.2, -45, c);

export const WALLS: MapEntity[] = [
  {
    position: { x: 2, y: 0 },
    type: 'static',
    shape: { type: 'box', width: 1, height: 800, rotation: 0, color: '#222', bloomColor: '#777' },
    props: { density: 500, angularVelocity: 0, restitution: 0 },
  },
  {
    position: { x: 21, y: 0 },
    type: 'static',
    shape: { type: 'box', width: 1, height: 800, rotation: 0, color: '#222', bloomColor: '#777' },
    props: { density: 500, angularVelocity: 0, restitution: 0 },
  },
];

export const pegRow = (
  y: number,
  x0: number,
  x1: number,
  gap: number,
  c = '#fff4b7',
  r = 0.4,
): MapEntity[] => {
  const res: MapEntity[] = [];
  for (let x = x0; x <= x1; x += gap) {
    res.push(C(x, y, r, c));
  }
  return res;
};

export const dRow = (
  y: number,
  x0: number,
  x1: number,
  gap: number,
  c = '#818fb4',
): MapEntity[] => {
  const res: MapEntity[] = [];
  for (let x = x0; x <= x1; x += gap) {
    res.push(D(x, y, c));
  }
  return res;
};

export const wideStart = (color1: string, color2: string): MapEntity[] => [
  ...pegRow(18, 3.5, 19.5, 2.0, color1, 0.3),
  ...pegRow(21, 4.5, 18.5, 2.0, color2, 0.3),
  ...pegRow(24, 3.5, 19.5, 2.0, color1, 0.3),
  C(8, 27, 0.7, color2, 2.0, 2),
  C(15, 27, 0.7, color2, 2.0, 2),
];

export const standardEnd = (baseY: number): MapEntity[] => [
  ...pegRow(baseY, 3.5, 19.5, 1.4, '#fff4b7', 0.4),
  ...pegRow(baseY + 3, 4.2, 18.8, 1.4, '#ffe227', 0.4),
  ...pegRow(baseY + 6, 3.5, 19.5, 1.4, '#fff4b7', 0.4),
  ...pegRow(baseY + 9, 4.2, 18.8, 1.4, '#ffe227', 0.4),
  ...pegRow(baseY + 12, 3.5, 19.5, 1.4, '#fff4b7', 0.4),
  C(5, baseY + 5, 1.0, '#e74c3c', 2.5, 2),
  C(18, baseY + 5, 1.0, '#3498db', 2.5, 2),
  C(11.5, baseY + 8, 1.0, '#2ecc71', 2.5, 2),
  K(7, baseY + 18, 4, 4, '#e17055'),
  K(16, baseY + 18, 4, -4, '#0984e3'),
  K(11.5, baseY + 28, 6, -2, '#6c5ce7'),
  ...pegRow(baseY + 35, 3.5, 19.5, 1.3, '#ffe3fe', 0.35),
  ...pegRow(baseY + 40, 4, 19, 1.3, '#ff94cc', 0.35),
  W([
    [3, baseY + 42],
    [10, baseY + 55],
  ], '#c44569'),
  W([
    [20, baseY + 42],
    [13, baseY + 55],
  ], '#c44569'),
  ...pegRow(baseY + 50, 8, 15, 1.5, '#fff4b7', 0.3),
];
