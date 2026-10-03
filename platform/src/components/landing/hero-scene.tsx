"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { buildGuardians, makeKit } from "./guardians";

/**
 * The hero's 3D piece: a kente-woven gourd with gold rings, circled by five
 * animated bronze guardians (lion, elephant, giraffe, fish eagle, kudu).
 *
 * Smoothness comes from three habits: every motion is driven by elapsed time,
 * not frame count; pointer and hover responses are damped exponentially
 * (frame-rate independent); and GSAP eases the entrance and the hover slow-down
 * so speed never jumps. It idles when off screen or in a hidden tab, and calls
 * `onFail` if WebGL is unavailable so the page keeps its flat sun.
 */

const GOLD = 0xf5a623;
const ORBIT_R = 3.3;

/** A woven kente cloth: coloured weft bands crossed by a block warp pattern. */
function kenteTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const bands: Array<[string, number]> = [
    ["#f5a623", 54],
    ["#0f0805", 10],
    ["#1f8a4c", 54],
    ["#0f0805", 10],
    ["#c8321e", 54],
    ["#0f0805", 10],
    ["#f8ecda", 14],
    ["#0f0805", 10],
  ];
  const total = bands.reduce((s, [, h]) => s + h, 0);
  const scale = size / total;
  let y = 0;
  for (const [colour, h] of bands) {
    g.fillStyle = colour;
    g.fillRect(0, y, size, h * scale + 1);
    y += h * scale;
  }
  g.globalAlpha = 0.34;
  g.fillStyle = "#000";
  for (let x = 0; x < size; x += 32) g.fillRect(x, 0, 4, size);
  g.globalAlpha = 0.5;
  g.fillStyle = "#f8ecda";
  for (let row = 0; row < 4; row++) {
    for (let x = 16; x < size; x += 64) {
      const cy = (row + 0.5) * (size / 4);
      g.beginPath();
      g.moveTo(x, cy - 7);
      g.lineTo(x + 7, cy);
      g.lineTo(x, cy + 7);
      g.lineTo(x - 7, cy);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A soft round glow, drawn once and reused as an additive sprite. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,214,120,1)");
  grad.addColorStop(0.35, "rgba(245,166,35,0.45)");
  grad.addColorStop(1, "rgba(245,166,35,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function HeroScene({ onFail, onFront }: { onFail?: () => void; onFront?: (index: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const frontCb = useRef(onFront);
  frontCb.current = onFront;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail?.();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = el.clientWidth < 520;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, 1.5, 10);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffe2b0, 0x2a1008, 0.55));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.3);
    key.position.set(3, 5, 6);
    const rim = new THREE.PointLight(0xe8693a, 45, 16);
    rim.position.set(-5, -1, 3);
    const back = new THREE.PointLight(0xffc766, 30, 14);
    back.position.set(3, 1, -5);
    scene.add(key, rim, back);

    const rig = new THREE.Group();
    scene.add(rig);

    // ── Centre: the kente gourd, its halo and two gold rings ─────────────
    const tex = kenteTexture();
    const orbMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.52, metalness: 0.12, envMapIntensity: 0.8 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 96, 64), orbMat);
    rig.add(orb);

    const glowTex = glowTexture();
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    const halo = new THREE.Sprite(glowMat);
    halo.scale.setScalar(6.4);
    halo.position.z = -1.2;
    rig.add(halo);

    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.04, 24, 160), goldMat);
    ringA.rotation.set(1.2, 0.2, 0);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.026, 24, 160), goldMat);
    ringB.rotation.set(0.4, -0.6, 0);
    rig.add(ringA, ringB);

    // ── The orbit: a faint path, and the five guardians riding it ───────
    const orbit = new THREE.Group();
    orbit.rotation.set(0.26, 0, -0.1);
    rig.add(orbit);

    const pathMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.28 });
    const path = new THREE.Mesh(new THREE.TorusGeometry(ORBIT_R, 0.012, 8, 220), pathMat);
    path.rotation.x = Math.PI / 2;
    orbit.add(path);

    const kit = makeKit();
    const guardians = buildGuardians(kit);
    const N = guardians.length;
    const haloRingGeo = new THREE.TorusGeometry(0.95, 0.016, 8, 64);
    const haloRingMat = new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const slots = guardians.map((g, i) => {
      const slot = new THREE.Group();
      const pad = new THREE.Mesh(haloRingGeo, haloRingMat);
      pad.rotation.x = Math.PI / 2;
      pad.position.y = -1.0;
      slot.add(pad);
      const spark = new THREE.Sprite(glowMat);
      spark.scale.setScalar(3.2);
      spark.position.y = 0.1;
      slot.add(spark);
      slot.add(g.group);
      orbit.add(slot);
      return { slot, pad, i };
    });

    // Gold dust.
    const count = small ? 160 : 320;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4.6 + Math.random() * 3.4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 1.5;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0xffcf5a, size: 0.04, transparent: true, opacity: 0.75, depthWrite: false });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Back the camera off until the whole orbit (radius + a guardian's size) fits both ways.
      const half = Math.tan((camera.fov / 2) * (Math.PI / 180));
      camera.position.z = Math.max(9, 4.7 / (camera.aspect * half), 3.5 / half);
      camera.position.y = camera.position.z * 0.14;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Pointer: normalised target, damped toward each frame.
    const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1.2, 1.2);
      target.y = THREE.MathUtils.clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1.2, 1.2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Orbit speed lives in one object so GSAP can ease it: fast during the
    // entrance, a calm cruise afterwards, slower still while hovered.
    const state = { speed: reduced ? 0.12 : 2.4 };
    const CRUISE = 0.2;
    const tl = gsap.timeline();
    // Resting size of each figure, so the silhouettes read at the same weight.
    const baseScales = [1.5, 1.5, 1.2, 1.55, 1.4];
    if (reduced) {
      slots.forEach(({ i }) => guardians[i]!.group.scale.setScalar(baseScales[i] ?? 1));
    } else {
      tl.to(state, { speed: CRUISE, duration: 3.4, ease: "power3.out" }, 0);
      tl.fromTo(orb.scale, { x: 0.55, y: 0.55, z: 0.55 }, { x: 1, y: 1, z: 1, duration: 1.6, ease: "elastic.out(1, 0.7)" }, 0.1);
      slots.forEach(({ i }) => {
        const g = guardians[i]!;
        const to = baseScales[i] ?? 1;
        g.group.scale.setScalar(0.0001);
        tl.to(g.group.scale, { x: to, y: to, z: to, duration: 1.3, ease: "back.out(1.7)" }, 0.5 + i * 0.22);
      });
    }
    const onEnter = () => !reduced && gsap.to(state, { speed: 0.06, duration: 1.1, ease: "power2.out", overwrite: "auto" });
    const onLeave = () => !reduced && gsap.to(state, { speed: CRUISE, duration: 1.6, ease: "power2.inOut", overwrite: "auto" });
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(el);

    const clock = new THREE.Clock();
    let angle = 0;
    let t = 0;
    let front = -1;
    const tmp = new THREE.Vector3();
    const damp = (current: number, to: number, lambda: number, dt: number) => THREE.MathUtils.lerp(current, to, 1 - Math.exp(-lambda * dt));
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05); // a tab switch must not fling the orbit
      if (!visible || document.hidden) return;
      t += dt;
      const k = reduced ? 0 : 1;
      angle += state.speed * dt * (reduced ? 0 : 1);

      orb.rotation.y = t * 0.2 * k;
      ringA.rotation.z = t * 0.16 * k;
      ringB.rotation.x = 0.4 + t * 0.1 * k;
      halo.material.opacity = 0.5 + Math.sin(t * 1.3) * 0.06 * k;
      dust.rotation.y = t * 0.02 * k;
      path.rotation.z = t * 0.05 * k;

      let best = -Infinity;
      let bestI = 0;
      slots.forEach(({ slot, pad, i }) => {
        const g = guardians[i]!;
        const phi = angle + (i / N) * Math.PI * 2;
        // Each rides at its own height and drifts gently, like a slow swell.
        const bob = Math.sin(t * 0.8 + i * 1.3) * 0.16 * k + (i === 3 ? 0.5 : 0.25);
        slot.position.set(Math.cos(phi) * ORBIT_R, bob, Math.sin(phi) * ORBIT_R);
        // Walkers show a three-quarter face to the viewer; the eagle faces its flight path.
        g.group.rotation.y = g.flies ? -phi : -phi + 0.85;
        g.group.rotation.z = g.flies ? Math.sin(t * 1.1) * 0.08 * k : 0;
        pad.rotation.z = t * 0.6 * k;
        g.update(t);
        slot.getWorldPosition(tmp);
        if (tmp.z > best) {
          best = tmp.z;
          bestI = i;
        }
      });
      if (bestI !== front) {
        front = bestI;
        frontCb.current?.(bestI);
      }

      // Damped pointer lean, frame-rate independent.
      const lean = reduced ? 0 : 1;
      rig.rotation.y = damp(rig.rotation.y, target.x * 0.28 * lean, 3.2, dt);
      rig.rotation.x = damp(rig.rotation.x, target.y * 0.16 * lean, 3.2, dt);
      rig.position.y = Math.sin(t * 0.9) * 0.1 * k;
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      tl.kill();
      gsap.killTweensOf(state);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      guardians.forEach((g) => g.dispose());
      scene.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose?.();
      });
      Object.values(kit).forEach((m) => m.dispose());
      haloRingGeo.dispose();
      haloRingMat.dispose();
      pathMat.dispose();
      goldMat.dispose();
      orbMat.dispose();
      glowMat.dispose();
      glowTex.dispose();
      tex.dispose();
      dustMat.dispose();
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFail]);

  return <div ref={host} className="h-full w-full" />;
}
