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

        this.onTransformChange = null;
        this.onTransformEnd = null;
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
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        this.sketch.setSize(size.x, size.y);
    }

    render(extraHelpers = [], guideObjects = [], showGuides = true) {
        this.orbit.update();
        const helpers = [...this.helperObjects, ...extraHelpers];
        this.sketch.render(this.scene, this.camera, {
            helperObjects: helpers,
            guideObjects,
            showGuides,
            floorMesh: this.ground
        });
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
