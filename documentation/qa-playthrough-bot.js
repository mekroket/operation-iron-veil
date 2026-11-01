/*
 * Plays Silent Breakwater through the game's real input path, with no teleporting and no invulnerability.
 * Open the game with ?debug=1, wait for the main menu, and paste this into the console.
 * Progress and the final result appear on window.__R. Set window.__R.done to see when it has finished.
 */
(async () => {
  const a = window.__ironveil;
  if (!a) throw new Error('Open the game with ?debug=1 first.');
  a.ignoreLock(true);

  const s = () => a.snapshot();
  const buttons = () => [...document.querySelectorAll('.iv-menu-layer button')].filter((b) => b.offsetParent !== null);
  const click = async (pattern) => {
    buttons().find((b) => pattern.test(b.textContent))?.click();
    await new Promise((r) => setTimeout(r, 60));
  };
  await click(/campaign/i);
  await click(/start mission/i);
  a.app.session.skipCinematic();
  a.tick(5);

  const level = a.app.gameWorld.level;
  const nodes = new Map(level.nav.map((n) => [n.id, { ...n, links: [...n.links] }]));
  for (const n of nodes.values()) {
    for (const id of n.links) {
      const other = nodes.get(id);
      if (other && !other.links.includes(n.id)) other.links.push(n.id);
    }
  }
  const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const nearest = (p) => {
    let best = null;
    let score = Infinity;
    for (const n of nodes.values()) {
      const d = flat(n.position, p) + Math.abs(n.position.y - p.y);
      if (d < score) {
        score = d;
        best = n;
      }
    }
    return best;
  };
  const findPath = (from, to) => {
    const open = new Map([[from.id, 0]]);
    const prev = new Map();
    const done = new Set();
    while (open.size) {
      let cur = null;
      let cost = Infinity;
      for (const [k, v] of open) {
        if (v < cost) {
          cost = v;
          cur = k;
        }
      }
      open.delete(cur);
      done.add(cur);
      if (cur === to.id) break;
      for (const id of nodes.get(cur).links) {
        if (done.has(id)) continue;
        const next = cost + flat(nodes.get(cur).position, nodes.get(id).position);
        if (!open.has(id) || next < open.get(id)) {
          open.set(id, next);
          prev.set(id, cur);
        }
      }
    }
    const path = [to.id];
    while (path[0] !== from.id) {
      const p = prev.get(path[0]);
      if (!p) return null;
      path.unshift(p);
    }
    return path;
  };

  const player = () => a.app.session.player;
  const physics = a.app.gameWorld.physics;
  const lookSpeed = 0.0021 * a.app.settings.get().controls.sensitivity;
  const DT = 1 / 30;
  const angleDelta = (x, y) => {
    let d = (y - x) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  const R = { frames: 0, deaths: 0, stuck: [], kills: 0, stages: [], done: false, damage: 0, shots: 0, hits: 0, enemyShots: 0, enemyHits: 0 };
  window.__R = R;
  let lastStage = null;
  const bus = a.app.bus;
  bus.on('enemy:killed', () => R.kills++);
  bus.on('player:damaged', (e) => (R.damage += e.amount));
  bus.on('weapon:fired', () => R.shots++);
  bus.on('combat:enemyHit', () => R.hits++);
  bus.on('enemy:fired', (e) => {
    R.enemyShots++;
    if (e.hitPlayer) R.enemyHits++;
  });
  bus.on('mission:complete', (m) => (R.complete = m));

  const frame = () => {
    a.tick(1, DT);
    R.frames++;
    const stage = s().stage;
    if (stage !== lastStage) {
      R.stages.push([stage, Math.round(R.frames * DT)]);
      lastStage = stage;
    }
  };

  const aimAt = (p) => {
    const eye = player().eye;
    const f = player().forward;
    const yawError = angleDelta(Math.atan2(f.x, f.z), Math.atan2(p.x - eye.x, p.z - eye.z));
    const pitchError = Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z)) - Math.asin(f.y);
    const limit = (v) => Math.max(-120, Math.min(120, v / lookSpeed));
    a.look(limit(yawError), -limit(pitchError));
    return Math.hypot(yawError, pitchError);
  };

  const visibleEnemy = () => {
    const eye = player().eye;
    let best = null;
    let range = 40;
    for (const t of a.app.session.enemies.getHitTargets()) {
      if (!t.alive) continue;
      const c = t.capsules();
      const torso = c[1] || c[0];
      const m = { x: (torso.a.x + torso.b.x) / 2, y: (torso.a.y + torso.b.y) / 2, z: (torso.a.z + torso.b.z) / 2 };
      const d = flat(m, eye);
      if (d < range && physics.lineOfSight(eye, m)) {
        range = d;
        best = m;
      }
    }
    return best;
  };

  const SLOT_KEYS = { assaultRifle: 'Digit1', smg: 'Digit2', handgun: 'Digit3' };

  function* fight() {
    for (let f = 0; f < 30 * 45; f++) {
      if (s().state !== 'mission') break;
      const target = visibleEnemy();
      if (!target) break;
      const error = aimAt(target);
      const w = s().weapon;
      const ammo = w.ammo[w.activeWeapon];
      if (ammo.mag === 0) {
        a.mouse(0, false);
        if (ammo.reserve > 0) {
          a.key('KeyR', true);
          frame();
          a.key('KeyR', false);
        } else {
          const other = Object.keys(SLOT_KEYS).find((k) => w.ammo[k].mag + w.ammo[k].reserve > 0);
          if (!other) break;
          a.key(SLOT_KEYS[other], true);
          frame();
          a.key(SLOT_KEYS[other], false);
        }
      } else {
        a.mouse(0, error < 0.035);
      }
      frame();
      yield;
    }
    a.mouse(0, false);
  }

  function* moveTo(target, stopFrame, radius = 0.9) {
    a.key('KeyW', true);
    let best = Infinity;
    let idle = 0;
    let tries = 0;
    while (flat(player().position, target) > radius && R.frames < stopFrame && s().state === 'mission') {
      if (visibleEnemy()) {
        a.key('KeyW', false);
        yield* fight();
        if (s().state !== 'mission') break;
        a.key('KeyW', true);
        best = Infinity;
        idle = 0;
      }
      const p = player().position;
      const d = flat(p, target);
      const f = player().forward;
      const turn = angleDelta(Math.atan2(f.x, f.z), Math.atan2(target.x - p.x, target.z - p.z));
      a.look(Math.max(-300, Math.min(300, turn / lookSpeed)), (Math.asin(f.y) / lookSpeed) * 0.3);
      frame();
      yield;
      if (d < best - 0.05) {
        best = d;
        idle = 0;
      } else if (++idle > 60) {
        idle = 0;
        best = Infinity;
        if (++tries === 1) {
          // Possibly a closed door: try the interact key before calling it stuck.
          a.key('KeyE', true);
          frame();
          frame();
          a.key('KeyE', false);
        } else {
          R.stuck.push([+p.x.toFixed(1), +p.z.toFixed(1), 'to', target.x, target.z]);
          break;
        }
      }
    }
    a.key('KeyW', false);
  }

  function* route(goal, seconds) {
    const stop = R.frames + seconds * 30;
    while (R.frames < stop) {
      if (s().state === 'dead') {
        R.deaths++;
        a.mouse(0, false);
        a.key('KeyW', false);
        if (R.deaths > 12) return 'too many deaths';
        for (let i = 0; i < 80; i++) a.tick(1, DT);
        const restart = buttons().find((b) => /restart checkpoint/i.test(b.textContent));
        if (!restart) return 'no restart button';
        restart.click();
        a.tick(5, DT);
        yield;
        continue;
      }
      if (s().state !== 'mission') return `state ${s().state}`;
      const here = player().position;
      const ids = findPath(nearest(here), nearest(goal));
      if (!ids) return 'no path';
      if (ids.length <= 1 && flat(here, nodes.get(ids[0]).position) < 1.3) return 'arrived';
      yield* moveTo(nodes.get(ids.length > 1 ? ids[1] : ids[0]).position, stop);
      yield;
    }
    return 'timeout';
  }

  function* mission() {
    const terminal = level.objective.position;
    R.toObjective = yield* route(terminal, 1200);
    yield* moveTo({ x: terminal.x, y: 0, z: terminal.z + 1.5 }, R.frames + 300, 0.5);
    for (let i = 0; i < 30; i++) {
      aimAt({ x: terminal.x, y: 1.1, z: terminal.z });
      frame();
      yield;
    }
    a.key('KeyE', true);
    for (let i = 0; i < 120; i++) {
      frame();
      yield;
    }
    a.key('KeyE', false);
    for (let i = 0; i < 30 * 200 && a.app.session.mission.transferSecondsLeft !== null && s().state === 'mission'; i++) {
      if (visibleEnemy()) yield* fight();
      else {
        frame();
        yield;
      }
    }
    R.toPier = yield* route(level.extraction.position, 900);
    a.key('KeyE', true);
    for (let i = 0; i < 70; i++) {
      frame();
      yield;
    }
    a.key('KeyE', false);
    for (let i = 0; i < 30 * 40 && s().state === 'mission'; i++) {
      a.tick(1, DT);
      if (i % 10 === 0) yield;
    }
    R.endState = s().state;
    R.errors = s().errors;
  }

  const run = mission();
  const pump = () => {
    const end = performance.now() + 25;
    try {
      while (performance.now() < end) {
        if (run.next().done) {
          R.done = true;
          return;
        }
      }
    } catch (error) {
      R.exception = String(error?.stack ?? error);
      R.done = true;
      return;
    }
    setTimeout(pump, 0);
  };
  setTimeout(pump, 0);
})();
