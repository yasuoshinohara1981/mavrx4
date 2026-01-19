/**
 * Scene02: シンプルなsphere接続システム
 * ProcessingのScene02を移植
 */

import { SceneBase } from '../SceneBase.js';
import { Scene02_RedSphere } from './Scene02_RedSphere.js';
// import { Scene02_YellowSphere } from './Scene02_YellowSphere.js';  // 黄色いsphereをコメントアウト
import { Scene02_Connection } from './Scene02_Connection.js';
import { Scene02_Scope } from './Scene02_Scope.js';
import * as THREE from 'three';

export class Scene02 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | bng bng';
        this.sceneNumber = 2;
        
        // 表示設定
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;
        
        // リスト
        this.redSpheres = [];
        // this.yellowSpheres = [];  // 黄色いsphereをコメントアウト
        this.connections = [];
        this.activeScopes = [];
        
        // 接続の設定
        this.NEIGHBOR_DISTANCE = 150.0;
        
        // スコープ表示の設定
        this.SCOPE_DURATION = 60.0;
        this.SHOW_SCOPES = false;  // スコープとテキストをコメントアウト
        
        // スコープ用の共有Canvas（全スコープで1つのCanvasを使用してパフォーマンス向上）
        this.scopeCanvas = null;
        this.scopeCtx = null;
        
        // 5キーの状態
        this.key5Pressed = false;
        this.growingSphere = null;
        this.growingSphereScale = 1.0;
        
        // リセットフラグ（sphere数が300を超えたら次のトラック2でリセット）
        this.shouldResetOnTrack2 = false;
        
        // 前回のSphereの情報
        this.lastSpherePosition = null;
        this.lastSphereTime = 0;
        
        // レーザースキャンパラメータ
        this.laserScanActive = false;
        this.scanY = 500.0;
        this.scanSpeed = 5.0;
        this.scanWidth = 20.0;
        this.scanStartY = 500.0;
        this.scanEndY = -500.0;
        
        // シェーダー描画用（一時的に無効化して動作確認）
        this.useShaderRendering = false;  // まずは通常描画で動作確認
        this.useShaderLineRendering = false;  // まずは通常描画で動作確認
        
        // 被写界深度パラメータ（DOF無効化）
        this.focusDistance = 0.0;
        this.depthRange = 500.0;
        this.depthBlurStrength = 0.0;  // DOFエフェクトを無効化
        this.lineDepthBlurStrength = 0.0;  // 線のDOFエフェクトを無効化
        
        // マテリアルパラメータ
        this.materialRoughness = 0.85;  // 0.7 → 0.85 に上げてマットな質感に
        
        // SSAOパラメータ
        this.useSSAO = true;
        this.ssaoRadius = 50.0;
        this.ssaoStrength = 0.3;
        this.ssaoSamples = 8;
        
        // ライト用パラメータ
        this.lightPosition = null;
        this.lightColorValue = null;
        
        // Three.js用のオブジェクト
        this.sphereGroup = null;  // 赤いsphereと黄色いsphereのグループ
        this.lineGroup = null;  // 接続線のグループ
        this.laserScanGroup = null;  // レーザースキャンのグループ
        
        // シェーダーマテリアル
        this.sphereMaterial = null;
        this.lineMaterial = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        // 親クラスのsetup()を呼ぶ（ColorInversionの初期化を含む）
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // ライト位置を初期化
        this.initializeLightPosition();
        
        // ライトを追加
        this.setupLights();
        
        // シェーダーマテリアルを初期化
        await this.initShaders();
        
        // グループを作成
        this.sphereGroup = new THREE.Group();
        this.lineGroup = new THREE.Group();
        this.laserScanGroup = new THREE.Group();
        this.scene.add(this.sphereGroup);
        this.scene.add(this.lineGroup);
        this.scene.add(this.laserScanGroup);
        
        // スコープ用の共有Canvasを初期化
        if (this.SHOW_SCOPES) {
            this.scopeCanvas = document.createElement('canvas');
            this.scopeCanvas.width = window.innerWidth;
            this.scopeCanvas.height = window.innerHeight;
            this.scopeCanvas.style.position = 'absolute';
            this.scopeCanvas.style.top = '0';
            this.scopeCanvas.style.left = '0';
            this.scopeCanvas.style.pointerEvents = 'none';
            this.scopeCanvas.style.zIndex = '1000';
            this.scopeCtx = this.scopeCanvas.getContext('2d');
            // フォントを一度だけ設定（パフォーマンス最適化）
            this.scopeCtx.font = '14px monospace';
            this.scopeCtx.textAlign = 'center';
            this.scopeCtx.textBaseline = 'top';
            document.body.appendChild(this.scopeCanvas);
        }
    }
    
    /**
     * ライト位置を初期化
     */
    initializeLightPosition() {
        const lightDistance = 2000.0;
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * (Math.PI / 3 - Math.PI / 6) + Math.PI / 6;
        
        this.lightPosition = new THREE.Vector3(
            lightDistance * Math.sin(angle2) * Math.cos(angle1),
            lightDistance * Math.cos(angle2),
            lightDistance * Math.sin(angle2) * Math.sin(angle1)
        );
        
        // HSL色空間で色を生成
        const hue = Math.random() * 60;
        const saturation = Math.random() * 30 + 70;
        const brightness = Math.random() * 20 + 80;
        this.lightColorValue = new THREE.Color();
        this.lightColorValue.setHSL(hue / 360, saturation / 100, brightness / 100);
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光を弱くしてコントラストを上げる
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);  // 0.2 → 0.15 に下げてコントラスト強化
        this.scene.add(ambientLight);
        
        // 指向性ライト（動的に生成された位置と色）
        if (this.lightPosition && this.lightColorValue) {
            const directionalLight = new THREE.DirectionalLight(this.lightColorValue, 1.2);  // 0.5 → 1.2 に上げてライトの影響を強く
            directionalLight.position.copy(this.lightPosition);
            this.scene.add(directionalLight);
        }
    }
    
    /**
     * シェーダーを初期化
     */
    async initShaders() {
        if (this.useShaderRendering) {
            try {
                const shaderBasePath = `/shaders/scene02/`;
                const [vertexShader, fragmentShader] = await Promise.all([
                    fetch(`${shaderBasePath}particle_vert.glsl`).then(r => r.text()).catch(() => null),
                    fetch(`${shaderBasePath}particle_frag.glsl`).then(r => r.text()).catch(() => null)
                ]);
                
                if (vertexShader && fragmentShader) {
                    this.sphereMaterial = new THREE.ShaderMaterial({
                        vertexShader: vertexShader,
                        fragmentShader: fragmentShader,
                        uniforms: {
                            cameraPosition: { value: new THREE.Vector3() },
                            focusDistance: { value: 0.0 },
                            depthRange: { value: this.depthRange },
                            depthBlurStrength: { value: this.depthBlurStrength },
                            lightPosition: { value: this.lightPosition || new THREE.Vector3() },
                            lightColor: { value: this.lightColorValue || new THREE.Color(1, 1, 1) },
                            materialRoughness: { value: this.materialRoughness },
                            useSSAO: { value: this.useSSAO },
                            ssaoRadius: { value: this.ssaoRadius },
                            ssaoStrength: { value: this.ssaoStrength },
                            ssaoSamples: { value: this.ssaoSamples },
                            sphereColor: { value: new THREE.Color(1, 0, 0) },  // デフォルト色（各sphereで上書き）
                            sphereLife: { value: 1.0 }  // デフォルト寿命（透明度制御用）
                        },
                        transparent: true,
                        side: THREE.DoubleSide
                    });
                    console.log('Scene02 sphere shader loaded successfully');
                } else {
                    console.warn('Could not load Scene02 sphere shader files. Using fallback rendering.');
                    this.useShaderRendering = false;
                }
            } catch (err) {
                console.error('Error loading Scene02 sphere shaders:', err);
                this.useShaderRendering = false;
            }
        }
        
        if (this.useShaderLineRendering) {
            try {
                const shaderBasePath = `/shaders/scene02/`;
                const [vertexShader, fragmentShader] = await Promise.all([
                    fetch(`${shaderBasePath}line_vert.glsl`).then(r => r.text()).catch(() => null),
                    fetch(`${shaderBasePath}line_frag.glsl`).then(r => r.text()).catch(() => null)
                ]);
                
                if (vertexShader && fragmentShader) {
                    this.lineMaterial = new THREE.ShaderMaterial({
                        vertexShader: vertexShader,
                        fragmentShader: fragmentShader,
                        uniforms: {
                            cameraPosition: { value: new THREE.Vector3() },
                            focusDistance: { value: 0.0 },
                            depthRange: { value: this.depthRange },
                            depthBlurStrength: { value: this.lineDepthBlurStrength },
                            lightPosition: { value: this.lightPosition || new THREE.Vector3() },
                            lightColor: { value: this.lightColorValue || new THREE.Color(1, 1, 1) },
                            materialRoughness: { value: this.materialRoughness }
                        },
                        transparent: true,
                        side: THREE.DoubleSide
                    });
                    console.log('Scene02 line shader loaded successfully');
                } else {
                    console.warn('Could not load Scene02 line shader files. Using fallback rendering.');
                    this.useShaderLineRendering = false;
                }
            } catch (err) {
                console.error('Error loading Scene02 line shaders:', err);
                this.useShaderLineRendering = false;
            }
        }
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（Scene02用：近くに）
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 2000.0;  // 3500.0 → 2000.0 に変更（近くに）
        cameraParticle.maxDistance = 5000.0;  // 8000.0 → 5000.0 に変更（近くに）
        cameraParticle.maxDistanceReset = 3500.0;  // 6000.0 → 3500.0 に変更（近くに）
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        // 時間を更新（HUD表示用、Scene02はdeltaTimeを使用）
        this.time += deltaTime;
        
        // 黄色いsphereを更新 - コメントアウト
        // this.yellowSpheres = this.yellowSpheres.filter(ys => {
        //     ys.update();
        //     if (ys.isDead()) {
        //         ys.dispose(this.scene);
        //         return false;
        //     }
        //     return true;
        // });
        
        // 5キーが押されている間、生成されたsphereを大きくする
        if (this.key5Pressed && this.growingSphere) {
            this.growingSphereScale += 0.05;
            this.growingSphere.setScale(this.growingSphereScale);
        }
        
        // 接続を更新
        this.updateConnections();
        
        // スコープを更新（無効化されている場合はスキップ）
        if (this.SHOW_SCOPES) {
            // 共有Canvasをクリア
            if (this.scopeCtx) {
                this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
            }
            
            this.activeScopes = this.activeScopes.filter(scope => {
                scope.update();
                if (scope.isDead()) {
                    scope.dispose(this.scene);
                    return false;
                }
                // 共有Canvasを使用して描画
                scope.updateThreeObjects(this.scopeCtx, this.scopeCanvas);
                return true;
            });
        } else {
            // スコープが無効化されている場合は全てクリア
            if (this.scopeCtx) {
                this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
            }
            this.activeScopes.forEach(scope => {
                scope.dispose(this.scene);
            });
            this.activeScopes = [];
        }
        
        // レーザースキャンの更新
        if (this.laserScanActive) {
            this.scanY -= this.scanSpeed;
            if (this.scanY < this.scanEndY) {
                this.scanY = this.scanStartY;
            }
        }
        
        // Three.jsオブジェクトを更新
        this.updateThreeObjects();
        
        // HUDのOBJECTSにsphereの数を設定
        this.setParticleCount(this.redSpheres.length);
    }
    
    /**
     * Three.jsオブジェクトを更新
     */
    updateThreeObjects() {
        // 赤いsphereを更新
        this.redSpheres.forEach(sphere => {
            sphere.updateThreeObjects();
        });
        
        // 黄色いsphereを更新 - コメントアウト
        // this.yellowSpheres.forEach(sphere => {
        //     sphere.updateThreeObjects();
        // });
        
        // 接続線を更新（SHOW_LINESがtrueの場合のみ）
        if (this.SHOW_LINES && this.lineGroup) {
            this.updateConnectionLines();
        }
        
        // レーザースキャンを更新
        if (this.laserScanActive) {
            this.updateLaserScan();
        }
        
        // シェーダーのuniformを更新（シェーダーが有効な場合のみ）
        if (this.useShaderRendering && this.sphereMaterial) {
            const eye = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
            const center = new THREE.Vector3(0, 0, 0);
            const centerDistance = center.distanceTo(eye);
            
            this.sphereMaterial.uniforms.cameraPosition.value.copy(eye);
            this.sphereMaterial.uniforms.focusDistance.value = centerDistance;
            this.sphereMaterial.uniforms.lightPosition.value.copy(this.lightPosition || new THREE.Vector3());
            this.sphereMaterial.uniforms.lightColor.value.copy(this.lightColorValue || new THREE.Color(1, 1, 1));
        }
        
        if (this.useShaderLineRendering && this.lineMaterial) {
            const eye = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
            const center = new THREE.Vector3(0, 0, 0);
            const centerDistance = center.distanceTo(eye);
            
            this.lineMaterial.uniforms.cameraPosition.value.copy(eye);
            this.lineMaterial.uniforms.focusDistance.value = centerDistance;
            this.lineMaterial.uniforms.lightPosition.value.copy(this.lightPosition || new THREE.Vector3());
            this.lineMaterial.uniforms.lightColor.value.copy(this.lightColorValue || new THREE.Color(1, 1, 1));
        }
        
    }
    
    /**
     * 接続線を更新
     */
    updateConnectionLines() {
        // lineGroupが初期化されていない場合は何もしない
        if (!this.lineGroup) {
            return;
        }
        
        if (!this.SHOW_LINES) {
            // 表示しない場合は全て削除
            this.lineGroup.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            this.lineGroup.clear();
            return;
        }
        
        // 接続数が変わった場合のみ再作成
        const currentLineCount = this.lineGroup.children.length;
        const targetLineCount = this.connections.length;
        
        if (currentLineCount !== targetLineCount) {
            // 既存の線を削除
            this.lineGroup.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            this.lineGroup.clear();
            
            // 新しい接続線を作成
            this.connections.forEach(conn => {
                const fromPos = conn.from.getPosition();
            const toPos = conn.target.getPosition();
            
            if (this.useShaderLineRendering && this.lineMaterial) {
                // シェーダー描画
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    fromPos.x, fromPos.y, fromPos.z,
                    toPos.x, toPos.y, toPos.z
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const line = new THREE.Line(geometry, this.lineMaterial.clone());
                this.lineGroup.add(line);
            } else {
                // 通常描画
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    fromPos.x, fromPos.y, fromPos.z,
                    toPos.x, toPos.y, toPos.z
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const eye = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
                const lineCenter = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
                const lineDistance = lineCenter.distanceTo(eye);
                const centerDistance = new THREE.Vector3(0, 0, 0).distanceTo(eye);
                
                // ライティング対応のため、CylinderGeometryを使用してMeshとして描画
                const distance = fromPos.distanceTo(toPos);
                const direction = new THREE.Vector3().subVectors(toPos, fromPos).normalize();
                const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
                
                // 円柱のジオメトリを作成（線の太さは1.0、セグメント数を減らして軽量化）
                const cylinderGeometry = new THREE.CylinderGeometry(1.0, 1.0, distance, 4, 1);
                
                // 円柱を線の方向に回転
                const up = new THREE.Vector3(0, 1, 0);
                const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
                
                const material = new THREE.MeshStandardMaterial({
                    color: 0xcccccc,  // 明るいグレー（白より少し暗く）
                    emissive: 0x333333,  // 発光色を控えめに（ライトの影響を受けやすく）
                    emissiveIntensity: 0.1,  // 発光強度を下げる
                    transparent: false,  // 不透明度100%なのでtransparentは不要
                    opacity: 1.0,  // 常に100%不透明
                    roughness: 0.8,  // マットな質感に
                    metalness: 0.2  // メタリック感を控えめに
                });
                
                const lineMesh = new THREE.Mesh(cylinderGeometry, material);
                lineMesh.position.copy(midPoint);
                lineMesh.setRotationFromQuaternion(quaternion);
                this.lineGroup.add(lineMesh);
                }
            });
        } else {
            // 接続数が同じ場合は位置だけ更新（ただし、毎フレーム更新は重いので、必要に応じてスキップ）
            // パフォーマンス向上のため、位置の更新はスキップ（接続が変わった時だけ再作成）
            // もし位置の更新が必要な場合は、以下のコメントを外す
            /*
            this.connections.forEach((conn, index) => {
                if (index < this.lineGroup.children.length) {
                    const line = this.lineGroup.children[index];
                    const fromPos = conn.from.getPosition();
                    const toPos = conn.target.getPosition();
                    
                    const positions = new Float32Array([
                        fromPos.x, fromPos.y, fromPos.z,
                        toPos.x, toPos.y, toPos.z
                    ]);
                    line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                }
            });
            */
        }
    }
    
    /**
     * レーザースキャンを更新
     */
    updateLaserScan() {
        // 既存のスキャンを削除
        this.laserScanGroup.children.forEach(obj => {
            obj.geometry.dispose();
            obj.material.dispose();
        });
        this.laserScanGroup.clear();
        
        // スキャンラインの範囲内のsphereを探す
        const scanSpheres = this.redSpheres.filter(sphere => {
            const pos = sphere.getPosition();
            const dist = Math.abs(pos.y - this.scanY);
            return dist < this.scanWidth;
        });
        
        // スキャンライン付近のsphereを赤い線で描画
        scanSpheres.forEach(sphere => {
            const pos = sphere.getPosition();
            const distFromScan = Math.abs(pos.y - this.scanY);
            const intensity = THREE.MathUtils.mapLinear(distFromScan, 0, this.scanWidth, 1.0, 0.3);
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                pos.x, pos.y - this.scanWidth, pos.z,
                pos.x, pos.y + this.scanWidth, pos.z
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.LineBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: intensity,
                linewidth: 2
            });
            
            const line = new THREE.Line(geometry, material);
            this.laserScanGroup.add(line);
        });
        
        // スキャンラインの高さに水平な円を描画（X-Z平面）
        const circleGeometry = new THREE.RingGeometry(0, 600.0, 64);
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.31,  // 80/255
            side: THREE.DoubleSide
        });
        const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
        circleMesh.position.set(0, this.scanY, 0);
        circleMesh.rotation.x = -Math.PI / 2;  // X-Z平面に配置
        this.laserScanGroup.add(circleMesh);
    }
    
    /**
     * 描画処理
     */
    render() {
        // SceneBaseのrenderメソッドを使用（色反転、glitch、chromaticAberrationを含む）
        super.render();
    }
    
    /**
     * カメラをランダムに切り替える（OSC用）
     */
    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        
        if (this.cameraParticles[this.currentCameraIndex]) {
            this.cameraParticles[this.currentCameraIndex].applyRandomForce();
        }
    }
    
    /**
     * 赤いsphereを発生
     */
    createRedSphere(velocity) {
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastSphereTime;
        
        // 位置を決定
        let position;
        let isFirstAfterInterval = false;  // 暫く間があいた後の最初のsphereかどうか
        
        if (this.lastSpherePosition) {
            // 前回の位置がある場合、時間間隔に応じて距離を決定
            // 間が開けば開くほど遠くに、近ければ近いほど近い位置でランダム
            // timeDiffが小さい（近い）→ 近い範囲でランダム
            // timeDiffが大きい（遠い）→ 遠い範囲でランダム
            const minTimeDiff = 0;      // 最小時間間隔（ms）
            const maxTimeDiff = 5000;   // 最大時間間隔（ms、これ以上は完全ランダム）
            const minDistance = 50.0;   // 最小距離（近い時）
            const maxDistance = 1000.0; // 最大距離（遠い時）
            
            let distance;
            if (timeDiff <= minTimeDiff) {
                // 時間間隔が0または負の場合は最小距離
                distance = minDistance;
            } else if (timeDiff >= maxTimeDiff) {
                // 時間間隔が最大値を超えた場合は完全ランダム
                position = new THREE.Vector3(
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000
                );
                isFirstAfterInterval = true;
            } else {
                // 時間間隔に応じて距離を線形補間
                const distanceFactor = THREE.MathUtils.mapLinear(timeDiff, minTimeDiff, maxTimeDiff, 0.0, 1.0);
                distance = THREE.MathUtils.lerp(minDistance, maxDistance, distanceFactor);
                
                // 前回の位置から指定距離内でランダムに配置
                // 球面上のランダムな方向を生成
                const theta = Math.random() * Math.PI * 2; // 方位角
                const phi = Math.acos(2 * Math.random() - 1); // 極角
                const randomDistance = Math.random() * distance; // 距離もランダムに
                
                const direction = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                );
                
                position = this.lastSpherePosition.clone().add(direction.multiplyScalar(randomDistance));
            }
            
            // 位置がまだ設定されていない場合（timeDiffがmaxTimeDiff未満の場合）
            if (!position) {
                // これは上記のelseブロックで既に設定されているはずだが、念のため
                const distanceFactor = THREE.MathUtils.mapLinear(timeDiff, minTimeDiff, maxTimeDiff, 0.0, 1.0);
                distance = THREE.MathUtils.lerp(minDistance, maxDistance, distanceFactor);
                
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const randomDistance = Math.random() * distance;
                
                const direction = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                );
                
                position = this.lastSpherePosition.clone().add(direction.multiplyScalar(randomDistance));
            }
        } else {
            // 前回の位置がない場合（最初のsphere）は完全ランダム
            position = new THREE.Vector3(
                (Math.random() - 0.5) * 1000,
                (Math.random() - 0.5) * 1000,
                (Math.random() - 0.5) * 1000
            );
            isFirstAfterInterval = true;
        }
        
        // ベロシティをHSLに変換（0-127 → 青(240度)から赤(0度)へ）
        let hue = THREE.MathUtils.mapLinear(velocity, 0, 127, 240, 0);
        if (hue < 0) hue += 360;  // 負の値の場合は360度を加算（Processingと同じ）
        // 鮮やかな赤にするため、彩度と明度を調整
        const saturation = 100.0;  // 彩度100%（最大鮮やかに）
        const lightness = 50.0;   // 明度50%（濃い赤）
        
        // デバッグ用ログ（ベロシティと色の対応を確認）
        console.log(`createRedSphere - velocity: ${velocity}, hue: ${hue}, saturation: ${saturation}, lightness: ${lightness}`);
        
        // 赤いsphereを作成（DOFエフェクト用にカメラを渡す）
        const redSphere = new Scene02_RedSphere(position, hue, saturation, lightness, this.scene, this.sphereGroup, this.useShaderRendering, this.sphereMaterial, this.camera);
        redSphere.createThreeObjects();
        this.redSpheres.push(redSphere);
        
        // sphere数が300を超えたら、次のトラック2でリセットするフラグを立てる
        if (this.redSpheres.length > 300) {
            this.shouldResetOnTrack2 = true;
            console.log(`Sphere count exceeded 300 (${this.redSpheres.length}), will reset on next Track 2`);
        }
        
        // 暫く間があいた後の最初のsphereの場合のみスコープを追加
        if (isFirstAfterInterval && this.SHOW_SCOPES) {
            const scope = new Scene02_Scope(position, this.renderer, this.camera);
            scope.createThreeObjects(this.scene);
            this.activeScopes.push(scope);
        }
        
        // 前回の位置とタイムを更新
        this.lastSpherePosition = position.clone();
        this.lastSphereTime = currentTime;
        
        // 黄色いsphereを周りに発生 - コメントアウト
        // this.createYellowSpheres(position);
        
        // 接続をチェック（トラック5が押されている間はスキップしてパフォーマンス向上）
        if (!this.key5Pressed) {
        this.checkNewConnections(redSphere);
    }
    }
    
    /**
     * 黄色いsphereを発生（赤いsphereと同じ位置で1つだけ）- コメントアウト
     */
    // createYellowSpheres(center) {
    //     const yellowSphere = new Scene02_YellowSphere(center, this.scene, this.sphereGroup, this.useShaderRendering, this.sphereMaterial);
    //     yellowSphere.createThreeObjects();
    //     this.yellowSpheres.push(yellowSphere);
    // }
    
    /**
     * 接続を更新
     */
    updateConnections() {
        this.connections = [];
        
        for (let i = 0; i < this.redSpheres.length; i++) {
            const fromSphere = this.redSpheres[i];
            
            for (let j = i + 1; j < this.redSpheres.length; j++) {
                const toSphere = this.redSpheres[j];
                const dist = fromSphere.getPosition().distanceTo(toSphere.getPosition());
                
                if (dist < this.NEIGHBOR_DISTANCE) {
                    this.connections.push(new Scene02_Connection(fromSphere, toSphere));
                }
            }
        }
    }
    
    /**
     * 新しい接続をチェック
     */
    checkNewConnections(newSphere) {
        let hasNewConnection = false;
        
        for (let i = 0; i < this.redSpheres.length; i++) {
            const otherSphere = this.redSpheres[i];
            if (otherSphere === newSphere) continue;
            
            const dist = newSphere.getPosition().distanceTo(otherSphere.getPosition());
            
            if (dist < this.NEIGHBOR_DISTANCE) {
                hasNewConnection = true;
                // スコープは暫く間があいた後の最初のsphereのみに表示するため、ここでは追加しない
                break;
            }
        }
    }
    
    /**
     * OSCメッセージのハンドリング（SceneBaseをオーバーライド）
     */
    handleOSC(message) {
        const trackNumber = message.trackNumber;
        
        // トラック2: 色反転エフェクトの処理後にリセットチェック
        if (trackNumber === 2) {
            // 親クラスのhandleOSCを呼ぶ（色反転エフェクトの処理）
            super.handleOSC(message);
            
            // sphere数が300を超えていたらリセット
            if (this.shouldResetOnTrack2) {
                this.shouldResetOnTrack2 = false;
                console.log('Track 2: Resetting due to sphere count exceeding 300');
                this.reset();
        }
            return;  // 処理済み
        }
        
        // その他は親クラスの処理を呼ぶ
        super.handleOSC(message);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1、2はSceneBaseで共通処理されているため、ここでは処理しない
        // if (trackNumber === 1) {
        //     this.switchCameraRandom();
        // }
        // if (trackNumber === 2) {
        //     // SceneBaseで色反転エフェクトを処理
        // }
        
        // トラック5: 赤いsphereを発生（サステイン開始）
        if (trackNumber === 5) {
            const noteNumber = args[0] || 64.0;  // ノート（MIDI）
            const velocity = args[1] || 127.0;  // ベロシティ（0-127）
            const durationMs = args[2] || 0.0;  // デュレーション（ms）
            console.log(`handleTrackNumber - trackNumber: ${trackNumber}, note: ${noteNumber}, velocity: ${velocity}, duration: ${durationMs}`);
            
            this.handleTrack5(velocity);
        }
    }
    
    /**
     * キーダウン処理（トラック5専用：接続チェックをスキップ）
     */
    handleKeyDown(trackNumber) {
        // 親クラスのhandleKeyDownを呼ぶ（トラック2の色反転など）
        super.handleKeyDown(trackNumber);
        
        // トラック5: 接続チェックをスキップするためフラグを設定
        if (trackNumber === 5) {
            this.key5Pressed = true;
            console.log('Track 5: Connection check disabled');
        }
    }
    
    /**
     * キーアップ処理（トラック5専用：接続チェックを再開）
     */
    handleKeyUp(trackNumber) {
        // 親クラスのhandleKeyUpを呼ぶ（トラック2の色反転など）
        super.handleKeyUp(trackNumber);
        
        // トラック5: 接続チェックを再開
        if (trackNumber === 5) {
            this.key5Pressed = false;
            console.log('Track 5: Connection check enabled');
            
            // キーが離された時に、既存のsphereの接続を再チェック
            this.redSpheres.forEach(sphere => {
                this.checkNewConnections(sphere);
            });
        }
    }
    
    /**
     * トラック5の処理（サステイン開始）
     */
    handleTrack5(velocity = 127.0) {
        this.key5Pressed = true;
        this.createRedSphere(velocity);
        
        // 生成されたsphereを記録
        if (this.redSpheres.length > 0) {
            this.growingSphere = this.redSpheres[this.redSpheres.length - 1];
            this.growingSphereScale = 1.0;
        }
        
        console.log('Track 5: Red sphere created');
    }
    
    /**
     * 5キーの状態を設定
     */
    setKey5Pressed(pressed) {
        this.key5Pressed = pressed;
    }
    
    /**
     * リセット処理（Rキーで呼ばれる）
     */
    reset() {
        super.reset(); // TIMEをリセット
        // すべてのsphereをクリア
        this.redSpheres.forEach(sphere => sphere.dispose(this.scene));
        // this.yellowSpheres.forEach(sphere => sphere.dispose(this.scene));  // 黄色いsphereをコメントアウト
        this.redSpheres = [];
        // this.yellowSpheres = [];  // 黄色いsphereをコメントアウト
        this.connections = [];
        
        // スコープをクリア
        this.activeScopes.forEach(scope => scope.dispose(this.scene));
        this.activeScopes = [];
        
        // 状態をリセット
        this.key5Pressed = false;
        this.growingSphere = null;
        this.growingSphereScale = 1.0;
        this.lastSpherePosition = null;
        this.lastSphereTime = 0;
        this.backgroundWhite = false;
        this.backgroundWhiteEndTime = 0;
        this.laserScanActive = false;
        this.scanY = this.scanStartY;
        
        // すべてのカメラパーティクルをリセット
        this.cameraParticles.forEach(cp => cp.reset());
        this.currentCameraIndex = 0;
        
        // グループをクリア
        this.sphereGroup.clear();
        this.lineGroup.clear();
        this.laserScanGroup.clear();
        
        // スコープ用の共有Canvasをクリア
        if (this.scopeCtx && this.scopeCanvas) {
            this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        }
        
        console.log('Scene02 reset');
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        // 親クラスのonResizeを呼ぶ（スクリーンショット用Canvasのリサイズ）
        super.onResize();
        
        // スコープ用の共有Canvasをリサイズ
        if (this.scopeCanvas) {
            this.scopeCanvas.width = window.innerWidth;
            this.scopeCanvas.height = window.innerHeight;
        }
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene02.dispose: クリーンアップ開始');
        
        // すべてのsphereを破棄
        this.redSpheres.forEach(sphere => {
            if (sphere.dispose) {
                sphere.dispose(this.scene);
            }
        });
        this.redSpheres = [];
        
        // 接続をクリア
        this.connections = [];
        
        // スコープを破棄
        this.activeScopes.forEach(scope => {
            if (scope.dispose) {
                scope.dispose(this.scene);
            }
        });
        this.activeScopes = [];
        
        // グループをクリア
        if (this.sphereGroup) {
            this.sphereGroup.clear();
            this.scene.remove(this.sphereGroup);
            this.sphereGroup = null;
        }
        if (this.lineGroup) {
            this.lineGroup.children.forEach(line => {
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this.lineGroup.clear();
            this.scene.remove(this.lineGroup);
            this.lineGroup = null;
        }
        if (this.laserScanGroup) {
            this.laserScanGroup.children.forEach(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this.laserScanGroup.clear();
            this.scene.remove(this.laserScanGroup);
            this.laserScanGroup = null;
        }
        
        // スコープ用Canvasを削除
        if (this.scopeCanvas && this.scopeCanvas.parentElement) {
            this.scopeCanvas.parentElement.removeChild(this.scopeCanvas);
            this.scopeCanvas = null;
            this.scopeCtx = null;
        }
        
        // シェーダーマテリアルを破棄
        if (this.sphereMaterial) {
            this.sphereMaterial.dispose();
            this.sphereMaterial = null;
        }
        if (this.lineMaterial) {
            this.lineMaterial.dispose();
            this.lineMaterial = null;
        }
        
        // すべてのライトを削除
        const lightsToRemove = [];
        this.scene.traverse((object) => {
            if (object instanceof THREE.Light) {
                lightsToRemove.push(object);
            }
        });
        lightsToRemove.forEach(light => {
            this.scene.remove(light);
            if (light.dispose) {
                light.dispose();
            }
        });
        
        console.log('Scene02.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}

