
import * as THREE from
'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

// ===================================
// WILDLANDS SURVIVAL - VERSION 0.1
// ===================================

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d2);
scene.fog = new THREE.Fog(0x87b5d2, 35, 180);

// Camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500
);

camera.rotation.order = 'YXZ';

// Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

document.body.appendChild(renderer.domElement);

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(50, 100, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ambient = new THREE.HemisphereLight(
    0xc4e1ff,
    0x52613a,
    1.5
);
scene.add(ambient);

// ===================================
// TERRAIN
// ===================================

function terrainHeight(x, z) {
    return (
        Math.sin(x * 0.025) * 2 +
        Math.cos(z * 0.03) * 2 +
        Math.sin((x + z) * 0.018) * 3
    );
}

const terrainGeometry = new THREE.PlaneGeometry(
    500, 500, 100, 100
);

const vertices = terrainGeometry.attributes.position;

for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = -vertices.getY(i);

    vertices.setZ(i, terrainHeight(x, z));
}

terrainGeometry.computeVertexNormals();
terrainGeometry.rotateX(-Math.PI / 2);

const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
        color: 0x496d37,
        roughness: 1
    })
);

terrain.receiveShadow = true;
scene.add(terrain);

// ===================================
// WORLD OBJECTS
// ===================================

const resources = [];
const obstacles = [];

const materials = {
    trunk: new THREE.MeshStandardMaterial({
        color: 0x60432b
    }),
    leaves: new THREE.MeshStandardMaterial({
        color: 0x244b28
    }),
    rock: new THREE.MeshStandardMaterial({
        color: 0x777b78,
        roughness: 1
    })
};

function createTree(x, z) {
    const group = new THREE.Group();
    const ground = terrainHeight(x, z);

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.4, 4, 8),
        materials.trunk
    );

    trunk.position.y = 2;
    trunk.castShadow = true;
    group.add(trunk);

    for (let i = 0; i < 3; i++) {
        const leaves = new THREE.Mesh(
            new THREE.ConeGeometry(2.2 - i * 0.25, 4, 8),
            materials.leaves
        );

        leaves.position.y = 4 + i * 1.5;
        leaves.castShadow = true;
        group.add(leaves);
    }

    group.position.set(x, ground, z);
    scene.add(group);

    resources.push({
        group,
        type: 'wood',
        position: new THREE.Vector3(x, ground + 2, z),
        radius: 3
    });

    obstacles.push({ x, z, radius: 1.1 });
}

function createRock(x, z) {
    const group = new THREE.Group();
    const ground = terrainHeight(x, z);

    const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.2, 1),
        materials.rock
    );

    rock.scale.set(1.3, 0.8, 1);
    rock.position.y = 0.8;
    rock.castShadow = true;
    group.add(rock);

    group.position.set(x, ground, z);
    scene.add(group);

    resources.push({
        group,
        type: 'stone',
        position: new THREE.Vector3(x, ground + 0.8, z),
        radius: 3
    });

    obstacles.push({ x, z, radius: 1.1 });
}

// Random forest
let seed = 207;

function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
}

for (let i = 0; i < 350; i++) {
    const x = (random() - 0.5) * 220;
    const z = (random() - 0.5) * 220;

    if (Math.hypot(x, z) < 12) continue;

    if (random() > 0.25) {
        createTree(x, z);
    } else {
        createRock(x, z);
    }
}

// ===================================
// PLAYER
// ===================================

const player = {
    position: new THREE.Vector3(
        0,
        terrainHeight(0, 0) + 1.7,
        0
    ),
    speed: 7,
    hunger: 100,
    thirst: 100,
    wood: 0,
    stone: 0
};

camera.position.copy(player.position);

let yaw = 0;
let pitch = 0;

const keys = {};

window.addEventListener('keydown', event => {
    keys[event.code] = true;

    if (event.code === 'KeyE') {
        gatherResource();
    }

    if (event.code === 'KeyF') {
        saveGame();
    }
});

window.addEventListener('keyup', event => {
    keys[event.code] = false;
});

// Mouse controls
renderer.domElement.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        renderer.domElement.requestPointerLock();
    }
});

document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== renderer.domElement) {
        return;
    }

    yaw -= event.movementX * 0.002;
    pitch -= event.movementY * 0.002;

    pitch = Math.max(-1.5, Math.min(1.5, pitch));

    camera.rotation.set(pitch, yaw, 0);
});

// ===================================
// RESOURCE COLLECTION
// ===================================

const prompt = document.getElementById('prompt');

function findResource() {
    const forward = new THREE.Vector3(
        -Math.sin(yaw),
        0,
        -Math.cos(yaw)
    );

    let nearest = null;
    let nearestDistance = Infinity;

    for (const resource of resources) {
        const distance = player.position.distanceTo(
            resource.position
        );

        if (distance > resource.radius + 1.7) continue;

        const direction = resource.position.clone()
            .sub(player.position)
            .normalize();

        if (forward.dot(direction) < 0.45) continue;

        if (distance < nearestDistance) {
            nearest = resource;
            nearestDistance = distance;
        }
    }

    return nearest;
}

function gatherResource() {
    const resource = findResource();

    if (!resource) return;

    if (resource.type === 'wood') {
        player.wood += 3;
        prompt.textContent = '+3 Wood';
    } else {
        player.stone += 2;
        prompt.textContent = '+2 Stone';
    }

    scene.remove(resource.group);

    const index = resources.indexOf(resource);
    resources.splice(index, 1);

    const obstacleIndex = obstacles.findIndex(o =>
        Math.abs(o.x - resource.group.position.x) < 0.01 &&
        Math.abs(o.z - resource.group.position.z) < 0.01
    );

    if (obstacleIndex !== -1) {
        obstacles.splice(obstacleIndex, 1);
    }

    updateHUD();
}

// ===================================
// COLLISION AND MOVEMENT
// ===================================

function movePlayer(dt) {
    const direction = new THREE.Vector3();

    if (keys.KeyW) direction.z -= 1;
    if (keys.KeyS) direction.z += 1;
    if (keys.KeyA) direction.x -= 1;
    if (keys.KeyD) direction.x += 1;

    if (direction.lengthSq() === 0) return;

    direction.normalize();

    const forward = new THREE.Vector3(
        -Math.sin(yaw),
        0,
        -Math.cos(yaw)
    );

    const right = new THREE.Vector3(
        Math.cos(yaw),
        0,
        -Math.sin(yaw)
    );

    const movement = new THREE.Vector3()
        .addScaledVector(forward, -direction.z)
        .addScaledVector(right, direction.x)
        .multiplyScalar(player.speed * dt);

    const nextX = player.position.x + movement.x;
    const nextZ = player.position.z + movement.z;

    function blocked(x, z) {
        return obstacles.some(obstacle =>
            Math.hypot(x - obstacle.x, z - obstacle.z)
            < obstacle.radius
        );
    }

    if (!blocked(nextX, player.position.z)) {
        player.position.x = nextX;
    }

    if (!blocked(player.position.x, nextZ)) {
        player.position.z = nextZ;
    }

    player.position.y =
        terrainHeight(player.position.x, player.position.z) + 1.7;

    camera.position.copy(player.position);
}

// ===================================
// SURVIVAL SYSTEM
// ===================================

let survivalTimer = 0;
let elapsed = 0;

function updateSurvival(dt) {
    survivalTimer += dt;
    elapsed += dt;

    if (survivalTimer >= 5) {
        player.hunger = Math.max(0, player.hunger - 0.15);
        player.thirst = Math.max(0, player.thirst - 0.25);
        survivalTimer = 0;
    }

    if (player.hunger === 0 || player.thirst === 0) {
        player.hunger = Math.max(0, player.hunger - 0.1);
        player.thirst = Math.max(0, player.thirst - 0.1);
    }

    updateHUD();
}

// ===================================
// DAY AND NIGHT
// ===================================

function updateDayNight() {
    const cycle = (elapsed / 180) % 1;
    const sunAngle = cycle * Math.PI * 2;

    sun.position.set(
        Math.cos(sunAngle) * 100,
        Math.sin(sunAngle) * 120,
        30
    );

    const daylight = Math.max(0, Math.sin(sunAngle));

    sun.intensity = 0.15 + daylight * 2.5;
    ambient.intensity = 0.3 + daylight * 1.2;

    const sky = new THREE.Color().setRGB(
        0.015 + daylight * 0.45,
        0.025 + daylight * 0.65,
        0.08 + daylight * 0.75
    );

    scene.background.copy(sky);
    scene.fog.color.copy(sky);

    document.getElementById('day').textContent =
        Math.floor(elapsed / 360) + 1;
}

// ===================================
// HUD
// ===================================

function updateHUD() {
    document.getElementById('hunger').textContent =
        Math.round(player.hunger);

    document.getElementById('thirst').textContent =
        Math.round(player.thirst);

    document.getElementById('wood').textContent =
        player.wood;

    document.getElementById('stone').textContent =
        player.stone;
}

function updatePrompt() {
    const resource = findResource();

    prompt.textContent = resource
        ? `Press E to collect ${resource.type}`
        : '';
}

// ===================================
// SAVE AND LOAD
// ===================================

function saveGame() {
    const data = {
        position: player.position.toArray(),
        hunger: player.hunger,
        thirst: player.thirst,
        wood: player.wood,
        stone: player.stone,
        elapsed,
        yaw,
        pitch,
        collected: resources
            .filter(r => !scene.children.includes(r.group))
            .length
    };

    localStorage.setItem(
        'wildlands-save',
        JSON.stringify(data)
    );

    prompt.textContent = 'Game saved!';
}

function loadGame() {
    const saved = localStorage.getItem('wildlands-save');

    if (!saved) return;

    try {
        const data = JSON.parse(saved);

        player.position.fromArray(data.position);
        player.hunger = data.hunger;
        player.thirst = data.thirst;
        player.wood = data.wood;
        player.stone = data.stone;
        elapsed = data.elapsed || 0;
        yaw = data.yaw || 0;
        pitch = data.pitch || 0;

        // Restore collected resources.
        const collected = Math.min(
            resources.length,
            Math.max(0, data.collected || 0)
        );

        for (let i = 0; i < collected; i++) {
            const resource = resources.shift();
            scene.remove(resource.group);

            const index = obstacles.findIndex(o =>
                Math.abs(o.x - resource.group.position.x) < 0.01 &&
                Math.abs(o.z - resource.group.position.z) < 0.01
            );

            if (index !== -1) obstacles.splice(index, 1);
        }

        camera.position.copy(player.position);
        camera.rotation.set(pitch, yaw, 0);
        updateHUD();
    } catch (error) {
        console.error('Could not load save:', error);
    }
}

document.getElementById('save').addEventListener(
    'click',
    saveGame
);

// ===================================
// GAME LOOP
// ===================================

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (document.pointerLockElement === renderer.domElement) {
        movePlayer(dt);
        updateSurvival(dt);
    }

    updateDayNight();
    updatePrompt();

    renderer.render(scene, camera);
}

document.getElementById('start').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    loadGame();
    renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
        document.getElementById('start-screen').style.display = 'flex';
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});

updateHUD();
animate();
