// 3B "radar küresi": nöral ağ gibi bağlı noktalar ve etrafında dönen kategori uyduları.
// Etkileşim: sürükleyerek döndür, imlecin altındaki noktalar parlar, uydunun üzerine gelince
// kategori adı görünür, tıklayınca o kategoriye gider. window.Globe.pulse() yenilemede dalga yayar.
(function () {
  const canvas = document.getElementById('globe');
  const tip = document.getElementById('globeTip');
  if (!canvas || !window.THREE) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 9.5);

  const root = new THREE.Group();
  root.rotation.z = 0.35;
  scene.add(root);

  // Fibonacci küresi
  const N = 760, R = 2.4;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    pts.push(new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R));
  }
  const pGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const base = new Float32Array(N * 3);
  const lime = new THREE.Color('#c6ff3d'), cyan = new THREE.Color('#4fd8ff'), violet = new THREE.Color('#a48bff');
  pts.forEach((p, i) => {
    const t = (p.y / R + 1) / 2;
    const c = t > 0.5 ? cyan.clone().lerp(lime, (t - 0.5) * 2) : violet.clone().lerp(cyan, t * 2);
    base.set([c.r * 0.75, c.g * 0.75, c.b * 0.75], i * 3);
  });
  const colors = base.slice();
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dots = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.95 }));
  root.add(dots);

  // Seyrek bağlantılar
  const linePos = [];
  for (let i = 0; i < N; i += 2) {
    let links = 0;
    for (let j = i + 1; j < N && links < 2; j++) {
      if (pts[i].distanceTo(pts[j]) < 0.42 && Math.random() < 0.55) {
        linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        links++;
      }
    }
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  root.add(new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.12 })));

  const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 48, 48), new THREE.MeshBasicMaterial({ color: 0x0a0c16, transparent: true, opacity: 0.88 }));
  root.add(core);

  // Yörüngeler
  const rings = [[3.4, 0.9, 0x9b7bff], [3.9, -0.5, 0xc6ff3d], [4.4, 0.2, 0x4fd8ff]].map(([r, tilt, col]) => {
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y)));
    const ring = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.16 }));
    ring.rotation.x = tilt;
    ring.rotation.z = tilt * 0.4;
    scene.add(ring);
    return { ring, r };
  });

  // Kategori uyduları (sıra app.js'teki sekmelerle aynı)
  const CATS = [
    ['models', 0xa48bff], ['news', 0x4fd8ff], ['apps', 0xc6ff3d], ['ideas', 0xffb547],
    ['edu', 0x27c9b5], ['learn', 0x7ee0c3], ['video', 0xff5f6d], ['tr', 0xff7a7a],
  ];
  const sats = CATS.map(([id, col], i) => {
    const ringInfo = rings[i % rings.length];
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: col }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14 }));
    glow.userData.sat = i;
    m.add(glow);
    scene.add(m);
    return { id, m, glow, ring: ringInfo.ring, r: ringInfo.r, a: (i / CATS.length) * Math.PI * 2, s: 0.1 + (i % 3) * 0.04, col, label: id, count: 0 };
  });

  // Uydudan küreye sinyaller
  const signals = [];
  const sigGeo = new THREE.SphereGeometry(0.035, 8, 8);
  function emit(sat) {
    const mesh = new THREE.Mesh(sigGeo, new THREE.MeshBasicMaterial({ color: sat.col, transparent: true }));
    scene.add(mesh);
    const from = sat.m.position.clone();
    signals.push({ mesh, from, target: from.clone().normalize().multiplyScalar(R), t: 0 });
  }

  const wave = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 48), new THREE.MeshBasicMaterial({ color: 0xc6ff3d, wireframe: true, transparent: true, opacity: 0 }));
  scene.add(wave);
  let waveT = 1;

  // ── Etkileşim ──────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-9, -9);
  let inside = false, dragging = false, moved = 0, lastX = 0, lastY = 0;
  let velY = 0, velX = 0, hovered = -1;
  const hit = new THREE.Vector3();
  let hitOn = false;

  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    setMouse(e);
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    velY = dx * 0.006;
    velX = dy * 0.004;
    root.rotation.y += velY;
    root.rotation.x = Math.max(-0.9, Math.min(0.9, root.rotation.x + velX));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab';
    if (moved < 6 && hovered >= 0) window.Globe.onSelect?.(sats[hovered].id);
  });
  canvas.addEventListener('pointerleave', () => {
    inside = false;
    hitOn = false;
  });

  function updateHover() {
    if (!inside) {
      if (hovered >= 0) setHover(-1);
      hitOn = false;
      return;
    }
    ray.setFromCamera(mouse, camera);
    const hs = ray.intersectObjects(sats.map((s) => s.glow));
    setHover(hs.length ? hs[0].object.userData.sat : -1);
    const hc = ray.intersectObject(core);
    hitOn = hc.length > 0;
    if (hitOn) {
      hit.copy(hc[0].point);
      root.worldToLocal(hit);
      hit.setLength(R);
    }
  }
  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    if (!dragging) canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
    sats.forEach((s, k) => s.glow.material.opacity = k === i ? 0.35 : 0.14);
    if (tip) tip.hidden = i < 0;
  }
  function placeTip() {
    if (!tip || hovered < 0) return;
    const s = sats[hovered];
    const v = s.m.position.clone().project(camera);
    const r = canvas.getBoundingClientRect();
    const host = canvas.parentElement.getBoundingClientRect();
    tip.style.left = `${r.left - host.left + ((v.x + 1) / 2) * r.width}px`;
    tip.style.top = `${r.top - host.top + ((1 - v.y) / 2) * r.height}px`;
    tip.innerHTML = `<b>${s.label}</b>${s.count ? `<span>${s.count} haber · tıkla</span>` : ''}`;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let lastEmit = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const speed = reduce ? 0.15 : 1;

    if (!dragging) {
      // Bırakınca ataletle yavaşla, sonra kendi dönüşüne dön
      velY *= 0.94;
      velX *= 0.9;
      root.rotation.y += velY + dt * 0.1 * speed;
      root.rotation.x = Math.max(-0.9, Math.min(0.9, root.rotation.x + velX));
    }

    for (const s of sats) {
      if (sats.indexOf(s) !== hovered) s.a += dt * s.s * speed;
      const v = new THREE.Vector3(Math.cos(s.a) * s.r, 0, Math.sin(s.a) * s.r).applyEuler(s.ring.rotation);
      s.m.position.copy(v);
      s.m.rotation.x += dt * 2;
      s.m.rotation.y += dt * 1.5;
      s.m.scale.setScalar(sats.indexOf(s) === hovered ? 1.8 : 1);
    }

    updateHover();
    placeTip();

    // İmlecin altındaki noktaları parlat
    for (let i = 0; i < N; i++) {
      let k = 0;
      if (hitOn) {
        tmp.set(pts[i].x, pts[i].y, pts[i].z);
        const d = tmp.distanceTo(hit);
        if (d < 0.9) k = 1 - d / 0.9;
      }
      const j = i * 3;
      const tr = base[j] + (1 - base[j]) * k, tg = base[j + 1] + (1 - base[j + 1]) * k, tb = base[j + 2] + (1 - base[j + 2]) * k;
      colors[j] += (tr - colors[j]) * 0.2;
      colors[j + 1] += (tg - colors[j + 1]) * 0.2;
      colors[j + 2] += (tb - colors[j + 2]) * 0.2;
    }
    pGeo.attributes.color.needsUpdate = true;
    dots.material.size = 0.05 + Math.sin(t * 2) * 0.006;

    if (!reduce && t - lastEmit > 0.5) {
      lastEmit = t;
      emit(sats[(Math.random() * sats.length) | 0]);
    }
    for (let i = signals.length - 1; i >= 0; i--) {
      const sg = signals[i];
      sg.t += dt * 0.9;
      sg.mesh.position.lerpVectors(sg.from, sg.target, sg.t);
      sg.mesh.material.opacity = 1 - sg.t * 0.6;
      if (sg.t >= 1) {
        scene.remove(sg.mesh);
        sg.mesh.material.dispose();
        signals.splice(i, 1);
      }
    }

    if (waveT < 1) {
      waveT += dt * 0.6;
      wave.scale.setScalar(1 + waveT * 1.2);
      wave.material.opacity = 0.35 * (1 - waveT);
    }
    renderer.render(scene, camera);
  }
  frame();

  window.Globe = {
    pulse() {
      waveT = 0;
      sats.forEach((s) => emit(s));
    },
    // labels: { models: { name, count }, ... }
    setLabels(labels) {
      for (const s of sats) if (labels[s.id]) Object.assign(s, { label: labels[s.id].name, count: labels[s.id].count });
    },
    onSelect: null,
  };
})();
