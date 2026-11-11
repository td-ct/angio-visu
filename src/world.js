import * as THREE from 'three';
import { FIELD_SIZE, FIELD_N, PLANE_SIZE, colormapNamed, logMap } from './dose.js';

export const ISO = new THREE.Vector3(0, 1.0, -0.35);
export const SID = 1.0;
export const TABLE_BASE = 0.8;

class PartialCurve extends THREE.Curve {
  constructor(base, maxU) {
    super();
    this.base = base;
    this.maxU = maxU;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const u = Math.max(0, Math.min(1, t)) * this.maxU;
    return this.base.getPointAt(u, target);
  }
}

export function sampleEllipsoid(center, radii, n) {
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    const dx = Math.cos(th) * rad;
    const dy = y;
    const dz = Math.sin(th) * rad;
    const px = center.x + radii.x * dx;
    const py = center.y + radii.y * dy;
    const pz = center.z + radii.z * dz;
    let nx = dx / radii.x;
    let ny = dy / radii.y;
    let nz = dz / radii.z;
    const il = 1 / Math.hypot(nx, ny, nz);
    nx *= il; ny *= il; nz *= il;
    pos[i * 3] = px + nx * 0.002;
    pos[i * 3 + 1] = py + ny * 0.002;
    pos[i * 3 + 2] = pz + nz * 0.002;
    nor[i * 3] = nx;
    nor[i * 3 + 1] = ny;
    nor[i * 3 + 2] = nz;
  }
  return { pos, nor };
}

export const AORTA_POINTS = [
  [0.07, 0.045, 0.55],
  [0.06, 0.06, 0.32],
  [0.045, 0.075, 0.08],
  [0.0, 0.095, -0.1],
  [-0.03, 0.13, -0.22],
  [-0.02, 0.165, -0.31],
  [0.03, 0.15, -0.38],
  [0.035, 0.135, -0.43]
];
export const OSTIUM = [0.035, 0.135, -0.43];
export const LM_POINTS = [OSTIUM, [0.07, 0.125, -0.49], [0.095, 0.105, -0.55]];
export const LAD_POINTS = [[0.095, 0.105, -0.55], [0.1, 0.085, -0.62], [0.095, 0.07, -0.7]];
export const LCX_POINTS = [[0.07, 0.125, -0.49], [0.02, 0.115, -0.55], [-0.03, 0.1, -0.6], [-0.06, 0.095, -0.66]];
export const RCA_POINTS = [OSTIUM, [-0.005, 0.125, -0.475], [-0.045, 0.11, -0.53], [-0.055, 0.095, -0.6], [-0.05, 0.085, -0.67]];

function toV3(list) {
  return list.map(p => new THREE.Vector3(p[0], p[1], p[2]));
}

const beamVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */`
  uniform vec3 uColor;
  uniform float uI;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(1.0, 0.55, abs(vUv.x * 2.0 - 1.0));
    float ends = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    float src = 1.0 - 0.45 * vUv.y;
    float a = uI * edge * ends * src;
    gl_FragColor = vec4(uColor, a);
  }
`;

function makeBeamPlane(width, intensity) {
  const geo = new THREE.PlaneGeometry(1, SID, 1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    uniforms: { uColor: { value: new THREE.Color(0xffd27a) }, uI: { value: intensity } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.x = width;
  m.renderOrder = 8;
  return m;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.Fog(0x0b1020, 6, 14);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x141c2e, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(3, 5, 2.5);
  scene.add(dir);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x111a2e, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(24, 48, 0x1e293b, 0x16213a);
  grid.position.y = 0.001;
  scene.add(grid);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 });
  const column = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.0, 0.24), standMat);
  column.position.set(-1.05, 0.5, -0.35);
  scene.add(column);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.14), standMat);
  arm.position.set(-0.775, 1.0, -0.35);
  scene.add(arm);

  const tableGroup = new THREE.Group();
  scene.add(tableGroup);

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.07, 2.15),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
  );
  mattress.position.y = -0.035;
  tableGroup.add(mattress);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.45), standMat);
  pedestal.position.set(0, 0.8 - 0.47, 0);
  scene.add(pedestal);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc, roughness: 0.25, transparent: true, opacity: 0.30, depthWrite: false
  });
  const organMat = new THREE.MeshStandardMaterial({
    color: 0xf87171, roughness: 0.5, transparent: true, opacity: 0.4, depthWrite: false
  });
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xe7e5d8, roughness: 0.6, transparent: true, opacity: 0.30, depthWrite: false
  });
  const brainMat = new THREE.MeshStandardMaterial({
    color: 0xf0abfc, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false
  });
  const torsoC = new THREE.Vector3(0, 0.14, -0.02);
  const torsoR = new THREE.Vector3(0.2, 0.14, 0.58);
  const headC = new THREE.Vector3(0.02, 0.17, -0.72);
  const headR = new THREE.Vector3(0.115, 0.125, 0.14);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), waterMat);
  torso.scale.copy(torsoR);
  torso.position.copy(torsoC);
  torso.renderOrder = 1;
  tableGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), waterMat);
  head.scale.copy(headR);
  head.position.copy(headC);
  head.renderOrder = 1;
  tableGroup.add(head);

  const organsGroup = new THREE.Group();
  const boneGroup = new THREE.Group();
  tableGroup.add(organsGroup, boneGroup);
  const brainMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), brainMat);
  brainMesh.scale.set(headR.x * 0.72, headR.y * 0.72, headR.z * 0.72);
  brainMesh.position.copy(headC);
  brainMesh.renderOrder = 2;
  tableGroup.add(brainMesh);
  const skullShell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), boneMat);
  skullShell.scale.set(headR.x * 1.18, headR.y * 1.18, headR.z * 1.18);
  skullShell.position.copy(headC);
  skullShell.renderOrder = 2;
  boneGroup.add(skullShell);

  const ellipsoidMesh = (c, r, mat, seg = 28) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg / 2), mat);
    m.scale.copy(r);
    m.position.copy(c);
    m.renderOrder = 2;
    return m;
  };
  const ORGANS = [
    [[0.085, 0.17, -0.26], [0.075, 0.10, 0.15]],
    [[-0.085, 0.17, -0.26], [0.075, 0.10, 0.15]],
    [[0.065, 0.10, 0.02], [0.075, 0.05, 0.11]],
    [[-0.05, 0.08, 0.10], [0.05, 0.06, 0.09]]
  ];
  for (const [c, r] of ORGANS) organsGroup.add(ellipsoidMesh(new THREE.Vector3(...c), new THREE.Vector3(...r), organMat));
  const spine = ellipsoidMesh(new THREE.Vector3(0, 0.115, -0.02), new THREE.Vector3(0.035, 0.032, 0.55), boneMat);
  boneGroup.add(spine);

  const limbMat = waterMat;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.5, 6, 12), limbMat);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(sx * 0.085, 0.055, 0.65);
    leg.renderOrder = 1;
    tableGroup.add(leg);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.45, 6, 12), limbMat);
    armL.rotation.x = Math.PI / 2;
    armL.position.set(sx * 0.235, 0.06, -0.05);
    armL.renderOrder = 1;
    tableGroup.add(armL);
  }

  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, emissive: 0x2a0505 })
  );
  heart.scale.set(1, 0.9, 0.95);
  heart.position.set(0.035, 0.1, -0.43);
  organsGroup.add(heart);

  const vesselMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48, emissive: 0x6d0f24, roughness: 0.35, transparent: true, opacity: 0.95
  });
  const neuroMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, emissive: 0x7c3a06, roughness: 0.35, transparent: true, opacity: 0.95
  });
  const aortaCurve = new THREE.CatmullRomCurve3(toV3(AORTA_POINTS), false, 'centripetal');
  const guideCurve = new THREE.CatmullRomCurve3(
    toV3(AORTA_POINTS.concat(LM_POINTS.slice(1), LAD_POINTS.slice(1))), false, 'centripetal'
  );
  const contrastCurve = new THREE.CatmullRomCurve3(toV3(LM_POINTS.concat(LAD_POINTS.slice(1))), false, 'centripetal');

  const NEURO_ACCESS = [
    [0.235, 0.06, -0.05], [0.2, 0.09, -0.22], [0.13, 0.12, -0.34], [0.07, 0.15, -0.44],
    [-0.02, 0.165, -0.31], [0.0, 0.16, -0.52], [0.01, 0.17, -0.65], [0.02, 0.185, -0.76]
  ];
  const neuroCurve = new THREE.CatmullRomCurve3(toV3(NEURO_ACCESS), false, 'centripetal');
  const neuroGuideCurve = neuroCurve;
  const neuroContrastCurve = new THREE.CatmullRomCurve3(
    toV3([[0.0, 0.16, -0.52], [0.01, 0.17, -0.65], [0.02, 0.185, -0.76], [0.0, 0.19, -0.8]]), false, 'centripetal'
  );
  const CAROTID_TREE = [
    [[-0.02, 0.165, -0.31], [-0.01, 0.16, -0.45], [0.0, 0.16, -0.52], [0.01, 0.17, -0.65], [0.02, 0.185, -0.76], [0.0, 0.19, -0.8]],
    [[0.03, 0.155, -0.4], [0.05, 0.15, -0.48], [0.05, 0.16, -0.58], [0.045, 0.17, -0.68], [0.04, 0.185, -0.76], [0.05, 0.19, -0.8]],
    [[-0.035, 0.16, -0.58], [-0.035, 0.175, -0.7], [-0.03, 0.185, -0.78]],
    [[0.035, 0.16, -0.58], [0.035, 0.175, -0.7], [0.03, 0.185, -0.78]]
  ];
  const carotidMeshes = CAROTID_TREE.map(pts => new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(toV3(pts), false, 'centripetal'), 40, 0.0042, 8), neuroMat
  ));
  carotidMeshes.forEach(m => { m.visible = false; tableGroup.add(m); });

  const aortaMesh = new THREE.Mesh(new THREE.TubeGeometry(aortaCurve, 96, 0.011, 10), vesselMat);
  tableGroup.add(aortaMesh);
  const coronaryMeshes = [LM_POINTS, LAD_POINTS, LCX_POINTS, RCA_POINTS].map(pts => {
    const c = new THREE.CatmullRomCurve3(toV3(pts), false, 'centripetal');
    const r = pts === LM_POINTS ? 0.0065 : 0.0052;
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 48, r, 8), vesselMat);
    tableGroup.add(m);
    return m;
  });

  const cathMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.8 });
  const catheterMesh = new THREE.Mesh(new THREE.TubeGeometry(new PartialCurve(aortaCurve, 0), 8, 0.0038, 8), cathMat);
  const wireMesh = new THREE.Mesh(new THREE.TubeGeometry(new PartialCurve(guideCurve, 0), 8, 0.0016, 6), wireMat);
  catheterMesh.visible = false;
  wireMesh.visible = false;
  tableGroup.add(catheterMesh, wireMesh);

  const contrastMesh = new THREE.Mesh(
    new THREE.TubeGeometry(new PartialCurve(contrastCurve, 0), 8, 0.0075, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0 })
  );
  contrastMesh.visible = false;
  tableGroup.add(contrastMesh);

  const torsoS = sampleEllipsoid(torsoC, torsoR, 1400);
  const headS = sampleEllipsoid(headC, headR, 300);
  const nPts = 1700;
  const skinPos = new Float32Array(nPts * 3);
  const skinNor = new Float32Array(nPts * 3);
  skinPos.set(torsoS.pos);
  skinPos.set(headS.pos, 1400 * 3);
  skinNor.set(torsoS.nor);
  skinNor.set(headS.nor, 1400 * 3);
  const skinGeo = new THREE.BufferGeometry();
  skinGeo.setAttribute('position', new THREE.BufferAttribute(skinPos, 3));
  const skinColors = new Float32Array(nPts * 3);
  skinGeo.setAttribute('color', new THREE.BufferAttribute(skinColors, 3));
  const skinPoints = new THREE.Points(skinGeo, new THREE.PointsMaterial({
    size: 0.013, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false
  }));
  skinPoints.renderOrder = 5;
  skinPoints.frustumCulled = false;
  tableGroup.add(skinPoints);

  const gantry = new THREE.Group();
  gantry.position.copy(ISO);
  gantry.rotation.order = 'ZXY';
  scene.add(gantry);

  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(SID / 2, 0.038, 12, 72, Math.PI),
    standMat
  );
  arc.rotation.z = Math.PI / 2;
  gantry.add(arc);

  const source = new THREE.Group();
  source.position.set(0, -SID / 2, 0);
  const srcBody = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.17),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.5 }));
  const coll = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.13, 4),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.5 }));
  coll.rotation.y = Math.PI / 4;
  coll.position.y = 0.13;
  source.add(srcBody, coll);
  gantry.add(source);

  const beamLight = new THREE.PointLight(0xffe6b0, 0, 3.5, 1.6);
  beamLight.position.set(0, -SID / 2 + 0.05, 0);
  gantry.add(beamLight);

  const detector = new THREE.Group();
  detector.position.set(0, SID / 2, 0);
  const detBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), standMat);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.12 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), screenMat);
  screen.rotation.x = Math.PI / 2;
  screen.position.y = -0.041;
  detector.add(detBody, screen);
  gantry.add(detector);

  const beamOuter = [makeBeamPlane(0.4, 0.075), makeBeamPlane(0.4, 0.075)];
  beamOuter[1].rotation.y = Math.PI / 2;
  const beamInner = [makeBeamPlane(0.18, 0.16), makeBeamPlane(0.18, 0.16)];
  beamInner[1].rotation.y = Math.PI / 2;
  const beamGroup = new THREE.Group();
  beamGroup.add(...beamOuter, ...beamInner);
  gantry.add(beamGroup);

  const PLANE_M = 256;
  const planeCanvas = document.createElement('canvas');
  planeCanvas.width = PLANE_M;
  planeCanvas.height = PLANE_M;
  const planeCtx = planeCanvas.getContext('2d');
  const planeTex = new THREE.CanvasTexture(planeCanvas);
  planeTex.colorSpace = THREE.SRGBColorSpace;
  const planeGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  const planeMesh = new THREE.Mesh(
    planeGeo,
    new THREE.MeshBasicMaterial({ map: planeTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  planeMesh.renderOrder = 6;
  planeMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), new THREE.LineBasicMaterial({ color: 0x64748b })));
  scene.add(planeMesh);

  let cn = FIELD_N;
  let cloudGeo = new THREE.BufferGeometry();
  let ccol = null;
  let calpha = null;
  function buildCloudGeo(nn) {
    cn = nn;
    cloudGeo.dispose();
    cloudGeo = new THREE.BufferGeometry();
    const cpos = new Float32Array(cn ** 3 * 3);
    ccol = new Float32Array(cn ** 3 * 3);
    calpha = new Float32Array(cn ** 3);
    const h = FIELD_SIZE / 2, cell = FIELD_SIZE / cn;
    let p = 0;
    for (let k = 0; k < cn; k++) {
      for (let j = 0; j < cn; j++) {
        for (let i = 0; i < cn; i++) {
          cpos[p * 3] = ISO.x - h + (i + 0.5) * cell;
          cpos[p * 3 + 1] = ISO.y - h + (j + 0.5) * cell;
          cpos[p * 3 + 2] = ISO.z - h + (k + 0.5) * cell;
          p++;
        }
      }
    }
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
    cloudGeo.setAttribute('aColor', new THREE.BufferAttribute(ccol, 3));
    cloudGeo.setAttribute('aAlpha', new THREE.BufferAttribute(calpha, 1));
    cloud.geometry = cloudGeo;
    cloudMat.uniforms.uSize.value = (FIELD_SIZE / cn * 2.6);
  }
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: (FIELD_SIZE / cn * 2.6) } },
    vertexShader: `
      uniform float uSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec3 vC;
      varying float vA;
      void main() {
        vC = aColor;
        vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (280.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vC;
      varying float vA;
      void main() {
        float m = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5));
        float a = vA * m * m;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vC * a, a);
      }
    `
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.renderOrder = 7;
  cloud.frustumCulled = false;
  scene.add(cloud);
  buildCloudGeo(cn);

  let tableY = TABLE_BASE;
  const world = {
    ISO, SID, gantry, source, detector, screen, beamOuter, beamInner, beamGroup, beamLight,
    tableGroup, heart,
    skinPoints, skinPos, skinNor, nPts,
    ellipsoidsLocal: [
      { c: torsoC.clone(), r: torsoR.clone(), mu: 1 },
      { c: headC.clone(), r: headR.clone(), mu: 1 },
      { c: headC.clone(), r: headR.clone().multiplyScalar(1.18), mu: 1.9 },
      { c: new THREE.Vector3(0, -0.05, 0), r: new THREE.Vector3(0.28, 0.05, 1.05), mu: 1 }
    ],
    tableMesh: mattress,
    tableOff: { x: 0, z: 0 },
    setTableOffset(x, z) {
      this.tableOff.x = THREE.MathUtils.clamp(x, -0.3, 0.3);
      this.tableOff.z = THREE.MathUtils.clamp(z, -0.8, 0.8);
      tableGroup.position.x = this.tableOff.x;
      tableGroup.position.z = this.tableOff.z;
    },
    setLayers(o) {
      organsGroup.visible = !!o.organs;
      boneGroup.visible = !!o.bone;
      brainMesh.visible = !!o.brain;
    },
    setCollimating(b) {
      for (const m of beamOuter) {
        m.material.uniforms.uI.value = b ? 0.42 : 0.075;
        m.material.uniforms.uColor.value.set(b ? 0xfff6d8 : 0xffd27a);
      }
      for (const m of beamInner) {
        m.material.uniforms.uI.value = b ? 0.75 : 0.16;
        m.material.uniforms.uColor.value.set(b ? 0xfff6d8 : 0xffd27a);
      }
    },
    aortaCurve, guideCurve, contrastCurve,
    catheterMesh, wireMesh, contrastMesh,
    planeMesh, cloud, PLANE_M,
    planeAxes: {
      x: { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      y: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      z: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }
    },
    planeAxis: 'z',
    planeOffset: 0,
    setPlane(axis, offset) {
      const A = this.planeAxes[axis];
      const n = new THREE.Vector3(...A.n);
      const u = new THREE.Vector3(...A.u);
      const v = new THREE.Vector3(...A.v);
      planeMesh.position.copy(ISO).addScaledVector(n, offset);
      planeMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
      this.planeAxis = axis;
      this.planeOffset = offset;
    },
    setPlaneVisible(b) {
      planeMesh.visible = b;
    },
    drawPlane(data, m, o) {
      const img = planeCtx.createImageData(m, m);
      const c = [0, 0, 0];
      const range = Math.max(1e-9, o.scaleMax - o.scaleMin);
      for (let b = 0; b < m; b++) {
        for (let a = 0; a < m; a++) {
          const val = data[b * m + a];
          const ox = ((m - 1 - b) * m + a) * 4;
          const u = val * o.unitFactor;
          if (u <= o.scaleMin + 0.5) {
            img.data[ox] = 245; img.data[ox + 1] = 248; img.data[ox + 2] = 252;
          } else {
            const t = o.log ? logMap(u - o.scaleMin, range) : Math.max(0, Math.min(1, (u - o.scaleMin) / range));
            colormapNamed(o.cmap, t, c);
            img.data[ox] = c[0] * 255; img.data[ox + 1] = c[1] * 255; img.data[ox + 2] = c[2] * 255;
          }
          img.data[ox + 3] = 255;
        }
      }
      planeCtx.putImageData(img, 0, 0);

      const pxPerM = m / PLANE_SIZE;
      for (let g = -1.3; g <= 1.3; g += 0.1) {
        const isMajor = Math.abs(g / 0.5 - Math.round(g / 0.5)) < 1e-6;
        const p = ((g + PLANE_SIZE / 2) / PLANE_SIZE) * m;
        if (p < 0 || p > m) continue;
        planeCtx.strokeStyle = isMajor ? 'rgba(71,85,105,0.55)' : 'rgba(100,116,139,0.28)';
        planeCtx.lineWidth = isMajor ? 1.4 : 0.7;
        planeCtx.beginPath();
        planeCtx.moveTo(p, 0); planeCtx.lineTo(p, m);
        planeCtx.moveTo(0, p); planeCtx.lineTo(m, p);
        planeCtx.stroke();
      }

      const stripH = Math.round(m * 0.085);
      planeCtx.fillStyle = 'rgba(255,255,255,0.9)';
      planeCtx.fillRect(0, m - stripH, m, stripH);
      const bx = m * 0.05, bw = m * 0.9, by = m - stripH + Math.round(stripH * 0.22), bh = Math.round(stripH * 0.42);
      const grad = planeCtx.createLinearGradient(bx, 0, bx + bw, 0);
      for (let i = 0; i <= 10; i++) {
        colormapNamed(o.cmap, i / 10, c);
        grad.addColorStop(i / 10, `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`);
      }
      planeCtx.fillStyle = grad;
      planeCtx.fillRect(bx, by, bw, bh);
      planeCtx.strokeStyle = '#0f172a';
      planeCtx.lineWidth = 1;
      planeCtx.strokeRect(bx, by, bw, bh);
      planeCtx.fillStyle = '#0f172a';
      planeCtx.font = `${Math.max(8, Math.round(m * 0.045))}px sans-serif`;
      planeCtx.textBaseline = 'middle';
      const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v * 10) / 10);
      planeCtx.fillText(fmt(o.scaleMin), bx, by + bh + stripH * 0.32);
      planeCtx.textAlign = 'right';
      planeCtx.fillText(fmt(o.scaleMax) + ' ' + (o.unit || ''), bx + bw, by + bh + stripH * 0.32);
      planeCtx.textAlign = 'left';

      const barLen = pxPerM;
      const gridStep = 0.1 * pxPerM;
      const xMid = (Math.floor((m * 0.78) / gridStep) + 0.5) * gridStep;
      const barY = m - 3;
      planeCtx.strokeStyle = '#0f172a';
      planeCtx.fillStyle = '#0f172a';
      planeCtx.lineWidth = 1.6;
      planeCtx.beginPath();
      planeCtx.moveTo(xMid - barLen / 2, barY);
      planeCtx.lineTo(xMid + barLen / 2, barY);
      planeCtx.stroke();
      for (const s of [-1, 1]) {
        const ax = xMid + s * barLen / 2;
        planeCtx.beginPath();
        planeCtx.moveTo(ax, barY);
        planeCtx.lineTo(ax - s * 5, barY - 3.5);
        planeCtx.lineTo(ax - s * 5, barY + 3.5);
        planeCtx.closePath();
        planeCtx.fill();
      }
      planeCtx.font = `${Math.max(8, Math.round(m * 0.042))}px sans-serif`;
      planeCtx.fillText('1 m', xMid - 8, barY - 8);

      planeTex.needsUpdate = true;
    },
    setCloudVisible(b) {
      cloud.visible = b;
    },
    rebuildCloud(n) {
      buildCloudGeo(n);
    },
    updateCloud(field, o, rateFn) {
      const n = field.n;
      const c = [0, 0, 0];
      const h = field.size / 2, cell = field.size / n, ctr = field.center;
      const range = Math.max(1e-9, o.scaleMax - o.scaleMin);
      const thr = (o.scaleMin + 0.02 * range) / o.unitFactor;
      for (let id = 0; id < n ** 3; id++) {
        const k = Math.floor(id / (n * n)), j = Math.floor(id / n) % n, i = id % n;
        const x = ctr.x - h + (i + 0.5) * cell, y = ctr.y - h + (j + 0.5) * cell, z = ctr.z - h + (k + 0.5) * cell;
        const d = rateFn ? rateFn(x, y, z) : field.data[id];
        if (d < thr) {
          calpha[id] = 0;
          continue;
        }
        const u = d * o.unitFactor;
        const t = o.log ? logMap(u - o.scaleMin, range) : Math.max(0, Math.min(1, (u - o.scaleMin) / range));
        colormapNamed(o.cmap, t, c);
        ccol[id * 3] = c[0];
        ccol[id * 3 + 1] = c[1];
        ccol[id * 3 + 2] = c[2];
        calpha[id] = 0.015 + 0.4 * t;
      }
      cloudGeo.attributes.aColor.needsUpdate = true;
      cloudGeo.attributes.aAlpha.needsUpdate = true;
    },
    tableY,
    setTableY(y) {
      tableY = y;
      tableGroup.position.y = y;
      pedestal.position.y = y - 0.47;
      pedestal.scale.y = Math.max(0.05, y / 0.8);
    },
    setGantry(raoDeg, cranDeg) {
      gantry.rotation.z = THREE.MathUtils.degToRad(raoDeg);
      gantry.rotation.x = THREE.MathUtils.degToRad(cranDeg);
    },
    anatomy: 'hkl',
    setAnatomyMode(mode) {
      this.anatomy = mode;
      for (const m of coronaryMeshes) m.visible = mode === 'hkl';
      for (const m of carotidMeshes) m.visible = mode === 'neuro';
      aortaMesh.visible = true;
      this._lastCath = -1;
      this._lastContrast = -1;
    },
    setIso(v) {
      gantry.position.copy(v);
    },
    activeCurves() {
      return this.anatomy === 'neuro'
        ? { cath: neuroCurve, guide: neuroGuideCurve, contrast: neuroContrastCurve }
        : { cath: aortaCurve, guide: guideCurve, contrast: contrastCurve };
    },
    setCatheter(u) {
      const uc = Math.max(0, Math.min(1, u));
      if (Math.abs(uc - (this._lastCath ?? -1)) < 0.0005) return;
      this._lastCath = uc;
      const C = this.activeCurves();
      const uw = Math.max(0, Math.min(1, uc * 1.12 + 0.015));
      catheterMesh.visible = uc > 0.002;
      wireMesh.visible = uw > 0.004;
      if (catheterMesh.visible) {
        catheterMesh.geometry.dispose();
        catheterMesh.geometry = new THREE.TubeGeometry(new PartialCurve(C.cath, Math.max(uc, 0.01)), 96, 0.0038, 8);
      }
      if (wireMesh.visible) {
        wireMesh.geometry.dispose();
        wireMesh.geometry = new THREE.TubeGeometry(new PartialCurve(C.guide, Math.max(uw, 0.01)), 128, 0.0016, 6);
      }
    },
    setContrast(u, opacity) {
      const uu = Math.max(0, Math.min(1, u));
      if (Math.abs(uu - (this._lastContrast ?? -1)) < 0.002 && Math.abs(opacity - (this._lastContrastOp ?? -1)) < 0.01) return;
      this._lastContrast = uu;
      this._lastContrastOp = opacity;
      contrastMesh.visible = uu > 0.01 && opacity > 0.01;
      if (contrastMesh.visible) {
        contrastMesh.geometry.dispose();
        contrastMesh.geometry = new THREE.TubeGeometry(new PartialCurve(this.activeCurves().contrast, Math.max(uu, 0.02)), 64, 0.0075, 8);
        contrastMesh.material.opacity = opacity;
      }
    },
    setBeam(fieldAtDet, on) {
      for (const m of beamOuter) m.scale.x = fieldAtDet;
      for (const m of beamInner) m.scale.x = fieldAtDet * 0.45;
      beamGroup.visible = on;
      beamLight.intensity = on ? 6 : 0;
    },
    getSourceWorld(out) {
      gantry.updateMatrixWorld(true);
      return out.set(0, -SID / 2, 0).applyMatrix4(gantry.matrixWorld);
    },
    getBeamDirWorld(out) {
      gantry.updateMatrixWorld(true);
      const a = new THREE.Vector3(0, -SID / 2, 0).applyMatrix4(gantry.matrixWorld);
      const b = new THREE.Vector3(0, 1, 0).applyMatrix4(gantry.matrixWorld);
      return out.copy(b).sub(a).normalize();
    }
  };
  world.setTableY(TABLE_BASE);
  return world;
}
