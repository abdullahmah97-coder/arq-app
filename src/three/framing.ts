// تأطير الكاميرا تلقائياً: نحسب حدود اللاعب والجهاز خلال الحركة كاملة ثم نقرّب الكاميرا لأقصى حد يظهر فيه كل شيء
import * as THREE from 'three';
import { motionDuration, poseOpts, sampleMotion, type Motion } from './motions';
import { applyPose, type PropsRuntime, type Rig } from './rig';

const PITCH = THREE.MathUtils.degToRad(10);

/** حدود المشهد خلال دورة الحركة (اللاعب + الأدوات) */
export function motionBounds(rig: Rig, props: PropsRuntime, m: Motion, sync?: () => void): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const dur = Math.max(0.1, motionDuration(m));
  const N = 20;
  for (let i = 0; i < N; i++) {
    applyPose(rig, sampleMotion(m, (i / N) * dur), poseOpts(m));
    sync?.();
    props.update();
    rig.object.updateMatrixWorld(true);
    props.group.updateMatrixWorld(true);
    box.union(tmp.setFromObject(rig.object));
    props.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.shadow) return;
      mesh.geometry.computeBoundingBox();
      box.union(tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
    });
  }
  box.min.y = Math.max(0, box.min.y);
  return box;
}

const _cam = new THREE.PerspectiveCamera();
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** اتجاه الكاميرا من زاوية الدوران (نفس نظام view.yaw) */
export function viewDir(yawDeg: number, out = new THREE.Vector3()) {
  const a = -THREE.MathUtils.degToRad(yawDeg);
  return out.set(Math.sin(a) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(a) * Math.cos(PITCH));
}

/** أقل مسافة يظهر فيها الصندوق كامل داخل الإطار (margin = نسبة من نصف الشاشة) */
export function fitDistance(box: THREE.Box3, yawDeg: number, fov: number, aspect: number, margin = 0.86): number {
  const target = box.getCenter(new THREE.Vector3());
  viewDir(yawDeg, _dir);
  _cam.fov = fov; _cam.aspect = aspect; _cam.near = 0.05; _cam.far = 100; _cam.updateProjectionMatrix();
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const fits = (d: number) => {
    _cam.position.copy(target).addScaledVector(_dir, d);
    _cam.lookAt(target);
    _cam.updateMatrixWorld(true);
    for (const c of corners) {
      _p.copy(c).project(_cam);
      if (_p.z > 1 || Math.abs(_p.x) > margin || Math.abs(_p.y) > margin) return false;
    }
    return true;
  };
  let lo = 0.8; let hi = 14;
  if (!fits(hi)) return hi;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

/** يضع الكاميرا (مع تنعيم المسافة عند التدوير) */
export function placeCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3, center: THREE.Vector3, yawDeg: number, state: { dist: number }, smooth = 0.2) {
  const target = fitDistance(box, yawDeg, camera.fov, camera.aspect);
  state.dist = state.dist > 0 ? state.dist + (target - state.dist) * smooth : target;
  viewDir(yawDeg, _dir);
  camera.position.copy(center).addScaledVector(_dir, state.dist);
  camera.lookAt(center);
}
