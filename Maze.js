// Check if PointerLockControls is available immediately after scripts are loaded
if (typeof THREE === 'undefined' || typeof THREE.PointerLockControls === 'undefined') {
    console.error("Erro: Three.js ou PointerLockControls não carregados. O jogo não pode iniciar.");
    document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>Erro ao carregar o jogo. Por favor, verifique sua conexão ou tente novamente.</p>";
    // Stop further script execution if dependencies are missing
    throw new Error("Missing Three.js or PointerLockControls.");
}
console.log("PointerLockControls disponível:", !!THREE.PointerLockControls);

// --- Maze generation and random enemy placement ---

// Maze generation using recursive backtracking
function generateMaze(width, height) {
    // Ensure odd dimensions for proper maze structure
    if (width % 2 === 0) width++;
    if (height % 2 === 0) height++;
    const maze = Array.from({ length: height }, () => Array(width).fill(1));

    function carve(x, y) {
        const dirs = [
            [0, -2], [2, 0], [0, 2], [-2, 0]
        ].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (ny > 0 && ny < height && nx > 0 && nx < width && maze[ny][nx] === 1) {
                maze[y + dy / 2][x + dx / 2] = 0;
                maze[ny][nx] = 0;
                carve(nx, ny);
            }
        }
    }
    maze[1][1] = 0;
    carve(1, 1);
    // Ensure exit is open
    maze[height - 2][width - 2] = 0;
    return maze;
}

// Randomize maze size (odd numbers, e.g. 21x21 to 31x31)
const mazeWidth = 21 + 2 * Math.floor(Math.random() * 6); // 21, 23, ..., 31
const mazeHeight = 21 + 2 * Math.floor(Math.random() * 6);

const maze = generateMaze(mazeWidth, mazeHeight);

const cellSize = 10;
// Utility to find a random free cell in the maze
function randomFreeCell(avoidList = []) {
    let x, z, isValid;
    do {
        x = 1 + Math.floor(Math.random() * (mazeWidth - 2));
        z = 1 + Math.floor(Math.random() * (mazeHeight - 2));
        isValid = maze[z][x] === 0 &&
            !avoidList.some(pos =>
                Math.abs(pos.x - (x + 0.5)) < 1 && Math.abs(pos.z - (z + 0.5)) < 1
            );
    } while (!isValid);
    return { x: x + 0.5, z: z + 0.5 };
}

// --- Initial placement ---
const player = randomFreeCell();
let exit;
do {
    exit = randomFreeCell([player]);
    // Ensure exit is not too close to player (e.g., at least 1/3 of maze away)
} while (Math.abs(exit.x - player.x) + Math.abs(exit.z - player.z) < (mazeWidth + mazeHeight) / 3);

const enemies = [];
const enemyCount = 2 + Math.floor(Math.random() * 3);
for (let i = 0; i < enemyCount; i++) {
    enemies.push(randomFreeCell([player, exit, ...enemies]));
    enemies[i] = {
        x: enemies[i].x,
        z: enemies[i].z,
        dir: Math.random() * Math.PI * 2,
        state: "patrol",
        lostSightTime: 0,
        mesh: null
    };
}

let scene, camera, renderer, controls, clock, startTime, victory = false;
const timerElem = document.getElementById("timer");

const keys = {};
document.addEventListener("keydown", e => {
    if (victory && e.key.toLowerCase() === "r") {
        restartGame();
        return;
    }
document.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});
    if (victory) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === "r") location.reload();
});


// --- Variáveis para Head Bobbing e Corrida ---
const walkSpeed = 5; 
const runSpeed = 15; 
const headBobbingAmount = 0.2; 
const headBobbingSpeed = 8; 
let totalTime = 0; 
// --- Fim das Variáveis ---
function isPositionFree(x, z, radius = 0.4) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const checkX = x + Math.cos(angle) * radius;
        const checkZ = z + Math.sin(angle) * radius;
        const cellX = Math.floor(checkX / cellSize);
        const cellZ = Math.floor(checkZ / cellSize);
        if (maze[cellZ]?.[cellX] === 1) return false;
    }
    return true;
}
function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * t;
}
function init() {
    try {
        console.log("Iniciando cena Three.js...");

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xADD8E6);
        scene.fog = new THREE.Fog(0xADD8E6, 0, 120);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        controls = new THREE.PointerLockControls(camera, document.body);
        scene.add(controls.getObject());

        camera.position.set(player.x * cellSize, cellSize / 2, player.z * cellSize);
        document.body.addEventListener('click', () => {
            if (!controls.isLocked) controls.lock();
        });

        // Add a little ambient light for visibility (remove if you want only lamps)
        const ambient = new THREE.AmbientLight(0xffffff, 0.25);
        scene.add(ambient);

        // --- TEXTURE LOADING ---
        const textureLoader = new THREE.TextureLoader();

        // Load all textures in parallel, then build the maze
        Promise.all([
            new Promise(res => textureLoader.load('/Assets/floor_texture.jpg', t => res(t), undefined, () => res(null))),
            new Promise(res => textureLoader.load('/Assets/ceiling_texture.jpg', t => res(t), undefined, () => res(null))),
            new Promise(res => textureLoader.load('/Assets/wall_texture.jpg', t => res(t), undefined, () => res(null))),
        ]).then(([floorTex, ceilTex, wallTex]) => {
            // --- FLOOR ---
            let floorMat;
            if (floorTex) {
                floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
                floorTex.repeat.set(maze[0].length, maze.length);
                floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
            } else {
                floorMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
            }
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(maze[0].length * cellSize, maze.length * cellSize),
                floorMat
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.set((maze[0].length * cellSize) / 2, -0.01, (maze.length * cellSize) / 2);
            scene.add(floor);

            // --- CEILING ---
            let ceilMat;
            if (ceilTex) {
                ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
                ceilTex.repeat.set(maze[0].length, maze.length);
                ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
            } else {
                ceilMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
            }
            const ceiling = new THREE.Mesh(
                new THREE.PlaneGeometry(maze[0].length * cellSize, maze.length * cellSize),
                ceilMat
            );
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set((maze[0].length * cellSize) / 2, cellSize - 0.01, (maze.length * cellSize) / 2);
            scene.add(ceiling);

            // --- WALLS ---
            let wallMat;
            if (wallTex) {
                wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
                wallTex.repeat.set(1, 1); // Adjust for tiling if needed
                wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
            } else {
                wallMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
            }
            const wallGroup = new THREE.Group();
            let wallCount = 0;
            for (let z = 0; z < maze.length; z++) {
                for (let x = 0; x < maze[z].length; x++) {
                    if (maze[z][x] === 1) {
                        const wall = new THREE.Mesh(
                            new THREE.BoxGeometry(cellSize, cellSize, cellSize),
                            wallMat
                        );
                        wall.position.set(x * cellSize + cellSize / 2, cellSize / 2, z * cellSize + cellSize / 2);
                        wallGroup.add(wall);
                        wallCount++;
                    }
                }
            }
            scene.add(wallGroup);

            // --- LAMPS ---
            // Example wall-mounted lamp placement for corners and corridors

            const lampColor = 0xffeeaa;
            const lampIntensity = 1.2;
            const lampDistance = cellSize * 2.2;
            const lampHeight = cellSize - 2;

            // Helper: Place a lamp on the wall at (x, z) facing the given direction
            function addWallLamp(pos, wall) {
                // Support beam
                const beamGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8);
                const beamMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                const beam = new THREE.Mesh(beamGeom, beamMat);

                // Lamp shade
                const shadeGeom = new THREE.CylinderGeometry(0.35, 0.45, 0.5, 16);
                const shadeMat = new THREE.MeshStandardMaterial({ color: lampColor, emissive: lampColor });
                const shade = new THREE.Mesh(shadeGeom, shadeMat);

                // Position beam and shade relative to wall
                if (wall === 'north') {
                    beam.position.set(pos.x, pos.y, pos.z + 0.35);
                    beam.rotation.x = Math.PI / 2;
                    shade.position.set(pos.x, pos.y, pos.z + 0.7);
                    shade.rotation.x = Math.PI / 2;
                } else if (wall === 'south') {
                    beam.position.set(pos.x, pos.y, pos.z - 0.35);
                    beam.rotation.x = Math.PI / 2;
                    shade.position.set(pos.x, pos.y, pos.z - 0.7);
                    shade.rotation.x = Math.PI / 2;
                } else if (wall === 'west') {
                    beam.position.set(pos.x + 0.35, pos.y, pos.z);
                    beam.rotation.z = Math.PI / 2;
                    shade.position.set(pos.x + 0.7, pos.y, pos.z);
                    shade.rotation.z = Math.PI / 2;
                } else if (wall === 'east') {
                    beam.position.set(pos.x - 0.35, pos.y, pos.z);
                    beam.rotation.z = Math.PI / 2;
                    shade.position.set(pos.x - 0.7, pos.y, pos.z);
                    shade.rotation.z = Math.PI / 2;
                }

                // Point light at the shade position
                const lamp = new THREE.PointLight(lampColor, lampIntensity, lampDistance);
                lamp.position.copy(shade.position);

                scene.add(beam);
                scene.add(shade);
                scene.add(lamp);
            }

            // Place lamps in the maze
            for (let z = 0; z < maze.length; z++) {
                for (let x = 0; x < maze[z].length; x++) {
                    // Horizontal corridors
                    if (
                        maze[z][x] === 0 &&
                        (x === 0 || maze[z][x - 1] === 1)
                    ) {
                        let len = 0;
                        while (x + len < maze[z].length && maze[z][x + len] === 0) len++;
                        if (len >= 3) {
                            const mid = x + Math.floor(len / 2);
                            const wall = (z > 0 && maze[z - 1][mid] === 1) ? 'north' : 'south';
                            const lampPos = new THREE.Vector3(
                                mid * cellSize + cellSize / 2,
                                lampHeight,
                                z * cellSize + (wall === 'north' ? 0.01 : cellSize - 0.01)
                            );
                            addWallLamp(lampPos, wall);
                        }
                        x += len - 1;
                    }
                    // Vertical corridors
                    if (
                        maze[z][x] === 0 &&
                        (z === 0 || maze[z - 1][x] === 1)
                    ) {
                        let len = 0;
                        while (z + len < maze.length && maze[z + len][x] === 0) len++;
                        if (len >= 3) {
                            const mid = z + Math.floor(len / 2);
                            const wall = (x > 0 && maze[mid][x - 1] === 1) ? 'west' : 'east';
                            const lampPos = new THREE.Vector3(
                                x * cellSize + (wall === 'west' ? 0.01 : cellSize - 0.01),
                                lampHeight,
                                mid * cellSize + cellSize / 2
                            );
                            addWallLamp(lampPos, wall);
                        }
                    }
                    // Inside corners (L-shape)
                    if (maze[z][x] === 0) {
                        // North-West inside corner
                        if (
                            z > 0 && x > 0 &&
                            maze[z - 1][x] === 0 && maze[z][x - 1] === 0 &&
                            maze[z - 1][x - 1] === 1
                        ) {
                            const lampPos = new THREE.Vector3(
                                x * cellSize + cellSize / 2,
                                lampHeight,
                                z * cellSize + 0.01
                            );
                            addWallLamp(lampPos, 'north');
                        }
                        // North-East inside corner
                        if (
                            z > 0 && x < maze[z].length - 1 &&
                            maze[z - 1][x] === 0 && maze[z][x + 1] === 0 &&
                            maze[z - 1][x + 1] === 1
                        ) {
                            const lampPos = new THREE.Vector3(
                                (x + 1) * cellSize - cellSize / 2,
                                lampHeight,
                                z * cellSize + 0.01
                            );
                            addWallLamp(lampPos, 'north');
                        }
                        // South-West inside corner
                        if (
                            z < maze.length - 1 && x > 0 &&
                            maze[z + 1][x] === 0 && maze[z][x - 1] === 0 &&
                            maze[z + 1][x - 1] === 1
                        ) {
                            const lampPos = new THREE.Vector3(
                                x * cellSize + cellSize / 2,
                                lampHeight,
                                (z + 1) * cellSize - 0.01
                            );
                            addWallLamp(lampPos, 'south');
                        }
                        // South-East inside corner
                        if (
                            z < maze.length - 1 && x < maze[z].length - 1 &&
                            maze[z + 1][x] === 0 && maze[z][x + 1] === 0 &&
                            maze[z + 1][x + 1] === 1
                        ) {
                            const lampPos = new THREE.Vector3(
                                (x + 1) * cellSize - cellSize / 2,
                                lampHeight,
                                (z + 1) * cellSize - 0.01
                            );
                            addWallLamp(lampPos, 'south');
                        }
                    }
                }
            }

            // --- GOAL ---
            const goal = new THREE.Mesh(
                new THREE.BoxGeometry(4, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0x00aaff })
            );
            goal.position.set(exit.x * cellSize, 2, exit.z * cellSize);
            scene.add(goal);

            // --- ENEMIES ---
            enemies.forEach((enemy, i) => {
                const mesh = createEnemyMesh(false);
                mesh.position.set(enemy.x * cellSize, 0, enemy.z * cellSize);
                scene.add(mesh);
                enemy.mesh = mesh;
            });

            // --- ANIMATION LOOP ---
            clock = new THREE.Clock();
            startTime = Date.now();
            animate();
        });

    } catch (e) {
        console.error("Erro fatal durante a inicialização do jogo:", e);
        document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>A Critical Error has Ocorred</p>";
    }
}

function updateMovement(delta) {
    if (!controls || !controls.isLocked) return;

    let currentMoveSpeed = walkSpeed * delta;
    let isMoving = false;

    if (keys[" "]) {
        currentMoveSpeed = runSpeed * delta;
    }

    // Store the player's position BEFORE applying movement for collision revert
    const oldPlayerX = controls.getObject().position.x;
    const oldPlayerZ = controls.getObject().position.z;

    // Apply movement
    if (keys["w"] || keys["arrowup"]) { controls.moveForward(currentMoveSpeed); isMoving = true; }
    if (keys["s"] || keys["arrowdown"]) { controls.moveForward(-currentMoveSpeed); isMoving = true; }
    if (keys["a"] || keys["arrowleft"]) { controls.moveRight(-currentMoveSpeed); isMoving = true; }
    if (keys["d"] || keys["arrowright"]) { controls.moveRight(currentMoveSpeed); isMoving = true; }

    // Head Bobbing
    const originalCameraY = cellSize / 2;
    if (isMoving) {
        totalTime += delta * headBobbingSpeed;
        const bobAmount = Math.sin(totalTime) * headBobbingAmount;
        camera.position.y = originalCameraY + bobAmount;
    } else {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, originalCameraY, 0.1);
    }

    // Collision detection
    const newPlayerX = controls.getObject().position.x;
    const newPlayerZ = controls.getObject().position.z;

    if (!isPositionFree(newPlayerX, newPlayerZ)) {
        // If the new position is not free, revert to the old position
        controls.getObject().position.x = oldPlayerX;
        controls.getObject().position.z = oldPlayerZ;
        // Optionally, you could try to slide along the wall here
    } else {
        // Update the player's internal grid coordinates only if movement was successful
        player.x = newPlayerX / cellSize;
        player.z = newPlayerZ / cellSize;
    }
}


function checkVictory() {
    const distanceThreshold = 0.8; 
    const dx = player.x - exit.x;
    const dz = player.z - exit.z;
    if (!victory && Math.sqrt(dx * dx + dz * dz) < distanceThreshold) {
        document.getElementById("victory").style.display = "flex";
        victory = true;
        controls.unlock();
    }
}

function drawMinimap() {
    const minimapCanvas = document.getElementById("minimap");
    if (!minimapCanvas) {
        console.error("Minimap canvas not found!");
        return;
    }
    const ctx = minimapCanvas.getContext("2d");
    if (!ctx) {
        console.error("Could not get 2D context for minimap canvas!");
        return;
    }
    ctx.clearRect(0, 0, 120, 120);
    const scale = 120 / maze.length; 

    for (let z = 0; z < maze.length; z++) {
        for (let x = 0; x < maze[z].length; x++) {
            ctx.fillStyle = maze[z][x] === 1 ? "#888" : "#222";
            ctx.fillRect(x * scale, z * scale, scale, scale);
        }
    }
    // Draw player on minimap
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(player.x * scale, player.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw exit on minimap
    ctx.fillStyle = "cyan";
    ctx.beginPath();
    ctx.arc(exit.x * scale, exit.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    // Draw enemies on minimap
    enemies.forEach(enemy => {
        ctx.fillStyle = "orange";
        ctx.beginPath();
        ctx.arc(enemy.x * scale, enemy.z * scale, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}


function getAvailableDirections(enemy) {
    const cx = Math.floor(enemy.x);
    const cz = Math.floor(enemy.z);
    const dirs = [];
    // [dx, dz, angle]
    if (maze[cz][cx + 1] === 0) dirs.push({ dx: 1, dz: 0, angle: 0 }); // east
    if (maze[cz][cx - 1] === 0) dirs.push({ dx: -1, dz: 0, angle: Math.PI }); // west
    if (maze[cz - 1]?.[cx] === 0) dirs.push({ dx: 0, dz: -1, angle: -Math.PI / 2 }); // north
    if (maze[cz + 1]?.[cx] === 0) dirs.push({ dx: 0, dz: 1, angle: Math.PI / 2 }); // south
    return dirs;
}

function updateEnemies(delta) {
    const playerPos = { x: player.x * cellSize, z: player.z * cellSize };
    const enemySpeed = 0.5 * delta * cellSize;
    const chaseSpeed = 1.5 * delta * cellSize;
    const sightDistance = 60;
    const fov = Math.PI / 3;

    enemies.forEach((enemy, enemyIndex) => {
        // Walking animation (phase offset per enemy)
        const t = performance.now() * 0.002 + enemyIndex * 0.5;
        const walk = Math.abs(Math.sin(t * 2)) * 0.18;
        const { bodyHeight, headRadius } = enemy.mesh.userData;
        enemy.mesh.userData.body.position.y = bodyHeight / 2 + walk;
        enemy.mesh.userData.head.position.y = bodyHeight + headRadius * 0.7 + walk * 0.5;
        enemy.mesh.userData.skull.position.y = bodyHeight + headRadius * 0.7 + walk * 0.5;



        // Animate arms: right arm swings, left arm stays behind back
        if (enemy.mesh.userData.arms) {
            enemy.mesh.userData.arms[0].rotation.x = Math.PI / 2; // Left arm behind back (static)
            enemy.mesh.userData.arms[1].rotation.x = Math.sin(t * 2) * 0.5; // Right arm swings
        }

        // Convert mesh position to grid
        enemy.x = enemy.mesh.position.x / cellSize;
        enemy.z = enemy.mesh.position.z / cellSize;

        // --- SIGHT LOGIC (unchanged) ---
        const dx = playerPos.x - enemy.mesh.position.x;
        const dz = playerPos.z - enemy.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let seesPlayer = false;
        if (dist < sightDistance) {
            const angleToPlayer = Math.atan2(dz, dx);
            let angleDiff = Math.abs(angleToPlayer - enemy.dir);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            if (angleDiff < fov / 2) {
                let clear = true;
                const steps = Math.floor(dist / (cellSize / 2));
                for (let i = 1; i < steps; i++) {
                    const tx = enemy.mesh.position.x + (dx * i / steps);
                    const tz = enemy.mesh.position.z + (dz * i / steps);
                    const cx = Math.floor(tx / cellSize);
                    const cz = Math.floor(tz / cellSize);
                    if (maze[cz]?.[cx] === 1) {
                        clear = false;
                        break;
                    }
                }
                if (clear) seesPlayer = true;
            }
        }

        // --- PATROL LOGIC WITH MEMORY ---
        if (!enemy.visited) enemy.visited = {};
        const cx = Math.floor(enemy.x);
        const cz = Math.floor(enemy.z);
        const cellKey = `${cx},${cz}`;
        enemy.visited[cellKey] = true;

        if (enemy.state === "patrol") {
            if (seesPlayer) {
                enemy.state = "chase";
                enemy.lostSightTime = 0;
                enemy.targetCell = null;
            } else {
                // Move toward the center of the next cell in current direction
                if (!enemy.targetCell) {
                    // Get available directions
                    const dirs = getAvailableDirections(enemy);
                    // Prefer unvisited directions
                    let unvisited = dirs.filter(dir => {
                        const nx = cx + dir.dx;
                        const nz = cz + dir.dz;
                        return !enemy.visited[`${nx},${nz}`];
                    });
                    let options = unvisited.length > 0 ? unvisited : dirs;
                    // Remove the direction opposite to lastDir (if exists)
                    if (enemy.lastDir !== undefined && options.length > 1) {
                        options = options.filter(dir =>
                            Math.abs(dir.angle - (enemy.lastDir + Math.PI) % (2 * Math.PI)) > 0.1
                        );
                        if (options.length === 0) options = dirs; // fallback
                    }
                    // Randomly pick one
                    const dir = options[Math.floor(Math.random() * options.length)];
                    enemy.targetCell = {
                        x: cx + dir.dx + 0.5,
                        z: cz + dir.dz + 0.5,
                        angle: dir.angle
                    };
                    enemy.dir = dir.angle;
                    enemy.lastDir = dir.angle;
                }
                // Move toward targetCell
                const tx = enemy.targetCell.x * cellSize;
                const tz = enemy.targetCell.z * cellSize;
                const ex = enemy.mesh.position.x;
                const ez = enemy.mesh.position.z;
                const ddx = tx - ex;
                const ddz = tz - ez;
                const d = Math.sqrt(ddx * ddx + ddz * ddz);
                if (d < enemySpeed) {
                    enemy.mesh.position.x = tx;
                    enemy.mesh.position.z = tz;
                    enemy.x = enemy.targetCell.x;
                    enemy.z = enemy.targetCell.z;
                    enemy.targetCell = null; // Arrived, pick new direction next frame
                } else {
                    enemy.mesh.position.x += (ddx / d) * enemySpeed;
                    enemy.mesh.position.z += (ddz / d) * enemySpeed;
                }
            }
        }
        // --- CHASE LOGIC ---
        else if (enemy.state === "chase") {
            if (seesPlayer) {
                enemy.mesh.userData.leftDot.visible = true;
                enemy.mesh.userData.rightDot.visible = true;
                enemy.lostSightTime = 0;
                // If close enough, move directly toward player (not just cell center)
                if (dist < cellSize * 1.2) {
                    const ex = enemy.mesh.position.x;
                    const ez = enemy.mesh.position.z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d > 0.1) {
                        enemy.mesh.position.x += (dx / d) * chaseSpeed;
                        enemy.mesh.position.z += (dz / d) * chaseSpeed;
                    }
                } else {
                    // Move toward player using grid logic (greedy)
                    const px = Math.floor(player.x);
                    const pz = Math.floor(player.z);
                    let bestDir = null;
                    let minDist = Infinity;
                    const dirs = getAvailableDirections(enemy);
                    dirs.forEach(dir => {
                        const nx = cx + dir.dx;
                        const nz = cz + dir.dz;
                        const distToPlayer = Math.abs(nx - px) + Math.abs(nz - pz);
                        if (distToPlayer < minDist) {
                            minDist = distToPlayer;
                            bestDir = dir;
                        }
                    });
                    if (bestDir) {
                        enemy.dir = bestDir.angle;
                        const tx = (cx + bestDir.dx + 0.5) * cellSize;
                        const tz = (cz + bestDir.dz + 0.5) * cellSize;
                        const ex = enemy.mesh.position.x;
                        const ez = enemy.mesh.position.z;
                        const ddx = tx - ex;
                        const ddz = tz - ez;
                        const d = Math.sqrt(ddx * ddx + ddz * ddz);
                        if (d < chaseSpeed) {
                            enemy.mesh.position.x = tx;
                            enemy.mesh.position.z = tz;
                            enemy.x = cx + bestDir.dx + 0.5;
                            enemy.z = cz + bestDir.dz + 0.5;
                        } else {
                            enemy.mesh.position.x += (ddx / d) * chaseSpeed;
                            enemy.mesh.position.z += (ddz / d) * chaseSpeed;
                        }
                    }
                }
            } else {
                enemy.lostSightTime += delta;
                if (enemy.lostSightTime > 3) {
                    enemy.state = "patrol";
                    enemy.targetCell = null;
                    enemy.visited = {}; // Reset memory for new patrol
                    enemy.mesh.userData.leftDot.visible = false;
                    enemy.mesh.userData.rightDot.visible = false;
                }
            }
        }
        // Smoothly rotate mesh to face movement direction
        enemy.mesh.rotation.y = lerpAngle(enemy.mesh.rotation.y, enemy.dir - Math.PI / 2, 0.2);
    });
}

function animate() {
    requestAnimationFrame(animate); 
    const delta = clock.getDelta();

    if (!victory) {
        updateMovement(delta);
        updateEnemies(delta);
        drawMinimap();
        checkVictory();
        const t = ((Date.now() - startTime) / 1000).toFixed(1);
        timerElem.textContent = t;
    }

    renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize the game
    init();

function restartGame() {
    if (renderer && renderer.domElement) {
        document.body.removeChild(renderer.domElement);
    }
    document.getElementById("victory").style.display = "none";

    // Regenerate maze size and layout
    window.mazeWidth = 21 + 2 * Math.floor(Math.random() * 6);
    window.mazeHeight = 21 + 2 * Math.floor(Math.random() * 6);
    window.maze = generateMaze(window.mazeWidth, window.mazeHeight);

    // Randomize player and exit positions
    const newPlayer = randomFreeCell();
    player.x = newPlayer.x;
    player.z = newPlayer.z;
    let newExit;
    do {
        newExit = randomFreeCell([player]);
    } while (Math.abs(newExit.x - player.x) + Math.abs(newExit.z - player.z) < (mazeWidth + mazeHeight) / 3);
    exit.x = newExit.x;
    exit.z = newExit.z;

    // Regenerate enemies
    enemies.length = 0;
    const enemyCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < enemyCount; i++) {
        const pos = randomFreeCell([player, exit, ...enemies]);
        enemies.push({
            x: pos.x,
            z: pos.z,
            dir: Math.random() * Math.PI * 2,
            state: "patrol",
            lostSightTime: 0,
            mesh: null
        });
    }

    victory = false;
    startTime = Date.now();
    init();
}

function createEnemyMesh(isChasing = false) {
    const group = new THREE.Group();
    

    // Proportions
    const bodyHeight = 4.6; // Make enemy tall
    const bodyRadius = 0.7;
    const headRadius = 0.55;
    const skullRadius = 0.7;
    const enemyBaseY = bodyHeight / 2 + 0.7; // Raise body above feet

    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 12),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    body.position.y = enemyBaseY;
    group.add(body);

    // Head (hidden by mask)
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    head.position.y = bodyHeight + headRadius * 0.7;
    group.add(head);

    // Lamb Skull Mask (stylized: a white elongated sphere with horns)
    const skull = new THREE.Mesh(
        new THREE.SphereGeometry(skullRadius, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xf8f8f8 })
    );
    skull.scale.set(1, 1.2, 1.2);
    skull.position.y = bodyHeight + headRadius * 0.7;
    group.add(skull);

    // Horns (curved cylinders)
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    for (let side of [-1, 1]) {
        const horn = new THREE.Mesh(
            new THREE.TorusGeometry(0.55, 0.13, 8, 16, Math.PI),
            hornMat
        );
        horn.position.set(0.32 * side, skull.position.y + 0.38, 0.0);
        horn.rotation.x = Math.PI / 2;
        horn.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
        group.add(horn);
    }

    // Eye holes (small black spheres)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
    leftEye.position.set(-0.23, skull.position.y, 0.75);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.23;
    group.add(leftEye, rightEye);

    // Red dots for "chase" mode (small spheres, hidden unless chasing)
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 });
    const leftDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), redMat);
    leftDot.position.copy(leftEye.position);
    leftDot.position.z += 0.09;
    leftDot.visible = isChasing;

    const rightDot = leftDot.clone();
    rightDot.position.copy(rightEye.position);
    rightDot.position.z += 0.09;
    rightDot.visible = isChasing;

    group.add(leftDot, rightDot);

    // Arms
    const arms = [];
    const armGeom = new THREE.CylinderGeometry(0.18, 0.18, bodyHeight * 0.7, 8);
    for (let side of [-1, 1]) {
        const arm = new THREE.Mesh(
            armGeom,
            new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        arm.position.set(
        (bodyRadius + 0.18) * side,
        enemyBaseY + bodyHeight * 0.15,
        0
        );
        arm.rotation.z = Math.PI / 8 * side;
        group.add(arm);
        arms.push(arm);
    }
    group.userData = { leftDot, rightDot, body, head, skull, arms, bodyHeight, headRadius };

    return group;
}

/* To Do List:
- Expand the maze, optionally randomizing the layout, enemy placement, etc.(X)
- Darken the maze and add lamps placed at corners and along walls. (X*)
- Add traps with distinct visual cues and sound effects and different detrimental effects(drawing enemies to the player location, slowing the player, etc.).
- Improve enemy AI, refine its pathfinding so as to patrol among the corridors of the maze instead of going in random directions, and improve their chase behavior. (X)
- Add a stamina meter, regulate player and enemies speed, and make running alert the enemies. 
- Add a health system with visual feedback.
- Add Music during gameplay. 
- Add items like keys or power-ups, like a flashlight or a bottle of water that would scare the enemies away when splashed by the player.
- Add a visual motif to the maze and the enemies, that motif being La Manchaland's Haunted Bloody Mary from Limbus Company. (X*)
- Add a starting screen with a title, instructions, and a start button, moving the instructions at the upper left corner during gameplay to the start screen instructions.
- Add a pause menu with options to resume, restart, or return to title.
- Add a game over screen with options to restart or return to title.
- Improve the minimap, reduce its size to fit the current maze layout and more clearly show the position of the player, exit, and enemies.
*/