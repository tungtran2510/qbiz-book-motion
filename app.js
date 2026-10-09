(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  const app = {
    pages: [],
    pageRatios: [],
    allPages: [],
    selectedSpread: 0,
    audioEnabled: true,
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
    coverRimMesh: null,
    activeSheet: null,
    activeFrontMesh: null,
    activeBackMesh: null,
    activeRimMesh: null,
    leftPageMesh: null,
    rightPageMesh: null,
    subLeaf1: null,
    subLeaf2: null,
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
    bookHeight: 1.8,
    motionStyle: 'deep_curl',
    watermarkEnabled: false,
    watermarkText: 'QBiz Book Motion'
  };
  window.app = app;

  // ĐỊNH NGHĨA 4 PHONG CÁCH CHUYỂN ĐỘNG QUY CHUẨN (4 MOTION PRESET STYLES)
  const MOTION_STYLES = {
    deep_curl: {
      key: 'deep_curl',
      name: 'Phong cách 1: Uốn cong mềm (Panel 3)',
      desc: 'Bìa và trang uốn cong sâu hình vòm mềm mại, sang trọng kiểu tạp chí bìa mềm',
      curlFactor: 1.15,
      coverCurlFactor: 1.25,
      peelFactor: 0.35,
      fanningFactor: 0.65,
      defaultCamera: 'product'
    },
    diagonal_peel: {
      key: 'diagonal_peel',
      name: 'Phong cách 2: Bóc góc chéo điện ảnh (Panel 2 & 4)',
      desc: 'Bóc nhấc từ góc chéo dưới trước, lượn sóng xoắn vặn và quạt tệp giấy đa tầng',
      curlFactor: 0.95,
      coverCurlFactor: 0.85,
      peelFactor: 1.35,
      fanningFactor: 1.25,
      defaultCamera: 'product'
    },
    classic: {
      key: 'classic',
      name: 'Phong cách 3: Tiêu chuẩn phẳng',
      desc: 'Lật phẳng êm dịu, thanh lịch, chuyển động tự nhiên truyền thống',
      curlFactor: 0.65,
      coverCurlFactor: 0.45,
      peelFactor: 0.0,
      fanningFactor: 0.35,
      defaultCamera: 'product'
    },
    reader_focus: {
      key: 'reader_focus',
      name: 'Phong cách 4: Trải nghiệm đọc (Reader Focus)',
      desc: 'Góc nhìn đối diện Reader View, trang nằm phẳng tối đa để đọc rõ từng chữ',
      curlFactor: 0.45,
      coverCurlFactor: 0.40,
      peelFactor: 0.15,
      fanningFactor: 0.25,
      defaultCamera: 'reader'
    }
  };

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ease = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const smootherstep = x => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
  // Hàm chuyển động mượt bậc 7 (7th Order Smoothstep - Triệt tiêu gia tốc giật 0 Jerk)
  const smooth7 = x => {
    x = clamp(x, 0, 1);
    return x * x * x * x * (x * (x * (-20 * x + 70) - 84) + 35);
  };
  const h0 = 0.054; // Độ võng cong tự nhiên của trang giấy sách (tăng độ cong trang trọng)
  const restingZ = u => {
    u = clamp(u, 0, 1);
    return h0 * Math.sin(Math.PI * Math.pow(u, 0.65)) * Math.cos(0.5 * Math.PI * u);
  };

  // Cấu hình lưới đa giác siêu mịn (High-Subdivision SOTA 128x16) & Mép giấy 3D kín viền
  const SUBDIV_X = 128;
  const SUBDIV_Y = 16;
  const boundaryIndices = [];
  for (let ix = 0; ix <= SUBDIV_X; ix++) boundaryIndices.push({ ix, iy: 0 });
  for (let iy = 1; iy <= SUBDIV_Y; iy++) boundaryIndices.push({ ix: SUBDIV_X, iy });
  for (let ix = SUBDIV_X - 1; ix >= 0; ix--) boundaryIndices.push({ ix, iy: SUBDIV_Y });

  function createRimGeometry() {
    const numPts = boundaryIndices.length;
    const rimPos = new Float32Array(numPts * 2 * 3);
    const rimIndices = [];
    for (let i = 0; i < numPts - 1; i++) {
      const f0 = i * 2, b0 = i * 2 + 1;
      const f1 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
      rimIndices.push(f0, b0, f1);
      rimIndices.push(b0, b1, f1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(rimPos, 3));
    geom.setIndex(rimIndices);
    return geom;
  }

  // TẠO BẢN ĐỒ VÂN XẾP LỚP HÀNG TRĂM TRANG GIẤY TRÊN TỆP SÁCH (PROCEDURAL STACKED PAGE EDGE TEXTURE)
  function getStackEdgeTexture() {
    if (app.stackEdgeTexture) return app.stackEdgeTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(128, 256);
    const data = imgData.data;
    for (let y = 0; y < 256; y++) {
      const pageLine = (y % 2 === 0);
      const noise = (Math.sin(y * 18.2) * 0.5 + 0.5) * 8 + (Math.sin(y * 4.1) * 0.5 + 0.5) * 6;
      const base = pageLine ? 245 : 230;
      const col = Math.floor(base - noise);
      for (let x = 0; x < 128; x++) {
        const idx = (y * 128 + x) * 4;
        data[idx] = col;
        data[idx + 1] = col - 2;
        data[idx + 2] = col - 5;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 2);
    app.stackEdgeTexture = tex;
    return tex;
  }

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
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.0;
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

    // Ánh sáng Studio chuẩn xác (Tổng cường độ ~1.0 giữ nguyên 100% màu gốc của PDF, không bị cháy sáng hay đổi màu)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd0d4dc, 0.66);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 0.34);
    key.position.set(-2.0, 5.5, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 2.0;
    key.shadow.camera.left = -2.2;
    key.shadow.camera.right = 2.2;
    key.shadow.camera.top = 2.0;
    key.shadow.camera.bottom = -2.0;
    key.shadow.camera.near = 1.0;
    key.shadow.camera.far = 12.0;
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.10);
    fill.position.set(3.0, 3.5, 2.5);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.08);
    rim.position.set(2.0, 4.0, -3.0);
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
      if (!app.audioEnabled) return;
      if (!this.ctx || !this.buffers[name]) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.ctx.destination);
      src.start();
    },
    check(time) {
      if (!app.playing) return;
      const sigma = (app.duration || 10) / 10;
      if (time >= 1.05 * sigma && time < 1.45 * sigma && !this.playedTriggers.open) {
        this.play('open');
        this.playedTriggers.open = true;
      }
      if (time >= 4.25 * sigma && time < 4.65 * sigma && !this.playedTriggers.flip) {
        this.play('flip');
        this.playedTriggers.flip = true;
      }
      if (time >= 8.55 * sigma && time < 8.95 * sigma && !this.playedTriggers.close) {
        this.play('close');
        this.playedTriggers.close = true;
      }
    },
    resetTriggers(time) {
      const sigma = (app.duration || 10) / 10;
      if (time < 1.0 * sigma) this.playedTriggers.open = false;
      if (time < 4.2 * sigma) this.playedTriggers.flip = false;
      if (time < 8.5 * sigma) this.playedTriggers.close = false;
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
    app.subLeaf1 = null;
    app.subLeaf2 = null;
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
    app.bookThick = thick;

    // Khối ruột sách tĩnh bên phải (Right Stack) - Giả lập vân xếp lớp hàng trăm trang giấy
    const rightStackGeom = new THREE.BoxGeometry(W, thick * 0.45, H);
    const stackEdgeTex = getStackEdgeTexture();
    const paperEdgeMat = new THREE.MeshStandardMaterial({
      map: stackEdgeTex,
      roughness: 0.90,
      metalness: 0.0
    });
    const paperTopMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0.0
    });
    const stackMaterials = [
      paperEdgeMat, // +X (fore-edge)
      paperEdgeMat, // -X (spine)
      paperTopMat,  // +Y (top page)
      paperTopMat,  // -Y (bottom)
      paperEdgeMat, // +Z (bottom edge)
      paperEdgeMat  // -Z (top edge)
    ];

    const rightStackMesh = new THREE.Mesh(rightStackGeom, stackMaterials);
    rightStackMesh.position.set(W / 2, -thick * 0.22, 0);
    rightStackMesh.castShadow = true;
    rightStackMesh.receiveShadow = true;
    app.bookGroup.add(rightStackMesh);
    app.rightStack = rightStackMesh;

    // Khối ruột sách tĩnh bên trái (Left Stack)
    const leftStackGeom = new THREE.BoxGeometry(W, thick * 0.45, H);
    const leftStackMesh = new THREE.Mesh(leftStackGeom, stackMaterials);
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
    app.allPages = pages;
    app.selectedSpread = 0;
    $$('[data-spread]').forEach((b, i) => b.classList.toggle('active', i === 0));

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

    const cols = SUBDIV_X, rows = SUBDIV_Y;

    // Bìa trước xoay chuyển động (Dual-Sided Cover Pivot with 3D Fore-Edge Hardcover Rim)
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

    // Giữ nguyên 100% màu gốc tài liệu PDF/ảnh (Không ám vàng, không đổi màu, không lóa)
    const coverFrontMat = new THREE.MeshStandardMaterial({
      map: coverTex,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.FrontSide
    });
    const coverBackMat = new THREE.MeshStandardMaterial({
      map: p1Tex,
      roughness: 0.96,
      metalness: 0.0,
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

    const coverRimGeom = createRimGeometry();
    const coverRimMat = new THREE.MeshStandardMaterial({
      color: 0x182230,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const coverRimMesh = new THREE.Mesh(coverRimGeom, coverRimMat);
    coverRimMesh.rotation.x = -Math.PI / 2;
    coverRimMesh.castShadow = true;
    coverRimMesh.receiveShadow = true;

    coverPivot.add(coverFrontMesh);
    coverPivot.add(coverBackMesh);
    coverPivot.add(coverRimMesh);
    app.cover = coverPivot;
    app.coverFrontMesh = coverFrontMesh;
    app.coverBackMesh = coverBackMesh;
    app.coverRimMesh = coverRimMesh;

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
      roughness: 0.96,
      metalness: 0.0
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
      roughness: 0.96,
      metalness: 0.0
    });
    const rightPageMesh = new THREE.Mesh(rightGeom, rightPageMat);
    rightPageMesh.rotation.x = -Math.PI / 2;
    rightPageMesh.position.set(0, 0.006, 0);
    rightPageMesh.receiveShadow = true;
    rightPageMesh.visible = true;
    app.bookGroup.add(rightPageMesh);
    app.rightPageMesh = rightPageMesh;

    // CÁC TỜ GIẤY TỆP ĐA TẦNG PHÍA DƯỚI (Multi-Leaf Sub-Sheets for Fore-Edge Fanning)
    const subGeom1 = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    subGeom1.translate((W - 0.01) / 2, 0, 0);
    const subGeom2 = subGeom1.clone();

    const subLeafMat = new THREE.MeshStandardMaterial({
      color: 0xfdfcf8,
      roughness: 0.96,
      metalness: 0.0,
      normalMap: paperNorm,
      normalScale: paperNormScale
    });

    const subLeaf1 = new THREE.Mesh(subGeom1, subLeafMat);
    subLeaf1.rotation.x = -Math.PI / 2;
    subLeaf1.position.set(0, 0.0042, 0);
    subLeaf1.receiveShadow = true;
    app.bookGroup.add(subLeaf1);
    app.subLeaf1 = subLeaf1;

    const subLeaf2 = new THREE.Mesh(subGeom2, subLeafMat);
    subLeaf2.rotation.x = -Math.PI / 2;
    subLeaf2.position.set(0, 0.0024, 0);
    subLeaf2.receiveShadow = true;
    app.bookGroup.add(subLeaf2);
    app.subLeaf2 = subLeaf2;

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

    // TỜ RUỘT LẬT ĐỘNG (Active Flipping Sheet) - 128 CỘT UỐN CONG BẢO TOÀN CHIỀU DÀI & MÉP GIẤY 3D FORE-EDGE
    const sheetGeom = new THREE.PlaneGeometry(W - 0.01, H - 0.02, cols, rows);
    sheetGeom.translate((W - 0.01) / 2, 0, 0);

    const pos = sheetGeom.attributes.position;
    sheetGeom.userData.basePos = Float32Array.from(pos.array);

    // Mặt trước (Recto - Trang 2): 100% màu gốc chuẩn xác, không bị biến đổi màu
    const frontMat = new THREE.MeshStandardMaterial({
      map: p2Tex,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.FrontSide
    });
    const frontMesh = new THREE.Mesh(sheetGeom, frontMat);
    frontMesh.rotation.x = -Math.PI / 2;
    frontMesh.position.y = 0.0095;
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;

    // Mặt sau (Verso - Trang 3): 100% màu gốc chuẩn xác, không bị biến đổi màu
    const backGeom = sheetGeom.clone();
    backGeom.userData.basePos = Float32Array.from(sheetGeom.userData.basePos);
    const uv = backGeom.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, 1.0 - uv.getX(i));
    }
    uv.needsUpdate = true;

    const backMat = new THREE.MeshStandardMaterial({
      map: p3Tex,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.BackSide
    });
    const backMesh = new THREE.Mesh(backGeom, backMat);
    backMesh.rotation.x = -Math.PI / 2;
    backMesh.position.y = 0.0095;
    backMesh.castShadow = true;
    backMesh.receiveShadow = true;

    // Mép cắt giấy 3D (Physical 3D Fore-Edge Paper Rim - Trắng ngà tự nhiên)
    const activeRimGeom = createRimGeometry();
    const activeRimMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    const activeRimMesh = new THREE.Mesh(activeRimGeom, activeRimMat);
    activeRimMesh.rotation.x = -Math.PI / 2;
    activeRimMesh.position.y = 0.0095;
    activeRimMesh.castShadow = true;
    activeRimMesh.receiveShadow = true;

    const sheetGroup = new THREE.Group();
    sheetGroup.add(frontMesh);
    sheetGroup.add(backMesh);
    sheetGroup.add(activeRimMesh);
    sheetGroup.visible = false;
    app.bookGroup.add(sheetGroup);

    app.activeSheet = sheetGroup;
    app.activeFrontMesh = frontMesh;
    app.activeBackMesh = backMesh;
    app.activeRimMesh = activeRimMesh;

    applyTime(app.time);
    app.dirty = true;
  }

  // THUẬT TOÁN UỐN CONG CUNG TRÒN BẢO TOÀN CHIỀU DÀI & VẶN CHÉO GÓC GIẤY ĐIỆN ẢNH (DIAGONAL CORNER PEEL & TWIST)
  // ĐỒNG THỜI ĐỒNG BỘ MẶT TRƯỚC (RECTO), MẶT SAU (VERSO) VÀ MÉP CẮT GIẤY 3D FORE-EDGE VỚI ĐỘ DÀY THẬT
  function deformSheet(frontMesh, backMesh, rimMesh, progress, curlIntensity = 1.0) {
    if (!frontMesh || !backMesh) return;
    const q = clamp(progress, 0, 1);
    const geomF = frontMesh.geometry;
    const geomB = backMesh.geometry;
    const geomR = rimMesh ? rimMesh.geometry : null;
    const posF = geomF.attributes.position;
    const posB = geomB.attributes.position;
    const posR = geomR ? geomR.attributes.position : null;

    const style = MOTION_STYLES[app.motionStyle] || MOTION_STYLES.deep_curl;
    const effCurl = curlIntensity * (style.curlFactor || 1.0);

    const W = app.bookWidth - 0.01;
    const cols = SUBDIV_X;
    const rows = SUBDIV_Y;
    const ds = W / cols;

    const env_eff = Math.sin(Math.PI * q);
    const spineAngle = Math.PI * q;
    const paperThick = 0.0014; // Độ dày thực tế của trang giấy sách mỹ thuật (1.4mm)
    const halfThick = paperThick * 0.5;

    // 1. Precompute các thông số chung theo trục X (u)
    const commonPhi = new Float32Array(cols + 1);
    const restZArr = new Float32Array(cols + 1);
    const uCornerArr = new Float32Array(cols + 1);
    const takeOffArr = new Float32Array(cols + 1);
    const landArr = new Float32Array(cols + 1);
    const takeOff = smooth7(clamp((0.10 - q) / 0.10, 0, 1));
    // Hạ cánh giảm xóc với Perlin Smootherstep (book-slipstream-multi-sheet-physics)
    const landRaw = clamp((q - 0.86) / 0.14, 0, 1);
    const land = smootherstep(landRaw);
    const cushionWeight = (q > 0.65) ? Math.sin(Math.PI * clamp((q - 0.65) / 0.35, 0, 1)) : 0;
    const airCushionFloat = (q > 0.74 && q < 0.98)
      ? Math.sin(Math.PI * clamp((q - 0.74) / 0.24, 0, 1)) * 0.0030 * effCurl
      : 0;
    const inflectWeight = Math.sin(Math.PI * clamp((q - 0.28) / 0.52, 0, 1));

    for (let ix = 0; ix <= cols; ix++) {
      const u = ix / cols;
      const restZ0 = restingZ(u);
      restZArr[ix] = restZ0;
      uCornerArr[ix] = Math.pow(u, 1.6);
      takeOffArr[ix] = takeOff;
      landArr[ix] = land;

      const restSlope0 = (restingZ(Math.min(1, u + 0.02)) - restZ0) / (0.02 * W);
      const restAngle0 = Math.atan(restSlope0);
      const restAngle1 = Math.PI - restAngle0;

      const baseAngle = (1 - env_eff) * ((1 - q) * restAngle0 + q * restAngle1) + env_eff * spineAngle;
      const arch = Math.sin(Math.PI * Math.pow(u, 0.80)) * 0.92 * effCurl * env_eff;
      const roll = Math.sin(Math.PI * 0.5 * u) * (1.0 - q) * 0.42 * effCurl * env_eff;
      const cushion = cushionWeight * Math.pow(u, 1.5) * 0.20 * effCurl;
      const sInflect = -Math.sin(2.0 * Math.PI * u) * 0.09 * inflectWeight * effCurl;

      commonPhi[ix] = baseAngle + arch + roll + cushion + sInflect;
    }

    // 2. Tinh chỉnh hiệu ứng lật góc chéo (Diagonal Corner Peel & Twist - Panel 2 Blueprint)
    // Trong khoảng q ∈ [0.005, 0.38], góc dưới bên phải (fore-edge bottom) nhấc lên trước với góc xoắn vặn
    const peelScale = (style.peelFactor !== undefined) ? style.peelFactor : 1.0;
    const peelEnvelope = (q > 0.005 && q < 0.38)
      ? Math.sin(Math.PI * clamp((q - 0.005) / 0.375, 0, 1)) * peelScale
      : 0;

    // Tích phân từng hàng (Row-by-Row Inextensible Arc-Length Integration)
    for (let iy = 0; iy <= rows; iy++) {
      const rowFrac = iy / rows; // 0 tại mép trên (iy=0), 1 tại mép dưới (iy=rows)
      const rowCornerFactor = peelEnvelope * Math.pow(rowFrac, 1.35) * 0.26 * effCurl;

      let prevX = 0, prevZ = 0;
      for (let ix = 0; ix <= cols; ix++) {
        const idx = iy * (cols + 1) + ix;
        const u = ix / cols;
        const y0 = posF.getY(idx);

        let mx, mz, nx, nz;
        if (ix === 0) {
          mx = 0;
          mz = q * 0.003;
          nx = -Math.sin(spineAngle);
          nz = Math.cos(spineAngle);
          prevX = 0;
          prevZ = 0;
        } else {
          const phi = commonPhi[ix] + rowCornerFactor * uCornerArr[ix];
          const c = Math.cos(phi);
          const s = Math.sin(phi);

          const newX = prevX + ds * c;
          const newZ = Math.max(0, prevZ + ds * s);
          prevX = newX;
          prevZ = newZ;

          const toFac = takeOffArr[ix];
          const finalX0 = (1 - toFac) * newX + toFac * (u * W);
          const finalZ0 = (1 - toFac) * newZ + toFac * restZArr[ix];

          const ldFac = landArr[ix];
          mx = (1 - ldFac) * finalX0 + ldFac * (-u * W);
          mz = ((1 - ldFac) * finalZ0 + ldFac * restZArr[ix]) + q * 0.002 + airCushionFloat * Math.pow(u, 1.6);

          nx = -s;
          nz = c;
        }

        posF.setXYZ(idx, mx + halfThick * nx, y0, mz + halfThick * nz);
        posB.setXYZ(idx, mx - halfThick * nx, y0, mz - halfThick * nz);
      }
    }

    if (posR) {
      const numPts = boundaryIndices.length;
      for (let k = 0; k < numPts; k++) {
        const { ix, iy } = boundaryIndices[k];
        const idx = iy * (cols + 1) + ix;
        posR.setXYZ(k * 2, posF.getX(idx), posF.getY(idx), posF.getZ(idx));
        posR.setXYZ(k * 2 + 1, posB.getX(idx), posB.getY(idx), posB.getZ(idx));
      }
      posR.needsUpdate = true;
      geomR.computeVertexNormals();
    }

    posF.needsUpdate = true;
    posB.needsUpdate = true;
    geomF.computeVertexNormals();
    geomB.computeVertexNormals();
  }

  // UỐN CONG BÌA ĐỘNG TỰ NHIÊN KHI MỞ VÀ GẤP LẠI (FLEXIBLE COVER CURVATURE WITH 3D HARDCOVER RIM)
  function updateCoverDeformation(factor, isClosing = false, flipQ = 0) {
    if (!app.coverFrontMesh || !app.coverBackMesh) return;
    const geomF = app.coverFrontMesh.geometry;
    const geomB = app.coverBackMesh.geometry;
    const geomR = app.coverRimMesh ? app.coverRimMesh.geometry : null;
    const posF = geomF.attributes.position;
    const posB = geomB.attributes.position;
    const posR = geomR ? geomR.attributes.position : null;
    const cols = SUBDIV_X, rows = SUBDIV_Y;
    const flex = Math.sin(Math.PI * factor);
    const coverThick = 0.0022; // Độ dày bìa cứng carton 2.2mm
    const halfThick = coverThick * 0.5;
    const W = app.bookWidth - 0.01;

    // Đệm khí tiếp đất nhẹ nhàng: khi tờ giấy hạ cánh (flipQ > 0.70), cánh bìa/tệp trái lún vi mô 1.2mm
    const cushionDepression = (flipQ > 0.70 && flipQ < 0.98)
      ? Math.sin(Math.PI * clamp((flipQ - 0.70) / 0.28, 0, 1)) * 0.0012
      : 0;

    const midZ = new Float32Array(cols + 1);
    const normX = new Float32Array(cols + 1);
    const normZ = new Float32Array(cols + 1);

    const style = MOTION_STYLES[app.motionStyle] || MOTION_STYLES.deep_curl;
    const coverScale = (style.coverCurlFactor !== undefined) ? style.coverCurlFactor : 1.0;

    for (let ix = 0; ix <= cols; ix++) {
      const u = ix / cols;
      let zVal;
      if (!isClosing) {
        // Độ uốn cong bìa mở mềm mại theo phong cách được chọn
        const openCurl = flex * (0.075 * Math.sin(Math.PI * Math.pow(u, 0.75)) + 0.095 * Math.pow(u, 1.5)) * coverScale;
        zVal = -factor * restingZ(u) - openCurl - cushionDepression * Math.pow(u, 1.5);
      } else {
        const closeCurl = flex * (0.055 * Math.sin(Math.PI * Math.pow(u, 0.75)) + 0.075 * Math.pow(u, 1.5)) * coverScale;
        zVal = -(1 - factor) * restingZ(u) + closeCurl;
      }
      midZ[ix] = zVal;

      const uNext = Math.min(1, u + 0.015);
      let zNext;
      if (!isClosing) {
        const openCurlNext = flex * (0.075 * Math.sin(Math.PI * Math.pow(uNext, 0.75)) + 0.095 * Math.pow(uNext, 1.5)) * coverScale;
        zNext = -factor * restingZ(uNext) - openCurlNext - cushionDepression * Math.pow(uNext, 1.5);
      } else {
        const closeCurlNext = flex * (0.055 * Math.sin(Math.PI * Math.pow(uNext, 0.75)) + 0.075 * Math.pow(uNext, 1.5)) * coverScale;
        zNext = -(1 - factor) * restingZ(uNext) + closeCurlNext;
      }
      const slope = (zNext - zVal) / (0.015 * W);
      const angle = Math.atan(slope);
      normX[ix] = -Math.sin(angle);
      normZ[ix] = Math.cos(angle);
    }

    const ds = W / cols;
    const midX = new Float32Array(cols + 1);
    let prevX = 0;
    for (let ix = 0; ix <= cols; ix++) {
      if (ix === 0) {
        midX[0] = 0;
      } else {
        const c = normZ[ix];
        prevX += ds * c;
        midX[ix] = prevX;
      }
    }

    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const idx = iy * (cols + 1) + ix;
        const y0 = posF.getY(idx);
        const mz = midZ[ix];
        const nx = normX[ix];
        const nz = normZ[ix];
        const mx = midX[ix];

        posF.setXYZ(idx, mx + halfThick * nx, y0, mz + halfThick * nz);
        posB.setXYZ(idx, mx - halfThick * nx, y0, mz - halfThick * nz);
      }
    }

    if (posR) {
      const numPts = boundaryIndices.length;
      for (let k = 0; k < numPts; k++) {
        const { ix, iy } = boundaryIndices[k];
        const idx = iy * (cols + 1) + ix;
        posR.setXYZ(k * 2, posF.getX(idx), posF.getY(idx), posF.getZ(idx));
        posR.setXYZ(k * 2 + 1, posB.getX(idx), posB.getY(idx), posB.getZ(idx));
      }
      posR.needsUpdate = true;
      geomR.computeVertexNormals();
    }

    posF.needsUpdate = true;
    posB.needsUpdate = true;
    geomF.computeVertexNormals();
    geomB.computeVertexNormals();
  }

  // QUẠT TỆP GIẤY ĐA TẦNG & LỰC HÚT KHÍ ĐỘNG HỌC (MULTI-LEAF MICRO-FANNING & SLIPSTREAM DYNAMICS)
  function updateRightPageDeformation(factor, flipQ = 0) {
    if (!app.rightPageMesh) return;
    const geom0 = app.rightPageMesh.geometry;
    const pos0 = geom0.attributes.position;
    const geom1 = app.subLeaf1 ? app.subLeaf1.geometry : null;
    const pos1 = geom1 ? geom1.attributes.position : null;
    const geom2 = app.subLeaf2 ? app.subLeaf2.geometry : null;
    const pos2 = geom2 ? geom2.attributes.position : null;
    const cols = SUBDIV_X, rows = SUBDIV_Y;
    const style = MOTION_STYLES[app.motionStyle] || MOTION_STYLES.deep_curl;
    const fanScale = (style.fanningFactor !== undefined) ? style.fanningFactor : 1.0;

    // Lực hút khí động học kéo phân tầng các lớp trang giấy khi tờ trên cất cánh (book-slipstream-multi-sheet-physics)
    // z_slipstream(u, q) = sin(pi * clamp((q - 0.05) / 0.45, 0, 1)) * A_lift * u^1.8
    const suction0 = (flipQ > 0.04 && flipQ < 0.48)
      ? Math.sin(Math.PI * clamp((flipQ - 0.04) / 0.44, 0, 1)) * fanScale
      : 0;
    const suction1 = (flipQ > 0.07 && flipQ < 0.48)
      ? Math.sin(Math.PI * clamp((flipQ - 0.07) / 0.41, 0, 1)) * fanScale
      : 0;
    const suction2 = (flipQ > 0.10 && flipQ < 0.48)
      ? Math.sin(Math.PI * clamp((flipQ - 0.10) / 0.38, 0, 1)) * fanScale
      : 0;

    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const idx = iy * (cols + 1) + ix;
        const u = ix / cols;
        const baseZ = factor * restingZ(u);
        const uShape = Math.pow(u, 1.8);

        // Lá trên cùng (Trang kế tiếp: nhấc ~1.7mm)
        pos0.setZ(idx, baseZ + suction0 * 0.0034 * uShape);

        // Tầng phụ 1 (Sub-leaf 1: nhấc ~1.1mm)
        if (pos1) {
          pos1.setZ(idx, baseZ + suction1 * 0.0022 * uShape);
        }

        // Tầng phụ 2 (Sub-leaf 2: nhấc ~0.6mm)
        if (pos2) {
          pos2.setZ(idx, baseZ + suction2 * 0.0012 * uShape);
        }
      }
    }

    pos0.needsUpdate = true;
    geom0.computeVertexNormals();

    if (pos1) {
      pos1.needsUpdate = true;
      geom1.computeVertexNormals();
    }
    if (pos2) {
      pos2.needsUpdate = true;
      geom2.computeVertexNormals();
    }
  }

  // ĐỊNH VỊ CAMERA CHUẨN ĐIỆN ẢNH (CINEMATIC MICRO-DRIFT & DOLLY ZOOM)
  function updateCameraFraming(aspectRatio, coverOpenFactor = 1.0, time = 0) {
    const aspect = aspectRatio || app.camera3D.aspect || (16 / 9);
    const W = app.bookWidth;
    const dur = app.duration || 10;
    const sigma = dur / 10;
    const t = clamp(time, 0, dur);

    // 1. Cinematic Dolly Zoom (Nhẹ nhàng tịnh tiến lại gần 3.5% khi mở sách và lùi lại khi đóng)
    const openProg = smooth7(clamp((t - 0.8 * sigma) / (1.4 * sigma), 0, 1));
    const closeProg = smooth7(clamp((t - 8.4 * sigma) / (1.4 * sigma), 0, 1));
    const activeOpen = openProg * (1 - closeProg);
    const dollyFactor = 1.0 - 0.035 * activeOpen;

    // 2. Cinematic Micro-Drift (Chuyển động lia máy micro tinh tế, mượt mà chuẩn Hollywood)
    const driftPhase = clamp((t - 2.2 * sigma) / (6.2 * sigma), 0, 1);
    const driftWeight = activeOpen;
    const microDriftX = Math.sin(driftPhase * Math.PI) * 0.032 * driftWeight;
    const microDriftZ = (1 - Math.cos(driftPhase * Math.PI)) * 0.018 * driftWeight;

    // 3. Page Flip Dynamic Reaction (Phản ứng nâng nhẹ máy theo nhịp tờ giấy cất cánh)
    const flipPhase = clamp((t - 4.2 * sigma) / (1.4 * sigma), 0, 1);
    const flipReaction = Math.sin(Math.PI * flipPhase) * 0.014;

    // Khóa ổn định Tripod tuyệt đối cho Reader View (chữ đứng yên 100%, không bị lắc hay trôi khi đọc)
    const isReader = (app.camera === 'reader');
    const effDolly = isReader ? 1.0 : dollyFactor;
    const effMicroDriftX = isReader ? 0 : microDriftX;
    const effMicroDriftZ = isReader ? 0 : microDriftZ;
    const effFlipReaction = isReader ? 0 : flipReaction;

    const targetX = (W / 2) * (1 - coverOpenFactor) + effMicroDriftX * 0.35;
    const targetY = 0;
    const targetZ = 0.02 + effMicroDriftZ * 0.35;

    let dist, camX, camY, camZ;

    if (aspect >= 1.5) {
      // 16:9 Landscape
      dist = 3.65 * effDolly;
      if (app.camera === 'reader') {
        camX = targetX;
        camY = 2.65;
        camZ = 1.95;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + effMicroDriftX * 0.5;
        camY = dist * Math.sin(angleRad) + effFlipReaction;
        camZ = dist * Math.cos(angleRad) + 0.02 + effMicroDriftZ;
      } else {
        // Product 45°
        camX = targetX + 0.52 * effDolly + effMicroDriftX;
        camY = 2.25 * effDolly + effFlipReaction;
        camZ = 2.45 * effDolly + effMicroDriftZ;
      }
    } else if (aspect >= 1.2) {
      // 4:3 Standard
      dist = 4.10 * effDolly;
      if (app.camera === 'reader') {
        camX = targetX;
        camY = 3.10;
        camZ = 2.30;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + effMicroDriftX * 0.5;
        camY = dist * Math.sin(angleRad) + effFlipReaction;
        camZ = dist * Math.cos(angleRad) + 0.02 + effMicroDriftZ;
      } else {
        camX = targetX + 0.58 * effDolly + effMicroDriftX;
        camY = 2.55 * effDolly + effFlipReaction;
        camZ = 2.85 * effDolly + effMicroDriftZ;
      }
    } else if (aspect >= 0.9) {
      // 1:1 Square
      dist = 4.60 * effDolly;
      if (app.camera === 'reader') {
        camX = targetX;
        camY = 3.50;
        camZ = 2.60;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + effMicroDriftX * 0.5;
        camY = dist * Math.sin(angleRad) + effFlipReaction;
        camZ = dist * Math.cos(angleRad) + 0.02 + effMicroDriftZ;
      } else {
        camX = targetX + 0.62 * effDolly + effMicroDriftX;
        camY = 2.95 * effDolly + effFlipReaction;
        camZ = 3.25 * effDolly + effMicroDriftZ;
      }
    } else {
      // 9:16 Vertical (Khung hình dọc TikTok / Reels / Shorts - Căn giữa tuyệt đối không chạm viền)
      dist = 8.60 * effDolly;
      if (app.camera === 'reader') {
        camX = targetX;
        camY = 6.40;
        camZ = 5.90;
      } else if (app.camera === 'top') {
        const angleRad = (86.0 * Math.PI) / 180;
        camX = targetX + effMicroDriftX * 0.5;
        camY = dist * Math.sin(angleRad) + effFlipReaction;
        camZ = dist * Math.cos(angleRad) + 0.02 + effMicroDriftZ;
      } else {
        // Product 45°
        camX = targetX + 0.95 * effDolly + effMicroDriftX;
        camY = 5.35 * effDolly + effFlipReaction;
        camZ = 5.85 * effDolly + effMicroDriftZ;
      }
    }

    app.camera3D.position.set(camX, camY, camZ);
    app.controls.target.set(targetX, targetY, targetZ);
    app.controls.update();

    $('#cameraName').textContent = { product: 'Product 45°', reader: 'Reader View', top: 'Top View (Từ trên xuống)' }[app.camera] || 'Top View (Từ trên xuống)';
  }

  // TIMELINE CO GIÃN ĐA THỜI LƯỢNG (5s / 10s / 15s)
  function applyTime(time, customAspect = null) {
    if (!app.bookGroup) return;
    const dur = app.duration || 10;
    const sigma = dur / 10;
    const t = clamp(time, 0, dur);
    const W = app.bookWidth;

    // 1. Mở bìa trước (0.8s -> 2.2s scaled) & Đóng bìa (8.4s -> 9.8s scaled) với Smoothstep bậc 7 (Triệt tiêu 0 Jerk)
    const openStart = 0.8 * sigma;
    const openDur = 1.4 * sigma;
    const rawOpen = clamp((t - openStart) / openDur, 0, 1);
    const openProg = smooth7(rawOpen);

    const closeStart = 8.4 * sigma;
    const closeDur = 1.4 * sigma;
    const rawClose = clamp((t - closeStart) / closeDur, 0, 1);
    const closeProg = smooth7(rawClose);

    const coverFactor = clamp(openProg * (1 - closeProg), 0, 1);

    // Cover rotation quanh trục Z từ 0 -> +PI
    const coverAngle = Math.PI * coverFactor;
    if (app.cover) {
      app.cover.rotation.z = coverAngle;
      app.cover.visible = true; // Luôn luôn hiển thị liên tục, KHÔNG BAO GIỜ bị ẩn/hiện giật lag
    }

    // 2. Lật trang (4.2s -> 5.6s scaled) với Smoothstep bậc 7 (Triệt tiêu 0 Jerk)
    const flipStart = 4.2 * sigma;
    const flipDuration = 1.4 * sigma;
    const isFlipping = t >= flipStart && t <= flipStart + flipDuration;
    const rawQ = clamp((t - flipStart) / flipDuration, 0, 1);
    const q = smooth7(rawQ);
    const activeQ = isFlipping ? q : 0;

    // Spine flex kinematics: Gáy sách nở và uốn ra phía sau khi mở sách kết hợp vi uốn khi lật
    if (app.spine) {
      const thick = app.bookThick;
      const flipSpineFlex = isFlipping ? Math.sin(Math.PI * q) * 0.002 : 0;
      app.spine.position.y = -thick * 0.20 - 0.014 * coverFactor - flipSpineFlex;
      app.spine.scale.x = 1.0 + 0.08 * coverFactor;
      app.spine.scale.z = 1.0 + 0.05 * coverFactor;
    }

    // Uốn cong bìa và trang sách mềm mại theo độ mở kết hợp lực hút khí động học và đệm khí tiếp đất
    if (t < closeStart) {
      updateCoverDeformation(openProg, false, activeQ);
    } else {
      updateCoverDeformation(closeProg, true, 0);
    }
    updateRightPageDeformation(coverFactor, activeQ);

    if (app.rightPageMesh) {
      app.rightPageMesh.visible = true;
    }
    if (app.subLeaf1) {
      app.subLeaf1.visible = coverFactor > 0.01;
    }
    if (app.subLeaf2) {
      app.subLeaf2.visible = coverFactor > 0.01;
    }

    // Dynamic Stack Breathing & Mass Transfer (Chuyển khối lượng tệp giấy vật lý & thở theo nhịp lật)
    if (app.rightStack && app.leftStack) {
      const thick = app.bookThick || 0.08;
      const qFlip = (t >= (flipStart + flipDuration) && t < closeStart) ? 1.0 : (isFlipping ? q : 0.0);
      const rightScaleY = 1.0 - 0.05 * qFlip;
      const leftScaleY = (0.22 + 0.05 * qFlip) * coverFactor;
      const breathing = isFlipping ? Math.sin(Math.PI * q) * 0.015 : 0;

      app.rightStack.scale.y = rightScaleY + breathing;
      app.rightStack.position.y = -thick * 0.22 * app.rightStack.scale.y;

      app.leftStack.visible = coverFactor > 0.02;
      app.leftStack.scale.y = Math.max(0.01, leftScaleY);
      app.leftStack.position.y = -thick * 0.22 * app.leftStack.scale.y;
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
    } else if (t < closeStart) {
      // Giai đoạn lật trang VÀ đọc Spread 2
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

      // Giữ activeSheet hiển thị liên tục, mượt mà từ flipStart đến hết closeStart
      if (app.activeSheet) {
        app.activeSheet.visible = true;
        app.activeFrontMesh.visible = true;
        app.activeBackMesh.visible = true;
        if (app.activeRimMesh) app.activeRimMesh.visible = true;
        deformSheet(app.activeFrontMesh, app.activeBackMesh, app.activeRimMesh, q, app.curlAmount);
      }
    } else {
      // t >= closeStart: Giai đoạn đóng bìa lại
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

    // 3. Cinematic Camera Framing (Cinematic Micro-Drift & Dolly Zoom)
    updateCameraFraming(customAspect, coverFactor, t);

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

  function updateExportLabels() {
    const isTransparent = app.scene === 'transparent';
    const isNavy = app.scene === 'navy';
    const r = app.ratio || '16:9';

    const sizes = {
      '16:9': { export: '1920 × 1080 (16:9 Ngang)', snap: '3840 × 2160' },
      '4:3':  { export: '1440 × 1080 (4:3 Chuẩn)', snap: '2880 × 2160' },
      '9:16': { export: '1080 × 1920 (9:16 Dọc TikTok)', snap: '2160 × 3840' },
      '1:1':  { export: '1080 × 1080 (1:1 Vuông Social)', snap: '2160 × 2160' }
    };
    const s = sizes[r] || sizes['16:9'];

    const formatEl = $('#exportFormat');
    const titleEl = $('#exportTitle');
    const btnTextEl = $('#exportBtnText');
    const snapBtnTextEl = $('#snapshotBtnText');

    const durStr = `${app.duration || 10}s`;
    if (isTransparent) {
      if (titleEl) titleEl.textContent = `XUẤT VIDEO ALPHA (${durStr.toUpperCase()})`;
      if (formatEl) formatEl.textContent = `${s.export} · ${durStr} · WebM Alpha (Trong Suốt)`;
      if (btnTextEl) btnTextEl.textContent = `Xuất video WebM Alpha ${durStr} (Tách Nền)`;
      if (snapBtnTextEl) snapBtnTextEl.textContent = `Chụp ảnh Mockup 4K Tách Nền (${s.snap})`;
    } else {
      if (titleEl) titleEl.textContent = `XUẤT VIDEO MP4 (${durStr.toUpperCase()})`;
      if (formatEl) formatEl.textContent = `${s.export} · ${durStr} · Chuẩn H.264`;
      if (btnTextEl) btnTextEl.textContent = `Xuất video MP4 1080p ${durStr} (H.264)`;
      if (snapBtnTextEl) snapBtnTextEl.textContent = `Chụp ảnh Mockup 4K Ultra HD (${s.snap})`;
    }
  }

  function setScene(scene) {
    app.scene = scene;
    const stage = $('#stage');
    const isNavy = scene === 'navy';
    const isTransparent = scene === 'transparent';

    if (stage) {
      stage.classList.toggle('scene-navy', isNavy);
      stage.classList.toggle('scene-transparent', isTransparent);
    }

    const sceneNameMap = {
      white: 'Studio trắng',
      navy: 'Premium Navy',
      transparent: 'Trong suốt (Alpha)'
    };
    $('#sceneName').textContent = sceneNameMap[scene] || 'Studio trắng';

    if (app.scene3D) {
      if (isTransparent) {
        // Tắt sương mù để nền trong suốt tuyệt đối không bị phủ màu
        app.scene3D.fog.near = 99999;
        app.scene3D.fog.far = 100000;
        if (app.floor) app.floor.visible = false;
        if (app.contactShadow) {
          app.contactShadow.visible = true;
          app.contactShadow.material.opacity = 0.38; // Giữ bóng tiếp xúc đáy mềm mại
        }
        if (app.renderer) {
          app.renderer.setClearColor(0x000000, 0);
        }
      } else {
        // Phục hồi sàn và sương mù studio
        app.scene3D.fog.near = 14;
        app.scene3D.fog.far = 32;
        app.scene3D.fog.color.set(isNavy ? 0x0f172a : 0xe5e2d9);
        if (app.floor) {
          app.floor.visible = true;
          app.floor.material.color.set(isNavy ? 0x0f172a : 0xeeece4);
        }
        if (app.contactShadow) {
          app.contactShadow.visible = true;
          app.contactShadow.material.opacity = 1.0;
        }
        if (app.renderer) {
          app.renderer.setClearColor(0x000000, 0);
        }
      }
      app.dirty = true;
    }

    $$('[data-scene]').forEach(b => b.classList.toggle('active', b.dataset.scene === scene));
    updateExportLabels();
  }

  function setCamera(camera) {
    app.camera = camera;
    $$('[data-camera]').forEach(b => b.classList.toggle('active', b.dataset.camera === camera));
    applyTime(app.time);
  }

  function setMotionStyle(styleKey) {
    if (!MOTION_STYLES[styleKey]) return;
    app.motionStyle = styleKey;
    const style = MOTION_STYLES[styleKey];

    $$('[data-style]').forEach(b => {
      b.classList.toggle('active', b.dataset.style === styleKey);
    });

    if (styleKey === 'reader_focus') {
      setCamera('reader');
    }

    applyTime(app.time);
    app.dirty = true;
    toast(`Đã chọn: ${style.name}`);
  }

  function setRatio(r) {
    app.ratio = r;
    $$('[data-ratio]').forEach(b => b.classList.toggle('active', b.dataset.ratio === r));

    const stage = $('#stage');
    const ratioMap = {
      '16:9': '16 / 9',
      '4:3':  '4 / 3',
      '9:16': '9 / 16',
      '1:1':  '1 / 1'
    };
    if (stage) {
      stage.style.aspectRatio = ratioMap[r] || '16 / 9';
    }

    const badge = $('#aspectBadge');
    if (badge) {
      const badgeLabels = {
        '16:9': '16:9 NGANG',
        '4:3':  '4:3 CHUẨN',
        '9:16': '9:16 DỌC (TIKTOK)',
        '1:1':  '1:1 VUÔNG'
      };
      badge.textContent = badgeLabels[r] || r;
    }

    updateExportLabels();

    // Đồng bộ lại kích thước canvas và cự ly camera
    setTimeout(() => {
      resize();
    }, 40);
    app.dirty = true;
  }

  function setDuration(d) {
    app.duration = Number(d) || 10;
    $$('[data-duration]').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.duration) === app.duration);
    });

    const durEl = $('#duration');
    if (durEl) {
      durEl.textContent = `00:${String(app.duration).padStart(2, '0')}.0`;
    }

    const timelineEl = $('#timeline');
    if (timelineEl) {
      timelineEl.max = app.duration;
      if (app.time > app.duration) {
        app.time = 0;
      }
      timelineEl.value = app.time;
    }

    const recipeDurEl = document.querySelector('.recipe-duration');
    if (recipeDurEl) recipeDurEl.textContent = `${app.duration}s`;

    const recipeTag = document.querySelector('.recipe-tag');
    if (recipeTag) {
      recipeTag.innerHTML = `<i></i> VIDEO ${app.duration} GIÂY`;
    }

    const rulerSpans = $$('.timeline-ruler span');
    if (rulerSpans.length >= 2) {
      rulerSpans[1].textContent = `00:${String(app.duration).padStart(2, '0')}`;
    }

    updateExportLabels();
    applyTime(app.time);
    updateTimeline();
    toast(`Đã chọn thời lượng: ${app.duration} giây`);
  }

  function setWatermark(enabled, text) {
    app.watermarkEnabled = !!enabled;
    if (text !== undefined && text !== null && text.trim() !== '') {
      app.watermarkText = text.trim();
    }

    const toggle = $('#watermarkToggle');
    if (toggle) toggle.checked = app.watermarkEnabled;

    const input = $('#watermarkInput');
    if (input) {
      input.disabled = !app.watermarkEnabled;
      if (text !== undefined) input.value = app.watermarkText;
    }

    const stageWm = $('#stageWatermark');
    if (stageWm) {
      stageWm.style.display = app.watermarkEnabled ? 'flex' : 'none';
      const textEl = $('#stageWatermarkText');
      if (textEl) textEl.textContent = app.watermarkText;
    }
    app.dirty = true;
  }

  function drawWatermarkOnCanvas(ctx, w, h, scale = 1.0) {
    if (!app.watermarkEnabled) return;
    const text = app.watermarkText || 'QBiz Book Motion';
    ctx.save();
    const fontSize = Math.round(14 * scale);
    const padX = Math.round(10 * scale);
    const padY = Math.round(6 * scale);
    const margin = Math.round(20 * scale);
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const textMetrics = ctx.measureText(text);
    const iconSize = Math.round(15 * scale);
    const gap = Math.round(7 * scale);
    const boxW = padX * 2 + iconSize + gap + textMetrics.width;
    const boxH = fontSize + padY * 2;
    const x = w - boxW - margin;
    const y = h - boxH - margin;

    // Rounded background pill with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = Math.round(10 * scale);
    ctx.fillStyle = 'rgba(8, 18, 31, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(1, Math.round(scale));
    const r = Math.round(6 * scale);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, boxW, boxH, r);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Icon badge 'Q'
    const iconX = x + padX;
    const iconY = y + (boxH - iconSize) / 2;
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(iconX, iconY, iconSize, iconSize, Math.round(3 * scale));
    } else {
      ctx.rect(iconX, iconY, iconSize, iconSize);
    }
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(10 * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Q', iconX + iconSize / 2, iconY + iconSize / 2 + 0.5);

    // Text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, iconX + iconSize + gap, y + boxH / 2);

    ctx.restore();
  }

  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params || ![...params.keys()].length) return;

    if (params.has('ratio')) {
      const r = params.get('ratio');
      if (['16:9', '9:16', '1:1', '4:3'].includes(r)) setRatio(r);
    }

    if (params.has('scene')) {
      const s = params.get('scene');
      if (['white', 'navy', 'transparent'].includes(s)) setScene(s);
    }

    if (params.has('style')) {
      const st = params.get('style');
      if (MOTION_STYLES[st]) setMotionStyle(st);
    }

    if (params.has('camera')) {
      const cam = params.get('camera');
      if (['top', 'reader', 'product'].includes(cam)) setCamera(cam);
    }

    if (params.has('duration')) {
      const d = parseInt(params.get('duration'), 10);
      if ([5, 10, 15].includes(d)) setDuration(d);
    }

    if (params.has('spread')) {
      const sp = parseInt(params.get('spread'), 10);
      if (sp >= 0 && sp <= 3) setSpread(sp);
    }

    if (params.has('watermark') || params.has('wm')) {
      const wm = params.get('watermark') || params.get('wm');
      if (wm === '0' || wm === 'false' || wm === 'off') {
        setWatermark(false);
      } else {
        const text = (wm === '1' || wm === 'true' || wm === 'on') ? 'QBiz Book Motion' : wm;
        setWatermark(true, text);
      }
    }

    if (params.get('autostart') === '1' || params.get('autostart') === 'true') {
      setTimeout(() => {
        if ($('#playButton') && !app.playing) {
          $('#playButton').click();
        }
      }, 600);
    }
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

    // Sắp xếp tự nhiên theo số thứ tự tên file (page_1, page_2, page_10,...)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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
      if ($('#btnSnapshot4K')) $('#btnSnapshot4K').disabled = false;
      if ($('#btnBatchCombo')) $('#btnBatchCombo').disabled = false;

      const customStatus = $('#customFileStatus');
      if (customStatus) {
        customStatus.textContent = `Đang dùng: ${app.fileName} (${images.length} trang)`;
      }

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

  // BỘ CHỌN ĐOẠN TRANG LẬT (TẬN DỤNG TRỌN VẸN 11 TRANG TÀI LIỆU GỐC)
  function setSpread(idx) {
    if (!app.allPages || app.allPages.length < 3) return;
    app.selectedSpread = idx;
    const pages = app.allPages;

    $$('[data-spread]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.spread, 10) === idx);
    });

    const base = app.coverMode ? 1 : 0;
    const p1Idx = base + idx * 2;
    const p2Idx = base + idx * 2 + 1;
    const p3Idx = base + idx * 2 + 2;
    const p4Idx = base + idx * 2 + 3;

    const img1 = p1Idx < pages.length ? pages[p1Idx] : null;
    const img2 = p2Idx < pages.length ? pages[p2Idx] : null;
    const img3 = p3Idx < pages.length ? pages[p3Idx] : null;
    const img4 = p4Idx < pages.length ? pages[p4Idx] : null;

    // Giữ nguyên 100% màu sắc nguyên bản của sách, không qua bộ lọc
    const p1Tex = makeSinglePageTexture(img1, p1Idx + 1, `TRANG ${p1Idx + 1}`);
    const p2Tex = makeSinglePageTexture(img2, p2Idx + 1, `TRANG ${p2Idx + 1}`);
    const p3Tex = makeSinglePageTexture(img3, p3Idx + 1, `TRANG ${p3Idx + 1}`);
    const p4Tex = makeSinglePageTexture(img4, p4Idx + 1, `TRANG ${p4Idx + 1}`);

    for (let i = 1; i <= 4; i++) {
      if (app.pageTextures[i]) app.pageTextures[i].dispose();
    }

    app.pageTextures[1] = p1Tex;
    app.pageTextures[2] = p2Tex;
    app.pageTextures[3] = p3Tex;
    app.pageTextures[4] = p4Tex;

    if (app.activeSheet) {
      app.activeFrontMesh.material.map = p2Tex;
      app.activeFrontMesh.material.needsUpdate = true;
      app.activeBackMesh.material.map = p3Tex;
      app.activeBackMesh.material.needsUpdate = true;
    }
    if (app.coverBackMesh) {
      app.coverBackMesh.material.map = p1Tex;
      app.coverBackMesh.material.needsUpdate = true;
    }
    if (app.rightPageMesh) {
      app.rightPageMesh.material.map = p2Tex;
      app.rightPageMesh.material.needsUpdate = true;
    }

    applyTime(app.time);
    app.dirty = true;
    const labelStart = `Trang ${p1Idx + 1}–${p2Idx + 1}`;
    const labelEnd = p3Idx < pages.length ? `Trang ${p3Idx + 1}–${Math.min(pages.length, p4Idx + 1)}` : '';
    toast(`Đã chọn đoạn lật: ${labelStart} ➔ ${labelEnd}`);
  }

  // 1. CHỤP ẢNH MOCKUP 4K ĐA NĂNG (CAPTURE SNAPSHOT BLOB)
  async function captureSnapshotBlob(options = {}) {
    if (!app.renderer || !app.scene3D || !app.camera3D) {
      throw Error('Hệ thống 3D chưa sẵn sàng.');
    }
    if (!app.pages.length) {
      throw Error('Chưa có dữ liệu trang sách.');
    }

    const t = options.time !== undefined ? options.time : app.time;
    const r = options.ratio || app.ratio || '16:9';
    const cam = options.camera || app.camera;
    const sc = options.scene || app.scene;

    let w4k = 3840, h4k = 2160;
    if (r === '4:3') { w4k = 2880; h4k = 2160; }
    else if (r === '9:16') { w4k = 2160; h4k = 3840; }
    else if (r === '1:1') { w4k = 2160; h4k = 2160; }

    const stageEl = $('#stage');
    const origW = stageEl ? stageEl.clientWidth : 1280;
    const origH = stageEl ? stageEl.clientHeight : 720;
    const origAspect = app.camera3D.aspect;
    const origPixelRatio = app.renderer.getPixelRatio();
    const origTime = app.time;
    const origCamera = app.camera;
    const origScene = app.scene;

    try {
      if (sc && sc !== app.scene) setScene(sc);
      if (cam && cam !== app.camera) setCamera(cam);

      app.renderer.setPixelRatio(1);
      app.renderer.setSize(w4k, h4k, false);
      app.camera3D.aspect = w4k / h4k;
      app.camera3D.updateProjectionMatrix();
      applyTime(t, w4k / h4k);

      app.renderer.render(app.scene3D, app.camera3D);

      let exportCanvas = app.renderer.domElement;
      if (app.watermarkEnabled) {
        const snapWmCanvas = document.createElement('canvas');
        snapWmCanvas.width = w4k;
        snapWmCanvas.height = h4k;
        const snapWmCtx = snapWmCanvas.getContext('2d');
        snapWmCtx.drawImage(app.renderer.domElement, 0, 0);
        drawWatermarkOnCanvas(snapWmCtx, w4k, h4k, w4k / 1080);
        exportCanvas = snapWmCanvas;
      }

      const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
      const isAlpha = (sc === 'transparent');
      const snapPrefix = isAlpha ? 'QBiz-Mockup-4K-Alpha' : 'QBiz-Mockup-4K';
      const filename = options.filename || `${snapPrefix}-${r.replace(':', 'x')}-${app.motionStyle}-${t.toFixed(1).replace('.', 's')}.png`;

      return { blob, filename, width: w4k, height: h4k };
    } finally {
      if (cam && origCamera !== app.camera) setCamera(origCamera);
      if (sc && origScene !== app.scene) setScene(origScene);
      app.renderer.setPixelRatio(origPixelRatio);
      app.renderer.setSize(origW, origH, false);
      app.camera3D.aspect = origAspect;
      app.camera3D.updateProjectionMatrix();
      applyTime(origTime, origAspect);
      app.renderer.render(app.scene3D, app.camera3D);
    }
  }

  // CHỤP ẢNH MOCKUP 4K ULTRA HD (PNG ĐÚNG CHUẨN MÀU GỐC SÁCH)
  async function takeSnapshot4K() {
    if (!app.renderer || !app.scene3D || !app.camera3D) {
      toast('Vui lòng đợi 3D khởi tạo hoàn tất.');
      return;
    }
    if (!app.pages.length) {
      toast('Vui lòng nạp PDF hoặc ảnh trước khi chụp.');
      return;
    }

    const btn = $('#btnSnapshot4K');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>⚡</span> Đang kết xuất 4K…';
    btn.disabled = true;

    try {
      const { blob, filename, width, height } = await captureSnapshotBlob();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = filename;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        const isAlpha = app.scene === 'transparent';
        toast(`📸 Đã xuất ảnh Mockup 4K ${isAlpha ? 'Tách Nền' : 'Ultra HD'} (${width}×${height}) thành công!`);

        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            source: 'QBIZ_BOOK_MOTION',
            type: 'SNAPSHOT_COMPLETE',
            blobUrl: url,
            filename,
            width,
            height
          }, '*');
        }
      }
    } catch (err) {
      console.error('Snapshot 4K error:', err);
      toast(`Lỗi chụp 4K: ${err.message}`);
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
  window.takeSnapshot4K = takeSnapshot4K;

  // 2. KẾT XUẤT VIDEO CORE ENGINE (MP4 H.264 & WEBM ALPHA)
  async function renderVideoBlobCore(options = {}) {
    if (!app.pages.length) throw Error('Chưa có dữ liệu trang sách.');

    const r = options.ratio || app.ratio || '16:9';
    const sc = options.scene || app.scene;
    const duration = options.duration || app.duration || 10;
    const format = options.format || (sc === 'transparent' ? 'webm_alpha' : 'mp4');
    const onProgress = options.onProgress || (() => {});

    const [w, h] = r === '16:9' ? [1920, 1080] :
                   r === '4:3'  ? [1440, 1080] :
                   r === '9:16' ? [1080, 1920] :
                   r === '4:5'  ? [1080, 1350] : [1080, 1080];

    const fps = 30;
    const totalFrames = Math.round(duration * fps);
    const oldTime = app.time;
    const origRatio = app.ratio;
    const origScene = app.scene;

    const stageEl = $('#stage');
    const prevW = stageEl ? stageEl.clientWidth : 1280;
    const prevH = stageEl ? stageEl.clientHeight : 720;
    const origAspect = app.camera3D.aspect;

    try {
      if (sc && sc !== app.scene) setScene(sc);
      if (r && r !== app.ratio) setRatio(r);

      app.renderer.setSize(w, h, false);
      app.camera3D.aspect = w / h;
      app.camera3D.updateProjectionMatrix();

      const isTransparent = (sc === 'transparent') || (format === 'webm_alpha');
      const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof Mp4Muxer !== 'undefined';

      if (isTransparent || format === 'webm_alpha' || !hasWebCodecs) {
        onProgress(0, '<span>⚡</span> Đang chuẩn bị xuất video…');
        let mrWmCanvas = null;
        let mrWmCtx = null;
        if (app.watermarkEnabled) {
          mrWmCanvas = document.createElement('canvas');
          mrWmCanvas.width = w;
          mrWmCanvas.height = h;
          mrWmCtx = mrWmCanvas.getContext('2d');
        }
        const stream = (mrWmCanvas || app.renderer.domElement).captureStream(fps);

        let audioCtx = null;
        let audioSource = null;
        if (app.audioEnabled) {
          try {
            const aRes = await fetch('sound_master_10s.wav');
            if (aRes.ok) {
              const aBuf = await aRes.arrayBuffer();
              audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              const dest = audioCtx.createMediaStreamDestination();
              audioSource = audioCtx.createBufferSource();
              audioSource.buffer = await audioCtx.decodeAudioData(aBuf);
              if (duration !== 10) {
                audioSource.playbackRate.value = 10 / duration;
              }
              audioSource.connect(dest);
              const audioTrack = dest.stream.getAudioTracks()[0];
              if (audioTrack) stream.addTrack(audioTrack);
              audioSource.start(0);
            }
          } catch (ae) {
            console.warn('Audio capture note:', ae);
          }
        }

        const mime = isTransparent ?
          (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm') :
          (MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? 'video/mp4;codecs=h264' :
           MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm');

        const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16000000 });
        const chunks = [];
        mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        const stopPromise = new Promise(resolve => mr.onstop = resolve);
        mr.start(100);

        for (let f = 0; f < totalFrames; f++) {
          const t = f / fps;
          app.time = t;
          applyTime(t, w / h);
          app.renderer.render(app.scene3D, app.camera3D);

          if (mrWmCtx) {
            mrWmCtx.clearRect(0, 0, w, h);
            mrWmCtx.drawImage(app.renderer.domElement, 0, 0);
            drawWatermarkOnCanvas(mrWmCtx, w, h, w / 1080);
          }

          const pct = Math.round(((f + 1) / totalFrames) * 100);
          const typeLabel = isTransparent ? 'WebM Alpha' : 'MP4';
          onProgress(pct, `<span>⏳</span> Đang xuất ${typeLabel}: ${pct}%`);

          await new Promise(res => setTimeout(res, 1000 / fps));
        }

        onProgress(100, '<span>⚙</span> Đang hoàn tất đóng gói…');
        mr.stop();
        await stopPromise;
        if (audioSource) { try { audioSource.stop(); } catch(e){} }
        if (audioCtx) { try { await audioCtx.close(); } catch(e){} }

        const ext = isTransparent ? 'webm' : (mime.includes('mp4') ? 'mp4' : 'webm');
        const blob = new Blob(chunks, { type: mr.mimeType });
        const filename = `QBiz-Book-Motion-${isTransparent ? 'Alpha-' : ''}${r.replace(':', 'x')}.${ext}`;
        return { blob, filename, width: w, height: h };
      } else {
        // WebCodecs H.264 MP4 siêu nét 1080p
        onProgress(0, '<span>⚡</span> Đang nạp âm thanh & chuẩn bị WebCodecs…');

        let audioTrackConfig = null;
        let masterAudioBuffer = null;
        if (app.audioEnabled) {
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
              }
            }
          } catch (aErr) {
            console.warn('Audio master track loading warning:', aErr);
          }
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

        if (audioTrackConfig && masterAudioBuffer) {
          try {
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
            const totalAudioFrames = Math.min(left.length, Math.round(duration * masterAudioBuffer.sampleRate));
            for (let offset = 0; offset < totalAudioFrames; offset += chunkSize) {
              const frames = Math.min(chunkSize, totalAudioFrames - offset);
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
          } catch (aeErr) {
            console.warn('Audio encoding skipped:', aeErr);
          }
        }

        let encodeError = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: e => { console.error('VideoEncoder error:', e); encodeError = e; }
        });

        encoder.configure({
          codec: 'avc1.640028',
          width: w,
          height: h,
          bitrate: 16000000,
          framerate: fps
        });

        let videoWmCanvas = null;
        let videoWmCtx = null;
        if (app.watermarkEnabled) {
          videoWmCanvas = document.createElement('canvas');
          videoWmCanvas.width = w;
          videoWmCanvas.height = h;
          videoWmCtx = videoWmCanvas.getContext('2d');
        }

        for (let f = 0; f < totalFrames; f++) {
          if (encodeError) throw encodeError;

          const t = f / fps;
          app.time = t;
          applyTime(t, w / h);
          app.renderer.render(app.scene3D, app.camera3D);

          let frameCanvas = app.renderer.domElement;
          if (app.watermarkEnabled && videoWmCtx) {
            videoWmCtx.clearRect(0, 0, w, h);
            videoWmCtx.drawImage(app.renderer.domElement, 0, 0);
            drawWatermarkOnCanvas(videoWmCtx, w, h, w / 1080);
            frameCanvas = videoWmCanvas;
          }

          const timestampMicroseconds = Math.round(f * (1000000 / fps));
          const videoFrame = new VideoFrame(frameCanvas, { timestamp: timestampMicroseconds });
          encoder.encode(videoFrame, { keyFrame: f % 30 === 0 });
          videoFrame.close();

          while (encoder.encodeQueueSize > 5) {
            await new Promise(r => setTimeout(r, 10));
          }

          const pct = Math.round(((f + 1) / totalFrames) * 100);
          onProgress(pct, `<span>⏳</span> Đang xuất video MP4: ${pct}%`);

          if (f % 15 === 0) await new Promise(r => setTimeout(r, 0));
        }

        onProgress(100, '<span>⚙</span> Đang hoàn tất đóng gói file MP4…');
        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const filename = `QBiz-Book-Motion-${r.replace(':', 'x')}.mp4`;
        return { blob, filename, width: w, height: h };
      }
    } finally {
      if (origScene && origScene !== app.scene) setScene(origScene);
      if (origRatio && origRatio !== app.ratio) setRatio(origRatio);
      app.renderer.setSize(prevW, prevH, false);
      app.camera3D.aspect = origAspect;
      app.camera3D.updateProjectionMatrix();
      app.time = oldTime;
      applyTime(app.time);
      updateTimeline();
    }
  }

  // XUẤT VIDEO MP4/WEBM ĐƠN LẺ
  async function exportVideo() {
    if (!app.pages.length) {
      toast('Vui lòng thêm PDF hoặc ảnh trước khi xuất video.');
      return;
    }
    const button = $('#exportButton');
    button.disabled = true;
    const originalHTML = button.innerHTML;

    try {
      const isTransparent = (app.scene === 'transparent');
      const format = isTransparent ? 'webm_alpha' : 'mp4';
      const res = await renderVideoBlobCore({
        format,
        ratio: app.ratio,
        duration: app.duration,
        scene: app.scene,
        onProgress: (pct, html) => {
          button.innerHTML = html;
          updateTimeline();
        }
      });

      if (res && res.blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(res.blob);
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);

        const typeStr = isTransparent ? 'WebM Alpha tách nền' : 'MP4 1080p';
        toast(`✨ Xuất video ${typeStr} thành công! (${(res.blob.size / 1024 / 1024).toFixed(1)} MB, ${app.duration}s)`);

        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            source: 'QBIZ_BOOK_MOTION',
            type: 'EXPORT_COMPLETE',
            blobUrl: a.href,
            filename: res.filename,
            size: res.blob.size
          }, '*');
        }
      }
    } catch (e) {
      console.error(e);
      toast(`Xuất video thất bại: ${e.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
      updateTimeline();
    }
  }
  window.exportVideo = exportVideo;

  // 3. TRẠM XUẤT COMBO TỰ ĐỘNG (1-CLICK MULTI-ASSET BATCH EXPORTER)
  async function exportBatchCombo() {
    if (!app.pages.length) {
      toast('Vui lòng thêm PDF hoặc ảnh trước khi xuất combo.');
      return;
    }
    if (!window.JSZip) {
      toast('Thư viện nén ZIP chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }

    const btn = $('#btnBatchCombo');
    const origHtml = btn.innerHTML;
    btn.disabled = true;

    try {
      const zip = new JSZip();
      const folder = zip.folder('QBiz-Book-Mockup-Combo');

      // 1. Chụp 4K Bìa trước (t = 0.5s, Product 45°)
      btn.innerHTML = '<span>📸</span> [1/5] Chụp 4K Bìa trước…';
      const snap1 = await captureSnapshotBlob({
        time: 0.5,
        ratio: app.ratio,
        camera: 'product',
        scene: app.scene,
        filename: '01-Mockup-4K-Bia-Nghieng.png'
      });
      folder.file('01-Mockup-4K-Bia-Nghieng.png', snap1.blob);

      // 2. Chụp 4K Mở trang đôi (t = 3.5s, Reader View)
      btn.innerHTML = '<span>📸</span> [2/5] Chụp 4K Mở trang đôi…';
      const snap2 = await captureSnapshotBlob({
        time: 3.5,
        ratio: app.ratio,
        camera: 'reader',
        scene: app.scene,
        filename: '02-Mockup-4K-Mo-Trang-Doi.png'
      });
      folder.file('02-Mockup-4K-Mo-Trang-Doi.png', snap2.blob);

      // 3. Chụp 4K Lật trang uốn cong (t = 4.8s, Product 45°)
      btn.innerHTML = '<span>📸</span> [3/5] Chụp 4K Lật trang…';
      const snap3 = await captureSnapshotBlob({
        time: 4.8,
        ratio: app.ratio,
        camera: 'product',
        scene: app.scene,
        filename: '03-Mockup-4K-Lat-Trang-Uon-Cong.png'
      });
      folder.file('03-Mockup-4K-Lat-Trang-Uon-Cong.png', snap3.blob);

      // 4. Render Video Dọc 9:16 MP4 (H.264, 1080x1920)
      const comboDuration = Math.min(app.duration || 5, 3.5);
      btn.innerHTML = '<span>🎬</span> [4/5] Render Video 9:16 Dọc MP4…';
      const video1 = await renderVideoBlobCore({
        format: 'mp4',
        ratio: '9:16',
        duration: comboDuration,
        scene: 'white',
        onProgress: (pct) => {
          btn.innerHTML = `<span>🎬</span> [4/5] Video 9:16 MP4: ${pct}%`;
        }
      });
      folder.file('04-Mockup-Video-Doc-9x16.mp4', video1.blob);

      // 5. Render Video Tách Nền Trong Suốt Alpha WebM
      btn.innerHTML = '<span>✨</span> [5/5] Render Video Alpha Tách Nền…';
      const video2 = await renderVideoBlobCore({
        format: 'webm_alpha',
        ratio: app.ratio || '16:9',
        duration: comboDuration,
        scene: 'transparent',
        onProgress: (pct) => {
          btn.innerHTML = `<span>✨</span> [5/5] Video Alpha: ${pct}%`;
        }
      });
      folder.file('05-Mockup-Video-Tach-Nen-Alpha.webm', video2.blob);

      // 6. Đóng gói ZIP
      btn.innerHTML = '<span>📦</span> Đang nén file ZIP…';
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        btn.innerHTML = `<span>📦</span> Đang nén ZIP: ${Math.round(metadata.percent)}%`;
      });

      // 7. Download file ZIP
      const zipFilename = `QBiz-Book-Mockup-Combo-${app.ratio.replace(':', 'x')}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 10000);

      toast(`🎉 Đã xuất thành công Trọn Bộ Mockup Combo (${(zipBlob.size / 1024 / 1024).toFixed(1)} MB)!`);

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          source: 'QBIZ_BOOK_MOTION',
          type: 'BATCH_COMPLETE',
          blobUrl: url,
          filename: zipFilename,
          size: zipBlob.size
        }, '*');
      }
    } catch (err) {
      console.error('exportBatchCombo error:', err);
      toast(`Lỗi xuất combo: ${err.message}`);
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled = false;
      updateTimeline();
    }
  }
  window.exportBatchCombo = exportBatchCombo;

  // 4. BỘ NẠP SÁCH TÙY BIẾN CHO HỆ THỐNG NGOÀI (API POSTMESSAGE & STANDALONE)
  async function loadImagesFromUrls(urls, bookTitle = 'Custom Book') {
    if (!urls || !urls.length) return 0;
    toast(`Đang nạp ${urls.length} trang sách…`);
    const loadedCanvases = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise(resolve => {
        img.onload = () => resolve();
        img.onerror = () => {
          console.warn(`Lỗi nạp ảnh trang ${i + 1}: ${url}`);
          resolve();
        };
        img.src = url;
      });
      if (img.width && img.height) {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        loadedCanvases.push(c);
      }
    }

    if (loadedCanvases.length) {
      app.fileName = bookTitle;
      app.coverMode = $('#firstPageIsCover') ? $('#firstPageIsCover').checked : true;
      app.pages = loadedCanvases;
      app.time = 0;
      app.playing = false;
      updateTimeline();

      const first = loadedCanvases[0];
      app.bookWidth = clamp((first.width / first.height) * app.bookHeight, 0.9, 1.45);
      makeBook(loadedCanvases);

      if ($('#emptyState')) $('#emptyState').style.display = 'none';
      if ($('#documentInfo')) $('#documentInfo').hidden = false;
      if ($('#fileName')) $('#fileName').textContent = app.fileName;
      if ($('#fileMeta')) $('#fileMeta').textContent = `${loadedCanvases.length} trang (API PostMessage)`;
      if ($('#pageCount')) $('#pageCount').textContent = `${loadedCanvases.length} trang${app.coverMode ? ' · trang đầu là bìa' : ''}`;
      if ($('#stageHeading')) $('#stageHeading').textContent = app.fileName;
      if ($('#stageSub')) $('#stageSub').textContent = `${loadedCanvases.length} trang · 3D Book Flip sẵn sàng`;
      if ($('#exportButton')) $('#exportButton').disabled = false;
      if ($('#btnSnapshot4K')) $('#btnSnapshot4K').disabled = false;
      if ($('#btnBatchCombo')) $('#btnBatchCombo').disabled = false;

      const customStatus = $('#customFileStatus');
      if (customStatus) customStatus.textContent = `Đang dùng: ${app.fileName} (${loadedCanvases.length} trang)`;

      applyTime(0);
      toast(`Đã nạp ${loadedCanvases.length} trang sách thành công!`);
      return loadedCanvases.length;
    }
    return 0;
  }

  async function loadPdfFromData(dataOrUrl, title = 'Tài liệu PDF') {
    if (!window.pdfjsLib) throw Error('Chưa nạp được thư viện PDF.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    toast('Đang đọc tài liệu PDF…');
    let pdf = null;
    if (typeof dataOrUrl === 'string') {
      if (dataOrUrl.startsWith('data:')) {
        pdf = await pdfjsLib.getDocument({ url: dataOrUrl, isEvalSupported: false }).promise;
      } else {
        const res = await fetch(dataOrUrl);
        const ab = await res.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data: ab, isEvalSupported: false }).promise;
      }
    } else if (dataOrUrl instanceof ArrayBuffer) {
      pdf = await pdfjsLib.getDocument({ data: dataOrUrl, isEvalSupported: false }).promise;
    }
    if (!pdf) throw Error('Không thể phân tích dữ liệu PDF.');

    const images = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: Math.min(1.6, 1600 / page.getViewport({ scale: 1 }).width) });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      images.push(c);
    }

    app.fileName = title;
    app.coverMode = $('#firstPageIsCover') ? $('#firstPageIsCover').checked : true;
    app.pages = images;
    app.time = 0;
    app.playing = false;
    updateTimeline();

    const first = images[0];
    app.bookWidth = clamp((first.width / first.height) * app.bookHeight, 0.9, 1.45);
    makeBook(images);

    if ($('#emptyState')) $('#emptyState').style.display = 'none';
    if ($('#documentInfo')) $('#documentInfo').hidden = false;
    if ($('#fileName')) $('#fileName').textContent = app.fileName;
    if ($('#fileMeta')) $('#fileMeta').textContent = `PDF · ${pdf.numPages} trang`;
    if ($('#pageCount')) $('#pageCount').textContent = `${images.length} trang${app.coverMode ? ' · trang đầu là bìa' : ''}`;
    if ($('#stageHeading')) $('#stageHeading').textContent = app.fileName;
    if ($('#stageSub')) $('#stageSub').textContent = `${images.length} trang · 3D Book Flip sẵn sàng`;
    if ($('#exportButton')) $('#exportButton').disabled = false;
    if ($('#btnSnapshot4K')) $('#btnSnapshot4K').disabled = false;
    if ($('#btnBatchCombo')) $('#btnBatchCombo').disabled = false;

    const customStatus = $('#customFileStatus');
    if (customStatus) customStatus.textContent = `Đang dùng: ${app.fileName} (${images.length} trang)`;

    applyTime(0);
    toast(`Đã tải ${images.length} trang PDF thành công!`);
    return images.length;
  }

  async function loadDefaultBook() {
    try {
      toast('Đang nạp lại sách mẫu "Nguyên tắc Ăn uống.pdf"...');
      const res = await fetch('Nguyên tắc Ăn uống.pdf');
      if (!res.ok) throw Error('Không thể tải file PDF từ máy chủ.');
      const blob = await res.blob();
      const file = new File([blob], 'Nguyên tắc Ăn uống.pdf', { type: 'application/pdf' });
      await importFiles([file]);
      const customStatus = $('#customFileStatus');
      if (customStatus) customStatus.textContent = 'Đang dùng: Sách mẫu "Nguyên tắc Ăn uống.pdf" (11 trang)';
    } catch (err) {
      console.error('loadDefaultBook error:', err);
      toast(`Lỗi nạp sách mẫu: ${err.message}`);
    }
  }
  window.loadDefaultBook = loadDefaultBook;

  // 5. GIAO DIỆN CẦU NỐI POSTMESSAGE HAI CHIỀU (BIDIRECTIONAL API BRIDGE)
  function initPostMessageBridge() {
    window.addEventListener('message', async (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      const postReply = (replyObj) => {
        try {
          const target = event.source || window.parent;
          if (target && target.postMessage) {
            target.postMessage({ source: 'QBIZ_BOOK_MOTION', ...replyObj }, '*');
          }
        } catch (err) {
          console.warn('postMessage reply error:', err);
        }
      };

      switch (data.type) {
        case 'PING':
          postReply({ type: 'PONG', version: '20261010-phase3' });
          break;

        case 'GET_STATE':
          postReply({
            type: 'STATE',
            state: {
              ratio: app.ratio,
              scene: app.scene,
              camera: app.camera,
              style: app.motionStyle,
              duration: app.duration,
              time: app.time,
              watermark: { enabled: app.watermarkEnabled, text: app.watermarkText },
              pageCount: app.pages.length,
              fileName: app.fileName
            }
          });
          break;

        case 'SET_CONFIG':
          if (data.ratio) setRatio(data.ratio);
          if (data.scene) setScene(data.scene);
          if (data.camera) setCamera(data.camera);
          if (data.style) setMotionStyle(data.style);
          if (data.duration) setDuration(data.duration);
          if (data.spread !== undefined) setSpread(data.spread);
          if (data.watermark !== undefined) {
            if (typeof data.watermark === 'string') {
              setWatermark(true, data.watermark);
            } else if (typeof data.watermark === 'boolean') {
              setWatermark(data.watermark);
            }
          }
          if (data.audio !== undefined) {
            app.audioEnabled = !!data.audio;
            const aTog = $('#audioToggle');
            if (aTog) aTog.checked = app.audioEnabled;
            const icon = $('#audioIcon');
            if (icon) icon.textContent = app.audioEnabled ? '🔊' : '🔇';
          }
          postReply({
            type: 'CONFIG_CHANGED',
            config: {
              ratio: app.ratio,
              scene: app.scene,
              camera: app.camera,
              style: app.motionStyle,
              duration: app.duration,
              watermark: app.watermarkEnabled ? app.watermarkText : false
            }
          });
          break;

        case 'SEEK_TIME':
          if (typeof data.time === 'number') {
            app.time = clamp(data.time, 0, app.duration);
            applyTime(app.time);
            updateTimeline();
            postReply({ type: 'TIME_UPDATED', time: app.time });
          }
          break;

        case 'PLAY':
          audioPlayer.init();
          app.playing = true;
          app.playStart = performance.now() - app.time * 1000;
          updateTimeline();
          postReply({ type: 'PLAY_STARTED' });
          break;

        case 'PAUSE':
          app.playing = false;
          updateTimeline();
          postReply({ type: 'PLAY_PAUSED', time: app.time });
          break;

        case 'LOAD_PAGES':
          if (Array.isArray(data.pages)) {
            const count = await loadImagesFromUrls(data.pages, data.title || 'Sách nạp từ App');
            postReply({ type: 'PAGES_LOADED', count });
          }
          break;

        case 'LOAD_PDF':
          if (data.url || data.data) {
            const count = await loadPdfFromData(data.url || data.data, data.title || 'PDF từ App');
            postReply({ type: 'PAGES_LOADED', count });
          }
          break;

        case 'TAKE_SNAPSHOT_4K':
          try {
            const res = await captureSnapshotBlob({
              time: data.time !== undefined ? data.time : app.time,
              ratio: data.ratio || app.ratio,
              camera: data.camera || app.camera,
              scene: data.scene || app.scene
            });
            const blobUrl = URL.createObjectURL(res.blob);
            postReply({
              type: 'SNAPSHOT_COMPLETE',
              blobUrl,
              filename: res.filename,
              width: res.width,
              height: res.height,
              size: res.blob.size
            });
          } catch (err) {
            postReply({ type: 'ERROR', message: `Lỗi chụp ảnh 4K: ${err.message}` });
          }
          break;

        case 'EXPORT_VIDEO':
          try {
            const vid = await renderVideoBlobCore({
              format: data.format || (app.scene === 'transparent' ? 'webm_alpha' : 'mp4'),
              ratio: data.ratio || app.ratio,
              duration: data.duration || app.duration,
              scene: data.scene || app.scene,
              onProgress: (pct, msg) => {
                postReply({ type: 'EXPORT_PROGRESS', pct, message: msg });
              }
            });
            const blobUrl = URL.createObjectURL(vid.blob);
            postReply({
              type: 'EXPORT_COMPLETE',
              blobUrl,
              filename: vid.filename,
              size: vid.blob.size
            });
          } catch (err) {
            postReply({ type: 'ERROR', message: `Lỗi xuất video: ${err.message}` });
          }
          break;

        case 'EXPORT_BATCH_COMBO':
          try {
            await exportBatchCombo();
          } catch (err) {
            postReply({ type: 'ERROR', message: `Lỗi xuất combo: ${err.message}` });
          }
          break;
      }
    });

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          source: 'QBIZ_BOOK_MOTION',
          type: 'ENGINE_READY',
          version: '20261010-phase3'
        }, '*');
      }
    } catch(e) {}
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
      if ($('#btnSnapshot4K')) $('#btnSnapshot4K').disabled = true;
      if ($('#btnBatchCombo')) $('#btnBatchCombo').disabled = true;
      const customStatus = $('#customFileStatus');
      if (customStatus) customStatus.textContent = 'Chưa nạp tài liệu';
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
    const snapBtn = $('#btnSnapshot4K');
    if (snapBtn) snapBtn.onclick = takeSnapshot4K;
    const batchBtn = $('#btnBatchCombo');
    if (batchBtn) batchBtn.onclick = exportBatchCombo;

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

    $$('[data-ratio]').forEach(b => b.onclick = () => setRatio(b.dataset.ratio));
    $$('[data-scene]').forEach(b => b.onclick = () => setScene(b.dataset.scene));
    $$('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
    $$('[data-style]').forEach(b => b.onclick = () => setMotionStyle(b.dataset.style));

    const audioTog = $('#audioToggle');
    if (audioTog) {
      audioTog.onchange = e => {
        app.audioEnabled = e.target.checked;
        const icon = $('#audioIcon');
        if (icon) icon.textContent = app.audioEnabled ? '🔊' : '🔇';
        toast(app.audioEnabled ? 'Đã bật âm thanh lật giấy ASMR' : 'Đã tắt âm thanh (Video câm)');
      };
    }

    $$('[data-spread]').forEach(b => {
      b.onclick = () => setSpread(parseInt(b.dataset.spread, 10));
    });

    $$('[data-duration]').forEach(b => {
      b.onclick = () => setDuration(parseInt(b.dataset.duration, 10));
    });

    const wmTog = $('#watermarkToggle');
    if (wmTog) {
      wmTog.onchange = e => {
        setWatermark(e.target.checked);
        toast(e.target.checked ? 'Đã bật Watermark thương hiệu' : 'Đã tắt Watermark');
      };
    }
    const wmInput = $('#watermarkInput');
    if (wmInput) {
      wmInput.oninput = e => {
        setWatermark(app.watermarkEnabled, e.target.value);
      };
    }

    // Phase 3: Gắn sự kiện cho Khay Nạp Sách Riêng (Step 06)
    const customDrop = $('#customUploadDropzone');
    if (customDrop) {
      customDrop.addEventListener('dragover', e => { e.preventDefault(); customDrop.classList.add('dragging'); });
      customDrop.addEventListener('dragleave', () => customDrop.classList.remove('dragging'));
      customDrop.addEventListener('drop', e => {
        e.preventDefault();
        customDrop.classList.remove('dragging');
        filesInput(e.dataTransfer.files);
      });
    }
    const btnChoose = $('#btnChooseCustomFile');
    if (btnChoose) btnChoose.onclick = () => $('#customFileInput').click();
    const customFileInput = $('#customFileInput');
    if (customFileInput) customFileInput.onchange = e => filesInput(e.target.files);
    const btnReset = $('#btnResetDefaultBook');
    if (btnReset) btnReset.onclick = loadDefaultBook;

    // Phase 3: Kích hoạt Cầu nối postMessage hai chiều với hệ thống/app mockup ngoài
    initPostMessageBridge();

    setRatio('16:9');
    setScene('white');
    setCamera('product');
    setMotionStyle('deep_curl');
    setDuration(10);
    setWatermark(false);
    handleUrlParams();
    applyTime(0);

    // Tự động nạp sẵn sách mẫu chuẩn gốc 11 trang nếu chưa có file
    setTimeout(() => {
      if (!app.pages.length) {
        loadDefaultBook();
      }
    }, 400);
  }

  document.addEventListener('DOMContentLoaded', hook);
})();
