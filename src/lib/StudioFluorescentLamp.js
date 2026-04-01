import * as THREE from 'three';

/**
 * 蛍光灯メッシュ（emissive）と {@link THREE.PointLight} を同じ位置に置く。
 * シーンからは主に **StudioBox** 経由で使う。
 */
export class StudioFluorescentLamp {
    /**
     * @param {THREE.Scene} scene
     * @param {object} [options]
     * @param {THREE.Vector3 | { x?: number, y?: number, z?: number }} [options.position]
     * @param {number} [options.color=0xffffff]
     * @param {number} [options.emissiveIntensity=1]
     * @param {number} [options.radius=50]
     * @param {number} [options.height] 円柱の高さ（既定 10000）
     * @param {number} [options.pointIntensity] PointLight の intensity（未指定時は emissiveIntensity から算出）
     * @param {number} [options.distance] PointLight の distance
     * @param {number} [options.decay=2]
     * @param {number} [options.envMapIntensity=1]
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.mesh = null;
        this.pointLight = null;

        const color = options.color ?? 0xffffff;
        const emissiveIntensity = options.emissiveIntensity !== undefined ? options.emissiveIntensity : 1;
        const radius = options.radius ?? 50;
        const height = options.height ?? 10000;

        const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity,
            envMapIntensity: options.envMapIntensity !== undefined ? options.envMapIntensity : 1.0
        });
        this.mesh = new THREE.Mesh(geometry, material);
        const p = options.position;
        if (p) {
            if (p instanceof THREE.Vector3) {
                this.mesh.position.copy(p);
            } else {
                this.mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
            }
        }

        const distance = options.distance ?? 20000;
        const decay = options.decay !== undefined ? options.decay : 2;
        const pointIntensity =
            options.pointIntensity !== undefined
                ? options.pointIntensity
                : Math.max(400, emissiveIntensity * 120);

        this.pointLight = new THREE.PointLight(color, pointIntensity, distance, decay);
        this.pointLight.position.copy(this.mesh.position);

        scene.add(this.mesh);
        scene.add(this.pointLight);
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        if (this.pointLight) {
            this.scene.remove(this.pointLight);
            this.pointLight = null;
        }
    }
}
