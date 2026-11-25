import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { SketchRenderer } from './sketchPass.js';

export class SceneManager {
    constructor(canvas, container) {
        this.canvas = canvas;
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x161922);

        this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
        this.camera.position.set(1.3, 1.35, 2.75);

        this.orbit = new OrbitControls(this.camera, canvas);
        this.orbit.target.set(0, 0.92, 0);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.08;
        this.orbit.minDistance = 0.45;
        this.orbit.maxDistance = 16;
        this.orbit.update();

        this.transform = new TransformControls(this.camera, canvas);
        this.transform.setMode('rotate');
        this.transform.setSpace('local');
        this.transform.setSize(0.75);
        this.transformHelper = this.transform.getHelper();
        this.scene.add(this.transformHelper);

        this.isDraggingGizmo = false;
        this.transform.addEventListener('dragging-changed', (e) => {
            this.isDraggingGizmo = e.value;
            this.orbit.enabled = !e.value;
            if (!e.value && this.onTransformEnd) {
                this.onTransformEnd();
            }
        });
        this.transform.addEventListener('objectChange', () => {
            if (this.onTransformChange) {
                this.onTransformChange(this.transform.object);
            }
        });

        this._setupLights();
        this._setupGround();

        this.sketch = new SketchRenderer(this.renderer);
        this.helperObjects = [this.grid, this.transformHelper];
        this.bgTexture = null;
        this.pip = { enabled: true, mode: 'sketch-tone', viewportEl: null };

        this.quadView = false;
        this.orthoZoom = 1.15;
        this.orthoCenters = {
            front: new THREE.Vector3(0, 0.92, 0),
            side: new THREE.Vector3(0, 0.92, 0),
            top: new THREE.Vector3(0, 0, 0)
        };
        this.orthoFront = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
        this.orthoSide = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
        this.orthoTop = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
        this._updateOrthoCameras();

        this.onTransformChange = null;
        this.onTransformEnd = null;
    }

    _updateOrthoCameras() {
        const w = Math.max(2, this.container.clientWidth);
        const h = Math.max(2, this.container.clientHeight);
        const aspect = this.quadView ? (w * 0.5) / (h * 0.5) : w / h;
        const hh = this.orthoZoom;
        const hw = hh * aspect;

        for (const cam of [this.orthoFront, this.orthoSide, this.orthoTop]) {
            cam.left = -hw;
            cam.right = hw;
            cam.top = hh;
            cam.bottom = -hh;
            cam.updateProjectionMatrix();
        }

        const fc = this.orthoCenters.front;
        this.orthoFront.position.set(fc.x, fc.y, 10);
        this.orthoFront.up.set(0, 1, 0);
        this.orthoFront.lookAt(fc.x, fc.y, 0);

        const sc = this.orthoCenters.side;
        this.orthoSide.position.set(10, sc.y, sc.z);
        this.orthoSide.up.set(0, 1, 0);
        this.orthoSide.lookAt(0, sc.y, sc.z);

        const tc = this.orthoCenters.top;
        this.orthoTop.position.set(tc.x, 10, tc.z);
        this.orthoTop.up.set(0, 0, -1);
        this.orthoTop.lookAt(tc.x, 0, tc.z);
    }

    setQuadView(enabled) {
        this.quadView = !!enabled;
        this.resize();
    }

    zoomOrtho(factor) {
        this.orthoZoom = THREE.MathUtils.clamp(this.orthoZoom * factor, 0.25, 4.5);
        this._updateOrthoCameras();
    }

    panOrtho(quadrant, dxWorld, dyWorld) {
        if (quadrant === 'front') {
            this.orthoCenters.front.x -= dxWorld;
            this.orthoCenters.front.y += dyWorld;
        } else if (quadrant === 'side') {
            this.orthoCenters.side.z += dxWorld;
            this.orthoCenters.side.y += dyWorld;
        } else if (quadrant === 'top') {
            this.orthoCenters.top.x -= dxWorld;
            this.orthoCenters.top.z += dyWorld;
        }
        this._updateOrthoCameras();
    }

    getPointerInfo(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const lx = clientX - rect.left;
        const ly = clientY - rect.top;

        if (!this.quadView) {
            return {
                quadrant: '3d',
                camera: this.camera,
                ndc: new THREE.Vector2((lx / rect.width) * 2 - 1, -(ly / rect.height) * 2 + 1)
            };
        }

        const hw = rect.width * 0.5;
        const hh = rect.height * 0.5;
        const isRight = lx >= hw;
        const isBottom = ly >= hh;

        let quadrant = 'front';
        let camera = this.orthoFront;
        let qx = lx;
        let qy = ly;

        if (!isRight && !isBottom) {
            quadrant = 'front';
            camera = this.orthoFront;
        } else if (isRight && !isBottom) {
            quadrant = 'side';
            camera = this.orthoSide;
            qx = lx - hw;
        } else if (!isRight && isBottom) {
            quadrant = 'top';
            camera = this.orthoTop;
            qy = ly - hh;
        } else {
            quadrant = '3d';
            camera = this.camera;
            qx = lx - hw;
            qy = ly - hh;
        }

        return {
            quadrant,
            camera,
            ndc: new THREE.Vector2((qx / hw) * 2 - 1, -(qy / hh) * 2 + 1)
        };
    }

    _setupLights() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
        this.scene.add(this.ambientLight);

        this.keyLight = new THREE.DirectionalLight(0xfffaf2, 1.15);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.set(1024, 1024);
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 20;
        this.keyLight.shadow.camera.left = -3.5;
        this.keyLight.shadow.camera.right = 3.5;
        this.keyLight.shadow.camera.top = 4;
        this.keyLight.shadow.camera.bottom = -1;
        this.keyLight.shadow.bias = -0.0005;
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0x90b4ff, 0.35);
        this.fillLight.position.set(-4, 2.5, -2.5);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0xffcfad, 0.3);
        this.rimLight.position.set(0, 2.5, -5);
        this.scene.add(this.rimLight);

        this.lightParams = { az: 40, el: 52, intensity: 1.15, fill: 0.35, shadows: true };
        this.updateLights();
    }

    updateLights() {
        const az = THREE.MathUtils.degToRad(this.lightParams.az);
        const el = THREE.MathUtils.degToRad(this.lightParams.el);
        const r = 6;
        this.keyLight.position.set(
            r * Math.cos(el) * Math.sin(az),
            r * Math.sin(el),
            r * Math.cos(el) * Math.cos(az)
        );
        this.keyLight.intensity = this.lightParams.intensity;
        this.keyLight.castShadow = this.lightParams.shadows;
        this.fillLight.intensity = this.lightParams.fill;
    }

    _setupGround() {
        this.ground = new THREE.Mesh(
            new THREE.PlaneGeometry(24, 24),
            new THREE.MeshStandardMaterial({ color: 0x1e222d, roughness: 0.96, metalness: 0 })
        );
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        this.grid = new THREE.GridHelper(20, 40, 0x4a9eff, 0x2a3142);
        this.grid.material.transparent = true;
        this.grid.material.opacity = 0.32;
        this.grid.position.y = 0.001;
        this.scene.add(this.grid);
    }

    setFocalLength(mm) {
        // 35mm full-frame vertical sensor height = 24mm
        const fovRad = 2 * Math.atan(24 / (2 * mm));
        this.camera.fov = THREE.MathUtils.radToDeg(fovRad);
        this.camera.updateProjectionMatrix();
    }

    setCameraPreset(preset) {
        const target = new THREE.Vector3(0, 0.92, 0);
        const dist = 2.95;
        if (preset === 'front') {
            this.camera.position.set(0, target.y, dist);
        } else if (preset === 'back') {
            this.camera.position.set(0, target.y, -dist);
        } else if (preset === 'left') {
            this.camera.position.set(dist, target.y, 0);
        } else if (preset === 'right') {
            this.camera.position.set(-dist, target.y, 0);
        } else if (preset === 'top') {
            this.camera.position.set(0, target.y + dist, 0.01);
        } else {
            this.camera.position.set(1.3, 1.35, 2.75);
        }
        this.orbit.target.copy(target);
        this.orbit.update();
    }

    attachTransform(object3d) {
        if (object3d) {
            this.transform.attach(object3d);
            this.transformHelper.visible = true;
        } else {
            this.transform.detach();
            this.transformHelper.visible = false;
        }
    }

    setBackgroundFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            if (this.bgTexture) this.bgTexture.dispose();
            new THREE.TextureLoader().load(reader.result, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                this.bgTexture = tex;
                this.scene.background = tex;
            });
        };
        reader.readAsDataURL(file);
    }

    clearBackground() {
        if (this.bgTexture) {
            this.bgTexture.dispose();
            this.bgTexture = null;
        }
        this.scene.background = new THREE.Color(0x161922);
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w < 2 || h < 2) return;
        this.renderer.setSize(w, h, false);
        const viewAspect = this.quadView ? (w * 0.5) / (h * 0.5) : w / h;
        this.camera.aspect = viewAspect;
        this.camera.updateProjectionMatrix();
        this._updateOrthoCameras();
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        this.sketch.setSize(size.x, size.y);
    }

    render(extraHelpers = [], guideObjects = [], showGuides = true) {
        this.orbit.update();
        const helpers = [...this.helperObjects, ...extraHelpers];
        const stageW = this.container.clientWidth;
        const stageH = this.container.clientHeight;

        if (this.quadView) {
            const hw = Math.floor(stageW * 0.5);
            const hh = Math.floor(stageH * 0.5);
            const views = [
                { x: 0, y: hh, w: hw, h: stageH - hh, cam: this.orthoFront }, // Top-left: Front XY
                { x: hw, y: hh, w: stageW - hw, h: stageH - hh, cam: this.orthoSide }, // Top-right: Side ZY
                { x: 0, y: 0, w: hw, h: hh, cam: this.orthoTop }, // Bottom-left: Top XZ
                { x: hw, y: 0, w: stageW - hw, h: hh, cam: this.camera } // Bottom-right: 3D
            ];
            this.renderer.setScissorTest(true);
            for (const v of views) {
                this.renderer.setViewport(v.x, v.y, v.w, v.h);
                this.renderer.setScissor(v.x, v.y, v.w, v.h);
                this.renderer.render(this.scene, v.cam);
            }
            this.renderer.setScissorTest(false);
            this.renderer.setViewport(0, 0, stageW, stageH);
            return;
        }

        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, stageW, stageH);

        this.sketch.render(this.scene, this.camera, {
            helperObjects: helpers,
            guideObjects,
            showGuides,
            floorMesh: this.ground
        });

        // Live Final Sketch Preview PiP in 3D editing mode
        if (this.pip.enabled && this.sketch.settings.mode === '3d' && this.pip.viewportEl) {
            const cRect = this.canvas.getBoundingClientRect();
            const pRect = this.pip.viewportEl.getBoundingClientRect();
            if (pRect.width > 20 && pRect.height > 20) {
                const x = pRect.left - cRect.left;
                const yBottom = cRect.bottom - pRect.bottom;
                this.sketch.renderQuadToRect(
                    this.scene,
                    this.camera,
                    x,
                    yBottom,
                    pRect.width,
                    pRect.height,
                    {
                        forceMode: this.pip.mode,
                        helperObjects: helpers,
                        guideObjects,
                        showGuides,
                        floorMesh: this.ground
                    }
                );
                this.renderer.setViewport(0, 0, cRect.width, cRect.height);
            }
        }
    }

    exportFramePNG(extraHelpers = [], guideObjects = [], showGuides = true, width = 1600, height = 1200) {
        const helpers = [...this.helperObjects, ...extraHelpers];
        return this.sketch.exportFrameDataURL(this.scene, this.camera, {
            helperObjects: helpers,
            guideObjects,
            showGuides,
            floorMesh: this.ground,
            width,
            height
        });
    }
}
