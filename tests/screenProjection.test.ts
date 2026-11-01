import { describe, expect, it } from 'vitest';
import { projectToScreen } from '../src/app/screenProjection';

// A simple perspective-like column-major matrix: x and y pass through, w = z.
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];

describe('projectToScreen', () => {
  it('maps a point straight ahead to the screen centre', () => {
    const p = projectToScreen({ x: 0, y: 0, z: 10 }, matrix, 800, 600);
    expect(p).toEqual({ x: 400, y: 300, onScreen: true });
  });

  it('puts +y above the centre and +x to the right', () => {
    const p = projectToScreen({ x: 5, y: 5, z: 10 }, matrix, 800, 600);
    expect(p.x).toBeGreaterThan(400);
    expect(p.y).toBeLessThan(300);
    expect(p.onScreen).toBe(true);
  });

  it('marks points beyond the edge as off screen', () => {
    expect(projectToScreen({ x: 20, y: 0, z: 10 }, matrix, 800, 600).onScreen).toBe(false);
  });

  it('keeps the side and stays off screen for a point behind the camera', () => {
    const p = projectToScreen({ x: 5, y: 0, z: -10 }, matrix, 800, 600);
    expect(p.onScreen).toBe(false);
    expect(p.x).toBeGreaterThan(400);
    expect(p.y).toBeGreaterThan(600);
  });
});
