// 3B "radar küresi": nöral ağ gibi bağlı noktalar, etrafında dönen kaynak uyduları
// ve uydulardan küreye akan sinyaller. window.Globe.pulse() yenilemede dalga yayar.
(function () {
  const canvas = document.getElementById('globe');
  if (!canvas || !window.THREE) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const root = new THREE.Group();
  root.rotation.z = 0.35;
  scene.add(root);

  // Fibonacci küresi
  const N = 700, R = 2.4;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    pts.push(new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R));
  }
  const pGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const colors = new Float32Array(N * 3);
  const lime = new THREE.Color('#c6ff3d'), cyan = new THREE.Color('#45d9ff'), violet = new THREE.Color('#9b7bff');
  pts.forEach((p, i) => {
    const t = (p.y / R + 1) / 2;
    const c = t > 0.5 ? cyan.clone().lerp(lime, (t - 0.5) * 2) : violet.clone().lerp(cyan, t * 2);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dots = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.95 }));
  root.add(dots);

  // Seyrek bağlantılar (nöral ağ görünümü)
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
  root.add(new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ color: 0x45d9ff, transparent: true, opacity: 0.14 })));

  // İç parıltı çekirdeği
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.96, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x0b0d18, transparent: true, opacity: 0.85 })
  );
  root.add(core);

  // Yörünge halkaları
  const rings = [];
  [[3.3, 0.9, 0x9b7bff], [3.8, -0.5, 0xc6ff3d], [4.3, 0.2, 0x45d9ff]].forEach(([r, tilt, col]) => {
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y)));
    const ring = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.18 }));
    ring.rotation.x = tilt;
    ring.rotation.z = tilt * 0.4;
    scene.add(ring);
    rings.push({ ring, r, col });
  });

  // Uydular (kaynak kategorileri)
  const catColors = [0x9b7bff, 0x45d9ff, 0xc6ff3d, 0xffb547, 0xff6fb1, 0xff7a45, 0xff4d5e];
  const sats = catColors.map((col, i) => {
    const ringInfo = rings[i % rings.length];
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: col }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15 }));
    m.add(glow);
    scene.add(m);
    return { m, ring: ringInfo.ring, r: ringInfo.r, a: (i / catColors.length) * Math.PI * 2, s: 0.12 + (i % 3) * 0.05, col };
  });

  // Uydudan küreye sinyaller
  const signals = [];
  const sigGeo = new THREE.SphereGeometry(0.035, 8, 8);
  function emit(sat) {
    const mesh = new THREE.Mesh(sigGeo, new THREE.MeshBasicMaterial({ color: sat.col, transparent: true }));
    scene.add(mesh);
    const from = sat.m.position.clone();
    const target = from.clone().normalize().multiplyScalar(R);
    signals.push({ mesh, from, target, t: 0 });
  }

  // Yenileme dalgası
  const wave = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xc6ff3d, wireframe: true, transparent: true, opacity: 0 })
  );
  scene.add(wave);
  let waveT = 1;

  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
  });

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
  let lastEmit = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const speed = reduce ? 0.15 : 1;

    root.rotation.y += dt * 0.12 * speed;
    root.rotation.x += ((my * 0.25) - root.rotation.x) * 0.04;
    scene.rotation.y += ((mx * 0.3) - scene.rotation.y) * 0.04;
    dots.material.size = 0.045 + Math.sin(t * 2) * 0.006;

    for (const s of sats) {
      s.a += dt * s.s * speed;
      const v = new THREE.Vector3(Math.cos(s.a) * s.r, 0, Math.sin(s.a) * s.r);
      v.applyEuler(s.ring.rotation);
      s.m.position.copy(v);
      s.m.rotation.x += dt * 2;
      s.m.rotation.y += dt * 1.5;
    }

    if (!reduce && t - lastEmit > 0.45) {
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
  };
})();
