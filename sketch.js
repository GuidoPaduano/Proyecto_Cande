// ==================== PAISAJE DEL ÁNIMO vFINAL ====================
// Configuración base, variables y UI.

// Estado
let state = "intro";

// Audio
let mic, fft, haveMic = false, paused = false, wantMic = true;
let lastSavedURL = null;

// Parámetros
let sens = 0.9;
let paletteName = "calma";
let t = 0;

// Dibujo
let paths = [];
let autoPaint = true;
let voiceThreshold = 0.12;
let voiceDensity = 2.0;

// Control de ritmo (para hacerlo más contemplativo)
let frameSkip = 0;   // cuantos frames esperar entre cada “oleada” de piezas

// Noise gate
let gateOpen = false, lastGateState = false;
let silenceFrames = 0;
const SILENCE_HOLD = 60;

// Capas
let paintLayer;
let persistPaint = true;
let decayAlpha = 0;

// Collage
let collage = [];
const MAX_COLLAGE = 9000;
let currentLayout = 0;
let anchors = [];
let horizonY = 0;

// Colores base
let bgCol1, bgCol2, figCol1, figCol2, accentCol;

// UI
let uiWrap,
  btnStart,
  btnConfig,
  btnRun,
  btnSave,
  btnBack,
  btnPause,
  btnClear,
  btnFinish,
  btnEndBack,
  btnHome; // botón "Volver a inicio"

let selPalette,
  sliderSens,
  chkDemo,
  chkAutoPaint,
  sliderThresh,
  sliderDensity,
  chkPersist,
  sliderDecay;

let bannerMsg, helpBox, hudBox;

const PALETTES = {
  calma: ["#05101a", "#1a3a4f", "#a5d8ff", "#64dfdf", "#ffffff", "#020617"],
  energia: ["#2a0500", "#5c1000", "#ffea00", "#ff5e00", "#ff9100", "#2a0500"]
};

const LAYOUT_COUNT = 30;

// hook que llama index.html cuando entras a la obra
window.__arrancarSketch = () => { /* p5 ya se inicializa solo, lo dejamos por compatibilidad */ };

function setup() {
  const parent = select("#app");

  // --- HD & FULL SCREEN ---
  pixelDensity(window.devicePixelRatio);
  let w = windowWidth;
  let h = windowHeight;

  const c = createCanvas(w, h);
  c.parent(parent);
  c.style('z-index', '1');
  c.style('display', 'block');

  paintLayer = createGraphics(w, h);
  paintLayer.pixelDensity(window.devicePixelRatio);
  paintLayer.clear();

  fft = new p5.FFT(0.9, 1024);
  makeUI();
  newScenery();
  banner("Sistema listo: 30 Mundos cargados.");
  state = "intro";
  background(10);
}

function makeUI() {
  const prevUI = selectAll('.p5ui');
  for (let p of prevUI) p.remove();

  uiWrap = createDiv().addClass('p5ui');
  uiWrap.parent(select("#app"));

  // Botones de la barra inferior derecha
  btnStart = createButton("Comenzar");
  btnStart.mousePressed(() => state = "config");
  btnStart.parent(uiWrap);

  btnConfig = createButton("Configurar");
  btnConfig.mousePressed(() => state = "config");
  btnConfig.parent(uiWrap);

  // Botón para volver a la landing de bienvenida
  btnHome = createButton("Volver a inicio");
  btnHome.mousePressed(() => {
    stopAudio();
    resetWork();
    if (window.__volverAlInicio) {
      window.__volverAlInicio();   // vuelve a la home del index.html
    } else {
      state = "intro";
    }
  });
  btnHome.parent(uiWrap);

  selPalette = createSelect();
  selPalette.option('calma');
  selPalette.option('energia');
  selPalette.parent(uiWrap);
  selPalette.value(paletteName);
  selPalette.changed(() => {
    paletteName = selPalette.value();
    newScenery();
    banner("Paleta: " + paletteName.toUpperCase());
  });

  sliderSens = createSlider(50, 150, 90, 1);
  sliderSens.parent(uiWrap);
  sliderSens.input(() => sens = sliderSens.value() / 100);

  chkDemo = createCheckbox("Modo demo", false);
  chkDemo.parent(uiWrap);
  chkDemo.changed(() => { wantMic = !chkDemo.checked(); });

  // Ocultos / avanzados (por ahora no se muestran)
  chkAutoPaint = createCheckbox("Pintar", autoPaint);
  chkAutoPaint.parent(uiWrap);
  chkAutoPaint.changed(() => autoPaint = chkAutoPaint.checked());

  sliderThresh = createSlider(1, 100, 12, 1);
  sliderThresh.parent(uiWrap);
  sliderThresh.input(() => voiceThreshold = sliderThresh.value() / 100);

  sliderDensity = createSlider(50, 400, 200, 1);
  sliderDensity.parent(uiWrap);
  sliderDensity.input(() => voiceDensity = sliderDensity.value() / 100);

  chkPersist = createCheckbox("Persistente", persistPaint);
  chkPersist.parent(uiWrap);
  chkPersist.changed(() => persistPaint = chkPersist.checked());

  sliderDecay = createSlider(0, 30, 0, 1);
  sliderDecay.parent(uiWrap);
  sliderDecay.input(() => decayAlpha = sliderDecay.value());

  btnRun = createButton("Iniciar obra");
  btnRun.mousePressed(initRun);
  btnRun.parent(uiWrap);

  btnPause = createButton("Pausar");
  btnPause.mousePressed(togglePause);
  btnPause.parent(uiWrap);

  btnClear = createButton("Reiniciar");
  btnClear.mousePressed(() => { clearPaint(); collage = []; newScenery(); });
  btnClear.parent(uiWrap);

  btnSave = createButton("Guardar PNG");
  btnSave.mousePressed(saveAndPreview);
  btnSave.parent(uiWrap);

  btnFinish = createButton("Finalizar");
  btnFinish.mousePressed(() => { makePreview(); state = "end"; });
  btnFinish.parent(uiWrap);

  btnBack = createButton("Volver");
  btnBack.mousePressed(() => { stopAudio(); resetWork(); state = "intro"; });
  btnBack.parent(uiWrap);

  btnEndBack = createButton("Terminar y volver");
  btnEndBack.mousePressed(() => { stopAudio(); resetWork(); state = "intro"; });
  btnEndBack.parent(uiWrap);

  const prevHelp = select('.help');
  if (prevHelp) prevHelp.remove();
  helpBox = createDiv("<strong>Atajos</strong><br>P: Pausa<br>S: Guardar<br>Q: Finalizar<br>R: Reiniciar<br>C: Cambiar paleta<br>H: Info").addClass('help');
  helpBox.parent(select("#app"));

  const prevHud = select('.hud');
  if (prevHud) prevHud.remove();
  hudBox = createDiv("").addClass("hud");
  hudBox.parent(select("#app"));

  updateUIVisibility();
}

function draw() {
  if (state === "intro") drawIntro();
  else if (state === "config") drawConfig();
  else if (state === "run") drawRun();
  else if (state === "end") drawEnd();
  updateUIVisibility();
}

function drawBackgroundTheme() {
  const cols = PALETTES[paletteName];
  const c1 = color(cols[0]);
  const c2 = color(cols[1]);
  noStroke();
  for (let y = 0; y <= height; y += 10) {
    let inter = map(y, 0, height, 0, 1);
    fill(lerpColor(c1, c2, inter));
    rect(0, y, width, 10);
  }
  for (let y = 0; y < height; y += 8) {
    const n = noise(y * 0.01, t * 0.002);
    stroke(lerpColor(c1, color(255, 255, 255), n * 0.03));
    strokeWeight(1);
    line(0, y, width, y);
  }
}

function drawIntro() {
  drawBackgroundTheme();
  titleBlock("PAISAJE DEL ÁNIMO", "Un autorretrato de voz y movimiento.");
}

function drawConfig() {
  drawBackgroundTheme();
  titleBlock("CONFIGURACIÓN", "Personaliza tu experiencia.");
  noStroke();
  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);
  let y = height - 280;
  text("Paleta: " + paletteName.toUpperCase(), 24, y); y += 30;
  text("Sensibilidad: " + nf(sens, 1, 2), 24, y); y += 30;
  fill(wantMic ? color(100, 255, 100) : color(255, 100, 100));
  text("Micrófono: " + (wantMic ? "ACTIVO" : "APAGADO"), 24, y);
  y += 50;
  fill(255, 200, 100);
  text("Presiona 'Iniciar obra'.", 24, y);
}

function initRun() {
  wantMic = !chkDemo.checked();
  paletteName = selPalette.value();
  sens = sliderSens.value() / 100;
  autoPaint = chkAutoPaint.checked();
  paintLayer.clear();
  collage = [];
  newScenery();
  frameSkip = 0; // reseteamos el ritmo cuando arranca

  if (wantMic) {
    userStartAudio().then(() => {
      try {
        if (mic) mic.stop();
        mic = new p5.AudioIn();
        mic.start(
          () => { haveMic = true; banner("Micrófono ESCUCHANDO 🎤"); },
          (err) => { haveMic = false; banner("Error permisos."); }
        );
      } catch (e) {
        haveMic = false;
      }
    }).catch(e => {
      haveMic = false;
      banner("Audio bloqueado.");
    });
  } else {
    haveMic = false;
    banner("Modo demo.");
  }
  state = "run";
}

function updateVoiceGate(level) {
  if (gateOpen) {
    if (level < voiceThreshold * 0.7) {
      silenceFrames++;
      if (silenceFrames >= SILENCE_HOLD) gateOpen = false;
    } else silenceFrames = 0;
  } else if (level >= voiceThreshold) {
    gateOpen = true;
    silenceFrames = 0;
  }
}

function drawRun() {
  if (paused) return;
  drawBackgroundTheme();
  const level = getLevel();
  if (!fft) fft = new p5.FFT(0.9, 1024);
  fft.analyze();
  updateVoiceGate(level);

  if (!gateOpen && lastGateState !== gateOpen) {
    newScenery();
  }
  lastGateState = gateOpen;

  // Dibujo más contemplativo: solo spawneamos cada X frames
  if (autoPaint && ((haveMic && wantMic && gateOpen) || !wantMic)) {
    if (frameSkip <= 0) {
      spawnCollagePieces(level);
      frameSkip = 4; // cuanto más alto, más lento (6 ~ tranquilo)
    } else {
      frameSkip--;
    }
  }

  drawCollage();

  if (!persistPaint && decayAlpha > 0) {
    paintLayer.noStroke();
    paintLayer.fill(0, decayAlpha);
    paintLayer.rect(0, 0, width, height);
  }
  drawPathsToLayer();
  image(paintLayer, 0, 0);

  if (hudBox && hudBox.elt.style.display !== "none") {
    let st = !wantMic ? "Modo DEMO" : (gateOpen ? "PINTANDO" : "Esperando voz...");
    hudBox.html(`ESTADO: <strong>${st}</strong><br>Nivel: ${nf(level, 1, 2)}<br>Paleta: ${paletteName}`);
  }
  t += 0.01;
}

function drawEnd() {
  background(10);
  titleBlock("OBRA GUARDADA", "Preview exportada.");
  if (!select("#endbox")) {
    const box = createDiv().id("endbox").addClass("endbox");
    box.parent(select("#app"));
    createImg(lastSavedURL || makePreview(), "preview").parent(box);
    const act = createDiv().addClass("actions");
    act.parent(box);
    const b = createButton("Volver");
    b.parent(act);
    b.mousePressed(() => {
      removeEndBox();
      stopAudio();
      resetWork();
      state = "intro";
    });
    createA(lastSavedURL || "#", "Descargar PNG", "_blank").parent(act);
  }
}

function removeEndBox() {
  const eb = select("#endbox");
  if (eb) eb.remove();
}

function saveAndPreview() {
  makePreview();
  saveCanvas("paisaje_del_animo", "png");
  banner("Imagen guardada.");
}

function makePreview() {
  try {
    lastSavedURL = document.querySelector("canvas").toDataURL("image/png");
    return lastSavedURL;
  } catch (e) {
    return null;
  }
}

function voiceColor(level) {
  const f = constrain(map(level, 0, 0.6, 0, 1), 0, 1);
  return lerpColor(
    lerpColor(figCol1, figCol2, random(0.2, 0.8)),
    accentCol,
    f
  );
}

// ==================== 30 LAYOUTS LOGIC ====================

function newScenery() {
  currentLayout = int(random(LAYOUT_COUNT));
  const cols = PALETTES[paletteName];
  bgCol1 = color(cols[0]);
  bgCol2 = color(cols[1]);
  figCol1 = color(cols[2]);
  figCol2 = color(cols[3]);
  accentCol = color(cols[4]);
  anchors = [];
  horizonY = height * random(0.6, 0.8);

  // 1. Anclas
  if ([0].includes(currentLayout)) anchors.push(createVector(width * random(0.3, 0.7), horizonY));
  else if ([1].includes(currentLayout)) { for (let i = 0; i < 5; i++) anchors.push(createVector(width * map(i, 0, 4, 0.1, 0.9) + random(-50, 50), horizonY)); }
  else if ([2].includes(currentLayout)) { anchors.push(createVector(width * 0.2, height)); anchors.push(createVector(width * 0.5, height)); anchors.push(createVector(width * 0.8, height)); }
  else if ([3].includes(currentLayout)) { anchors.push(createVector(width * 0.3, height * 0.4)); anchors.push(createVector(width * 0.7, height * 0.3)); }
  else if ([4].includes(currentLayout)) { for (let i = 0; i < 8; i++) anchors.push(createVector(width * map(i, 0, 7, 0.05, 0.95), height)); }
  else if ([5, 27].includes(currentLayout)) { for (let i = 0; i < 10; i++) anchors.push(createVector(width * random(), 0)); }
  else if ([6, 7, 17, 21, 30].includes(currentLayout)) anchors.push(createVector(width / 2, height / 2));
  else if ([8, 25].includes(currentLayout)) { anchors.push(createVector(width * 0.3, 0)); anchors.push(createVector(width * 0.7, height)); }
  else if ([9].includes(currentLayout)) anchors.push(createVector(width * 0.5, height * 0.5));
  else if ([11, 16, 23, 26, 28, 29].includes(currentLayout)) anchors.push(createVector(width * 0.5, height));
  else if ([13].includes(currentLayout)) { for (let i = 0; i < 6; i++) anchors.push(createVector(random(width), random(height))); }
  else if ([14, 22].includes(currentLayout)) anchors.push(createVector(width / 2, 0));
  else if ([15].includes(currentLayout)) anchors.push(createVector(0, height * 0.7));
  else if ([18].includes(currentLayout)) anchors.push(createVector(width / 2, height));

  collage = [];
  banner("Nuevo Mundo Generado.");
}

function spawnCollagePieces(level) {
  // Mucho más lento: pocas piezas por “oleada”
  const base = constrain(map(level, voiceThreshold * 0.6, 1.2, 0, 10), 0, 10);
  const count = int(1 + base * 0.4);   // antes eran montones; ahora 1–5 piezas aprox

  for (let i = 0; i < count; i++) {
    if (collage.length >= MAX_COLLAGE) collage.splice(0, 1);
    let x = 0, y = 0, w = 0, h = 0, ang = 0, col, layer = 1, shadow = true;
    const vcol = voiceColor(level);
    let anchor = (anchors.length > 0) ? random(anchors) : createVector(width / 2, height / 2);

    // --- 30 LAYOUTS ---
    if (currentLayout === 0) { // Arbol
      if (random() < 0.2) { x = random(width); y = random(horizonY * 0.8); w = random(40, 120); h = 5; col = lerpColor(vcol, color(255), 0.1); layer = 0; shadow = false; }
      else if (random() < 0.5) { x = anchor.x + random(-40, 40); y = anchor.y - random(20, 150); w = 15; h = 40; col = lerpColor(vcol, color(0), 0.2); layer = 2; }
      else { x = random(width); y = random(horizonY, height); w = 50; h = 15; col = vcol; layer = 1; }
    } else if (currentLayout === 1) { // Bosque
      if (random() < 0.6) { x = anchor.x + random(-20, 20); y = anchor.y - random(0, 200); w = 10; h = 80; col = vcol; layer = 2; }
      else { x = random(width); y = random(horizonY - 20, height); w = 60; h = 15; col = lerpColor(vcol, color(0), 0.3); layer = 3; }
    } else if (currentLayout === 2) { // Montaña
      x = anchor.x + random(-150, 150); y = height - random(0, 300); w = 150 * (0.5 + level); h = 80; ang = (x < width / 2) ? -0.5 : 0.5; col = vcol; layer = 2;
    } else if (currentLayout === 3) { // Islas
      x = anchor.x + random(-80, 80); y = anchor.y + random(-50, 50); w = 60; h = 30; col = lerpColor(vcol, color(255), 0.2); layer = 1; shadow = false;
    } else if (currentLayout === 4) { // Ciudad
      x = anchor.x + random(-15, 15); h = 150 * (0.5 + level); y = height - h / 2; w = 30; ang = 0; col = lerpColor(vcol, color(0), 0.1); layer = 2;
    } else if (currentLayout === 5) { // Lluvia
      x = random(width); y = random(height); w = 3; h = 80 * (1 + level); ang = 0.2; col = lerpColor(vcol, color(255), 0.5); layer = 3; shadow = false;
    } else if (currentLayout === 6) { // Vortice
      let a = random(TWO_PI), r = random(50, 400); x = width / 2 + cos(a + t) * r; y = height / 2 + sin(a + t) * r; w = 30; h = 30; ang = a + 0.8; col = vcol; layer = 1;
    } else if (currentLayout === 7) { // Explosion
      let a = random(TWO_PI), d = random(0, 300) * level * 2; x = width / 2 + cos(a) * d; y = height / 2 + sin(a) * d; w = 20; h = 20; ang = a; col = vcol; layer = 2;
    } else if (currentLayout === 8) { // Cueva
      x = anchor.x + random(-40, 40); y = (anchor.y === 0) ? random(0, height * 0.4) : random(height * 0.6, height); w = 50; h = 150; col = lerpColor(vcol, color(0), 0.4); layer = 3;
    } else if (currentLayout === 9) { // Lago
      x = random(width); let off = random(10, 150); y = anchor.y - off; w = 60; h = 20; col = vcol; layer = 1;
      collage.push({ x: x, y: anchor.y + off, w: w, h: h, ang: 0, col: lerpColor(col, color(0), 0.3), layer: 0, shadow: false });
    } else if (currentLayout === 10) { // Abstracto
      x = random(width); y = random(height); w = 40; h = 40; col = vcol; layer = random(3); ang = random(1.5);
    } else if (currentLayout === 11) { // Flores
      x = random(width); y = height - random(0, 200); w = 15; h = 15; col = lerpColor(vcol, accentCol, 0.5); layer = 2; shadow = false;
    } else if (currentLayout === 12) { // Galaxia
      x = random(width); y = random(height); w = 4; h = 4; col = color(255); layer = 0; shadow = false;
      if (random() < 0.1) { w = 15; h = 15; col = vcol; }
    } else if (currentLayout === 13) { // Red
      let n = random(anchors); x = n.x + random(-60, 60); y = n.y + random(-60, 60); w = 4; h = 80; ang = atan2(n.y - y, n.x - x); col = vcol; layer = 1;
    } else if (currentLayout === 14) { // Cascada
      x = random(width * 0.4, width * 0.6); y = random(height); w = 10; h = 60; col = lerpColor(vcol, color(255), 0.3); layer = 2; ang = 0;
    } else if (currentLayout === 15) { // Dunas
      x = random(width); y = random(height * 0.5, height); w = 200; h = 40; ang = random(-0.1, 0.1); col = lerpColor(vcol, color(0), 0.1); layer = map(y, height / 2, height, 0, 3);
    } else if (currentLayout === 16) { // Burbujas
      x = random(width); y = height - (t * 50 + random(height)) % height; w = 25; h = 25; col = lerpColor(vcol, color(255, 255, 255, 100), 0.5); layer = 2; shadow = false;
    } else if (currentLayout === 17) { // Cristales
      x = width / 2 + random(-10, 10); y = height / 2 + random(-10, 10); w = 10; h = 150 * level; ang = random(TWO_PI); col = lerpColor(vcol, color(255), 0.7); layer = 2;
    } else if (currentLayout === 18) { // Torre
      x = width / 2 + random(-40, 40) * level; y = height - random(height * 0.8); w = 60 * (1 - y / height); h = 30; col = vcol; layer = 2;
    } else if (currentLayout === 19) { // Caos
      x = random(width); y = random(height); w = 300; h = 2; ang = random(TWO_PI); col = vcol; layer = 1;
    } else if (currentLayout === 20) { // Mosaico
      let g = 40; x = int(random(width) / g) * g; y = int(random(height) / g) * g; w = g - 2; h = g - 2; col = vcol; layer = 0;
    } else if (currentLayout === 21) { // Eclipse
      let d = random(100, 300), ap = random(TWO_PI); x = width / 2 + cos(ap) * d; y = height / 2 + sin(ap) * d; w = 30; h = 20; ang = ap + 1.5; col = vcol; layer = 1;
    } else if (currentLayout === 22) { // ADN
      let p = (y / height) * TWO_PI * 4;
      x = width / 2 + sin(p + t) * 100;
      y = random(height);
      w = 40; h = 10; ang = 0; col = vcol; layer = 1;
      collage.push({ x: width / 2 - sin(p + t) * 100, y: y, w: 40, h: 10, ang: 0, col: lerpColor(col, color(0), 0.2), layer: 1, shadow: true });
    } else if (currentLayout === 23) { // Fuego
      x = random(width * 0.3, width * 0.7); y = height - random(0, 300) * level; w = 40 * (1 - y / height); h = 70; ang = random(-0.3, 0.3); col = lerpColor(vcol, color(255, 200, 0), 0.5); layer = 2;
    } else if (currentLayout === 24) { // Niebla
      x = random(width); y = random(height); w = 200; h = 100; col = color(red(vcol), green(vcol), blue(vcol), 50); layer = 3; shadow = false;
    } else if (currentLayout === 25) { // Cañon
      x = (random() < 0.5) ? random(0, width * 0.3) : random(width * 0.7, width); y = random(height); w = 100; h = 40; col = vcol; layer = 2;
    } else if (currentLayout === 26) { // Arcoiris
      let r = random(200, 600), a = 3.14 + random(3.14); x = width / 2 + cos(a) * r; y = height + sin(a) * r; w = 30; h = 40; ang = a + 1.5; col = vcol; layer = 0;
    } else if (currentLayout === 27) { // Matrix
      x = int(random(width) / 20) * 20; y = random(height); w = 15; h = 20; col = lerpColor(vcol, color(0, 255, 0), 0.3); layer = 2;
    } else if (currentLayout === 28) { // Coral
      x = random(width); y = height; w = 20; h = 100 * level; ang = random(-0.5, 0.5); col = vcol; layer = 2;
    } else { // 29 Volcan
      let a = random(3.6, 5.7), r = random(50, height) * level; x = width / 2 + cos(a) * r; y = height + sin(a) * r; w = 20; h = 20; ang = random(TWO_PI); col = lerpColor(vcol, color(255, 50, 0), 0.6); layer = 1;
    }

    if (ang === 0 && currentLayout !== 20) ang = radians(random(-5, 5));
    collage.push({ x, y, w, h, ang, col, layer, shadow });
  }
}

function drawCollage() {
  const ordered = collage.slice().sort((a, b) => a.layer - b.layer);
  for (const p of ordered) {
    push();
    translate(p.x, p.y);
    rotate(p.ang);
    if (p.shadow) {
      noStroke();
      fill(0, 30);
      rect(4, 4, p.w, p.h, 4);
    }
    noStroke();
    fill(p.col);
    rect(0, 0, p.w, p.h, 2);
    pop();
  }
}

function drawPathsToLayer() {
  paintLayer.strokeWeight(3);
  paintLayer.noFill();
  for (let p of paths) {
    paintLayer.stroke(p.col);
    paintLayer.beginShape();
    for (let v of p.pts) paintLayer.vertex(v.x, v.y);
    paintLayer.endShape();
  }
  if (state === "run" && mouseIsPressed && mouseInCanvas() && !overUIArea()) {
    paintLayer.noStroke();
    paintLayer.fill(255, 180);
    paintLayer.circle(mouseX, mouseY, 3);
  }
}

function mouseDragged() {
  if (state !== "run" || !mouseInCanvas() || overUIArea()) return;
  if (!paths.length || paths[paths.length - 1].finished)
    paths.push({ pts: [], col: voiceColor(0.5), finished: false });
  paths[paths.length - 1].pts.push({ x: mouseX, y: mouseY });
  return false;
}

function mousePressed() {
  if (state !== "run" || !mouseInCanvas() || overUIArea()) return;
  paths.push({ pts: [{ x: mouseX, y: mouseY }], col: voiceColor(0.5), finished: false });
  return false;
}

function mouseReleased() {
  if (state === "run" && paths.length) paths[paths.length - 1].finished = true;
}

function touchMoved() { return mouseDragged(); }

function mouseInCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function overUIArea() {
  return (mouseX <= 520 && mouseY >= height - 170);
}

function clearPaint() {
  paths = [];
  paintLayer.clear();
  banner("Lienzo limpio.");
}

function togglePause() {
  paused = !paused;
  banner(paused ? "Pausa" : "Reanudado");
  btnPause.html(paused ? "Reanudar" : "Pausar");
}

function keyPressed() {
  if (key == 'S' || key == 's') saveAndPreview();
  if (key == 'Q' || key == 'q') { makePreview(); state = "end"; }
  if (key == 'P' || key == 'p') togglePause();
  if (key == 'R' || key == 'r') { clearPaint(); collage = []; newScenery(); }
  if (key == 'C' || key == 'c') {
    paletteName = (paletteName == 'calma') ? 'energia' : 'calma';
    selPalette.value(paletteName);
    newScenery();
    banner("Paleta: " + paletteName);
  }
  if (key == 'H' || key == 'h') {
    hudBox.elt.style.display = (hudBox.elt.style.display == "none") ? "block" : "none";
  }
}

function getLevel() {
  let lvl = 0.1;
  if (haveMic && mic) {
    lvl = mic.getLevel() * (2.5 * sens);
    lvl = constrain(lvl, 0, 1.5);
  } else {
    lvl = abs((noise(t * 0.4) - 0.4) * (1.2 * sens));
  }
  return lvl;
}

function updateUIVisibility() {
  const intro = (state === 'intro'),
        config = (state === 'config'),
        run = (state === 'run'),
        end = (state === 'end');

  btnStart.style('display', intro ? 'inline-block' : 'none');
  btnConfig.style('display', intro ? 'inline-block' : 'none');
  btnRun.style('display', config ? 'inline-block' : 'none');
  btnBack.style('display', (run || config) ? 'inline-block' : 'none');
  btnEndBack.style('display', end ? 'inline-block' : 'none');

  selPalette.style('display', config ? 'inline-block' : 'none');
  sliderSens.style('display', config ? 'inline-block' : 'none');
  chkDemo.style('display', config ? 'inline-block' : 'none');

  chkAutoPaint.style('display', 'none');
  sliderThresh.style('display', 'none');
  sliderDensity.style('display', 'none');
  chkPersist.style('display', 'none');
  sliderDecay.style('display', 'none');

  btnPause.style('display', run ? 'inline-block' : 'none');
  btnSave.style('display', run ? 'inline-block' : 'none');
  btnClear.style('display', run ? 'inline-block' : 'none');
  btnFinish.style('display', run ? 'inline-block' : 'none');

  // El botón de volver a inicio siempre visible
  btnHome.style('display', 'inline-block');

  helpBox.style('display', end ? 'none' : 'block');
  hudBox.style('display', end ? 'none' : 'block');

  if (!end) removeEndBox();
}

function stopAudio() {
  try { if (mic) mic.stop(); } catch (e) { }
  haveMic = false;
}

function resetWork() {
  clearPaint();
  paused = false;
  t = 0;
  paletteName = 'calma';
  if (btnPause) btnPause.html("Pausar");
  lastSavedURL = null;
  wantMic = true;
  if (chkDemo) chkDemo.checked(false);
  collage = [];
  newScenery();
  frameSkip = 0;
}

// hook que usa index.html para frenar todo antes de volver a la landing
window.__detenerSketch = function () {
  stopAudio();
  resetWork();
  state = "intro";
};

function titleBlock(title, subtitle) {
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(min(64, width * 0.06));
  text(title, width / 2, height * 0.34);
  fill(220);
  textSize(min(18, width * 0.02));
  text(subtitle, width / 2, height * 0.34 + 48);
}

function banner(msg) {
  if (bannerMsg) bannerMsg.remove();
  bannerMsg = createDiv(msg).addClass('banner');
  bannerMsg.parent(select("#app"));
  setTimeout(() => { if (bannerMsg) bannerMsg.remove(); }, 2500);
}

function pick(arr) { return arr[int(random(arr.length))]; }

function windowResized() {
  let w = windowWidth;
  let h = windowHeight;
  resizeCanvas(w, h);
  let old = paintLayer;
  paintLayer = createGraphics(w, h);
  paintLayer.pixelDensity(window.devicePixelRatio);
  paintLayer.clear();
  if (old) {
    paintLayer.image(old, 0, 0, w, h);
  }
  newScenery();
  updateUIVisibility();
}
