(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  const app = {
    pages: [],
    pageRatios: [],
    fileName: '',
    duration: 10,
    playing: false,
    playStart: 0,
    time: 0,
    scene: 'white',
    camera: 'top',
    ratio: '16:9',
    coverTexture: null,
    pageTextures: [],
    cover: null,
    coverFrontMesh: null,
    coverBackMesh: null,
    activeSheet: null,
    activeFrontMesh: null,
    activeBackMesh: null,
    leftPageMesh: null,
    rightPageMesh: null,
    leftStack: null,
    rightStack: null,
    spine: null,
    backCover: null,
    bookGroup: null,
    contactShadow: null,
    renderer: null,
    dirty: true,
    thickness: 18,
    curlAmount: 1.0,
    coverMode: true,
    bookWidth: 1.25,
    bookHeight: 1.8
  };
  window.app = app;

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ease = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const smootherstep = x => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
  const h0 = 0.046; // Độ võng tự nhiên của trang giấy sách
  const restingZ = u => {
    u = clamp(u, 0, 1);
    return h0 * Math.sin(Math.PI * Math.pow(u, 0.65)) * Math.cos(0.5 * Math.PI * u);
  };

  function init3D() {
    if (!window.THREE) return;
    const host = $('#stage');
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog(0xe5e2d9, 14, 32);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(1.4, 1.8, 2.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    host.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.minDistance = 1.2;
    controls.maxDistance = 8.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.saveState();
    controls.addEventListener('change', () => { app.dirty = true; });

    app.controls = controls;
    app.renderer = renderer;
    app.scene3D = scene;
    app.camera3D = camera;

    // Ánh sáng Studio Điện ảnh (Dual-Temperature 3-Point Lighting & ACES Filmic)
    const hemi = new THREE.HemisphereLight(0xfffaf0, 0xd8e0ea, 0.58);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffbf2, 0.42);
    key.position.set(-2.0, 5.5, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0003;
    key.shadow.radius = 2.2;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8f0fe, 0.14);
    fill.position.set(3.0, 3.5, 2.5);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.12);
    rim.position.set(1.8, 4.2, -3.2);
    scene.add(rim);

    // Mặt sàn Studio Sweep
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.88, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.165;
    floor.receiveShadow = true;
    scene.add(floor);
    app.floor = floor;

    // Contact Shadow đậm nét ngay dưới đáy sách
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 512; shadowCanvas.height = 512;
    const sg = shadowCanvas.getContext('2d');
    const grad = sg.createRadialGradient(256, 256, 12, 256, 256, 240);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.48)');
    grad.addColorStop(0.35, 'rgba(15, 23, 42, 0.22)');
    grad.addColorStop(0.7, 'rgba(15, 23, 42, 0.08)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 512, 512);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.encoding = THREE.sRGBEncoding;

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, toneMapped: false, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -0.158;
    scene.add(contactShadow);
    app.contactShadow = contactShadow;

    app.bookGroup = new THREE.Group();
    scene.add(app.bookGroup);

    makeBook([]);
    resize();
    new ResizeObserver(resize).observe(host);

    app.animate = () => {
      requestAnimationFrame(app.animate);
      if (app.playing) {
        const now = performance.now();
        app.time = clamp((now - app.playStart) / 1000, 0, app.duration);
        if (app.time >= app.duration) {
          app.playing = false;
        }
        audioPlayer.check(app.time);
        applyTime(app.time);
        updateTimeline();
      }
      if (app.dirty || app.playing) {
        controls.update();
        renderer.render(scene, camera);
        app.dirty = false;
      }
    };
    app.animate();
  }

  function resize() {
    if (!app.renderer) return;
    const el = $('#stage');
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    app.renderer.setSize(w, h, false);
    app.camera3D.aspect = w / h;
    app.camera3D.updateProjectionMatrix();
    applyTime(app.time);
    app.dirty = true;
  }

  // HỆ THỐNG ÂM THANH LẬT SÁCH (PAGE FLIP SOUND FX)
  const audioPlayer = {
    ctx: null,
    buffers: {},
    playedTriggers: {},
    async init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      try {
        const [openRes, flipRes, closeRes] = await Promise.all([
          fetch('sound_book_open.wav'),
          fetch('sound_page_flip.wav'),
          fetch('sound_book_close.wav')
        ]);
        const [openBuf, flipBuf, closeBuf] = await Promise.all([
          openRes.arrayBuffer(),
          flipRes.arrayBuffer(),
          closeRes.arrayBuffer()
        ]);
        this.buffers.open = await this.ctx.decodeAudioData(openBuf);
        this.buffers.flip = await this.ctx.decodeAudioData(flipBuf);
        this.buffers.close = await this.ctx.decodeAudioData(closeBuf);
      } catch (e) {
        console.warn('Audio preview files loading note:', e);
      }
    },
    play(name) {
      if (!this.ctx || !this.buffers[name]) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.ctx.destination);
      src.start();
    },
    check(time) {
      if (!app.playing) return;
      if (time >= 1.05 && time < 1.45 && !this.playedTriggers.open) {
        this.play('open');
        this.playedTriggers.open = true;
      }
      if (time >= 4.25 && time < 4.65 && !this.playedTriggers.flip) {
        this.play('flip');
        this.playedTriggers.flip = true;
      }
      if (time >= 8.55 && time < 8.95 && !this.playedTriggers.close) {
        this.play('close');
        this.playedTriggers.close = true;
      }
    },
    resetTriggers(time) {
      if (time < 1.0) this.playedTriggers.open = false;
      if (time < 4.2) this.playedTriggers.flip = false;
      if (time < 8.5) this.playedTriggers.close = false;
    }
  };

  function makeSinglePageTexture(img, pageNum, label = '') {
    if (img) {
      const tex = new THREE.CanvasTexture(img);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = app.renderer ? app.renderer.capabilities.getMaxAnisotropy() : 4;
      return tex;
    }

    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1680;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.strokeStyle = '#d0ccc0';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, c.width - 96, c.height - 96);
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 56px Georgia';
    ctx.fillText(label || (pageNum === 1 ? 'BÌA SÁCH' : `TRANG ${pageNum}`), 90, 180);
    ctx.fillStyle = '#64748b';
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(90, 260 + i * 52, 980 - (i % 5) * 60, 6);
    }
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(90, 1340, 300, 180);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(800, 1430, 90, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = app.renderer ? app.renderer.capabilities.getMaxAnisotropy() : 4;
    return tex;
  }

  function clearBook() {
    if (!app.bookGroup) return;
    while (app.bookGroup.children.length) {
      const obj = app.bookGroup.children.pop();
      app.bookGroup.remove(obj);
      obj.traverse?.(v => {
        v.geometry?.dispose();
        if (v.material) {
          (Array.isArray(v.material) ? v.material : [v.material]).forEach(m => {
            if (m.map) m.map.dispose?.();
            if (m.normalMap && m.normalMap !== app.paperNormalTexture) m.normalMap.dispose?.();
            m.dispose?.();
          });
        }
      });
    }
    app.pageTextures.forEach(t => t.dispose());
    app.pageTextures = [];
    if (app.coverTexture) app.coverTexture.dispose();
    app.coverTexture = null;
  }

  // TẠO BẢN ĐỒ PHÁP TUYẾN SỢI GIẤY CELLULOSE PBR (PROCEDURAL PBR PAPER GRAIN)
  function getPaperNormalTexture() {
    if (app.paperNormalTexture) return app.paperNormalTexture;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Sinh độ cao vi hạt ngẫu nhiên định hướng thớ giấy in
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const n1 = Math.sin(x * 0.45) * Math.cos(y * 0.45);
        const n2 = Math.sin(x * 0.95 + y * 0.65) * 0.5;
        const n3 = (Math.random() - 0.5) * 0.7;
        heights[i] = n1 * 0.25 + n2 * 0.25 + n3 * 0.5;
      }
    }

    // Bộ lọc Sobel chuyển đổi sang Normal Map (RGB ứng với vector pháp tuyến X, Y, Z)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const left = heights[y * size + ((x - 1 + size) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const up = heights[((y - 1 + size) % size) * size + x];
        const down = heights[((y + 1) % size) * size + x];

        const dx = (right - left) * 1.5;
        const dy = (down - up) * 1.5;
        const dz = 1.0;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const pIdx = idx * 4;
        data[pIdx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255);
        data[pIdx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255);
        data[pIdx + 2] = Math.floor(((dz / len) * 0.5 + 0.5) * 255);
        data[pIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 8);
    app.paperNormalTexture = tex;
    return tex;
  }

  function makeBook(pages) {
    if (!app.bookGroup) return;
    clearBook();

    const H = app.bookHeight;
    const W = app.bookWidth;
    const thick = 0.05 + (app.thickness / 1000) * 1.6;

    // Khối ruột sách tĩnh bên phải (Right Stack)
    const rightStackGeom = new THREE.BoxGeometry(W, thick * 0.45, H);
    const paperEdgeMat = new THREE.MeshStandardMaterial({ color: 0xedebe4, roughness: 0.88 });
    const rightStackMesh = new THREE.Mesh(rightStackGeom, paperEdgeMat);
    rightStackMesh.position.set(W / 2, -thick * 0.22, 0);
    rightStackMesh.castShadow = true;
    rightStackMesh.receiveShadow = true;
    app.bookGroup.add(rightStackMesh);
    app.rightStack = rightStackMesh;

    // Khối ruột sách tĩnh bên trái (Left Stack)
    const leftStackGeom = new THREE.BoxGeometry(W, thick * 0.45, H);
    const leftStackMesh = new THREE.Mesh(leftStackGeom, paperEdgeMat);
    leftStackMesh.position.set(-W / 2, -thick * 0.22, 0);
    leftStackMesh.castShadow = true;
    leftStackMesh.receiveShadow = true;
    leftStackMesh.visible = false;
    app.bookGroup.add(leftStackMesh);
    app.leftStack = leftStackMesh;

    // Bản đồ pháp tuyến sợi giấy PBR và độ nhám mịn vật lý
    const paperNorm = getPaperNormalTexture();
    const paperNormScale = new THREE.Vector2(0.038, 0.038);

    // Gáy sách (Spine)
    const spineGeom = new THREE.CylinderGeometry(thick * 0.45, thick * 0.45, H, 24, 1, false, -Math.PI / 2, Math.PI);
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0x182230,
      roughness: 0.65,
      metalness: 0.05,
      normalMap: paperNorm,
      normalScale: new THREE.Vector2(0.05, 0.05)
    });
    const spine = new THREE.Mesh(spineGeom, spineMat);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, -thick * 0.2, 0);
    app.bookGroup.add(spine);
    app.spine = spine;

    // Bìa sau (Back Cover) nằm dưới khối sách bên phải khi đóng
    const backCoverGeom = new THREE.BoxGeometry(W + 0.02, 0.018, H + 0.02);
    const backCoverMat = new THREE.MeshStandardMaterial({
      color: 0x182230,
      roughness: 0.65,
      metalness: 0.05,
      normalMap: paperNorm,
      normalScale: new THREE.Vector2(0.05, 0.05)
    });
    const backCover = new THREE.Mesh(backCoverGeom, backCoverMat);
    backCover.position.set(W / 2, -thick * 0.46, 0);
    backCover.receiveShadow = true;
    app.bookGroup.add(backCover);
    app.backCover = backCover;

    // Chuẩn bị Textures cho các trang
    const coverImg = app.coverMode && pages.length ? pages[0] : null;
    const page1Img = app.coverMode ? (pages.length > 1 ? pages[1] : null) : pages[0];
    const page2Img = app.coverMode ? (pages.length > 2 ? pages[2] : null) : pages[1];
    const page3Img = app.coverMode ? (pages.length > 3 ? pages[3] : null) : pages[2];
    const page4Img = app.coverMode ? (pages.length > 4 ? pages[4] : null) : pages[3];

    const coverTex = makeSinglePageTexture(coverImg, 1, 'BÌA SÁCH');
    const p1Tex = makeSinglePageTexture(page1Img, 2, 'TRANG 01 (TRÁI)');
    const p2Tex = makeSinglePageTexture(page2Img, 3, 'TRANG 02 (PHẢI)');
    const p3Tex = makeSinglePageTexture(page3Img, 4, 'TRANG 03 (MẶT SAU)');
    const p4Tex = makeSinglePageTexture(page4Img, 5, 'TRANG 04 (TIẾP THEO)');

    app.pageTextures.push(coverTex, p1Tex, p2Tex, p3Tex, p4Tex);

    const cols = 48, rows = 12;

    // Bìa trước xoay chuyển động (Dual-Sided Cover Pivot)
    const coverPivot = new THREE.Group();
    coverPivot.position.set(0, 0.007, 0);
    app.bookGroup.add(coverPivot);

    const coverFrontGeom = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    coverFrontGeom.translate((W - 0.01) / 2, 0, 0);
    const coverBackGeom = coverFrontGeom.clone();
    const bUv = coverBackGeom.attributes.uv;
    for (let i = 0; i < bUv.count; i++) {
      bUv.setX(i, 1.0 - bUv.getX(i));
    }
    bUv.needsUpdate = true;

    const coverFrontMat = new THREE.MeshStandardMaterial({
      map: coverTex,
      roughness: 0.92,
      metalness: 0.02,
      normalMap: paperNorm,
      normalScale: new THREE.Vector2(0.022, 0.022),
      side: THREE.FrontSide
    });
    const coverBackMat = new THREE.MeshStandardMaterial({
      map: p1Tex,
      roughness: 0.96,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale,
      side: THREE.BackSide
    });

    const coverFrontMesh = new THREE.Mesh(coverFrontGeom, coverFrontMat);
    coverFrontMesh.rotation.x = -Math.PI / 2;
    coverFrontMesh.castShadow = true;
    coverFrontMesh.receiveShadow = true;

    const coverBackMesh = new THREE.Mesh(coverBackGeom, coverBackMat);
    coverBackMesh.rotation.x = -Math.PI / 2;
    coverBackMesh.castShadow = true;
    coverBackMesh.receiveShadow = true;

    coverPivot.add(coverFrontMesh);
    coverPivot.add(coverBackMesh);
    app.cover = coverPivot;
    app.coverFrontMesh = coverFrontMesh;
    app.coverBackMesh = coverBackMesh;

    // Mặt trang tĩnh bên trái (Dự phòng ngầm, để ẩn để bìa động app.cover làm chủ hoàn toàn)
    const leftGeom = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    leftGeom.translate(-(W - 0.01) / 2, 0, 0);
    const lpos = leftGeom.attributes.position;
    for (let i = 0; i < lpos.count; i++) {
      const x = lpos.getX(i);
      const u = Math.max(0, Math.min(1, -x / (W - 0.01)));
      lpos.setZ(i, restingZ(u));
    }
    lpos.needsUpdate = true;
    leftGeom.computeVertexNormals();

    const leftPageMat = new THREE.MeshStandardMaterial({
      map: p1Tex,
      roughness: 0.98,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale
    });
    const leftPageMesh = new THREE.Mesh(leftGeom, leftPageMat);
    leftPageMesh.rotation.x = -Math.PI / 2;
    leftPageMesh.position.set(0, 0.006, 0);
    leftPageMesh.receiveShadow = true;
    leftPageMesh.visible = false;
    app.bookGroup.add(leftPageMesh);
    app.leftPageMesh = leftPageMesh;

    // Mặt trang cong tĩnh bên phải (Trang 2 / Trang 4 khi lật tờ active)
    const rightGeom = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    rightGeom.translate((W - 0.01) / 2, 0, 0);
    const rpos = rightGeom.attributes.position;
    for (let i = 0; i < rpos.count; i++) {
      const x = rpos.getX(i);
      const u = Math.max(0, Math.min(1, x / (W - 0.01)));
      rpos.setZ(i, restingZ(u));
    }
    rpos.needsUpdate = true;
    rightGeom.computeVertexNormals();

    const rightPageMat = new THREE.MeshStandardMaterial({
      map: p2Tex,
      roughness: 0.98,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale
    });
    const rightPageMesh = new THREE.Mesh(rightGeom, rightPageMat);
    rightPageMesh.rotation.x = -Math.PI / 2;
    rightPageMesh.position.set(0, 0.006, 0);
    rightPageMesh.receiveShadow = true;
    rightPageMesh.visible = true;
    app.bookGroup.add(rightPageMesh);
    app.rightPageMesh = rightPageMesh;

    // Bóng đổ khe gáy sách mềm mại đa tầng (Gutter Crease Multi-Stop Ambient Occlusion)
    const creaseCanvas = document.createElement('canvas');
    creaseCanvas.width = 256; creaseCanvas.height = 16;
    const cg = creaseCanvas.getContext('2d');
    const cgrad = cg.createLinearGradient(0, 0, 256, 0);
    cgrad.addColorStop(0.00, 'rgba(0, 0, 0, 0)');
    cgrad.addColorStop(0.20, 'rgba(12, 18, 28, 0.02)');
    cgrad.addColorStop(0.35, 'rgba(12, 18, 28, 0.12)');
    cgrad.addColorStop(0.45, 'rgba(8, 14, 22, 0.35)');
    cgrad.addColorStop(0.50, 'rgba(2, 6, 14, 0.65)');
    cgrad.addColorStop(0.55, 'rgba(8, 14, 22, 0.35)');
    cgrad.addColorStop(0.65, 'rgba(12, 18, 28, 0.12)');
    cgrad.addColorStop(0.80, 'rgba(12, 18, 28, 0.02)');
    cgrad.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
    cg.fillStyle = cgrad;
    cg.fillRect(0, 0, 256, 16);

    const creaseTex = new THREE.CanvasTexture(creaseCanvas);
    creaseTex.encoding = THREE.sRGBEncoding;
    const creaseGeom = new THREE.PlaneGeometry(0.18, H - 0.02);
    const creaseMat = new THREE.MeshBasicMaterial({
      map: creaseTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const creaseMesh = new THREE.Mesh(creaseGeom, creaseMat);
    creaseMesh.rotation.x = -Math.PI / 2;
    creaseMesh.position.set(0, 0.010, 0);
    creaseMesh.visible = false;
    app.bookGroup.add(creaseMesh);
    app.creaseMesh = creaseMesh;

    // TỜ RUỘT LẬT ĐỘNG (Active Flipping Sheet) - 48 CỘT UỐN CONG BẢO TOÀN CHIỀU DÀI
    const sheetGeom = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    sheetGeom.translate((W - 0.01) / 2, 0, 0);

    const pos = sheetGeom.attributes.position;
    sheetGeom.userData.basePos = Float32Array.from(pos.array);

    // Mặt trước (Recto - Trang 2): GPU hardware FrontSide culling
    const frontMat = new THREE.MeshStandardMaterial({
      map: p2Tex,
      roughness: 0.98,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale,
      side: THREE.FrontSide
    });
    const frontMesh = new THREE.Mesh(sheetGeom, frontMat);
    frontMesh.rotation.x = -Math.PI / 2;
    frontMesh.position.y = 0.0095;
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;

    // Mặt sau (Verso - Trang 3): GPU hardware BackSide culling
    const backGeom = sheetGeom.clone();
    backGeom.userData.basePos = Float32Array.from(sheetGeom.userData.basePos);
    const uv = backGeom.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, 1.0 - uv.getX(i));
    }
    uv.needsUpdate = true;

    const backMat = new THREE.MeshStandardMaterial({
      map: p3Tex,
      roughness: 0.98,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale,
      side: THREE.BackSide
    });
    const backMesh = new THREE.Mesh(backGeom, backMat);
    backMesh.rotation.x = -Math.PI / 2;
    backMesh.position.y = 0.0095;
    backMesh.castShadow = true;
    backMesh.receiveShadow = true;

    const sheetGroup = new THREE.Group();
    sheetGroup.add(frontMesh);
    sheetGroup.add(backMesh);
    sheetGroup.visible = false;
    app.bookGroup.add(sheetGroup);

    app.activeSheet = sheetGroup;
    app.activeFrontMesh = frontMesh;
    app.activeBackMesh = backMesh;

    applyTime(app.time);
    app.dirty = true;
  }

  // THUẬT TOÁN UỐN CONG BẢO TOÀN CHIỀU DÀI CUNG (INEXTENSIBLE DEVELOPABLE SURFACE)
  // KẾT HỢP BEND + TWIST + CORNER PEEL TỰ NHIÊN (GÓC DƯỚI PHẢI NHẤC LÊN TRƯỚC)
  function deformSheet(mesh, progress, curlIntensity = 1.0) {
    const q = clamp(progress, 0, 1);
    const geom = mesh.geometry;
    const pos = geom.attributes.position;
    const W = app.bookWidth - 0.01;
    const cols = 48;
    const rows = 12;
    const ds = W / cols;

    for (let iy = 0; iy <= rows; iy++) {
      // iy = 0 là mép trên (+H/2), iy = rows là mép dưới (-H/2)
      const s_bottom = iy / rows; // 0 = trên, 1 = dưới
      // Góc dưới phải được tay người lật nhấc lên trước (lead phase)
      const deltaQ = 0.12 * (s_bottom - 0.35) * 4 * q * (1 - q);
      let prevX = 0;
      let prevZ = 0;

      for (let ix = 0; ix <= cols; ix++) {
        const vertexIdx = iy * (cols + 1) + ix;
        const y0 = pos.getY(vertexIdx);

        if (ix === 0) {
          pos.setXYZ(vertexIdx, 0, y0, q * 0.003);
          prevX = 0;
          prevZ = 0;
          continue;
        }

        const u = ix / cols;
        // Điểm càng xa gáy sách (u -> 1) thì độ lệch góc lật càng rõ rệt
        const q_eff = clamp(q + deltaQ * u, 0, 1);
        const env_eff = Math.sin(Math.PI * q_eff);

        const restZ0 = restingZ(u);
        const restSlope0 = (restingZ(Math.min(1, u + 0.02)) - restZ0) / (0.02 * W);
        const restAngle0 = Math.atan(restSlope0);
        const restAngle1 = Math.PI - restAngle0;

        const spineAngle = Math.PI * (3 * q_eff * q_eff - 2 * q_eff * q_eff * q_eff);
        const baseAngle = (1 - env_eff) * ((1 - q_eff) * restAngle0 + q_eff * restAngle1) + env_eff * spineAngle;

        const arch = Math.sin(Math.PI * u) * 0.40 * curlIntensity * env_eff;
        const lead = Math.pow(u, 1.3) * (1.0 - 0.85 * q_eff) * 0.65 * curlIntensity * env_eff;
        // Độ xoắn uốn chéo góc tự nhiên (torsional twist)
        const twistArch = (s_bottom - 0.35) * 0.22 * Math.pow(u, 1.5) * curlIntensity * env_eff;
        const cushion = Math.pow(u, 2) * (0.45 - q_eff) * 0.30 * curlIntensity * env_eff;
        // Độ lượn sóng khí động học nhẹ nhàng khi lướt trong không khí (aerodynamic flutter)
        const flutter = Math.sin(Math.PI * 2.0 * u + q_eff * Math.PI) * 0.04 * Math.pow(u, 1.8) * env_eff * curlIntensity;

        const phi = baseAngle + arch + lead + twistArch + cushion + flutter;
        const c = Math.cos(phi);
        const s = Math.sin(phi);

        const newX = prevX + ds * c;
        const newZ = Math.max(0, prevZ + ds * s);

        prevX = newX;
        prevZ = newZ;

        const takeOffFactor = smootherstep(clamp((0.3 - q) / 0.3, 0, 1));
        const finalX0 = (1 - takeOffFactor) * newX + takeOffFactor * (u * W);
        const finalZ0 = (1 - takeOffFactor) * newZ + takeOffFactor * restZ0;

        const landFactor = smootherstep(clamp((q - 0.6) / 0.4, 0, 1));
        const finalX = (1 - landFactor) * finalX0 + landFactor * (-u * W);
        const finalZ = (1 - landFactor) * finalZ0 + landFactor * restZ0;

        pos.setXYZ(vertexIdx, finalX, y0, finalZ + q * 0.002);
      }
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }

  // UỐN CONG BÌA ĐỘNG TỰ NHIÊN KHI MỞ VÀ GẤP LẠI (FLEXIBLE COVER CURVATURE)
  function updateCoverDeformation(factor, isClosing = false) {
    if (!app.coverFrontMesh || !app.coverBackMesh) return;
    const geomF = app.coverFrontMesh.geometry;
    const geomB = app.coverBackMesh.geometry;
    const posF = geomF.attributes.position;
    const posB = geomB.attributes.position;
    const cols = 48, rows = 12;
    const flex = Math.sin(Math.PI * factor);

    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const idx = iy * (cols + 1) + ix;
        const u = ix / cols;
        let zVal;
        if (!isClosing) {
          // Mở bìa: factor đi từ 0 -> 1. Khi mở hoàn toàn (factor=1), zVal = -restingZ(u)
          // Xoay quanh trục Z 180 độ sẽ làm -restingZ(u) hướng lên trên (+Y thế giới) trùng khớp tuyệt đối độ cong trang
          zVal = -factor * restingZ(u) - 0.020 * flex * Math.sin(Math.PI * u);
        } else {
          // Đóng bìa: factor đi từ 0 -> 1 (0 là mở hoàn toàn, 1 là gập phẳng hoàn toàn)
          zVal = -(1 - factor) * restingZ(u) - 0.020 * flex * Math.sin(Math.PI * u);
        }
        posF.setZ(idx, zVal);
        posB.setZ(idx, zVal);
      }
    }
    posF.needsUpdate = true;
    posB.needsUpdate = true;
    geomF.computeVertexNormals();
    geomB.computeVertexNormals();
  }

  // UỐN THẢ LỎNG VÀ HÚT KHÍ ĐỘNG HỌC TRANG KẾ TIẾP (RIGHT PAGE SLIPSTREAM DYNAMICS)
  function updateRightPageDeformation(factor, flipQ = 0) {
    if (!app.rightPageMesh) return;
    const geom = app.rightPageMesh.geometry;
    const pos = geom.attributes.position;
    const cols = 48, rows = 12;

    // Lực hút khí động học kéo nhẹ mép trang bên dưới khi trang trên nhấc lên (0.02 -> 0.55)
    const suctionEnv = (flipQ > 0.02 && flipQ < 0.55)
      ? Math.sin(Math.PI * clamp((flipQ - 0.02) / 0.53, 0, 1))
      : 0;

    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const idx = iy * (cols + 1) + ix;
        const u = ix / cols;
        const baseZ = factor * restingZ(u);
        const slipstreamZ = suctionEnv * 0.0028 * Math.pow(u, 1.8);
        pos.setZ(idx, baseZ + slipstreamZ);
      }
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }

  // ĐỊNH VỊ CAMERA CHUẨN ĐIỆN ẢNH VÀ CHUYỂN ĐỘNG THỞ SỐNG ĐỘNG (CINEMATIC CAMERA BREATHING & DOLLY)
  function updateCameraFraming(aspectRatio, coverOpenFactor = 1.0, flipQ = 0.0) {
    const aspect = aspectRatio || app.camera3D.aspect || (16 / 9);
    const W = app.bookWidth;
    const targetX = (W / 2) * (1 - coverOpenFactor);
    const targetY = 0;
    const targetZ = 0.02;

    // Chuyển động thở điện ảnh: Zoom push-in 3.5% khi mở sách để tập trung vào nội dung
    const dollyFactor = 1.0 - 0.035 * coverOpenFactor;
    // Micro-parallax drift nhẹ nhàng đồng nhịp khi lật trang
    const flipParallax = Math.sin(Math.PI * flipQ) * 0.032;

    let dist, camX, camY, camZ;

    if (aspect >= 1.5) {
      // 16:9 Landscape
      dist = 3.65 * dollyFactor;
      if (app.camera === 'reader') {
        camX = targetX + flipParallax; camY = 2.65 * dollyFactor; camZ = 1.95 * dollyFactor;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + flipParallax * 0.5; camY = dist * Math.sin(angleRad); camZ = dist * Math.cos(angleRad) + 0.02;
      } else {
        // Product 45°
        camX = targetX + 0.52 * dollyFactor + flipParallax; camY = 2.25 * dollyFactor; camZ = 2.45 * dollyFactor;
      }
    } else if (aspect >= 1.2) {
      // 4:3 Standard
      dist = 4.10 * dollyFactor;
      if (app.camera === 'reader') {
        camX = targetX + flipParallax; camY = 3.10 * dollyFactor; camZ = 2.30 * dollyFactor;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + flipParallax * 0.5; camY = dist * Math.sin(angleRad); camZ = dist * Math.cos(angleRad) + 0.02;
      } else {
        camX = targetX + 0.58 * dollyFactor + flipParallax; camY = 2.55 * dollyFactor; camZ = 2.85 * dollyFactor;
      }
    } else if (aspect >= 0.9) {
      // 1:1 Square
      dist = 4.60 * dollyFactor;
      if (app.camera === 'reader') {
        camX = targetX + flipParallax; camY = 3.50 * dollyFactor; camZ = 2.60 * dollyFactor;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + flipParallax * 0.5; camY = dist * Math.sin(angleRad); camZ = dist * Math.cos(angleRad) + 0.02;
      } else {
        camX = targetX + 0.62 * dollyFactor + flipParallax; camY = 2.95 * dollyFactor; camZ = 3.25 * dollyFactor;
      }
    } else {
      // 9:16 Vertical
      dist = 5.50 * dollyFactor;
      if (app.camera === 'reader') {
        camX = targetX + flipParallax; camY = 4.20 * dollyFactor; camZ = 3.20 * dollyFactor;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + flipParallax * 0.5; camY = dist * Math.sin(angleRad); camZ = dist * Math.cos(angleRad) + 0.02;
      } else {
        camX = targetX + 0.65 * dollyFactor + flipParallax; camY = 3.55 * dollyFactor; camZ = 3.90 * dollyFactor;
      }
    }

    app.camera3D.position.set(camX, camY, camZ);
    app.controls.target.set(targetX, targetY, targetZ);
    app.controls.update();

    $('#cameraName').textContent = { product: 'Product 45°', reader: 'Reader View', top: 'Top View (Từ trên xuống)' }[app.camera] || 'Top View (Từ trên xuống)';
  }

  // TIMELINE TIÊU CHUẨN 10 GIÂY
  function applyTime(time, customAspect = null) {
    if (!app.bookGroup) return;
    const t = clamp(time, 0, 10);
    const W = app.bookWidth;

    // 1. Mở bìa trước (0.8s -> 2.2s) & Đóng bìa (8.4s -> 9.8s) với Perlin Smootherstep
    const rawOpen = clamp((t - 0.8) / 1.4, 0, 1);
    const openProg = rawOpen * rawOpen * rawOpen * (rawOpen * (rawOpen * 6 - 15) + 10);

    const rawClose = clamp((t - 8.4) / 1.4, 0, 1);
    const closeProg = rawClose * rawClose * rawClose * (rawClose * (rawClose * 6 - 15) + 10);

    const coverFactor = clamp(openProg * (1 - closeProg), 0, 1);

    // Cover rotation quanh trục Z từ 0 -> +PI
    const coverAngle = Math.PI * coverFactor;
    if (app.cover) {
      app.cover.rotation.z = coverAngle;
      app.cover.visible = true; // Luôn luôn hiển thị liên tục, KHÔNG BAO GIỜ bị ẩn/hiện giật lag
    }

    // 2. Lật trang (4.2s -> 5.6s) với Perlin Smootherstep
    const flipStart = 4.2;
    const flipDuration = 1.4;
    const isFlipping = t >= flipStart && t <= flipStart + flipDuration;
    const rawQ = clamp((t - flipStart) / flipDuration, 0, 1);
    const q = rawQ * rawQ * rawQ * (rawQ * (rawQ * 6 - 15) + 10);
    const activeQ = isFlipping ? q : 0;

    // Spine flex kinematics: Gáy sách nở và uốn ra phía sau khi mở sách
    if (app.spine) {
      const thick = app.bookThick;
      app.spine.position.y = -thick * 0.20 - 0.014 * coverFactor;
      app.spine.scale.x = 1.0 + 0.08 * coverFactor;
      app.spine.scale.z = 1.0 + 0.05 * coverFactor;
    }

    // Uốn cong bìa và trang sách mềm mại theo độ mở kết hợp lực hút khí động học trang kế tiếp
    if (t < 8.4) {
      updateCoverDeformation(openProg, false);
    } else {
      updateCoverDeformation(closeProg, true);
    }
    updateRightPageDeformation(coverFactor, activeQ);

    if (app.rightPageMesh) {
      app.rightPageMesh.visible = true;
    }

    if (app.leftPageMesh) {
      app.leftPageMesh.visible = false;
    }

    if (app.creaseMesh) {
      app.creaseMesh.visible = coverFactor > 0.01;
      app.creaseMesh.material.opacity = 0.85 * coverFactor;
    }

    if (app.contactShadow) {
      app.contactShadow.scale.x = 0.55 + coverFactor * 0.52;
      app.contactShadow.position.x = (W / 2) * (1 - coverFactor);
    }

    if (t < flipStart) {
      // Spread 1 (Trang 1 bên trái & Trang 2 bên phải)
      if (app.coverBackMesh && app.pageTextures[1]) {
        if (app.coverBackMesh.material.map !== app.pageTextures[1]) {
          app.coverBackMesh.material.map = app.pageTextures[1];
          app.coverBackMesh.material.needsUpdate = true;
        }
      }
      if (app.rightPageMesh && app.pageTextures[2]) {
        if (app.rightPageMesh.material.map !== app.pageTextures[2]) {
          app.rightPageMesh.material.map = app.pageTextures[2];
          app.rightPageMesh.material.needsUpdate = true;
        }
      }
      if (app.activeSheet) app.activeSheet.visible = false;
    } else if (t < 8.4) {
      // Giai đoạn lật trang (4.2s -> 5.6s) VÀ đọc Spread 2 (5.6s -> 8.4s):
      // Khi q >= 0.5 (t >= 4.9s), tờ active đã lật qua phương thẳng đứng, che kín cánh trái.
      // Pre-bind cánh trái bên dưới thành Trang 3 để 100% không bao giờ bị lộ Trang 1.
      if (q >= 0.5) {
        if (app.coverBackMesh && app.pageTextures[3] && app.coverBackMesh.material.map !== app.pageTextures[3]) {
          app.coverBackMesh.material.map = app.pageTextures[3];
          app.coverBackMesh.material.needsUpdate = true;
        }
      } else {
        if (app.coverBackMesh && app.pageTextures[1] && app.coverBackMesh.material.map !== app.pageTextures[1]) {
          app.coverBackMesh.material.map = app.pageTextures[1];
          app.coverBackMesh.material.needsUpdate = true;
        }
      }

      // Bên phải hiển thị trang 4
      if (app.rightPageMesh && app.pageTextures[4]) {
        if (app.rightPageMesh.material.map !== app.pageTextures[4]) {
          app.rightPageMesh.material.map = app.pageTextures[4];
          app.rightPageMesh.material.needsUpdate = true;
        }
      }

      // Giữ activeSheet hiển thị liên tục, mượt mà từ 4.2s đến hết 8.4s (không bị ẩn giật tại 5.6s)
      if (app.activeSheet) {
        app.activeSheet.visible = true;
        app.activeFrontMesh.visible = true;
        app.activeBackMesh.visible = true;
        deformSheet(app.activeFrontMesh, q, app.curlAmount);
        deformSheet(app.activeBackMesh, q, app.curlAmount);
      }
    } else {
      // t >= 8.4s: Giai đoạn đóng bìa lại
      // Ẩn activeSheet để cánh bìa app.cover làm chủ hoàn toàn chuyển động đóng
      if (app.activeSheet) app.activeSheet.visible = false;

      // Cánh bìa mặt trong chắc chắn là Trang 3 khi gập
      if (app.coverBackMesh && app.pageTextures[3]) {
        if (app.coverBackMesh.material.map !== app.pageTextures[3]) {
          app.coverBackMesh.material.map = app.pageTextures[3];
          app.coverBackMesh.material.needsUpdate = true;
        }
      }
      if (app.rightPageMesh && app.pageTextures[4]) {
        if (app.rightPageMesh.material.map !== app.pageTextures[4]) {
          app.rightPageMesh.material.map = app.pageTextures[4];
          app.rightPageMesh.material.needsUpdate = true;
        }
      }
    }

    // 3. Cinematic Camera Breathing & Dolly Parallax
    updateCameraFraming(customAspect, coverFactor, activeQ);

    app.dirty = true;
  }
  window.applyTime = applyTime;

  function updateTimeline() {
    const t = app.time;
    $('#timeline').value = t;
    const sec = Math.floor(t);
    const ms = Math.floor((t - sec) * 10);
    $('#currentTime').textContent = `00:${String(sec).padStart(2, '0')}.${ms}`;
    $('#playButton').textContent = app.playing ? '⏸' : '▶';
  }
  window.updateTimeline = updateTimeline;

  function setScene(scene) {
    app.scene = scene;
    const shell = $('#stageShell');
    shell.classList.toggle('scene-navy', scene === 'navy');
    $('#sceneName').textContent = scene === 'navy' ? 'Premium Navy' : 'Studio trắng';
    if (app.scene3D) {
      const navy = scene === 'navy';
      app.scene3D.fog.color.set(navy ? 0x0f172a : 0xe5e2d9);
      app.floor.material.color.set(navy ? 0x0f172a : 0xeeece4);
      app.dirty = true;
    }
    $$('[data-scene]').forEach(b => b.classList.toggle('active', b.dataset.scene === scene));
  }

  function setCamera(camera) {
    app.camera = camera;
    $$('[data-camera]').forEach(b => b.classList.toggle('active', b.dataset.camera === camera));
    applyTime(app.time);
  }

  function setRatio(r) {
    app.ratio = r;
    $$('[data-ratio]').forEach(b => b.classList.toggle('active', b.dataset.ratio === r));
    const sizes = {
      '16:9': '1920 × 1080 (16:9 Ngang)',
      '4:3': '1440 × 1080 (4:3 Chuẩn)',
      '9:16': '1080 × 1920 (9:16 Dọc)',
      '1:1': '1080 × 1080 (1:1 Vuông)'
    };
    $('#exportFormat').textContent = `${sizes[r] || r} · Chuẩn H.264`;
    applyTime(app.time);
    app.dirty = true;
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  async function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function importFiles(files) {
    files = [...files].filter(f => /\.pdf$|\.(jpe?g|png|webp|svg)$/i.test(f.name));
    if (!files.length) {
      toast('Vui lòng chọn file PDF, JPG, PNG hoặc WEBP.');
      return;
    }

    app.fileName = files.length === 1 ? files[0].name : `${files.length} ảnh`;
    const images = [];

    try {
      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          if (!window.pdfjsLib) throw Error('Không mở được bộ đọc PDF. Vui lòng kiểm tra kết nối mạng.');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: Math.min(1.6, 1600 / page.getViewport({ scale: 1 }).width) });
            const c = document.createElement('canvas');
            c.width = Math.floor(vp.width);
            c.height = Math.floor(vp.height);
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            images.push(c);
            if (p === 1) $('#fileMeta').textContent = `PDF · ${pdf.numPages} trang`;
          }
        } else {
          images.push(await loadImage(file));
        }
      }

      app.coverMode = $('#firstPageIsCover').checked;
      app.pages = images;
      app.time = 0;
      app.playing = false;
      updateTimeline();

      const first = images[0];
      app.bookWidth = clamp((first.width / first.height) * app.bookHeight, 0.9, 1.45);
      makeBook(images);

      $('#emptyState').style.display = 'none';
      $('#documentInfo').hidden = false;
      $('#fileName').textContent = app.fileName;
      if (!app.fileName.toLowerCase().endsWith('.pdf')) {
        $('#fileMeta').textContent = `Ảnh · ${first.width} × ${first.height}`;
      }
      $('#pageCount').textContent = `${images.length} trang${app.coverMode ? ' · trang đầu là bìa' : ''}`;
      $('#stageHeading').textContent = app.fileName;
      $('#stageSub').textContent = `${images.length} trang · 3D Book Flip sẵn sàng · Lật trang uốn cong mượt mà`;
      $('#exportButton').disabled = false;

      applyTime(0);
      toast(`Đã tải ${images.length} trang sách thành công! Bấm ▶ để xem lật sách.`);
    } catch (e) {
      console.error(e);
      toast(`Không thể mở file: ${e.message}`);
    }
  }

  function filesInput(files) {
    $('#fileMeta').textContent = 'Đang đọc tài liệu…';
    importFiles(files);
  }

  // XUẤT VIDEO MP4 CHUẨN XÁC 10.00s (H.264 / 1080P ĐÚNG PIXEL 1:1)
  async function exportVideo() {
    if (!app.pages.length) {
      toast('Vui lòng thêm PDF hoặc ảnh trước khi xuất video.');
      return;
    }
    const button = $('#exportButton');
    button.disabled = true;
    const originalHTML = button.innerHTML;

    const [w, h] = app.ratio === '16:9' ? [1920, 1080] :
                   app.ratio === '4:3'  ? [1440, 1080] :
                   app.ratio === '9:16' ? [1080, 1920] :
                   app.ratio === '4:5'  ? [1080, 1350] : [1080, 1080];

    const duration = app.duration; // 10.0 giây
    const fps = 30;
    const totalFrames = duration * fps; // 300 frames
    const oldTime = app.time;

    // Lưu lại cấu hình viewport hiện tại
    const stageEl = $('#stage');
    const prevW = stageEl.clientWidth;
    const prevH = stageEl.clientHeight;

    try {
      // 1. Tạm thời resize Three.js renderer đúng bằng kích thước xuất 1080p
      app.renderer.setSize(w, h, false);
      app.camera3D.aspect = w / h;
      app.camera3D.updateProjectionMatrix();

      // Kiểm tra nếu có WebCodecs VideoEncoder & Mp4Muxer
      const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined';

      if (hasWebCodecs) {
        console.log('[EXPORT_LOG] Starting WebCodecs export...');
        button.innerHTML = '<span>⚡</span> Đang nạp âm thanh & chuẩn bị…';

        // Tải và giải mã track âm thanh đồng bộ chuẩn xác 10s
        let audioTrackConfig = null;
        let masterAudioBuffer = null;
        try {
          const aRes = await fetch('sound_master_10s.wav');
          if (aRes.ok) {
            const aBuf = await aRes.arrayBuffer();
            const actx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
            masterAudioBuffer = await actx.decodeAudioData(aBuf);
            if (typeof AudioEncoder !== 'undefined') {
              audioTrackConfig = {
                codec: 'aac',
                sampleRate: masterAudioBuffer.sampleRate,
                numberOfChannels: masterAudioBuffer.numberOfChannels
              };
              console.log('[EXPORT_LOG] Audio track ready:', masterAudioBuffer.duration, 'sec');
            }
          }
        } catch (aErr) {
          console.warn('Audio master track loading warning:', aErr);
        }

        const muxerOptions = {
          target: new Mp4Muxer.ArrayBufferTarget(),
          video: {
            codec: 'avc',
            width: w,
            height: h
          },
          fastStart: 'in-memory'
        };
        if (audioTrackConfig) {
          muxerOptions.audio = audioTrackConfig;
        }

        const muxer = new Mp4Muxer.Muxer(muxerOptions);

        // Mã hóa audio track sang AAC nếu có
        if (audioTrackConfig && masterAudioBuffer) {
          try {
            console.log('[EXPORT_LOG] Encoding audio chunks to AAC...');
            const audioEncoder = new AudioEncoder({
              output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
              error: e => console.error('AudioEncoder error:', e)
            });
            audioEncoder.configure({
              codec: 'mp4a.40.2',
              sampleRate: masterAudioBuffer.sampleRate,
              numberOfChannels: masterAudioBuffer.numberOfChannels,
              bitrate: 128000
            });

            const left = masterAudioBuffer.getChannelData(0);
            const right = masterAudioBuffer.getChannelData(1);
            const chunkSize = 2048;

            for (let offset = 0; offset < left.length; offset += chunkSize) {
              const frames = Math.min(chunkSize, left.length - offset);
              const chunkData = new Float32Array(frames * 2);
              chunkData.set(left.subarray(offset, offset + frames), 0);
              chunkData.set(right.subarray(offset, offset + frames), frames);

              const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: masterAudioBuffer.sampleRate,
                numberOfFrames: frames,
                numberOfChannels: masterAudioBuffer.numberOfChannels,
                timestamp: Math.round((offset / masterAudioBuffer.sampleRate) * 1e6),
                data: chunkData
              });
              audioEncoder.encode(audioData);
              audioData.close();
            }

            await audioEncoder.flush();
            audioEncoder.close();
            console.log('[EXPORT_LOG] Audio encoding complete!');
          } catch (aeErr) {
            console.warn('Audio encoding skipped due to:', aeErr);
          }
        }

        let encodeError = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: e => { console.error('VideoEncoder error:', e); encodeError = e; }
        });

        // H.264 High Profile Level 4.0
        encoder.configure({
          codec: 'avc1.640028',
          width: w,
          height: h,
          bitrate: 14000000,
          framerate: fps
        });

        console.log('[EXPORT_LOG] Encoding 300 video frames...');
        for (let f = 0; f < totalFrames; f++) {
          if (encodeError) throw encodeError;

          const t = f / fps;
          app.time = t;
          applyTime(t, w / h);
          app.renderer.render(app.scene3D, app.camera3D);

          const timestampMicroseconds = Math.round(f * (1000000 / fps));
          const videoFrame = new VideoFrame(app.renderer.domElement, { timestamp: timestampMicroseconds });
          encoder.encode(videoFrame, { keyFrame: f % 30 === 0 });
          videoFrame.close();

          const pct = Math.round(((f + 1) / totalFrames) * 100);
          button.innerHTML = `<span>⏳</span> Đang xuất video MP4: ${pct}%`;
          updateTimeline();

          if (f % 60 === 0) {
            console.log(`[EXPORT_LOG] Video frame ${f}/${totalFrames} (${pct}%)`);
          }

          // Nhường nhịp nhỏ cho UI
          if (f % 6 === 0) await new Promise(r => setTimeout(r, 4));
        }

        console.log('[EXPORT_LOG] Finalizing muxer...');
        button.innerHTML = '<span>⚙</span> Đang hoàn tất đóng gói file MP4…';
        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });

        window.lastExportedBlob = blob;
        console.log('[EXPORT_LOG] Export succeeded! Blob size:', blob.size);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `QBiz-Book-Motion-${app.ratio.replace(':', 'x')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);

        toast(`Xuất video MP4 1080p thành công! (${(blob.size / 1024 / 1024).toFixed(1)} MB, đúng 10.0 giây)`);
      } else {
        // Fallback MediaRecorder với canvas đã resize chuẩn 1080p
        button.innerHTML = '<span>⏳</span> Đang ghi video MP4… 0%';
        const stream = app.renderer.domElement.captureStream(fps);
        const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? 'video/mp4;codecs=h264' :
                     MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
                     MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';

        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        const finished = new Promise(resolve => recorder.onstop = resolve);
        recorder.start();

        for (let f = 0; f < totalFrames; f++) {
          const t = f / fps;
          app.time = t;
          applyTime(t, w / h);
          app.renderer.render(app.scene3D, app.camera3D);

          const pct = Math.round(((f + 1) / totalFrames) * 100);
          button.innerHTML = `<span>⏳</span> Đang ghi video: ${pct}%`;
          updateTimeline();
          await new Promise(r => setTimeout(r, 1000 / fps));
        }

        recorder.stop();
        await finished;

        const blob = new Blob(chunks, { type: recorder.mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
        a.download = `QBiz-Book-Motion-${app.ratio.replace(':', 'x')}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);

        toast(`Xuất video thành công! (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch (e) {
      console.error(e);
      toast(`Xuất video thất bại: ${e.message}`);
    } finally {
      // Khôi phục lại kích thước preview trên web
      app.renderer.setSize(prevW, prevH, false);
      app.camera3D.aspect = prevW / prevH;
      app.camera3D.updateProjectionMatrix();
      button.disabled = false;
      button.innerHTML = originalHTML;
      app.time = oldTime;
      applyTime(app.time);
      updateTimeline();
    }
  }

  function hook() {
    init3D();

    $('#fileInput').addEventListener('change', e => filesInput(e.target.files));
    $('#emptyImport').onclick = () => $('#hiddenInput').click();
    $('#hiddenInput').onchange = e => filesInput(e.target.files);

    $('#dropzone').addEventListener('dragover', e => { e.preventDefault(); $('#dropzone').classList.add('dragging'); });
    $('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
    $('#dropzone').addEventListener('drop', e => {
      e.preventDefault();
      $('#dropzone').classList.remove('dragging');
      filesInput(e.dataTransfer.files);
    });

    $('#removeFile').onclick = () => {
      app.pages = [];
      makeBook([]);
      $('#documentInfo').hidden = true;
      $('#emptyState').style.display = 'flex';
      $('#pageCount').textContent = '0 trang';
      $('#exportButton').disabled = true;
      $('#stageHeading').textContent = 'QBiz Book Motion · Video lật sách 3D';
      $('#stageSub').textContent = 'Nạp PDF hoặc ảnh để tự dựng sách 3D, mở bìa, uốn cong lật trang và xuất MP4 1080p.';
      $('#fileInput').value = '';
    };

    $('#firstPageIsCover').onchange = e => {
      app.coverMode = e.target.checked;
      if (app.pages.length) {
        makeBook(app.pages);
        applyTime(app.time);
      }
    };

    $('#exportButton').onclick = exportVideo;

    $$('[data-ratio]').forEach(b => b.onclick = () => setRatio(b.dataset.ratio));
    $$('[data-scene]').forEach(b => b.onclick = () => setScene(b.dataset.scene));
    $$('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));

    $('#timeline').oninput = e => {
      app.playing = false;
      app.time = +e.target.value;
      audioPlayer.resetTriggers(app.time);
      applyTime(app.time);
      updateTimeline();
    };

    $('#playButton').onclick = () => {
      audioPlayer.init();
      if (app.playing) {
        app.playing = false;
      } else {
        if (app.time >= app.duration) {
          app.time = 0;
          audioPlayer.resetTriggers(0);
        }
        app.playing = true;
        app.playStart = performance.now() - app.time * 1000;
      }
      updateTimeline();
    };

    $('#resetCamera').onclick = () => {
      app.controls.reset();
      setCamera('top');
    };

    $('#fullScreen').onclick = () => $('#stageShell').requestFullscreen?.();

    $('#thickness').oninput = e => {
      app.thickness = +e.target.value;
      $('#thicknessOut').value = `${app.thickness} mm`;
      makeBook(app.pages);
      applyTime(app.time);
    };

    $('#curlAmount').oninput = e => {
      app.curlAmount = +e.target.value / 100;
      $('#curlAmountOut').value = `${e.target.value}%`;
      applyTime(app.time);
    };

    const sampleBtn = $('#btnSamplePdf');
    if (sampleBtn) {
      sampleBtn.onclick = async () => {
        try {
          toast('Đang nạp file mẫu "Nguyên tắc Ăn uống.pdf"...');
          const res = await fetch('Nguyên tắc Ăn uống.pdf');
          if (!res.ok) throw Error('Không thể tải file PDF từ máy chủ.');
          const blob = await res.blob();
          const file = new File([blob], 'Nguyên tắc Ăn uống.pdf', { type: 'application/pdf' });
          filesInput([file]);
        } catch (err) {
          toast(`Lỗi nạp file mẫu: ${err.message}`);
        }
      };
    }

    $$('[data-sample]').forEach(b => b.onclick = async () => {
      const res = await fetch(b.dataset.sample);
      const blob = await res.blob();
      filesInput([new File([blob], b.dataset.sample.split('/').pop(), { type: 'image/svg+xml' })]);
    });

    setRatio('16:9');
    setScene('white');
    setCamera('top');
    applyTime(0);
  }

  document.addEventListener('DOMContentLoaded', hook);
})();
