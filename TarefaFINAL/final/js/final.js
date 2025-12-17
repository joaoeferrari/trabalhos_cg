import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let camera, scene, renderer, composer;
let objects = [];
let collidableObjects = [];
let mixer;
let npcMixers = [];
let radarObject = null;
let listaMetros = [];

let tremAtual = null;

let walkAction, danceAction, idleAction, acaoAtual;
let loadFinished = false;
let clock = new THREE.Clock();
let keyState = {};
let moveSpeed = 40; 
let turnSpeed = 2.5;
let playerContainer;
let modeloPersonagem;
let isDancingMode = false;
let dustParticles; 
let jetpackParticles; 

let playerVelocityY = 0;
let gravity = -60;
let jumpForce = 45;
let isJumping = false;

let cameraMode = 0; 

const TRILHO_COMPRIMENTO = 4000;
const LIMITE_RESET = 2000;

const manager = new THREE.LoadingManager();

export function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa04b36);
    scene.fog = new THREE.Fog(0xa04b36, 100, 900);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 20, -30);

    renderer = new THREE.WebGLRenderer({ antialias: true }); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    document.body.appendChild(renderer.domElement);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.4; 
    bloomPass.strength = 1.0;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen';
    loadingScreen.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:#000;color:#fff;display:flex;justify-content:center;align-items:center;font-family:Arial;z-index:999;font-size:24px;';
    loadingScreen.innerHTML = 'CARREGANDO BASE DE MARTE... 0%';
    document.body.appendChild(loadingScreen);

    const instructions = document.createElement('div');
    instructions.style.cssText = 'position:absolute;top:20px;left:20px;color:#00ff00;font-family:monospace;pointer-events:none;text-shadow: 1px 1px 2px black;';
    instructions.innerHTML = `
        <h3>MARTE EXPLORER</h3>
        WASD - Mover | B - Dançar<br>
        ESPAÇO - Jetpack (Voar)<br>
        V - Alternar Câmera<br>
        C - Chamar Metrô | E - Entrar/Sair
    `;
    document.body.appendChild(instructions);

    manager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
        loadingScreen.innerHTML = `CARREGANDO BASE DE MARTE... ${percent}%`;
    };

    manager.onLoad = function () {
        loadingScreen.style.display = 'none';
        loadFinished = true;
        if (idleAction) { acaoAtual = idleAction; acaoAtual.play(); }
    };

    criaIluminacaoFixa();
    criaChao();
    criaParticulasAmbiente();
    criaSistemaMetroCruzado();
    loadAssets();
    createGui();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    renderer.setAnimationLoop(renderLoop);
}

function criaIluminacaoFixa() {
    const ambientLight = new THREE.AmbientLight(0xffccaa, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(150, 300, 100);
    sunLight.castShadow = true;
    
    sunLight.shadow.mapSize.width = 16384;
    sunLight.shadow.mapSize.height = 16384;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 1000;
    const d = 500;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);
}

function criaParticulasAmbiente() {
    const geoDust = new THREE.BufferGeometry();
    const posDust = [];
    for(let i=0; i<800; i++) {
        posDust.push(
            (Math.random()*1600)-800, 
            Math.random()*100, 
            (Math.random()*1600)-800
        );
    }
    geoDust.setAttribute('position', new THREE.Float32BufferAttribute(posDust, 3));
    dustParticles = new THREE.Points(geoDust, new THREE.PointsMaterial({ color: 0xffaa88, size: 0.8, transparent: true, opacity: 0.6 }));
    scene.add(dustParticles);

    const geoJet = new THREE.BufferGeometry();
    const posJet = new Float32Array(50 * 3); 
    geoJet.setAttribute('position', new THREE.BufferAttribute(posJet, 3));
    jetpackParticles = new THREE.Points(geoJet, new THREE.PointsMaterial({ color: 0x00ffff, size: 2, transparent: true }));
    jetpackParticles.visible = false;
    scene.add(jetpackParticles);
}

let criaChao = function () {
    const textureLoader = new THREE.TextureLoader(manager);
    const texture = textureLoader.load('assets/marte/marte_solo.jpg');
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(50, 50);
    
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), material);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
};

let criaSistemaMetroCruzado = function() {
    const objLoader = new OBJLoader(manager);
    const linhas = [
        { eixo: 'z', pos: -70, direcao: 1, cor: 0x00ffff, emissive: 0x004444 },
        { eixo: 'z', pos: -90, direcao: -1, cor: 0xff0055, emissive: 0x440011 },
        { eixo: 'x', pos: 50, direcao: 1, cor: 0xffaa00, emissive: 0x442200 },
        { eixo: 'x', pos: 70, direcao: -1, cor: 0x333333, emissive: 0x111111 }
    ];

    const trilhoMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });

    linhas.forEach(linha => {
        if (linha.eixo === 'z') {
            let t1 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, TRILHO_COMPRIMENTO), trilhoMat); t1.position.set(linha.pos - 1.5, 0.2, 0); scene.add(t1);
            let t2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, TRILHO_COMPRIMENTO), trilhoMat); t2.position.set(linha.pos + 1.5, 0.2, 0); scene.add(t2);
        } else {
            let t1 = new THREE.Mesh(new THREE.BoxGeometry(TRILHO_COMPRIMENTO, 0.5, 1), trilhoMat); t1.position.set(0, 0.2, linha.pos - 1.5); scene.add(t1);
            let t2 = new THREE.Mesh(new THREE.BoxGeometry(TRILHO_COMPRIMENTO, 0.5, 1), trilhoMat); t2.position.set(0, 0.2, linha.pos + 1.5); scene.add(t2);
        }

        objLoader.load('assets/marte/metro.obj', function(modeloOriginal) {
            const matTrem = new THREE.MeshStandardMaterial({ color: linha.cor, emissive: linha.emissive, emissiveIntensity: 2, roughness: 0.2, metalness: 0.8 });
            modeloOriginal.traverse(c => { if(c.isMesh) { c.material = matTrem; c.castShadow = true; }});

            for (let i = 0; i < 3; i++) {
                let trem = modeloOriginal.clone();
                let offset = -1000 + (i * 800);
                trem.scale.set(6, 6, 6);
                if (linha.eixo === 'z') { trem.position.set(linha.pos, 0.8, offset); trem.rotation.y = (linha.direcao === -1) ? Math.PI : 0; } 
                else { trem.position.set(offset, 0.8, linha.pos); trem.rotation.y = (linha.direcao === 1) ? Math.PI / 2 : -Math.PI / 2; }
                
                trem.userData.bbox = new THREE.Box3().setFromObject(trem);
                scene.add(trem);
                listaMetros.push({ mesh: trem, speed: 40 * linha.direcao, eixo: linha.eixo, parado: false, chamado: false });
            }
        });
    });
};

let loadAssets = function () {
    const objLoader = new OBJLoader(manager);
    const fbxLoader = new FBXLoader(manager);

    let modeloBase, modeloNPC, clipNPCAnim, modeloCaixa, modeloRover, modeloBarril;

    function setupModel(obj, color, isSolid = true) {
        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6, metalness: 0.3 });
        obj.traverse(c => { if (c.isMesh) { c.material = mat; c.castShadow = true; c.receiveShadow = true; }});
        if (isSolid) { obj.userData.bbox = new THREE.Box3().setFromObject(obj); collidableObjects.push(obj); }
    }

    objLoader.load('assets/marte/base_marte.obj', (obj) => { setupModel(obj, 0x888888); modeloBase = obj; check(); });
    objLoader.load('assets/marte/caixa.obj', (obj) => { setupModel(obj, 0xffa500); modeloCaixa = obj; check(); }, undefined, () => { modeloCaixa = "erro"; check(); });
    objLoader.load('assets/marte/rover.obj', (obj) => { setupModel(obj, 0x555555); modeloRover = obj; check(); }, undefined, () => { modeloRover = "erro"; check(); });
    objLoader.load('assets/marte/barrel.obj', (obj) => { setupModel(obj, 0xaaaaaa); modeloBarril = obj; check(); }, undefined, () => { modeloBarril = "erro"; check(); });
    
    fbxLoader.load('assets/marte/npc.fbx', (fbx) => {
        modeloNPC = fbx; modeloNPC.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }});
        fbxLoader.load('assets/marte/npc_idle.fbx', (anim) => { if (anim.animations.length > 0) clipNPCAnim = anim.animations[0]; check(); });
    }, undefined, () => { modeloNPC = "erro"; check(); });

    objLoader.load('assets/marte/rocha.obj', (obj) => {
        const matRocha = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1.0 });
        obj.traverse(c => c.material = matRocha);
        
        for(let i=0; i<200; i++) {
            let rx = (Math.random()*800)-400;
            let rz = (Math.random()*800)-400;
            
            if (Math.abs(rx) < 50 && Math.abs(rz) < 50) continue; 
            if ((rx > -100 && rx < -60) || (rx > 40 && rx < 80)) continue; 
            if ((rz > -100 && rz < -60) || (rz > 40 && rz < 80)) continue;

            let r = obj.clone(); 
            r.position.set(rx, 0, rz); 
            r.scale.setScalar(Math.random()*5 + 1); 
            r.rotation.y = Math.random() * Math.PI;
            
            r.updateMatrixWorld(); 
            r.userData.bbox = new THREE.Box3().setFromObject(r); 
            collidableObjects.push(r); 
            scene.add(r);
        }
    });

    objLoader.load('assets/marte/radar.obj', (obj) => {
        setupModel(obj, 0x555555); obj.position.set(-40, 0, 40); obj.scale.set(10, 10, 10);
        obj.userData.bbox = new THREE.Box3().setFromObject(obj); collidableObjects.push(obj); scene.add(obj); radarObject = obj;
    });

    objLoader.load('assets/marte/hangar.obj', (obj) => {
        setupModel(obj, 0xeeeeee); obj.position.set(0, 0, 0); obj.scale.set(8, 8, 8); 
        obj.userData.bbox = new THREE.Box3().setFromObject(obj); collidableObjects.push(obj); scene.add(obj);
    }, undefined, () => {});

    function check() {
        if (modeloBase && (modeloNPC || modeloNPC==="erro") && !objects['coloniaCriada']) {
             criaColonia(modeloBase, modeloNPC === "erro" ? null : modeloNPC, clipNPCAnim, modeloCaixa, modeloRover, modeloBarril);
             objects['coloniaCriada'] = true;
        }
    }
    carregaJogadorPrincipal(fbxLoader);
};

function criaColonia(objBase, objNPC, animNPC, objCaixa, objRover, objBarril) {
    const matLuz = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 5 });
    const geomLuz = new THREE.SphereGeometry(0.3);
    const geomPoste = new THREE.CylinderGeometry(0.1, 0.1, 6, 8);
    const matPoste = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const distritos = [ { x: -30, z: -160, qtd: 4 }, { x: -30, z: 160, qtd: 4 }, { x: 160, z: 30, qtd: 4 }, { x: -160, z: 30, qtd: 4 } ];

    distritos.forEach(distrito => {
        for (let i = 0; i < distrito.qtd; i++) {
            let baseX = distrito.x + (Math.random() * 60) - 30;
            let baseZ = distrito.z + (Math.random() * 60) - 30;
            
            let baseClone = objBase.clone();
            baseClone.position.set(baseX, 0, baseZ); 
            baseClone.scale.set(5, 5, 5); 
            baseClone.rotation.y = Math.random() * Math.PI;
            
            baseClone.updateMatrixWorld(); 
            baseClone.userData.bbox = new THREE.Box3().setFromObject(baseClone); 
            collidableObjects.push(baseClone); 
            scene.add(baseClone);

            let poste = new THREE.Mesh(geomPoste, matPoste);
            let lampada = new THREE.Mesh(geomLuz, matLuz);
            poste.position.set(baseX + 5, 3, baseZ + 5); 
            lampada.position.set(0, 3, 0); 
            poste.add(lampada);
            
            let pointLight = new THREE.PointLight(0x00ff00, 2, 25);
            pointLight.position.set(0, 2.5, 0);
            poste.add(pointLight);
            
            scene.add(poste);
        }
    });

    if (objNPC && animNPC) {
        for(let n=0; n<10; n++) {
            let npc = SkeletonUtils.clone(objNPC);
            npc.scale.set(0.02, 0.02, 0.02); 
            npc.position.set((Math.random()*200)-100, 0, (Math.random()*200)-100); 
            scene.add(npc);
            let mixerNPC = new THREE.AnimationMixer(npc);
            let action = mixerNPC.clipAction(animNPC); action.startAt(Math.random()).play(); npcMixers.push(mixerNPC); 
        }
    }
}

function carregaJogadorPrincipal(fbxLoader) {
    fbxLoader.load('assets/marte/personagem.fbx', function (fbx) {
        modeloPersonagem = fbx;
        modeloPersonagem.scale.set(0.02, 0.02, 0.02);
        modeloPersonagem.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }});
        playerContainer = new THREE.Group();
        playerContainer.add(modeloPersonagem);
        playerContainer.position.set(0, 0, 20); 
        scene.add(playerContainer);
        mixer = new THREE.AnimationMixer(modeloPersonagem);
        fbxLoader.load('assets/marte/anim_walk.fbx', (anim) => { if(anim.animations[0]) walkAction = mixer.clipAction(anim.animations[0]); });
        fbxLoader.load('assets/marte/anim_dance.fbx', (anim) => { if(anim.animations[0]) danceAction = mixer.clipAction(anim.animations[0]); });
        fbxLoader.load('assets/marte/anim_idle.fbx', (anim) => { if(anim.animations[0]) idleAction = mixer.clipAction(anim.animations[0]); });
    });
}

let trocaAcao = function(novaAcao) {
    if (acaoAtual === novaAcao) return;
    if (acaoAtual) acaoAtual.fadeOut(0.2);
    if (novaAcao) { novaAcao.reset().fadeIn(0.2).play(); acaoAtual = novaAcao; }
};

function checkCollision(newPos) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(newPos, new THREE.Vector3(2, 5, 2));
    for (let obj of collidableObjects) {
        if (obj.userData.bbox && playerBox.intersectsBox(obj.userData.bbox)) return true;
    }
    return false;
}

function updateJetpackParticles() {
    if (!jetpackParticles || !playerContainer) return;

    if (keyState[32]) { 
        jetpackParticles.visible = true;
        const positions = jetpackParticles.geometry.attributes.position.array;
        for(let i=0; i<positions.length; i+=3) {
            if (Math.random() > 0.9) {
                positions[i] = playerContainer.position.x + (Math.random() - 0.5);
                positions[i+1] = playerContainer.position.y + 1;
                positions[i+2] = playerContainer.position.z + (Math.random() - 0.5);
            } else {
                positions[i+1] -= 0.5;
            }
        }
        jetpackParticles.geometry.attributes.position.needsUpdate = true;
    } else {
        jetpackParticles.visible = false;
    }
}

let renderLoop = function () {
    let delta = clock.getDelta();

    if (loadFinished && playerContainer) {
        if (mixer) mixer.update(delta);
        npcMixers.forEach(m => m.update(delta));
        if (radarObject) radarObject.rotation.y += delta * 1.0;

        if (dustParticles) {
            const positions = dustParticles.geometry.attributes.position.array;
            for(let i=1; i<positions.length; i+=3) {
                positions[i] -= delta * 5; 
                if (positions[i] < 0) positions[i] = 100;
            }
            dustParticles.geometry.attributes.position.needsUpdate = true;
            dustParticles.position.x = playerContainer.position.x;
            dustParticles.position.z = playerContainer.position.z;
        }

        listaMetros.forEach(trem => {
            if (!trem.parado) {
                let moveAmount = trem.speed * delta;
                if (trem.eixo === 'z') {
                    trem.mesh.position.z += moveAmount;
                    if (Math.abs(trem.mesh.position.z) > LIMITE_RESET) trem.mesh.position.z *= -1;
                } else {
                    trem.mesh.position.x += moveAmount;
                    if (Math.abs(trem.mesh.position.x) > LIMITE_RESET) trem.mesh.position.x *= -1;
                }
            }
            if (trem.chamado) {
                let dist = (trem.eixo === 'z') ? Math.abs(trem.mesh.position.z - playerContainer.position.z) : Math.abs(trem.mesh.position.x - playerContainer.position.x);
                if (dist < 2) { trem.parado = true; trem.chamado = false; 
                   if(trem.eixo === 'z') trem.mesh.position.z = playerContainer.position.z; else trem.mesh.position.x = playerContainer.position.x;
                }
            }
        });

        if (tremAtual) {
            playerContainer.position.copy(tremAtual.mesh.position);
            playerContainer.position.y = 8; 
            playerVelocityY = 0;
            isJumping = false;
        } 
        else {
            if (keyState[32]) { 
                playerVelocityY += jumpForce * delta * 2;
                playerVelocityY = Math.min(playerVelocityY, 20); 
                isJumping = true;
            } else {
                if (playerContainer.position.y > 0) playerVelocityY += gravity * delta;
            }
            playerContainer.position.y += playerVelocityY * delta;
            if (playerContainer.position.y < 0) {
                playerContainer.position.y = 0;
                playerVelocityY = 0;
                isJumping = false;
            }

            updateJetpackParticles();

            let moveDist = moveSpeed * delta;
            let rotDist = turnSpeed * delta;
            let isWalking = false;
            
            if (keyState[65]) { playerContainer.rotateY(rotDist); }
            if (keyState[68]) { playerContainer.rotateY(-rotDist); }

            let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerContainer.quaternion);
            let nextPos = playerContainer.position.clone();

            if (keyState[87]) { nextPos.add(forward.multiplyScalar(moveDist)); isWalking = true; } 
            if (keyState[83]) { nextPos.add(forward.multiplyScalar(-moveDist)); isWalking = true; }

            if (isWalking && !checkCollision(nextPos)) { playerContainer.position.x = nextPos.x; playerContainer.position.z = nextPos.z; }

            if (playerContainer.position.y > 1) {
                trocaAcao(idleAction); 
            } else {
                if (isWalking) { isDancingMode = false; trocaAcao(walkAction); }
                else if (isDancingMode) trocaAcao(danceAction);
                else trocaAcao(idleAction);
            }
        }

        let relativeOffset;
        let lookTarget = playerContainer.position.clone().add(new THREE.Vector3(0, 4, 0));

        if (cameraMode === 0) { 
             relativeOffset = new THREE.Vector3(0, 8, -18);
        } else { 
             relativeOffset = new THREE.Vector3(0, 60, -30);
        }
        
        const cameraOffset = relativeOffset.applyMatrix4(playerContainer.matrixWorld);
        camera.position.lerp(cameraOffset, 0.1);
        camera.lookAt(lookTarget);
        
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
};

let onKeyDown = function (e) { 
    keyState[e.keyCode] = true; 
    
    if (e.keyCode === 66 && !e.repeat) isDancingMode = !isDancingMode; 
    if (e.keyCode === 86 && !e.repeat) cameraMode = (cameraMode === 0) ? 1 : 0; 

    if (e.keyCode === 67 && !e.repeat) { 
        let tremMaisProximo = null;
        listaMetros.forEach(trem => {
            let d = (trem.eixo === 'z') ? Math.abs(trem.mesh.position.x - playerContainer.position.x) : Math.abs(trem.mesh.position.z - playerContainer.position.z);
            if (d < 15) tremMaisProximo = trem;
        });
        if (tremMaisProximo) {
            if (tremMaisProximo.parado) tremMaisProximo.parado = false; 
            else { 
                tremMaisProximo.chamado = true;
                let distLong = (tremMaisProximo.eixo === 'z') ? Math.abs(tremMaisProximo.mesh.position.z - playerContainer.position.z) : Math.abs(tremMaisProximo.mesh.position.x - playerContainer.position.x);
                if (distLong > 200) {
                    let offset = -Math.sign(tremMaisProximo.speed) * 100;
                    if(tremMaisProximo.eixo === 'z') tremMaisProximo.mesh.position.z = playerContainer.position.z + offset; else tremMaisProximo.mesh.position.x = playerContainer.position.x + offset;
                }
            }
        }
    }

    if (e.keyCode === 69 && !e.repeat) { 
        if (tremAtual) {
            let offset = new THREE.Vector3(5, 0, 0).applyQuaternion(playerContainer.quaternion);
            playerContainer.position.add(offset); playerContainer.position.y = 0; 
            tremAtual.parado = false; tremAtual = null;
        } else {
            let tremProximo = null; let menorDistancia = 15;
            listaMetros.forEach(trem => { let dist = playerContainer.position.distanceTo(trem.mesh.position); if (dist < menorDistancia) { tremProximo = trem; menorDistancia = dist; }});
            if (tremProximo) { tremAtual = tremProximo; tremAtual.parado = false; isDancingMode = false; trocaAcao(idleAction); }
        }
    }
};

let onKeyUp = function (e) { keyState[e.keyCode] = false; };

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
}

let createGui = function () {
    const gui = new GUI();
    const params = { bloomStrength: 1.0 };
    gui.add(params, 'bloomStrength', 0, 3).onChange(val => { composer.passes[1].strength = val; });
};
