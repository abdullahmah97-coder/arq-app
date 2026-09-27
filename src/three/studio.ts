// "استوديو" العرض: خلفية متدرجة، أرضية تستقبل الظل، وإضاءة ثلاثية (رئيسية بظل ناعم + تعبئة + حافة)
// الهدف شكل قريب من فيديوهات التمارين الاحترافية: خلفية نظيفة وظل حقيقي للاعب والجهاز على الأرض.
import * as THREE from 'three';

export interface Studio { group: THREE.Group; key: THREE.DirectionalLight }

function gradientDome() {
  const geo = new THREE.SphereGeometry(14, 24, 16);
  const top = new THREE.Color('#EFE4D0');
  const mid = new THREE.Color('#FAF2E4');
  const low = new THREE.Color('#F5ECDD');
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 14; // -1..1
    if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.6)); else c.copy(mid).lerp(low, Math.min(1, -y * 3));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -10;
  dome.userData.backdrop = true;
  return dome;
}

/** bounds: حدود اللاعب والجهاز خلال الحركة (لتضييق كاميرا الظل = ظل أنعم وأدق) */
export function createStudio(bounds: THREE.Box3, opts: { shadows: boolean }): Studio {
  const group = new THREE.Group();
  group.add(gradientDome());

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  const hemi = new THREE.HemisphereLight('#fff7ea', '#b89a74', 1.05);
  group.add(hemi);

  const key = new THREE.DirectionalLight('#ffffff', 2.3);
  key.position.set(center.x + 2.4, center.y + 4.5, center.z + 3.2);
  key.target.position.copy(center);
  group.add(key, key.target);

  const fill = new THREE.DirectionalLight('#FEC98A', 0.55);
  fill.position.set(center.x - 3.5, center.y + 1.5, center.z + 1.5);
  fill.target.position.copy(center);
  group.add(fill, fill.target);

  const rim = new THREE.DirectionalLight('#ffffff', 0.9);
  rim.position.set(center.x - 0.5, center.y + 3, center.z - 4.5);
  rim.target.position.copy(center);
  group.add(rim, rim.target);

  if (opts.shadows) {
    key.castShadow = true;
    const r = Math.max(size.x, size.y, size.z) * 0.75 + 0.6;
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5; cam.far = 14;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 5;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.0015; floor.receiveShadow = true;
    floor.userData.backdrop = true;
    group.add(floor);
  }
  return { group, key };
}

/** يفعّل الظل على كل شبكات الكائن (اللاعب والأجهزة) */
export function enableShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.shadow || m.userData.backdrop) return;
    const mat = m.material as THREE.Material & { transparent?: boolean };
    if (mat?.transparent) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
}
