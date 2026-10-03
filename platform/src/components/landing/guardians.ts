import * as THREE from "three";

import type { GuardianId } from "./guardian-info";

/**
 * Five stylised, faceted bronze guardians built from primitives (no model
 * downloads). Each one has its own idle animation driven by time `t`, so they
 * stay alive while they circle: the lion's mane sways and its head turns, the
 * elephant's ears flap and its trunk swings, the giraffe's neck ripples, the
 * fish eagle's wings beat, and the kudu's ears twitch as it grazes.
 */

export interface Guardian {
  id: GuardianId;
  group: THREE.Group;
  /** Advance the idle animation. `t` is seconds since the scene started. */
  update(t: number): void;
  /** If true the figure flies, so it faces its direction of travel. */
  flies?: boolean;
  dispose(): void;
}

interface Kit {
  bronze: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
  clay: THREE.MeshStandardMaterial;
}

export function makeKit(): Kit {
  return {
    bronze: new THREE.MeshStandardMaterial({ color: 0xe2a13a, metalness: 0.85, roughness: 0.34, flatShading: true, envMapIntensity: 1.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a140a, metalness: 0.3, roughness: 0.6, flatShading: true }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf8ecda, metalness: 0.1, roughness: 0.4, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc24a, emissiveIntensity: 1.6, roughness: 0.3 }),
    clay: new THREE.MeshStandardMaterial({ color: 0xc8541f, metalness: 0.6, roughness: 0.4, flatShading: true, envMapIntensity: 1.2 }),
  };
}

type V3 = [number, number, number];

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

function pivot(parent: THREE.Object3D, pos: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}

function eyes(parent: THREE.Object3D, k: Kit, x: number, y: number, z: number, r = 0.04) {
  for (const s of [-1, 1]) {
    add(parent, new THREE.SphereGeometry(r, 12, 10), k.eye, [s * x, y, z]);
    add(parent, new THREE.SphereGeometry(r * 0.5, 8, 8), k.dark, [s * x, y, z + r * 0.75]);
  }
}

/** Geometry shared by a figure, collected so dispose() can free it. */
function tracker() {
  const geos: THREE.BufferGeometry[] = [];
  return {
    geos,
    track<T extends THREE.BufferGeometry>(g: T): T {
      geos.push(g);
      return g;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
    },
  };
}

/* ── Lion: courage ─────────────────────────────────────────────────────── */
function lion(k: Kit): Guardian {
  const tr = tracker();
  const group = new THREE.Group();
  add(group, tr.track(new THREE.CylinderGeometry(0.3, 0.46, 0.5, 10)), k.bronze, [0, -0.1, -0.05]);
  const head = pivot(group, [0, 0.42, 0]);
  add(head, tr.track(new THREE.IcosahedronGeometry(0.36, 1)), k.bronze, [0, 0, 0.02], [1, 0.95, 0.92]);

  // Two layers of mane cones fanning out behind the face.
  const mane: Array<{ m: THREE.Mesh; base: number; i: number }> = [];
  const coneA = tr.track(new THREE.ConeGeometry(0.1, 0.42, 6));
  const coneB = tr.track(new THREE.ConeGeometry(0.12, 0.55, 6));
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const outer = i % 2 === 0;
    const r = outer ? 0.4 : 0.34;
    const cone = add(head, outer ? coneB : coneA, outer ? k.clay : k.bronze, [Math.cos(a) * r, Math.sin(a) * r * 0.95, -0.12], [1, 1, 1], [0.25, 0, a - Math.PI / 2]);
    mane.push({ m: cone, base: a - Math.PI / 2, i });
  }

  add(head, tr.track(new THREE.SphereGeometry(0.17, 14, 10)), k.bronze, [0, -0.1, 0.32], [1, 0.8, 1.1]);
  add(head, tr.track(new THREE.BoxGeometry(0.1, 0.06, 0.06)), k.dark, [0, -0.02, 0.47]);
  eyes(head, k, 0.12, 0.09, 0.3, 0.04);
  for (const s of [-1, 1]) add(head, tr.track(new THREE.SphereGeometry(0.09, 10, 8)), k.bronze, [s * 0.27, 0.3, 0.05], [1, 1, 0.5]);

  return {
    id: "lion",
    group,
    update(t) {
      head.rotation.y = Math.sin(t * 0.6) * 0.32;
      head.rotation.x = Math.sin(t * 0.9 + 1) * 0.05;
      for (const { m, base, i } of mane) {
        m.rotation.z = base + Math.sin(t * 1.6 + i * 0.7) * 0.07;
        m.scale.y = 1 + Math.sin(t * 1.2 + i) * 0.06;
      }
    },
    dispose: tr.dispose,
  };
}

/* ── Elephant: wisdom ──────────────────────────────────────────────────── */
function elephant(k: Kit): Guardian {
  const tr = tracker();
  const group = new THREE.Group();
  add(group, tr.track(new THREE.CylinderGeometry(0.32, 0.48, 0.5, 10)), k.bronze, [0, -0.1, -0.05]);
  const head = pivot(group, [0, 0.42, 0]);
  add(head, tr.track(new THREE.IcosahedronGeometry(0.4, 1)), k.bronze, [0, 0.02, 0], [1, 1.05, 0.95]);

  const ears: Array<{ p: THREE.Group; side: number }> = [];
  const earGeo = tr.track(new THREE.SphereGeometry(0.4, 14, 10));
  for (const s of [-1, 1]) {
    const p = pivot(head, [s * 0.34, 0.1, -0.04]);
    add(p, earGeo, k.clay, [s * 0.3, -0.02, 0], [0.1, 1, 0.85]);
    ears.push({ p, side: s });
  }

  // Trunk: five hanging segments, each swinging a little after the one above.
  const segs: THREE.Group[] = [];
  let parent: THREE.Object3D = head;
  for (let i = 0; i < 5; i++) {
    const g = pivot(parent, i === 0 ? [0, -0.1, 0.36] : [0, -0.2, 0]);
    add(g, tr.track(new THREE.CylinderGeometry(0.13 - i * 0.016, 0.14 - i * 0.016, 0.22, 8)), k.bronze, [0, -0.1, 0]);
    segs.push(g);
    parent = g;
  }
  for (const s of [-1, 1]) add(head, tr.track(new THREE.ConeGeometry(0.05, 0.36, 6)), k.cream, [s * 0.2, -0.22, 0.36], [1, 1, 1], [1.15, 0, s * -0.25]);
  eyes(head, k, 0.17, 0.12, 0.34, 0.035);

  return {
    id: "elephant",
    group,
    update(t) {
      head.rotation.y = Math.sin(t * 0.5 + 2) * 0.22;
      ears.forEach(({ p, side }) => {
        p.rotation.y = side * (0.32 + (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.4);
      });
      segs.forEach((g, i) => {
        g.rotation.x = -(0.18 + Math.sin(t * 1.4 - i * 0.75) * 0.2 * (0.5 + i * 0.2));
      });
    },
    dispose: tr.dispose,
  };
}

/* ── Giraffe: vision ───────────────────────────────────────────────────── */
function giraffe(k: Kit): Guardian {
  const tr = tracker();
  const group = new THREE.Group();
  add(group, tr.track(new THREE.CylinderGeometry(0.3, 0.44, 0.4, 10)), k.bronze, [0, -0.15, 0]);

  const neck: THREE.Group[] = [];
  let parent: THREE.Object3D = group;
  const segGeo = tr.track(new THREE.CylinderGeometry(0.075, 0.1, 0.3, 8));
  const spotGeo = tr.track(new THREE.SphereGeometry(0.04, 8, 6));
  for (let i = 0; i < 5; i++) {
    const g = pivot(parent, i === 0 ? [0, 0.05, 0.02] : [0, 0.28, 0]);
    add(g, segGeo, k.bronze, [0, 0.14, 0]);
    for (const s of [-1, 1]) add(g, spotGeo, k.dark, [s * 0.078, 0.14, 0.02], [0.4, 1, 1]);
    neck.push(g);
    parent = g;
  }
  const head = pivot(parent, [0, 0.3, 0.02]);
  add(head, tr.track(new THREE.SphereGeometry(0.12, 12, 10)), k.bronze, [0, 0.03, 0.08], [0.85, 0.8, 1.5], [0.25, 0, 0]);
  add(head, tr.track(new THREE.BoxGeometry(0.05, 0.04, 0.04)), k.dark, [0, -0.01, 0.25]);
  for (const s of [-1, 1]) {
    add(head, tr.track(new THREE.CylinderGeometry(0.012, 0.018, 0.17, 6)), k.dark, [s * 0.05, 0.16, -0.01]);
    add(head, tr.track(new THREE.SphereGeometry(0.03, 8, 6)), k.clay, [s * 0.05, 0.25, -0.01]);
    add(head, tr.track(new THREE.SphereGeometry(0.06, 8, 6)), k.bronze, [s * 0.13, 0.08, -0.03], [1, 0.45, 0.7], [0, 0, s * -0.4]);
  }
  eyes(head, k, 0.08, 0.07, 0.12, 0.028);

  return {
    id: "giraffe",
    group,
    update(t) {
      neck.forEach((g, i) => {
        g.rotation.z = Math.sin(t * 0.9 - i * 0.55) * 0.05;
        g.rotation.x = 0.03 + Math.sin(t * 0.7 - i * 0.4) * 0.025;
      });
      head.rotation.x = Math.sin(t * 1.1) * 0.12;
      head.rotation.y = Math.sin(t * 0.6 + 1) * 0.3;
    },
    dispose: tr.dispose,
  };
}

/* ── Fish eagle: freedom ───────────────────────────────────────────────── */
function eagle(k: Kit): Guardian {
  const tr = tracker();
  const group = new THREE.Group();
  const body = pivot(group);
  add(body, tr.track(new THREE.SphereGeometry(0.2, 14, 10)), k.bronze, [0, 0, 0], [1, 0.95, 2.1]);
  add(body, tr.track(new THREE.SphereGeometry(0.1, 12, 10)), k.cream, [0, 0.06, 0.4]);
  add(body, tr.track(new THREE.ConeGeometry(0.045, 0.15, 6)), k.clay, [0, 0.03, 0.52], [1, 1, 1], [Math.PI / 2 + 0.45, 0, 0]);
  eyes(body, k, 0.055, 0.1, 0.45, 0.02);
  add(body, tr.track(new THREE.BoxGeometry(0.22, 0.03, 0.3)), k.dark, [0, 0, -0.5], [1, 1, 1], [0.1, 0, 0]);
  add(body, tr.track(new THREE.BoxGeometry(0.08, 0.025, 0.2)), k.cream, [0, 0.005, -0.42]);

  const inner = tr.track(new THREE.BoxGeometry(0.5, 0.035, 0.36));
  const outer = tr.track(new THREE.BoxGeometry(0.5, 0.028, 0.26));
  const tip = tr.track(new THREE.BoxGeometry(0.16, 0.026, 0.2));
  const wings: Array<{ shoulder: THREE.Group; elbow: THREE.Group; side: number }> = [];
  for (const s of [-1, 1]) {
    const shoulder = pivot(body, [s * 0.14, 0.06, 0.04]);
    add(shoulder, inner, k.bronze, [s * 0.25, 0, 0]);
    const elbow = pivot(shoulder, [s * 0.5, 0, 0.0]);
    add(elbow, outer, k.bronze, [s * 0.25, 0, -0.03], [1, 1, 1]);
    add(elbow, tip, k.dark, [s * 0.55, 0, -0.05]);
    wings.push({ shoulder, elbow, side: s });
  }

  return {
    id: "eagle",
    group,
    flies: true,
    update(t) {
      const beat = Math.sin(t * 3.4);
      wings.forEach(({ shoulder, elbow, side }) => {
        shoulder.rotation.z = side * (beat * 0.55 + 0.12);
        elbow.rotation.z = side * Math.sin(t * 3.4 - 0.9) * 0.4;
      });
      body.rotation.x = -beat * 0.05;
      body.position.y = beat * 0.04;
    },
    dispose: tr.dispose,
  };
}

/* ── Kudu: grace ───────────────────────────────────────────────────────── */
function kudu(k: Kit): Guardian {
  const tr = tracker();
  const group = new THREE.Group();
  add(group, tr.track(new THREE.CylinderGeometry(0.28, 0.42, 0.45, 10)), k.bronze, [0, -0.12, -0.05]);
  const neck = pivot(group, [0, 0.08, 0.02]);
  neck.rotation.x = 0.5;
  add(neck, tr.track(new THREE.CylinderGeometry(0.09, 0.14, 0.5, 8)), k.bronze, [0, 0.22, 0]);
  const head = pivot(neck, [0, 0.5, 0]);
  head.rotation.x = -0.5;
  add(head, tr.track(new THREE.SphereGeometry(0.14, 12, 10)), k.bronze, [0, 0.02, 0.1], [0.8, 0.85, 1.55], [0.2, 0, 0]);
  add(head, tr.track(new THREE.BoxGeometry(0.07, 0.05, 0.05)), k.dark, [0, -0.03, 0.3]);
  eyes(head, k, 0.085, 0.07, 0.12, 0.028);

  const ears: Array<{ m: THREE.Mesh; side: number; ph: number }> = [];
  const earGeo = tr.track(new THREE.SphereGeometry(0.12, 10, 8));
  for (const s of [-1, 1]) {
    const m = add(head, earGeo, k.clay, [s * 0.17, 0.1, -0.02], [0.35, 1, 0.55], [0, 0, s * -0.7]);
    ears.push({ m, side: s, ph: s > 0 ? 0 : 1.7 });
  }

  // Spiralling horns.
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const ang = u * Math.PI * 3.2;
      const r = 0.06 * (1 - 0.45 * u);
      pts.push(new THREE.Vector3(s * (0.05 + u * 0.12) + Math.cos(ang) * r, 0.1 + u * 0.78, -0.02 - u * 0.12 + Math.sin(ang) * r));
    }
    add(head, tr.track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.02, 6, false)), k.cream);
  }

  return {
    id: "kudu",
    group,
    update(t) {
      neck.rotation.x = 0.5 + Math.sin(t * 0.5) * 0.12;
      head.rotation.x = -0.5 - Math.sin(t * 0.5) * 0.1;
      head.rotation.y = Math.sin(t * 0.4 + 3) * 0.25;
      ears.forEach(({ m, side, ph }) => {
        const twitch = Math.pow(Math.max(0, Math.sin(t * 0.9 + ph)), 16);
        m.rotation.z = side * (-0.7 - twitch * 0.55);
      });
    },
    dispose: tr.dispose,
  };
}

/** The five guardians in orbit order (matches GUARDIANS in guardian-info.ts). */
export function buildGuardians(k: Kit): Guardian[] {
  const list = [lion(k), elephant(k), giraffe(k), eagle(k), kudu(k)];
  // Give each its own scale so the silhouettes read at the same weight.
  const scales: Record<GuardianId, number> = { lion: 1, elephant: 1, giraffe: 0.78, eagle: 1.05, kudu: 0.95 };
  list.forEach((g) => g.group.scale.setScalar(scales[g.id]));
  return list;
}
