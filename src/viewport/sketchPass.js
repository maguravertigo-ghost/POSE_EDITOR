import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tGuides;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uLineWidth;
uniform float uThreshold;
uniform float uToneStrength;
uniform float uHatchDensity;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform float uShowGuides;
uniform int uMode; // 1 = pure contour, 2 = contour + tone/hatching

varying vec2 vUv;

float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float sobelDepth(vec2 uv, vec2 texel) {
    float d00 = linearizeDepth(texture2D(tDepth, uv + vec2(-1.0, -1.0) * texel).r);
    float d10 = linearizeDepth(texture2D(tDepth, uv + vec2( 0.0, -1.0) * texel).r);
    float d20 = linearizeDepth(texture2D(tDepth, uv + vec2( 1.0, -1.0) * texel).r);
    float d01 = linearizeDepth(texture2D(tDepth, uv + vec2(-1.0,  0.0) * texel).r);
    float d21 = linearizeDepth(texture2D(tDepth, uv + vec2( 1.0,  0.0) * texel).r);
    float d02 = linearizeDepth(texture2D(tDepth, uv + vec2(-1.0,  1.0) * texel).r);
    float d12 = linearizeDepth(texture2D(tDepth, uv + vec2( 0.0,  1.0) * texel).r);
    float d22 = linearizeDepth(texture2D(tDepth, uv + vec2( 1.0,  1.0) * texel).r);

    float gx = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
    float gy = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
    float minD = min(min(min(d00, d20), min(d02, d22)), linearizeDepth(texture2D(tDepth, uv).r));
    return sqrt(gx * gx + gy * gy) / max(0.35, minD);
}

float sobelNormal(vec2 uv, vec2 texel) {
    vec3 n00 = texture2D(tNormal, uv + vec2(-1.0, -1.0) * texel).rgb;
    vec3 n10 = texture2D(tNormal, uv + vec2( 0.0, -1.0) * texel).rgb;
    vec3 n20 = texture2D(tNormal, uv + vec2( 1.0, -1.0) * texel).rgb;
    vec3 n01 = texture2D(tNormal, uv + vec2(-1.0,  0.0) * texel).rgb;
    vec3 n21 = texture2D(tNormal, uv + vec2( 1.0,  0.0) * texel).rgb;
    vec3 n02 = texture2D(tNormal, uv + vec2(-1.0,  1.0) * texel).rgb;
    vec3 n12 = texture2D(tNormal, uv + vec2( 0.0,  1.0) * texel).rgb;
    vec3 n22 = texture2D(tNormal, uv + vec2( 1.0,  1.0) * texel).rgb;

    vec3 gx = -n00 - 2.0 * n01 - n02 + n20 + 2.0 * n21 + n22;
    vec3 gy = -n00 - 2.0 * n10 - n20 + n02 + 2.0 * n12 + n22;
    return length(gx) + length(gy);
}

void main() {
    vec2 texel = uLineWidth / max(uResolution, vec2(1.0));
    float rawDepth = texture2D(tDepth, vUv).r;
    float isGeo = step(rawDepth, 0.9999);

    float dEdge = sobelDepth(vUv, texel) * 2.1;
    float nEdge = sobelNormal(vUv, texel) * 0.42;
    float edgeVal = max(dEdge, nEdge);

    float line = smoothstep(uThreshold * 0.55, uThreshold * 1.12, edgeVal);

    vec3 baseCol = uPaperColor;
    if (isGeo > 0.5 && uMode == 2) {
        vec4 col = texture2D(tColor, vUv);
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

        // Clean 2-tone mannequin shading + subtle diagonal shading in deeper shadows
        float shade = 1.0;
        if (lum < 0.72) shade = 0.91;
        if (lum < 0.54) shade = 0.82;
        if (lum < 0.36) shade = 0.72;

        vec2 frag = gl_FragCoord.xy;
        float h1 = abs(sin((frag.x + frag.y) * uHatchDensity));
        float hatch = 1.0;
        if (lum < 0.42) {
            hatch = mix(1.0, 0.86 + 0.14 * smoothstep(0.05, 0.35, h1), 0.50);
        }

        float toneFactor = mix(1.0, shade * hatch, uToneStrength);
        baseCol = uPaperColor * toneFactor;
    }

    if (uShowGuides > 0.5) {
        float gLum = dot(texture2D(tGuides, vUv).rgb, vec3(0.3333));
        float guideLine = 1.0 - smoothstep(0.45, 0.96, gLum);
        baseCol = mix(baseCol, uInkColor, guideLine * 0.42);
    }

    vec3 finalCol = mix(baseCol, uInkColor, line);
    gl_FragColor = vec4(finalCol, 1.0);
}
`;

export class SketchRenderer {
    constructor(renderer) {
        this.renderer = renderer;

        this.settings = {
            mode: '3d', // '3d' | 'sketch-line' | 'sketch-tone'
            lineWidth: 1.25,
            threshold: 0.42,
            toneStrength: 0.65,
            hatchDensity: 0.55,
            paper: 'white', // 'white' | 'warm'
            ink: 'charcoal', // 'charcoal' | 'violet' | 'pink' | 'blue'
            hideHelpersInSketch: true
        };

        this.colorTarget = this._createTarget(true);
        this.normalTarget = this._createTarget(false);
        this.guideTarget = this._createTarget(false);

        this.normalMaterial = new THREE.MeshNormalMaterial();
        this.whiteDepthMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.quadScene = new THREE.Scene();
        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.uniforms = {
            tColor: { value: this.colorTarget.texture },
            tNormal: { value: this.normalTarget.texture },
            tDepth: { value: this.colorTarget.depthTexture },
            tGuides: { value: this.guideTarget.texture },
            uResolution: { value: new THREE.Vector2(800, 600) },
            uNear: { value: 0.05 },
            uFar: { value: 100.0 },
            uLineWidth: { value: this.settings.lineWidth },
            uThreshold: { value: this.settings.threshold },
            uToneStrength: { value: this.settings.toneStrength },
            uHatchDensity: { value: this.settings.hatchDensity },
            uPaperColor: { value: new THREE.Color(0xffffff) },
            uInkColor: { value: new THREE.Color(0x181b22) },
            uShowGuides: { value: 1.0 },
            uMode: { value: 2 }
        };

        this.quadMat = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: this.uniforms,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });

        this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat);
        this.quadMesh.frustumCulled = false;
        this.quadScene.add(this.quadMesh);
    }

    _createTarget(withDepth) {
        const params = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };
        const target = new THREE.WebGLRenderTarget(512, 512, params);
        if (withDepth) {
            target.depthTexture = new THREE.DepthTexture(512, 512);
            target.depthTexture.format = THREE.DepthFormat;
            target.depthTexture.type = THREE.UnsignedIntType;
        }
        return target;
    }

    setSize(width, height) {
        const w = Math.max(2, Math.floor(width));
        const h = Math.max(2, Math.floor(height));
        if (this.colorTarget.width !== w || this.colorTarget.height !== h) {
            this.colorTarget.setSize(w, h);
            if (this.colorTarget.depthTexture) {
                this.colorTarget.depthTexture.image.width = w;
                this.colorTarget.depthTexture.image.height = h;
                this.colorTarget.depthTexture.needsUpdate = true;
            }
            this.normalTarget.setSize(w, h);
            this.guideTarget.setSize(w, h);
        }
        this.uniforms.uResolution.value.set(w, h);
    }

    preparePasses(scene, camera, options = {}) {
        const mode = options.forceMode || this.settings.mode;
        const targetW = options.targetWidth || this.colorTarget.width;
        const targetH = options.targetHeight || this.colorTarget.height;
        this.setSize(targetW, targetH);

        const paperHex = this.settings.paper === 'warm' ? 0xf4efe4 : 0xffffff;
        const inkMap = {
            charcoal: 0x181b22,
            violet: 0x5c3572,
            pink: 0xd4337f,
            blue: 0x2c559c
        };
        this.uniforms.uPaperColor.value.setHex(paperHex);
        this.uniforms.uInkColor.value.setHex(inkMap[this.settings.ink] || 0x181b22);
        this.uniforms.uLineWidth.value = this.settings.lineWidth;
        this.uniforms.uThreshold.value = this.settings.threshold;
        this.uniforms.uToneStrength.value = this.settings.toneStrength;
        this.uniforms.uHatchDensity.value = this.settings.hatchDensity;
        this.uniforms.uNear.value = camera.near;
        this.uniforms.uFar.value = camera.far;
        this.uniforms.uShowGuides.value = options.showGuides ? 1.0 : 0.0;
        this.uniforms.uMode.value = mode === 'sketch-line' ? 1 : 2;

        const prevBg = scene.background;
        const prevScissorTest = this.renderer.getScissorTest();
        this.renderer.setScissorTest(false);

        const hiddenRestore = [];
        const hideHelpers = options.hideHelpers ?? this.settings.hideHelpersInSketch;

        if (options.helperObjects) {
            for (const obj of options.helperObjects) {
                if (obj && obj.visible && hideHelpers) {
                    hiddenRestore.push(obj);
                    obj.visible = false;
                }
            }
        }
        if (options.floorMesh && options.floorMesh.visible) {
            hiddenRestore.push(options.floorMesh);
            options.floorMesh.visible = false;
        }
        if (options.guideObjects) {
            for (const g of options.guideObjects) {
                if (g) g.visible = false;
            }
        }

        // 1. Color + Depth pass (meshes only)
        scene.background = new THREE.Color(0xffffff);
        this.renderer.setRenderTarget(this.colorTarget);
        this.renderer.clear();
        this.renderer.render(scene, camera);

        // 2. Normal pass (meshes only)
        scene.background = new THREE.Color(0x8080ff);
        const prevOverride = scene.overrideMaterial;
        scene.overrideMaterial = this.normalMaterial;
        this.renderer.setRenderTarget(this.normalTarget);
        this.renderer.clear();
        this.renderer.render(scene, camera);
        scene.overrideMaterial = prevOverride;

        // 3. Depth-occluded construction guide lines pass (white background + white depth-writing meshes + dark guide lines)
        if (options.showGuides && options.guideObjects && options.guideObjects.length) {
            const meshRestores = [];
            scene.traverse((obj) => {
                if (obj.isMesh && obj.visible) {
                    meshRestores.push({ obj, mat: obj.material });
                    obj.material = this.whiteDepthMaterial;
                }
            });
            for (const g of options.guideObjects) {
                if (g) g.visible = true;
            }
            scene.background = new THREE.Color(0xffffff);
            this.renderer.setRenderTarget(this.guideTarget);
            this.renderer.clear();
            this.renderer.render(scene, camera);

            for (const item of meshRestores) item.obj.material = item.mat;
            for (const g of options.guideObjects) {
                if (g) g.visible = false;
            }
        }

        scene.background = prevBg;
        for (const obj of hiddenRestore) obj.visible = true;
        this.renderer.setScissorTest(prevScissorTest);
    }

    render(scene, camera, options = {}) {
        const mode = options.forceMode || this.settings.mode;
        if (mode === '3d') {
            if (options.guideObjects) {
                for (const g of options.guideObjects) {
                    if (g) g.visible = false;
                }
            }
            this.renderer.setRenderTarget(null);
            this.renderer.render(scene, camera);
            return;
        }

        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        this.preparePasses(scene, camera, {
            ...options,
            targetWidth: size.x,
            targetHeight: size.y
        });

        this.renderer.setRenderTarget(options.outputTarget || null);
        this.renderer.render(this.quadScene, this.quadCamera);
    }

    renderQuadToRect(scene, camera, cssX, cssYBottom, cssW, cssH, options = {}) {
        const pr = this.renderer.getPixelRatio();
        const prevAspect = camera.aspect;
        camera.aspect = cssW / Math.max(1, cssH);
        camera.updateProjectionMatrix();

        this.preparePasses(scene, camera, {
            ...options,
            targetWidth: Math.max(4, Math.floor(cssW * pr)),
            targetHeight: Math.max(4, Math.floor(cssH * pr)),
            hideHelpers: true
        });

        camera.aspect = prevAspect;
        camera.updateProjectionMatrix();

        this.renderer.setRenderTarget(null);
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(cssX, cssYBottom, cssW, cssH);
        this.renderer.setScissor(cssX, cssYBottom, cssW, cssH);
        this.renderer.render(this.quadScene, this.quadCamera);
        this.renderer.setScissorTest(false);
    }

    exportFrameDataURL(scene, camera, options = {}) {
        const w = options.width || 1600;
        const h = options.height || 1200;
        const prevSize = new THREE.Vector2();
        this.renderer.getSize(prevSize);
        const prevPR = this.renderer.getPixelRatio();
        const prevAspect = camera.aspect;

        this.renderer.setPixelRatio(1);
        this.renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        this.render(scene, camera, {
            ...options,
            hideHelpers: true,
            outputTarget: null
        });

        const dataUrl = this.renderer.domElement.toDataURL('image/png');

        this.renderer.setPixelRatio(prevPR);
        this.renderer.setSize(prevSize.x, prevSize.y, false);
        camera.aspect = prevAspect;
        camera.updateProjectionMatrix();
        return dataUrl;
    }

    dispose() {
        this.colorTarget.dispose();
        this.normalTarget.dispose();
        this.guideTarget.dispose();
        this.normalMaterial.dispose();
        this.whiteDepthMaterial.dispose();
        this.quadMat.dispose();
        this.quadMesh.geometry.dispose();
    }
}
