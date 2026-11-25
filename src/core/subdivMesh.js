import * as THREE from 'three';

/**
 * Editable Low-Poly Quad Mesh + Catmull-Clark Subdivision Engine
 */

export function cloneEditableMesh(meshData) {
    return {
        verts: meshData.verts.map((v) => [v[0], v[1], v[2]]),
        quads: meshData.quads.map((q) => [q[0], q[1], q[2], q[3]]),
        subdiv: meshData.subdiv ?? 2,
        axis: meshData.axis || 'y',
        refLength: meshData.refLength || 0.2,
        guideLoops: meshData.guideLoops ? meshData.guideLoops.map((g) => ({ ...g, edges: g.edges.map((e) => [...e]) })) : []
    };
}

/**
 * Create a clean manifold Cube-Grid primitive with sx, sy, sz subdivisions.
 */
export function createBoxGridMesh(w = 0.2, h = 0.2, d = 0.2, sx = 2, sy = 3, sz = 2, offset = [0, 0, 0]) {
    const verts = [];
    const quads = [];
    const vertMap = new Map();

    function getVert(ix, iy, iz) {
        const key = `${ix},${iy},${iz}`;
        if (vertMap.has(key)) return vertMap.get(key);
        const x = ((ix / sx) - 0.5) * w + offset[0];
        const y = ((iy / sy) - 0.5) * h + offset[1];
        const z = ((iz / sz) - 0.5) * d + offset[2];
        const idx = verts.length;
        verts.push([x, y, z]);
        vertMap.set(key, idx);
        return idx;
    }

    // Front (+Z, iz=sz) and Back (-Z, iz=0)
    for (let iy = 0; iy < sy; iy++) {
        for (let ix = 0; ix < sx; ix++) {
            quads.push([getVert(ix, iy, sz), getVert(ix + 1, iy, sz), getVert(ix + 1, iy + 1, sz), getVert(ix, iy + 1, sz)]);
            quads.push([getVert(ix + 1, iy, 0), getVert(ix, iy, 0), getVert(ix, iy + 1, 0), getVert(ix + 1, iy + 1, 0)]);
        }
    }
    // Right (+X, ix=sx) and Left (-X, ix=0)
    for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
            quads.push([getVert(sx, iy, iz + 1), getVert(sx, iy, iz), getVert(sx, iy + 1, iz), getVert(sx, iy + 1, iz + 1)]);
            quads.push([getVert(0, iy, iz), getVert(0, iy, iz + 1), getVert(0, iy + 1, iz + 1), getVert(0, iy + 1, iz)]);
        }
    }
    // Top (+Y, iy=sy) and Bottom (-Y, iy=0)
    for (let iz = 0; iz < sz; iz++) {
        for (let ix = 0; ix < sx; ix++) {
            quads.push([getVert(ix, sy, iz + 1), getVert(ix + 1, sy, iz + 1), getVert(ix + 1, sy, iz), getVert(ix, sy, iz)]);
            quads.push([getVert(ix, 0, iz), getVert(ix + 1, 0, iz), getVert(ix + 1, 0, iz + 1), getVert(ix, 0, iz + 1)]);
        }
    }

    return { verts, quads, subdiv: 2, axis: 'y', refLength: h };
}

/**
 * Create a Quad Sphere (Cube projected onto ellipsoid) — zero pole triangles!
 */
export function createQuadSphereMesh(rx = 0.1, ry = 0.1, rz = 0.1, segs = 2, offset = [0, 0, 0]) {
    const box = createBoxGridMesh(2, 2, 2, segs, segs, segs, [0, 0, 0]);
    for (let i = 0; i < box.verts.length; i++) {
        const [x, y, z] = box.verts[i];
        const x2 = x * x, y2 = y * y, z2 = z * z;
        const sx = x * Math.sqrt(Math.max(0, 1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3));
        const sy = y * Math.sqrt(Math.max(0, 1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3));
        const sz = z * Math.sqrt(Math.max(0, 1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3));
        box.verts[i] = [sx * rx + offset[0], sy * ry + offset[1], sz * rz + offset[2]];
    }
    box.refLength = ry * 2;
    return box;
}

/**
 * Create a clean closed Quad Cylinder along Y from yStart to yEnd.
 */
export function createQuadCylinderMesh(rTop = 0.05, rBot = 0.05, yStart = 0, yEnd = -0.28, radialSegs = 8, heightSegs = 4) {
    const verts = [];
    const quads = [];

    for (let iy = 0; iy <= heightSegs; iy++) {
        const t = iy / heightSegs;
        const y = yStart + (yEnd - yStart) * t;
        const r = rBot * (1 - t) + rTop * t;
        for (let ir = 0; ir < radialSegs; ir++) {
            const ang = (ir / radialSegs) * Math.PI * 2;
            verts.push([Math.cos(ang) * r, y, Math.sin(ang) * r]);
        }
    }

    for (let iy = 0; iy < heightSegs; iy++) {
        for (let ir = 0; ir < radialSegs; ir++) {
            const irNext = (ir + 1) % radialSegs;
            const a = iy * radialSegs + ir;
            const b = iy * radialSegs + irNext;
            const c = (iy + 1) * radialSegs + irNext;
            const d = (iy + 1) * radialSegs + ir;
            if (yEnd < yStart) {
                quads.push([a, d, c, b]);
            } else {
                quads.push([a, b, c, d]);
            }
        }
    }

    // Cap poles with quad fans if even radialSegs, else center pole + triangles/degenerate quads
    const topCenterIdx = verts.length;
    verts.push([0, yEnd, 0]);
    const botCenterIdx = verts.length;
    verts.push([0, yStart, 0]);

    const topRingStart = heightSegs * radialSegs;
    for (let ir = 0; ir < radialSegs; ir += 2) {
        const i0 = ir;
        const i1 = (ir + 1) % radialSegs;
        const i2 = (ir + 2) % radialSegs;
        if (yEnd < yStart) {
            quads.push([botCenterIdx, i0, i1, i2]);
            quads.push([topCenterIdx, topRingStart + i2, topRingStart + i1, topRingStart + i0]);
        } else {
            quads.push([botCenterIdx, i2, i1, i0]);
            quads.push([topCenterIdx, topRingStart + i0, topRingStart + i1, topRingStart + i2]);
        }
    }

    return { verts, quads, subdiv: 2, axis: 'y', refLength: Math.abs(yEnd - yStart) };
}

/**
 * Single Catmull-Clark subdivision pass on a closed/manifold quad mesh.
 */
export function subdivideCatmullClarkStep(verts, quads) {
    const nVerts = verts.length;
    const facePoints = quads.map((q) => {
        const cx = (verts[q[0]][0] + verts[q[1]][0] + verts[q[2]][0] + verts[q[3]][0]) * 0.25;
        const cy = (verts[q[0]][1] + verts[q[1]][1] + verts[q[2]][1] + verts[q[3]][1]) * 0.25;
        const cz = (verts[q[0]][2] + verts[q[1]][2] + verts[q[2]][2] + verts[q[3]][2]) * 0.25;
        return [cx, cy, cz];
    });

    const edgeMap = new Map();
    const vertFaces = Array.from({ length: nVerts }, () => []);
    const vertEdges = Array.from({ length: nVerts }, () => new Set());

    function edgeKey(a, b) {
        return a < b ? `${a}_${b}` : `${b}_${a}`;
    }

    quads.forEach((q, fIdx) => {
        for (let k = 0; k < 4; k++) {
            const a = q[k];
            const b = q[(k + 1) % 4];
            vertFaces[a].push(fIdx);
            const key = edgeKey(a, b);
            let e = edgeMap.get(key);
            if (!e) {
                e = { a: Math.min(a, b), b: Math.max(a, b), faces: [], idx: -1 };
                edgeMap.set(key, e);
            }
            e.faces.push(fIdx);
            vertEdges[a].add(key);
            vertEdges[b].add(key);
        }
    });

    const newVerts = [];

    // 1. Update original vertices (0 .. nVerts-1)
    for (let i = 0; i < nVerts; i++) {
        const faces = vertFaces[i];
        const edges = Array.from(vertEdges[i]);
        const n = faces.length;
        if (n === 0 || edges.length !== n) {
            // Boundary or isolated vertex: average boundary edge midpoints
            const bEdges = edges.filter((k) => edgeMap.get(k).faces.length === 1);
            if (bEdges.length >= 2) {
                const p = verts[i];
                const e1 = edgeMap.get(bEdges[0]);
                const e2 = edgeMap.get(bEdges[1]);
                const o1 = verts[e1.a === i ? e1.b : e1.a];
                const o2 = verts[e2.a === i ? e2.b : e2.a];
                newVerts.push([
                    0.75 * p[0] + 0.125 * (o1[0] + o2[0]),
                    0.75 * p[1] + 0.125 * (o1[1] + o2[1]),
                    0.75 * p[2] + 0.125 * (o1[2] + o2[2])
                ]);
            } else {
                newVerts.push([...verts[i]]);
            }
            continue;
        }

        let fx = 0, fy = 0, fz = 0;
        for (const fIdx of faces) {
            fx += facePoints[fIdx][0];
            fy += facePoints[fIdx][1];
            fz += facePoints[fIdx][2];
        }
        fx /= n; fy /= n; fz /= n;

        let rx = 0, ry = 0, rz = 0;
        for (const k of edges) {
            const e = edgeMap.get(k);
            rx += (verts[e.a][0] + verts[e.b][0]) * 0.5;
            ry += (verts[e.a][1] + verts[e.b][1]) * 0.5;
            rz += (verts[e.a][2] + verts[e.b][2]) * 0.5;
        }
        rx /= n; ry /= n; rz /= n;

        const p = verts[i];
        newVerts.push([
            (fx + 2 * rx + (n - 3) * p[0]) / n,
            (fy + 2 * ry + (n - 3) * p[1]) / n,
            (fz + 2 * rz + (n - 3) * p[2]) / n
        ]);
    }

    // 2. Face points
    const facePointIdx = [];
    for (const fp of facePoints) {
        facePointIdx.push(newVerts.length);
        newVerts.push(fp);
    }

    // 3. Edge points
    for (const e of edgeMap.values()) {
        e.idx = newVerts.length;
        const va = verts[e.a];
        const vb = verts[e.b];
        if (e.faces.length === 2) {
            const f1 = facePoints[e.faces[0]];
            const f2 = facePoints[e.faces[1]];
            newVerts.push([
                (va[0] + vb[0] + f1[0] + f2[0]) * 0.25,
                (va[1] + vb[1] + f1[1] + f2[1]) * 0.25,
                (va[2] + vb[2] + f1[2] + f2[2]) * 0.25
            ]);
        } else {
            newVerts.push([
                (va[0] + vb[0]) * 0.5,
                (va[1] + vb[1]) * 0.5,
                (va[2] + vb[2]) * 0.5
            ]);
        }
    }

    // 4. Split each quad into 4 quads
    const newQuads = [];
    quads.forEach((q, fIdx) => {
        const fp = facePointIdx[fIdx];
        const ep = [
            edgeMap.get(edgeKey(q[0], q[1])).idx,
            edgeMap.get(edgeKey(q[1], q[2])).idx,
            edgeMap.get(edgeKey(q[2], q[3])).idx,
            edgeMap.get(edgeKey(q[3], q[0])).idx
        ];
        newQuads.push([q[0], ep[0], fp, ep[3]]);
        newQuads.push([ep[0], q[1], ep[1], fp]);
        newQuads.push([fp, ep[1], q[2], ep[2]]);
        newQuads.push([ep[3], fp, ep[2], q[3]]);
    });

    return { verts: newVerts, quads: newQuads };
}

export function subdivideQuadMesh(verts, quads, levels = 2) {
    let curV = verts;
    let curQ = quads;
    const clamped = Math.max(0, Math.min(3, levels));
    for (let i = 0; i < clamped; i++) {
        const res = subdivideCatmullClarkStep(curV, curQ);
        curV = res.verts;
        curQ = res.quads;
    }
    return { verts: curV, quads: curQ };
}

export function mirrorEditableMeshX(meshData) {
    const out = cloneEditableMesh(meshData);
    out.verts = out.verts.map(([x, y, z]) => [-x, y, z]);
    out.quads = out.quads.map(([a, b, c, d]) => [d, c, b, a]);
    return out;
}

/**
 * Convert an editable quad mesh into a smooth THREE.BufferGeometry.
 */
export function buildBufferGeometryFromQuadMesh(meshData, boneLength, morphFn, partName) {
    const axis = meshData.axis || 'y';
    const refLen = meshData.refLength || boneLength || 1;
    const lenRatio = boneLength ? (boneLength / refLen) : 1;

    // Transform base verts by boneLength and morph before subdivision so subdivision preserves smoothness
    const baseVerts = meshData.verts.map((v) => {
        let mv = morphFn ? morphFn(partName, v) : v;
        let [x, y, z] = mv;
        if (axis === 'y') y *= lenRatio;
        else if (axis === 'x') x *= lenRatio;
        else if (axis === 'z') z *= lenRatio;
        return [x, y, z];
    });

    const { verts, quads } = subdivideQuadMesh(baseVerts, meshData.quads, meshData.subdiv ?? 2);

    // Compute signed volume to verify outward winding
    const flip = isQuadMeshInverted(verts, quads);

    const positions = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
        positions[i * 3] = verts[i][0];
        positions[i * 3 + 1] = verts[i][1];
        positions[i * 3 + 2] = verts[i][2];
    }

    const indices = [];
    for (const q of quads) {
        if (flip) {
            indices.push(q[0], q[2], q[1], q[0], q[3], q[2]);
        } else {
            indices.push(q[0], q[1], q[2], q[0], q[2], q[3]);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

export function createQuadConeMesh(rBase = 0.11, rTip = 0.012, height = 0.28, radialSegs = 8, heightSegs = 4) {
    const m = createQuadCylinderMesh(rTip, rBase, 0, height, radialSegs, heightSegs);
    m.axis = 'y';
    m.refLength = height;
    m.subdiv = 1;
    return m;
}

export function createQuadPlateMesh(w = 0.28, h = 0.22, thickness = 0.016, sx = 3, sy = 3) {
    const m = createBoxGridMesh(w, h, thickness, sx, sy, 1, [0, -h * 0.5, 0]);
    m.axis = 'y';
    m.refLength = h;
    m.subdiv = 1;
    return m;
}

export function createPrimitiveByType(type) {
    if (type === 'box') return createBoxGridMesh(0.18, 0.24, 0.18, 2, 3, 2, [0, 0, 0]);
    if (type === 'sphere') return createQuadSphereMesh(0.10, 0.12, 0.10, 2, [0, 0, 0]);
    if (type === 'cone') return createQuadConeMesh(0.11, 0.012, 0.26, 8, 3);
    if (type === 'plate') return createQuadPlateMesh(0.24, 0.22, 0.018, 3, 3);
    return createQuadCylinderMesh(0.06, 0.06, 0.14, -0.14, 8, 4);
}

export function buildFingerGeometry(length, radius) {
    const r = radius;
    const cyl = Math.max(0.002, length - r * 1.4);
    const geo = new THREE.CapsuleGeometry(r, cyl, 4, 10);
    geo.translate(0, -length * 0.5, 0);
    return geo;
}

function isQuadMeshInverted(verts, quads) {
    let cx = 0, cy = 0, cz = 0;
    for (const v of verts) { cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= verts.length || 1; cy /= verts.length || 1; cz /= verts.length || 1;

    let vol = 0;
    for (const q of quads) {
        const tris = [[q[0], q[1], q[2]], [q[0], q[2], q[3]]];
        for (const [ia, ib, ic] of tris) {
            const a = verts[ia], b = verts[ib], c = verts[ic];
            const ax = a[0] - cx, ay = a[1] - cy, az = a[2] - cz;
            const bx = b[0] - cx, by = b[1] - cy, bz = b[2] - cz;
            const cxp = c[0] - cx, cyp = c[1] - cy, czp = c[2] - cz;
            vol += ax * (by * czp - bz * cyp) + ay * (bz * cxp - bx * czp) + az * (bx * cyp - by * cxp);
        }
    }
    return vol < 0;
}
