import { App } from './app/App';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root');

if (!canvas || !uiRoot) {
  throw new Error('index.html is missing #game-canvas or #ui-root.');
}

void new App(canvas, uiRoot).boot();
