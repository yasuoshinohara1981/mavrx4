/**
 * GPU Cloth System
 * コンピュートシェーダーで布のシミュレーションを実装
 * スプリング計算を含む
 */

import * as THREE from 'three';

export class GPUClothSystem {
    constructor(renderer, gridSizeX, gridSizeZ, gridSpacing) {
        this.renderer = renderer;
        this.gridSizeX = gridSizeX;
        this.gridSizeZ = gridSizeZ;
        this.gridSpacing = gridSpacing;
        this.particleCount = gridSizeX * gridSizeZ;
        
        // テクスチャサイズ（グリッドサイズに合わせる）
        this.width = gridSizeX;
        this.height = gridSizeZ;
        
        // Ping-pongバッファ用のRenderTarget
        // position: x, y, z, mass
        // velocity: vx, vy, vz, unused
        this.positionRenderTargets = [];
        this.velocityRenderTargets = [];
        this.currentBuffer = 0;
        
        // 更新用シェーダーマテリアル
        this.updateMaterial = null;
        this.updateMesh = null;
        this.updateScene = null;
        this.updateCamera = null;
        
        // 描画用ジオメトリとマテリアル
        this.particleGeometry = null;
        this.particleMaterial = null;
        this.particleSystem = null;
        
        // 初期位置データ
        this.initialPositions = null;
        
        // パラメータ
        this.springStiffness = 0.2; // スプリング剛性を上げる（0.15 → 0.2）
        this.springDamping = 0.01; // 減衰を適度に保つ（0.005 → 0.01）
        this.restLength = gridSpacing;
        this.restoreStiffness = 0.001; // 復元力を上げる（0.00005 → 0.001）
        this.restoreDamping = 0.0005; // 復元減衰を上げる（0.0001 → 0.0005）
        this.gravity = new THREE.Vector3(0, -9.8, 0); // 重力を強くする（-3.5 → -9.8）
        this.groundY = -200.0; // Scene08の初期値に合わせる
        this.sphereRadius = 1.0; // パーティクルの半径
        
        // Boxの範囲（見えないBoxの境界）
        this.boxMin = new THREE.Vector3(-1000, -500, -1000);
        this.boxMax = new THREE.Vector3(1000, 500, 1000);
        
        // 下からの力（突き上げ）のリスト
        this.upwardForces = [];
        
        // 初期化（非同期）
        this.initPromise = this.init();
    }
    
    async init() {
        // RenderTargetを作成
        this.createRenderTargets();
        
        // シェーダーを作成
        this.createUpdateShader();
        
        // 描画用シェーダーを作成
        this.createRenderShader();
        
        // 初期データを設定
        this.initializeParticleData();
        
        // 描画用マテリアルに初期テクスチャを設定
        if (this.particleMaterial) {
            this.particleMaterial.uniforms.positionTexture.value = this.positionRenderTargets[0].texture;
            this.particleMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[0].texture;
            console.log('✅ GPU版: 描画用マテリアルにテクスチャを設定しました');
            console.log(`   位置テクスチャ: ${this.positionRenderTargets[0].texture ? 'OK' : 'NULL'}`);
            console.log(`   速度テクスチャ: ${this.velocityRenderTargets[0].texture ? 'OK' : 'NULL'}`);
        } else {
            console.error('❌ GPU版: 描画用マテリアルが存在しません');
        }
        
        console.log(`✅ GPU版: 初期化完了`);
        console.log(`   パーティクル数: ${this.particleCount}`);
        console.log(`   テクスチャサイズ: ${this.width}x${this.height}`);
        console.log(`   groundY: ${this.groundY}`);
        console.log(`   sphereRadius: ${this.sphereRadius}`);
    }
    
    /**
     * RenderTargetを作成（ping-pong用）
     */
    createRenderTargets() {
        const rtOptions = {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            generateMipmaps: false
        };
        
        // 位置用RenderTarget（ping-pong）
        this.positionRenderTargets[0] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        this.positionRenderTargets[1] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        // 速度用RenderTarget（ping-pong）
        this.velocityRenderTargets[0] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        this.velocityRenderTargets[1] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
    }
    
    /**
     * 更新用シェーダーを作成（スプリング計算を含む）
     */
    createUpdateShader() {
        // 更新用シーンとカメラを作成
        this.updateScene = new THREE.Scene();
        this.updateCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // 更新用シェーダーマテリアル
        this.updateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                velocityTexture: { value: null },
                initialPositionTexture: { value: null },
                deltaTime: { value: 0.0 },
                gridSizeX: { value: this.gridSizeX },
                gridSizeZ: { value: this.gridSizeZ },
                gridSpacing: { value: this.gridSpacing },
                springStiffness: { value: this.springStiffness },
                springDamping: { value: this.springDamping },
                restLength: { value: this.restLength },
                restoreStiffness: { value: this.restoreStiffness },
                restoreDamping: { value: this.restoreDamping },
                gravity: { value: this.gravity },
                groundY: { value: this.groundY },
                sphereRadius: { value: 1.0 },
                boxMin: { value: this.boxMin },
                boxMax: { value: this.boxMax },
                upwardForceCenter: { value: new THREE.Vector3(0, 0, 0) },
                upwardForceStrength: { value: 0.0 },
                upwardForceRadius: { value: 0.0 },
                forceCenter: { value: new THREE.Vector3(0, 0, 0) },
                forceStrength: { value: 0.0 },
                forceRadius: { value: 0.0 },
                outputType: { value: 0.0 } // 0.0 = 位置を出力, 1.0 = 速度を出力
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D positionTexture;
                uniform sampler2D velocityTexture;
                uniform sampler2D initialPositionTexture;
                uniform float deltaTime;
                uniform float gridSizeX;
                uniform float gridSizeZ;
                uniform float gridSpacing;
                uniform float springStiffness;
                uniform float springDamping;
                uniform float restLength;
                uniform float restoreStiffness;
                uniform float restoreDamping;
                uniform vec3 gravity;
                uniform float groundY;
                uniform float sphereRadius;
                uniform vec3 boxMin;
                uniform vec3 boxMax;
                uniform vec3 upwardForceCenter;
                uniform float upwardForceStrength;
                uniform float upwardForceRadius;
                uniform vec3 forceCenter;
                uniform float forceStrength;
                uniform float forceRadius;
                uniform float outputType; // 0.0 = 位置を出力, 1.0 = 速度を出力
                
                vec2 getUV(int x, int z) {
                    return vec2((float(x) + 0.5) / gridSizeX, (float(z) + 0.5) / gridSizeZ);
                }
                
                void main() {
                    // フラグメント座標からUVを計算
                    vec2 uv = gl_FragCoord.xy / vec2(gridSizeX, gridSizeZ);
                    // グリッド座標を計算（0からgridSizeX-1, 0からgridSizeZ-1）
                    int x = int(floor(gl_FragCoord.x));
                    int z = int(floor(gl_FragCoord.y));
                    
                    // 範囲チェック
                    if (x < 0 || x >= int(gridSizeX) || z < 0 || z >= int(gridSizeZ)) {
                        discard;
                        return;
                    }
                    
                    // 現在の位置と速度を取得
                    vec4 posData = texture2D(positionTexture, uv);
                    vec4 velData = texture2D(velocityTexture, uv);
                    vec3 position = posData.xyz;
                    float mass = posData.w;
                    vec3 velocity = velData.xyz;
                    
                    // 初期位置を取得
                    vec4 initialPosData = texture2D(initialPositionTexture, uv);
                    vec3 initialPosition = initialPosData.xyz;
                    
                    // 力を初期化
                    vec3 force = vec3(0.0);
                    
                    // スプリング力を計算（隣接パーティクルとの接続）
                    // 右隣（X+1）
                    if (x < int(gridSizeX) - 1) {
                        vec2 rightUV = getUV(x + 1, z);
                        vec4 rightPosData = texture2D(positionTexture, rightUV);
                        vec4 rightVelData = texture2D(velocityTexture, rightUV);
                        vec3 rightPos = rightPosData.xyz;
                        vec3 rightVel = rightVelData.xyz;
                        
                        vec3 diff = rightPos - position;
                        float dist = length(diff);
                        if (dist > 0.01) {
                            vec3 dir = normalize(diff);
                            float stretch = dist - restLength;
                            float springForce = stretch * springStiffness;
                            
                            vec3 velDiff = rightVel - velocity;
                            float dampingForce = dot(velDiff, dir) * springDamping;
                            
                            force += dir * (springForce + dampingForce);
                        }
                    }
                    
                    // 下隣（Z+1）
                    if (z < int(gridSizeZ) - 1) {
                        vec2 bottomUV = getUV(x, z + 1);
                        vec4 bottomPosData = texture2D(positionTexture, bottomUV);
                        vec4 bottomVelData = texture2D(velocityTexture, bottomUV);
                        vec3 bottomPos = bottomPosData.xyz;
                        vec3 bottomVel = bottomVelData.xyz;
                        
                        vec3 diff = bottomPos - position;
                        float dist = length(diff);
                        if (dist > 0.01) {
                            vec3 dir = normalize(diff);
                            float stretch = dist - restLength;
                            float springForce = stretch * springStiffness;
                            
                            vec3 velDiff = bottomVel - velocity;
                            float dampingForce = dot(velDiff, dir) * springDamping;
                            
                            force += dir * (springForce + dampingForce);
                        }
                    }
                    
                    // 右下対角線（X+1, Z+1）
                    if (x < int(gridSizeX) - 1 && z < int(gridSizeZ) - 1) {
                        vec2 diagonalUV = getUV(x + 1, z + 1);
                        vec4 diagonalPosData = texture2D(positionTexture, diagonalUV);
                        vec4 diagonalVelData = texture2D(velocityTexture, diagonalUV);
                        vec3 diagonalPos = diagonalPosData.xyz;
                        vec3 diagonalVel = diagonalVelData.xyz;
                        
                        vec3 diff = diagonalPos - position;
                        float dist = length(diff);
                        if (dist > 0.01) {
                            vec3 dir = normalize(diff);
                            float stretch = dist - restLength;
                            float springForce = stretch * springStiffness;
                            
                            vec3 velDiff = diagonalVel - velocity;
                            float dampingForce = dot(velDiff, dir) * springDamping;
                            
                            force += dir * (springForce + dampingForce);
                        }
                    }
                    
                    // 左下対角線（X-1, Z+1）
                    if (x > 0 && z < int(gridSizeZ) - 1) {
                        vec2 diagonalUV = getUV(x - 1, z + 1);
                        vec4 diagonalPosData = texture2D(positionTexture, diagonalUV);
                        vec4 diagonalVelData = texture2D(velocityTexture, diagonalUV);
                        vec3 diagonalPos = diagonalPosData.xyz;
                        vec3 diagonalVel = diagonalVelData.xyz;
                        
                        vec3 diff = diagonalPos - position;
                        float dist = length(diff);
                        if (dist > 0.01) {
                            vec3 dir = normalize(diff);
                            float stretch = dist - restLength;
                            float springForce = stretch * springStiffness;
                            
                            vec3 velDiff = diagonalVel - velocity;
                            float dampingForce = dot(velDiff, dir) * springDamping;
                            
                            force += dir * (springForce + dampingForce);
                        }
                    }
                    
                    // 復元力
                    vec3 restoreDiff = initialPosition - position;
                    float restoreDist = length(restoreDiff);
                    if (restoreDist > 0.01) {
                        vec3 restoreDir = normalize(restoreDiff);
                        float restoreForce = restoreDist * restoreStiffness;
                        float restoreDampingForce = dot(velocity, restoreDir) * restoreDamping;
                        force += restoreDir * (restoreForce + restoreDampingForce);
                    }
                    
                    // 重力
                    force += gravity;
                    
                    // 下からの力（突き上げ）
                    if (upwardForceRadius > 0.0) {
                        vec3 toParticle = position - upwardForceCenter;
                        float distance = length(toParticle);
                        if (distance < upwardForceRadius && distance > 0.1) {
                            float normalizedDist = distance / upwardForceRadius;
                            float localForceStrength = upwardForceStrength * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                            vec3 upwardDir = vec3(0.0, 1.0, 0.0); // 上方向
                            force += upwardDir * localForceStrength;
                        }
                    }
                    
                    // 上からの力（外側への力）
                    if (forceRadius > 0.0) {
                        vec3 toParticle = position - forceCenter;
                        float distance = length(toParticle);
                        if (distance < forceRadius && distance > 0.1) {
                            float normalizedDist = distance / forceRadius;
                            float localForceStrength = forceStrength * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                            vec3 forceDir = normalize(toParticle); // 外側への方向
                            force += forceDir * localForceStrength;
                        }
                    }
                    
                    // 加速度を計算
                    vec3 acceleration = force / max(mass, 0.001);
                    
                    // 速度を更新
                    velocity += acceleration * deltaTime;
                    
                    // 最大速度を制限（動きを増やすため、最大速度を上げる）
                    float maxSpeed = 50.0; // 30.0 → 50.0
                    if (length(velocity) > maxSpeed) {
                        velocity = normalize(velocity) * maxSpeed;
                    }
                    
                    // 位置を更新
                    position += velocity * deltaTime;
                    
                    // Boxの範囲制限（見えないBoxの境界）
                    if (position.x < boxMin.x) {
                        position.x = boxMin.x;
                        velocity.x *= -0.5; // 反発
                    } else if (position.x > boxMax.x) {
                        position.x = boxMax.x;
                        velocity.x *= -0.5;
                    }
                    
                    if (position.y < boxMin.y) {
                        position.y = boxMin.y;
                        velocity.y *= -0.5; // 下から突き上げられる
                    } else if (position.y > boxMax.y) {
                        position.y = boxMax.y;
                        velocity.y *= -0.5; // 上から押し下げられる
                    }
                    
                    if (position.z < boxMin.z) {
                        position.z = boxMin.z;
                        velocity.z *= -0.5;
                    } else if (position.z > boxMax.z) {
                        position.z = boxMax.z;
                        velocity.z *= -0.5;
                    }
                    
                    // 地面との衝突判定（Boxの範囲内で）
                    if (position.y <= groundY + sphereRadius) {
                        position.y = groundY + sphereRadius;
                        if (velocity.y < 0.0) {
                            velocity.y *= -0.2;
                        }
                        velocity.xz *= 0.95;
                    }
                    
                    // 摩擦を適用（動きを増やすため、摩擦を下げる）
                    velocity *= 0.998; // 0.995 → 0.998（摩擦を下げる）
                    
                    // 出力タイプに応じて位置または速度を出力
                    if (outputType < 0.5) {
                        // 位置を出力（x, y, z, mass）
                        gl_FragColor = vec4(position, mass);
                    } else {
                        // 速度を出力（vx, vy, vz, unused）
                        gl_FragColor = vec4(velocity, 0.0);
                    }
                }
            `
        });
        
        // 更新用メッシュを作成
        const updateGeometry = new THREE.PlaneGeometry(2, 2);
        this.updateMesh = new THREE.Mesh(updateGeometry, this.updateMaterial);
        this.updateScene.add(this.updateMesh);
    }
    
    /**
     * 描画用シェーダーを作成
     */
    createRenderShader() {
        // パーティクルジオメトリを作成
        // GPU版では、位置はシェーダーでテクスチャから読み取るため、ここではUVのみ設定
        const uvs = new Float32Array(this.particleCount * 2);
        const indices = new Uint16Array(this.particleCount);
        
        for (let z = 0; z < this.height; z++) {
            for (let x = 0; x < this.width; x++) {
                const index = z * this.width + x;
                const uvX = (x + 0.5) / this.width;
                const uvY = (z + 0.5) / this.height;
                
                uvs[index * 2] = uvX;
                uvs[index * 2 + 1] = uvY;
                indices[index] = index;
            }
        }
        
        this.particleGeometry = new THREE.BufferGeometry();
        // 位置はシェーダーでテクスチャから読み取るため、ダミーの位置を設定
        const positions = new Float32Array(this.particleCount * 3);
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('particleUv', new THREE.BufferAttribute(uvs, 2));
        this.particleGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        
        // 描画用マテリアル
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                velocityTexture: { value: null },
                sphereRadius: { value: 1.0 },
                width: { value: this.width },
                height: { value: this.height },
                heatMapMinValue: { value: 0.0 },
                heatMapMaxValue: { value: 8.0 }
            },
            vertexShader: `
                uniform sampler2D positionTexture;
                uniform sampler2D velocityTexture;
                uniform float sphereRadius;
                uniform float width;
                uniform float height;
                attribute vec2 particleUv;
                varying vec3 vColor;
                varying vec3 vPosition;
                
                void main() {
                    // UV座標をピクセル中心に調整（境界の問題を防ぐため、clampを使用）
                    float u = clamp((floor(particleUv.x * width) + 0.5) / width, 0.0, 1.0);
                    float v = clamp((floor(particleUv.y * height) + 0.5) / height, 0.0, 1.0);
                    vec2 pixelUv = vec2(u, v);
                    
                    vec4 posData = texture2D(positionTexture, pixelUv);
                    vec4 velData = texture2D(velocityTexture, pixelUv);
                    vec3 position = posData.xyz;
                    vec3 velocity = velData.xyz;
                    
                    // デバッグ: 位置が正しく読み取れているか確認（位置が0,0,0の場合は問題あり）
                    // if (length(position) < 0.1) {
                    //     position = vec3(0.0, 0.0, 0.0); // 原点に配置してテスト
                    // }
                    
                    vPosition = position;
                    
                    // ヒートマップの色を計算（速度に基づく）
                    float speed = length(velocity);
                    // 速度を0.0-8.0の範囲で正規化
                    float normalizedSpeed = clamp(speed / 8.0, 0.0, 1.0);
                    
                    // 青 → シアン → 緑 → 黄 → 赤（CPU版と同じ色計算）
                    vec3 color;
                    if (normalizedSpeed < 0.15) {
                        // 青からシアンへ（速度が低い）
                        float t = normalizedSpeed / 0.15;
                        color = vec3(0.0, t * 0.5, 1.0);
                    } else if (normalizedSpeed < 0.35) {
                        // シアンから緑へ
                        float t = (normalizedSpeed - 0.15) / 0.2;
                        color = vec3(0.0, 0.5 + t * 0.5, 1.0 - t);
                    } else if (normalizedSpeed < 0.6) {
                        // 緑から黄へ
                        float t = (normalizedSpeed - 0.35) / 0.25;
                        color = vec3(t, 1.0, 0.0);
                    } else {
                        // 黄から赤へ（速度が高い）
                        float t = (normalizedSpeed - 0.6) / 0.4;
                        color = vec3(1.0, 1.0 - t, 0.0);
                    }
                    
                    vColor = color;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    // パーティクルサイズを計算（最小サイズを確保）
                    float pointSize = sphereRadius * 2.0 * (300.0 / max(-mvPosition.z, 0.1));
                    gl_PointSize = max(pointSize, 2.0); // 最小サイズを2.0に設定
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying vec3 vPosition;
                
                void main() {
                    float dist = distance(gl_PointCoord, vec2(0.5));
                    if (dist > 0.5) discard;
                    float alpha = 1.0 - (dist * 2.0);
                    // デバッグ: 色が正しく設定されているか確認（一時的に固定色を使用）
                    // gl_FragColor = vec4(1.0, 0.0, 0.0, alpha); // 赤色でテスト
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // パーティクルシステムを作成
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    }
    
    /**
     * 初期パーティクルデータを設定
     */
    initializeParticleData() {
        const dataSize = this.width * this.height * 4;
        const positionData = new Float32Array(dataSize);
        const velocityData = new Float32Array(dataSize);
        const initialPositionData = new Float32Array(dataSize);
        
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        for (let z = 0; z < this.height; z++) {
            for (let x = 0; x < this.width; x++) {
                const index = (z * this.width + x) * 4;
                
                const gridX = -gridWidth / 2 + x * this.gridSpacing;
                const gridZ = -gridDepth / 2 + z * this.gridSpacing;
                const y = this.groundY + this.sphereRadius;
                
                // デバッグ: 最初の数個のパーティクルの位置を確認
                if (x === 0 && z === 0) {
                    console.log(`GPU版: 最初のパーティクル位置 - (${gridX.toFixed(1)}, ${y.toFixed(1)}, ${gridZ.toFixed(1)})`);
                    console.log(`   groundY: ${this.groundY}, sphereRadius: ${this.sphereRadius}`);
                }
                
                // 位置データ（x, y, z, mass）
                positionData[index] = gridX;
                positionData[index + 1] = y;
                positionData[index + 2] = gridZ;
                positionData[index + 3] = 1.0; // mass
                
                // 速度データ（vx, vy, vz, unused）
                velocityData[index] = 0.0;
                velocityData[index + 1] = 0.0;
                velocityData[index + 2] = 0.0;
                velocityData[index + 3] = 0.0;
                
                // 初期位置データ
                initialPositionData[index] = gridX;
                initialPositionData[index + 1] = y;
                initialPositionData[index + 2] = gridZ;
                initialPositionData[index + 3] = 0.0;
            }
        }
        
        // 初期テクスチャを作成
        const positionTexture = new THREE.DataTexture(
            positionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        positionTexture.needsUpdate = true;
        
        const velocityTexture = new THREE.DataTexture(
            velocityData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        velocityTexture.needsUpdate = true;
        
        const initialPositionTexture = new THREE.DataTexture(
            initialPositionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        initialPositionTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        this.renderer.setRenderTarget(this.positionRenderTargets[0]);
        this.renderer.clear();
        const tempMaterial = new THREE.MeshBasicMaterial({ map: positionTexture });
        const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial);
        const tempScene = new THREE.Scene();
        tempScene.add(tempMesh);
        this.renderer.render(tempScene, this.updateCamera);
        
        this.renderer.setRenderTarget(this.velocityRenderTargets[0]);
        this.renderer.clear();
        tempMaterial.map = velocityTexture;
        this.renderer.render(tempScene, this.updateCamera);
        
        this.updateMaterial.uniforms.initialPositionTexture.value = initialPositionTexture;
        
        this.renderer.setRenderTarget(null);
        
        // 描画用マテリアルにテクスチャを設定
        if (this.particleMaterial) {
            this.particleMaterial.uniforms.positionTexture.value = this.positionRenderTargets[0].texture;
            this.particleMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[0].texture;
        }
    }
    
    /**
     * 更新処理
     */
    update(deltaTime, activeUpwardForces = [], activeForces = []) {
        if (!this.updateMaterial || !this.updateMesh) return;
        
        // アクティブな力を更新
        const currentTime = Date.now();
        let currentUpwardForce = null;
        let currentUpwardForceStrength = 0.0;
        let currentUpwardForceRadius = 0.0;
        let currentUpwardForceCenter = new THREE.Vector3(0, 0, 0);
        
        // 最新の下からの力を取得
        for (const forceData of activeUpwardForces) {
            if (currentTime < forceData.endTime) {
                const progress = (currentTime - forceData.startTime) / (forceData.endTime - forceData.startTime);
                const timeStrength = 1.0 - progress;
                currentUpwardForce = forceData;
                currentUpwardForceStrength = forceData.strength * timeStrength;
                currentUpwardForceRadius = forceData.radius;
                currentUpwardForceCenter = forceData.center;
                break; // 最新のもののみ使用
            }
        }
        
        // 最新の上からの力を取得
        let currentForce = null;
        let currentForceStrength = 0.0;
        let currentForceRadius = 0.0;
        let currentForceCenter = new THREE.Vector3(0, 0, 0);
        
        for (const forceData of activeForces) {
            if (currentTime < forceData.endTime) {
                const progress = (currentTime - forceData.startTime) / (forceData.endTime - forceData.startTime);
                const timeStrength = 1.0 - progress;
                currentForce = forceData;
                currentForceStrength = forceData.strength * timeStrength;
                currentForceRadius = forceData.radius;
                currentForceCenter = forceData.center;
                break; // 最新のもののみ使用
            }
        }
        
        // uniformを更新
        this.updateMaterial.uniforms.deltaTime.value = deltaTime;
        this.updateMaterial.uniforms.positionTexture.value = this.positionRenderTargets[this.currentBuffer].texture;
        this.updateMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[this.currentBuffer].texture;
        this.updateMaterial.uniforms.upwardForceCenter.value = currentUpwardForceCenter;
        this.updateMaterial.uniforms.upwardForceStrength.value = currentUpwardForceStrength;
        this.updateMaterial.uniforms.upwardForceRadius.value = currentUpwardForceRadius;
        this.updateMaterial.uniforms.forceCenter.value = currentForceCenter;
        this.updateMaterial.uniforms.forceStrength.value = currentForceStrength;
        this.updateMaterial.uniforms.forceRadius.value = currentForceRadius;
        
        // 次のバッファに書き込む
        const nextBuffer = 1 - this.currentBuffer;
        
        // 位置を更新（outputType = 0.0）
        this.updateMaterial.uniforms.outputType.value = 0.0;
        this.renderer.setRenderTarget(this.positionRenderTargets[nextBuffer]);
        this.renderer.render(this.updateScene, this.updateCamera);
        
        // 速度を更新（outputType = 1.0）
        this.updateMaterial.uniforms.outputType.value = 1.0;
        this.renderer.setRenderTarget(this.velocityRenderTargets[nextBuffer]);
        this.renderer.render(this.updateScene, this.updateCamera);
        
        // バッファを切り替え
        this.currentBuffer = nextBuffer;
        
        // 描画用マテリアルにテクスチャを設定
        if (this.particleMaterial) {
            this.particleMaterial.uniforms.positionTexture.value = this.positionRenderTargets[this.currentBuffer].texture;
            this.particleMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[this.currentBuffer].texture;
            // テクスチャが正しく設定されているか確認（最初の数回のみログ出力）
            if (Math.random() < 0.01) { // 1%の確率でログ出力（パフォーマンスへの影響を最小化）
                console.log(`GPU版: テクスチャ更新 - 位置: ${this.positionRenderTargets[this.currentBuffer].texture ? 'OK' : 'NULL'}, 速度: ${this.velocityRenderTargets[this.currentBuffer].texture ? 'OK' : 'NULL'}`);
            }
        }
        
        this.renderer.setRenderTarget(null);
    }
    
    /**
     * 力を加える
     */
    applyForce(center, strength, radius) {
        // TODO: GPU側で力を加える処理を実装
        // 現在はCPU側で処理する必要がある
    }
    
    /**
     * パーティクルシステムを取得
     */
    getParticleSystem() {
        return this.particleSystem;
    }
    
    /**
     * 接続情報を取得（線の描画用）
     */
    getConnections() {
        const connections = [];
        // 各パーティクルに対して、隣接するパーティクルを接続
        for (let z = 0; z < this.height; z++) {
            for (let x = 0; x < this.width; x++) {
                const index = z * this.width + x;
                
                // 右隣（X+1）
                if (x < this.width - 1) {
                    const rightIndex = z * this.width + (x + 1);
                    connections.push({ from: index, to: rightIndex });
                }
                
                // 下隣（Z+1）
                if (z < this.height - 1) {
                    const bottomIndex = (z + 1) * this.width + x;
                    connections.push({ from: index, to: bottomIndex });
                }
                
                // 右下対角線（X+1, Z+1）
                if (x < this.width - 1 && z < this.height - 1) {
                    const diagonalIndex = (z + 1) * this.width + (x + 1);
                    connections.push({ from: index, to: diagonalIndex });
                }
                
                // 左下対角線（X-1, Z+1）
                if (x > 0 && z < this.height - 1) {
                    const diagonalIndex = (z + 1) * this.width + (x - 1);
                    connections.push({ from: index, to: diagonalIndex });
                }
            }
        }
        return connections;
    }
    
    /**
     * 位置テクスチャから位置を読み取る（線の描画用）
     */
    readPositionFromTexture(x, z) {
        // テクスチャから位置を読み取る（CPU側で実行）
        // 注意: これは非効率的なので、線の更新頻度を下げる必要がある
        const texture = this.positionRenderTargets[this.currentBuffer].texture;
        if (!texture) return null;
        
        // WebGLのreadPixelsを使用してテクスチャから読み取る
        // ただし、これは非効率的なので、線の更新は低頻度にする
        return null; // 実装は後で
    }
    
    /**
     * 破棄
     */
    dispose() {
        // RenderTargetを破棄
        this.positionRenderTargets.forEach(rt => rt.dispose());
        this.velocityRenderTargets.forEach(rt => rt.dispose());
        
        // ジオメトリとマテリアルを破棄
        if (this.particleGeometry) this.particleGeometry.dispose();
        if (this.particleMaterial) this.particleMaterial.dispose();
        if (this.updateMaterial) this.updateMaterial.dispose();
    }
}

