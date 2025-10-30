// ==================== PAISAJE DEL ÁNIMO v2.2.0 ====================
// Novedades clave:
// - Color de líneas por TONO de voz (pitch → azul→rojo).
// - El paisaje-collage se reconfigura aleatoriamente cada vez que BAJA la voz
//   (el gate se cierra). Nunca repite exactamente el mismo (semillas y parámetros nuevos).
//
// Estados: "intro" -> "config" -> "run" -> "end"
let state = "intro";

// Audio
let mic, fft, haveMic = false, paused = false;
let wantMic = false;           // preferencia del usuario
let lastSavedURL = null;       // para la preview en pantalla de fin

// Parámetros generales
let sens = 0.9;                 // sensibilidad (0.5–1.5 aprox)
let paletteName = "calma";      // "calma" | "energia"
let t = 0;                      // tiempo para ruido

// Dibujo manual
let paths = [];                 // trazos del mouse

// Pintar con voz (auto)
let autoPaint = true;
let voiceThreshold = 0.12;      // 0–1.5 aprox (amplitud)
let voiceDensity = 2.0;         // multiplicador de tinta
let particles = [];
const MAX_PARTICLES = 2000;

// Noise gate (solo pinta si la voz supera el umbral)
let gateOpen = false, lastGateState = false;
let silenceFrames = 0;
const SILENCE_HOLD = 6;         // frames de silencio antes de cerrar el gate

// Capa persistente para dibujo
let paintLayer;                 // createGraphics
let persistPaint = true;        // deja huella permanente
let decayAlpha = 0;             // 0 = no decae; 1..30 ~ más rápido

// ==== Modos de pintura ====
// 'paisaje' estilo collage (recortes que se forman con la voz)
let drawMode = 'paisaje';       // 'abstracto' | 'figuras' | 'paisaje'
let shapeType = 'montaña';      // 'montaña' | 'árbol' | 'casa'
let shapePts = [];              // puntos en coords canvas (se recalculan)

// ===== Collage =====
let collage = [];               // piezas acumuladas
const MAX_COLLAGE = 9000;
let treeAnchor;                 // punto base para el árbol del collage

// Semillas y esquema del paisaje aleatorio
let scenerySeed = 0;
let skyA, skyB, groundA, groundB;

// UI DOM
let uiWrap;
let btnStart, btnConfig, btnRun, btnSave, btnBack, btnPause, btnClear, btnFinish;
let selPalette, sliderSens, chkDemo, btnEndBack;
let chkAutoPaint, sliderThresh, sliderDensity;
let chkPersist, sliderDecay;
let bannerMsg, helpBox, hudBox;
// nuevos selectores
let selMode, selShape;

// Paletas
const PALETTES = {
  calma:   ["#0b1d2a", "#1a3a4f", "#3f6b86", "#89aabf", "#cfe7f1"],
  energia: ["#2a0d0d", "#7a1e1e", "#c33b0a", "#f29f05", "#ffd166"]
};

// Expuesta a index.html para arrancar cuando hacen click “Abrir obra”
window.__arrancarSketch = () => { /* p5 llamará setup */ };

function setup() {
  const parent = select("#app");

  pixelDensity(1);
  const c = createCanvas(windowWidth, windowHeight);
  c.parent(parent);
  c.style('position','absolute');
  c.style('left','0');
  c.style('top','0');
  c.style('z-index','1');

  // Capa persistente
  paintLayer = createGraphics(windowWidth, windowHeight);
  paintLayer.pixelDensity(1);
  paintLayer.clear();

  // FFT
  fft = new p5.FFT(0.9, 1024); // más resolución de espectro para pitch

  // UI
  makeUI();

  newScenery(); // primera configuración
  banner("Teclas: [P] pausa, [S] guardar, [Q] fin, [R] borrar, [C] paleta, [H] HUD.");

  state = "intro";
  background(10);
}

function makeUI() {
  uiWrap = createDiv().addClass('p5ui');
  uiWrap.parent(select("#app"));
  uiWrap.style('z-index','9999');

  // Intro
  btnStart = createButton("Comenzar"); btnStart.mousePressed(()=> state="config"); btnStart.parent(uiWrap);
  btnConfig = createButton("Configurar"); btnConfig.mousePressed(()=> state="config"); btnConfig.parent(uiWrap);

  uiWrap.child(createDiv().addClass('sep'));

  // Config
  selPalette = createSelect(); selPalette.option('calma'); selPalette.option('energia');
  selPalette.parent(uiWrap);
  selPalette.value(paletteName);
  selPalette.changed(()=> paletteName = selPalette.value());

  sliderSens = createSlider(50, 150, 90, 1);
  sliderSens.parent(uiWrap);
  sliderSens.input(()=> sens = sliderSens.value()/100);

  chkDemo = createCheckbox("Modo demo (sin mic)", true);
  chkDemo.parent(uiWrap);
  chkDemo.changed(()=> { wantMic = !chkDemo.checked(); });

  chkAutoPaint = createCheckbox("Pintar con voz (auto)", autoPaint);
  chkAutoPaint.parent(uiWrap);
  chkAutoPaint.changed(()=> autoPaint = chkAutoPaint.checked());

  sliderThresh = createSlider(5, 150, 12, 1); // 0.05–1.50
  sliderThresh.parent(uiWrap);
  sliderThresh.input(()=> voiceThreshold = sliderThresh.value()/100);

  sliderDensity = createSlider(50, 400, 200, 1); // 0.5–4.0
  sliderDensity.parent(uiWrap);
  sliderDensity.input(()=> voiceDensity = sliderDensity.value()/100);

  chkPersist = createCheckbox("Pintura persistente", persistPaint);
  chkPersist.parent(uiWrap);
  chkPersist.changed(()=> persistPaint = chkPersist.checked());

  sliderDecay = createSlider(0, 30, 0, 1);
  sliderDecay.parent(uiWrap);
  sliderDecay.input(()=> decayAlpha = sliderDecay.value());

  // ====== MODO: Abstracto / Figuras / Paisaje ======
  selMode = createSelect();
  selMode.option('abstracto'); selMode.option('figuras'); selMode.option('paisaje');
  selMode.parent(uiWrap);
  selMode.value(drawMode);
  selMode.style('position','relative');
  selMode.style('z-index','10000');
  selMode.changed(()=> {
    drawMode = selMode.value();
    updateModeUIVisibility();
    if (drawMode==='figuras') buildShape();
  });

  selShape = createSelect();
  selShape.option('montaña'); selShape.option('árbol'); selShape.option('casa');
  selShape.parent(uiWrap);
  selShape.value(shapeType);
  selShape.style('position','relative');
  selShape.style('z-index','10000');
  selShape.changed(()=> { shapeType = selShape.value(); if (state!=='intro') buildShape(); });

  btnRun = createButton("Iniciar obra"); btnRun.mousePressed(initRun); btnRun.parent(uiWrap);

  uiWrap.child(createDiv().addClass('sep'));

  // Run
  btnPause = createButton("Pausar"); btnPause.mousePressed(togglePause); btnPause.parent(uiWrap);
  btnClear = createButton("Borrar (trazos/voz)"); btnClear.mousePressed(()=> { clearPaint(); collage = []; }); btnClear.parent(uiWrap);
  btnSave = createButton("Guardar PNG"); btnSave.mousePressed(saveAndPreview); btnSave.parent(uiWrap);
  btnFinish = createButton("Finalizar"); btnFinish.mousePressed(()=> { makePreview(); state = "end"; }); btnFinish.parent(uiWrap);
  btnBack = createButton("Volver inicio"); btnBack.mousePressed(()=> { stopAudio(); resetWork(); state="intro"; }); btnBack.parent(uiWrap);

  // End
  btnEndBack = createButton("Terminar y volver");
  btnEndBack.mousePressed(()=> { stopAudio(); resetWork(); state="intro"; });
  btnEndBack.parent(uiWrap);

  // Ayuda / HUD
  helpBox = createDiv("<strong>Atajos</strong><br>P: Pausa/Reanudar<br>S: Guardar PNG<br>Q: Finalizar<br>R: Borrar<br>C: Cambiar paleta<br>H: HUD ON/OFF").addClass('help');
  helpBox.parent(select("#app"));

  hudBox = createDiv("").addClass("hud");
  hudBox.parent(select("#app"));

  updateModeUIVisibility();
}

function updateModeUIVisibility(){
  let modeVal = drawMode;
  try { if (selMode && typeof selMode.value === 'function') modeVal = selMode.value(); } catch(e){}
  const isFig = (modeVal === 'figuras');
  const isPaisaje = (modeVal === 'paisaje');

  if (selShape) selShape.style('display', isFig ? 'inline-block' : 'none');

  // En “paisaje” no usamos partículas de voz, así que escondemos sus sliders en CONFIG
  const showVoiceControls = (!isPaisaje);
  if (sliderThresh) sliderThresh.style('display', (state==='config' && showVoiceControls) ? 'inline-block' : 'none');
  if (sliderDensity) sliderDensity.style('display', (state==='config' && showVoiceControls) ? 'inline-block' : 'none');
  if (chkAutoPaint) chkAutoPaint.style('display', (state==='config' && showVoiceControls) ? 'inline-block' : 'none');
}

function draw() {
  if (state === "intro") drawIntro();
  else if (state === "config") drawConfig();
  else if (state === "run") drawRun();
  else if (state === "end") drawEnd();

  updateUIVisibility();
}

function drawIntro() {
  background(12);
  drawGradient();
  titleBlock("PAISAJE DEL ÁNIMO", "Un autorretrato de voz y movimiento.");
}

function drawConfig() {
  background(8);
  drawGradient(0.0015);
  titleBlock("CONFIGURACIÓN", "Elegí paleta, sensibilidad y modo (paisaje/figuras/abstracto).");

  // Indicadores
  noStroke(); fill(230); textSize(14); textAlign(LEFT, TOP);
  text("Paleta: " + paletteName, 24, height-360);
  text("Sensibilidad: " + nf(sens,1,2), 24, height-340);
  text("Micrófono: " + (wantMic ? "Sí" : "No (Modo demo)"), 24, height-320);
  text("Pintar con voz: " + (autoPaint ? "Activado" : "Desactivado"), 24, height-300);
  text("Umbral voz: " + nf(voiceThreshold,1,2) + "  " + (drawMode==='paisaje' ? "(no usado en paisaje)" : ""), 24, height-280);
  text("Densidad voz: " + nf(voiceDensity,1,2) + "  " + (drawMode==='paisaje' ? "(no usado en paisaje)" : ""), 24, height-260);
  text("Pintura persistente: " + (persistPaint ? "Sí" : "No"), 24, height-240);
  text("Decaimiento: " + decayAlpha, 24, height-220);
  text("Modo: " + drawMode + (drawMode==='figuras' ? " ("+shapeType+")" : ""), 24, height-200);
  text("Iniciar obra para continuar.", 24, height-180);

  updateModeUIVisibility();
}

function initRun() {
  wantMic = !chkDemo.checked();
  paletteName = selPalette.value();
  sens = sliderSens.value()/100;
  autoPaint = chkAutoPaint.checked();
  voiceThreshold = sliderThresh.value()/100;
  voiceDensity = sliderDensity.value()/100;
  persistPaint = chkPersist.checked();
  decayAlpha = sliderDecay.value();
  drawMode = selMode.value();
  shapeType = selShape.value();

  paintLayer.clear();
  collage = [];
  newScenery(); // paisaje de arranque

  buildShape();

  haveMic = false;
  if (wantMic) {
    userStartAudio();
    try {
      mic = new p5.AudioIn();
      mic.start(() => { haveMic = true; banner("Micrófono activado."); },
                () => { haveMic = false; banner("No se pudo activar micrófono. Modo demo."); });
    } catch(e) { haveMic = false; banner("Micrófono no disponible. Modo demo."); }
  } else {
    banner("Modo demo activo (sin mic).");
  }

  state = "run";
  background(5);
}

// ---------- Noise gate ----------
function updateVoiceGate(level){
  const onTh  = voiceThreshold;
  const offTh = voiceThreshold * 0.7;

  if (gateOpen) {
    if (level < offTh) {
      silenceFrames++;
      if (silenceFrames >= SILENCE_HOLD) gateOpen = false;
    } else {
      silenceFrames = 0;
    }
  } else {
    if (level >= onTh) {
      gateOpen = true;
      silenceFrames = 0;
    }
  }
}

// Pitch (tono): color azul→rojo según centroid (brillo espectral)
function pitchColor(){
  // Requiere fft.analyze() ejecutado este frame
  const centroid = fft.getCentroid(); // Hz
  const nyq = (getAudioContext() && getAudioContext().sampleRate) ? getAudioContext().sampleRate/2 : 22050;
  let f = constrain(centroid / nyq, 0, 1);
  // percepción más logarítmica
  f = pow(f, 0.5);
  const c1 = color(30, 140, 255);   // azul
  const c2 = color(255, 60, 60);    // rojo
  return lerpColor(c1, c2, f);
}

function drawRun() {
  if (paused) return;

  // 1) Fondo
  background(10);
  drawGradient(0.001);

  // Audio
  const level = getLevel();
  if (!fft) fft = new p5.FFT(0.9, 1024);
  fft.analyze();
  const energy = fft.getEnergy("mid");
  const toneCol = pitchColor();   // ← color por tono
  updateVoiceGate(level);

  // Si el gate se acaba de cerrar → NUEVO PAISAJE
  if (drawMode === 'paisaje' && !gateOpen && lastGateState !== gateOpen){
    newScenery(); // cambia semillas, colores y posiciones
  }
  lastGateState = gateOpen;

  // ----- Dibujo principal según modo -----
  if (drawMode === 'paisaje') {
    // Collage reactivo por voz: agrega piezas y las dibuja
    if ((haveMic && wantMic && gateOpen) || (!wantMic)) {
      spawnCollagePieces(level, energy, toneCol);
    }
    drawCollage();
  } else {
    // Paisaje de líneas (para abstracto/figuras) — color de línea por tono
    drawLandscape(level, energy, toneCol);
  }

  // 2) PINTURA PERSISTENTE EN paintLayer (para modos no-collage)
  if (!persistPaint && decayAlpha > 0) {
    paintLayer.noStroke();
    paintLayer.fill(0, decayAlpha);
    paintLayer.rect(0, 0, paintLayer.width, paintLayer.height);
  }

  // Dibujo manual a la capa
  drawPathsToLayer();

  // Partículas solo si NO estamos en paisaje
  const canAuto = autoPaint && haveMic && wantMic && (drawMode !== 'paisaje');
  if (canAuto && gateOpen) { spawnVoiceParticles(level); updateParticles(true); }
  else { updateParticles(false); }

  // Guía de figura en HUD
  if (drawMode==='figuras' && shapePts.length && hudBox && hudBox.elt.style.display !== "none") {
    noFill(); stroke(255, 40); strokeWeight(1);
    beginShape(); for (const q of shapePts) vertex(q.x, q.y); endShape();
  }

  // Componer capa encima
  image(paintLayer, 0, 0);

  // HUD
  if (hudBox && hudBox.elt.style.display !== "none") {
    hudBox.html(
      `mode: ${drawMode}${drawMode==='figuras'?' · '+shapeType:''} | level: ${nf(level,1,3)} | threshold: ${nf(voiceThreshold,1,2)} | gate: ${gateOpen?"OPEN":"closed"} | collage: ${collage.length} | particles: ${particles.length}<br>` +
      `persist: ${persistPaint ? "ON" : "OFF"} | decay: ${decayAlpha} | density: ${nf(voiceDensity,1,2)}`
    );
  }

  t += 0.01;
}

function drawEnd() {
  background(10);
  titleBlock("OBRA GUARDADA", "Preview exportada. Podés volver al inicio.");
  if (!select("#endbox")) {
    const box = createDiv().id("endbox").addClass("endbox");
    box.parent(select("#app"));
    const img = createImg(lastSavedURL || makePreview(), "preview"); img.parent(box);
    const actions = createDiv().addClass("actions"); actions.parent(box);
    const back = createButton("Volver al inicio"); back.parent(actions);
    back.mousePressed(()=> { removeEndBox(); stopAudio(); resetWork(); state="intro"; });
    const dl = createA(lastSavedURL || "#", "Descargar PNG", "_blank"); dl.parent(actions);
  }
}

function removeEndBox(){ const eb = select("#endbox"); if (eb) eb.remove(); }

function saveAndPreview(){ makePreview(); saveCanvas("paisaje_del_animo","png"); banner("Imagen guardada."); }

function makePreview(){
  try{ const c = document.querySelector("canvas"); if (!c) return null;
    lastSavedURL = c.toDataURL("image/png"); return lastSavedURL;
  }catch(e){ lastSavedURL = null; return null; }
}

// ---------- Color por voz (amplitud): de azul (voz baja) a rojo (voz alta) ----------
function voiceColor(level) {
  const f = constrain(map(level, 0, 0.5, 0, 1), 0, 1);
  const c1 = color(30, 140, 255);   // azul
  const c2 = color(255, 60, 60);    // rojo
  return lerpColor(c1, c2, f);
}

/* ===================== PAISAJE "COLLAGE" ===================== */
// Crear una nueva configuración aleatoria de paisaje
function newScenery(){
  // nuevas semillas → diferencia garantizada
  scenerySeed = int(random(1e9));
  randomSeed(scenerySeed);
  noiseSeed(int(random(1e9)));

  // anclas y colores base
  resetCollageAnchorsRandom();

  // Esquemas de cielo y suelo aleatorios (día, tarde, noche)
  const theme = random(['day','sunset','night','dawn']);
  if (theme==='day'){
    skyA = color(130,190,230); skyB = color(180,210,240);
    groundA = color(230,200,60); groundB = color(250,170,30);
  } else if (theme==='sunset'){
    skyA = color(50,40,90); skyB = color(240,120,90);
    groundA = color(210,150,60); groundB = color(160,90,40);
  } else if (theme==='dawn'){
    skyA = color(30,40,70); skyB = color(190,200,240);
    groundA = color(90,120,70); groundB = color(150,120,60);
  } else { // night
    skyA = color(16,20,30); skyB = color(24,28,44);
    groundA = color(40,60,30); groundB = color(60,40,20);
  }

  collage = []; // limpiar piezas acumuladas
}

function resetCollageAnchorsRandom(){
  const gx = random(width*0.2, width*0.55);
  const gy = random(height*0.62, height*0.74);
  treeAnchor = createVector(gx, gy);
}

// Genera piezas tipo “recortes” (cielo, suelo, árbol, tronco) en función de la voz
function spawnCollagePieces(level, energy, toneCol){
  const base = constrain(map(level, voiceThreshold*0.6, 1.2, 0, 10), 0, 10);
  const count = int((2 + base*6) * (0.6 + voiceDensity*0.2));

  for (let i=0; i<count; i++){
    if (collage.length >= MAX_COLLAGE) collage.splice(0,1);

    // Elegir zona
    const r = random();
    let zone = 'ground';
    if (r < 0.28) zone = 'sky';
    else if (r < 0.42) zone = 'tree';
    else if (r < 0.46) zone = 'trunk';

    let x=0, y=0, w=0, h=0, ang=0, col, layer=1, shadow=true;

    // Color por AMPLITUD suavizado hacia el color por TONO
    const vcol = lerpColor(voiceColor(level), toneCol, 0.5);

    if (zone === 'sky'){
      const topH = height*0.45;
      x = random(width);
      y = random(topH*0.15, topH);
      w = random(40, 180) * (0.7 + level*0.6);
      h = random(6, 22) * (0.7 + level*0.4);
      ang = radians(random(-8, 8)) + sin(t*0.6)*0.05;
      col = lerpColor( lerpColor(skyA, skyB, random()), vcol, 0.25 );
      layer = 0; shadow = false;
    } else if (zone === 'ground'){
      const gy0 = height*0.60, gy1 = height*0.98;
      x = random(width);
      y = random(gy0, gy1);
      w = random(28, 120) * (0.7 + level*0.8);
      h = random(6, 20)  * (0.7 + level*0.5);
      ang = radians(random(-8, 8) + (random()<0.35 ? random(-50,-20) : random(20,50)));
      col = lerpColor( lerpColor(groundA, groundB, random()), vcol, 0.18 );
      layer = 2;
    } else if (zone === 'trunk'){
      x = treeAnchor.x + random(-10, 10);
      y = treeAnchor.y - random(0, 70);
      w = random(8, 18);
      h = random(30, 80);
      ang = radians(random(-8, 8));
      col = lerpColor(color(25,25,35), vcol, 0.12);
      layer = 2;
    } else { // 'tree' — copa
      const rx = 110, ry = 95;
      const a = random(TWO_PI);
      const rrx = rx * (0.4 + random(0.6));
      const rry = ry * (0.4 + random(0.6));
      x = treeAnchor.x + cos(a)*rrx*0.7 + random(-10,10);
      y = treeAnchor.y - 70 + sin(a)*rry*0.5 + random(-10,10);
      w = random(20, 80);
      h = random(10, 28);
      ang = radians(random(-30, 30));
      const g1 = color(60,170,80), g2 = color(30,140,70);
      const b1 = color(70,80,200), p1 = color(120,70,160);
      const baseT = random()<0.6 ? lerpColor(g1,g2,random()) : lerpColor(b1,p1,random());
      col = lerpColor(baseT, vcol, 0.25);
      layer = 3;
    }

    collage.push({x,y,w,h,ang,col,layer,zone,shadow});
  }
}

// Dibuja el collage acumulado y fondos
function drawCollage(){
  // Cielo base
  noStroke();
  for (let y=0; y<height*0.55; y+=3){
    const k = y/(height*0.55);
    fill( lerpColor(skyA, skyB, k) );
    rect(0, y, width, 3);
  }
  // Suelo base
  for (let y=int(height*0.55); y<height; y+=3){
    const k = map(y, height*0.55, height, 0, 1);
    fill( lerpColor(groundA, groundB, k*0.9) );
    rect(0, y, width, 3);
  }

  // Orden por capas
  const ordered = collage.slice().sort((a,b)=> a.layer - b.layer);

  // Sombra + pieza
  for (const p of ordered){
    push();
    translate(p.x, p.y);
    rotate(p.ang);
    if (p.shadow){ noStroke(); fill(0, 40); rect(4, 4, p.w, p.h, 3); }
    noStroke(); fill(p.col); rect(0, 0, p.w, p.h, 3);
    pop();
  }

  // Sombra del árbol
  stroke(0,90);
  for (let i=0;i<28;i++){
    const xx = treeAnchor.x + i*6 - 60;
    const yy = treeAnchor.y + i*0.6;
    line(xx, yy, xx+random(8,16), yy+random(0,3));
  }
}
/* ================== FIN COLLAGE ================== */

// ---------- Paisaje de líneas (para modos abstracto/figuras) ----------
// Ahora las líneas toman color por tono de voz (pitch)
function drawLandscape(level, energy, toneCol) {
  noFill();
  const cols = PALETTES[paletteName];
  const base = map(level, 0, 1.5, 20, 220);
  const lines = 6;

  for (let i=0;i<lines;i++) {
    const yoff = i*0.012 + t*0.1;
    // Mezcla del color por tono con la paleta para variación
    const cc = lerpColor(toneCol, color(cols[i % cols.length]), 0.35);
    cc.setAlpha(220);
    stroke(cc); strokeWeight(2);
    beginShape();
    for (let x=0; x<=width; x+=12) {
      const n = noise(x*0.002 + yoff, t*0.2);
      let y = map(n,0,1, height*0.35, height*0.85);
      y -= base * (i*0.15 + 0.6);
      y -= map(energy,0,255, 0, 20) * sin((x*0.01)+t*2+i);
      vertex(x, y);
    }
    endShape();
  }
}

// ---------- Dibujo manual sobre la capa persistente ----------
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
    paintLayer.noStroke(); paintLayer.fill(255, 180); paintLayer.circle(mouseX, mouseY, 3);
  }
}

// IMPORTANTE: no bloquear eventos del DOM en "config"
function mouseDragged() {
  if (state !== "run") return;
  if (!mouseInCanvas() || overUIArea()) return;
  if (!paths.length || paths[paths.length-1].finished) {
    paths.push({ pts: [], col: pick(PALETTES[paletteName]), finished:false });
  }
  let p = paths[paths.length-1];
  p.pts.push({x:mouseX, y:mouseY});
  return false;
}
function mousePressed() {
  if (state !== "run") return;
  if (!mouseInCanvas() || overUIArea()) return;
  paths.push({ pts: [{x:mouseX, y:mouseY}], col: pick(PALETTES[paletteName]), finished:false });
  return false;
}
function mouseReleased() {
  if (state !== "run") return;
  if (paths.length && !paths[paths.length-1].finished) paths[paths.length-1].finished = true;
}
function touchMoved() { return mouseDragged(); }

function mouseInCanvas() { return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height; }
function overUIArea() {
  const panelW = 520, panelH = 170;
  return (mouseX >= 0 && mouseX <= panelW && mouseY >= height - panelH && mouseY <= height);
}

// ---------- Pintura por voz (partículas + trazo) ----------
function spawnVoiceParticles(level){
  if (level <= voiceThreshold) return;

  const cols = PALETTES[paletteName];
  const base = constrain(map(level, voiceThreshold, 1.5, 1, 10), 1, 10);
  const count = int(base * voiceDensity);

  // En modo figuras: emisores sobre el contorno con velocidad tangencial
  if (drawMode === 'figuras' && shapePts.length > 1) {
    for (let i=0; i<count; i++){
      if (particles.length >= MAX_PARTICLES) particles.shift();

      const n = shapePts.length;
      const si = int(random(0, n-1));
      const a = shapePts[si], b = shapePts[si+1];
      const tseg = random();
      const qx = lerp(a.x, b.x, tseg);
      const qy = lerp(a.y, b.y, tseg);

      let tx = b.x - a.x, ty = b.y - a.y;
      const len = Math.hypot(tx,ty) || 1; tx/=len; ty/=len;
      const nx = -ty, ny = tx;

      const off = random(-6, 6);
      const px = qx + nx * off;
      const py = qy + ny * off;

      const spd = map(level, 0, 1.5, 0.6, 3.0);
      const jitter = random(-0.25, 0.25);
      const vx = tx * spd + nx * jitter;
      const vy = ty * spd + ny * jitter;

      const cc = color(cols[int(random(cols.length))]);
      cc.setAlpha(map(level, 0, 1.5, 120, 240));

      particles.push({
        x:px, y:py, px:px, py:py, vx, vy,
        life: int(random(70, 160)),
        size: random(2.5, 6.5),
        col: cc
      });
    }
    return;
  }

  // Modo abstracto: emisor central
  for (let i=0; i<count; i++){
    if (particles.length >= MAX_PARTICLES) particles.shift();

    const px = width * 0.5 + random(-width*0.25, width*0.25);
    const py = height * 0.55 + random(-height*0.3, height*0.3);

    const ang = noise(px*0.002, py*0.002, t)*TWO_PI*2;
    const spd = map(level, 0, 1.5, 0.5, 3.2);
    const vx = cos(ang)*spd;
    const vy = sin(ang)*spd - random(0.25);

    const cc = color(cols[int(random(cols.length))]);
    cc.setAlpha(map(level, 0, 1.5, 120, 240));

    particles.push({
      x:px, y:py, px:px, py:py, vx, vy,
      life: int(random(60, 160)),
      size: random(2.5, 6.5),
      col: cc
    });
  }
}

// === Figuras: definición y build ===
function getNormalizedShape(name){
  if (name === 'montaña'){
    return [
      {x:0.00,y:0.75},{x:0.10,y:0.70},{x:0.20,y:0.78},{x:0.30,y:0.55},{x:0.38,y:0.62},
      {x:0.46,y:0.40},{x:0.52,y:0.48},{x:0.60,y:0.35},{x:0.68,y:0.50},{x:0.78,y:0.42},
      {x:0.88,y:0.60},{x:1.00,y:0.75}
    ];
  }
  if (name === 'árbol'){
    const pts = [];
    pts.push({x:0.48,y:0.80},{x:0.52,y:0.80},{x:0.52,y:0.60},{x:0.48,y:0.60},{x:0.48,y:0.80});
    const cx=0.50, cy=0.45, rx=0.18, ry=0.16;
    for (let a=0; a<=Math.PI*2+1e-6; a+= (Math.PI*2)/40){
      pts.push({x: cx + Math.cos(a)*rx, y: cy + Math.sin(a)*ry});
    }
    return pts;
  }
  if (name === 'casa'){
    return [
      {x:0.30,y:0.75},{x:0.70,y:0.75},{x:0.70,y:0.50},{x:0.30,y:0.50},{x:0.30,y:0.75},
      {x:0.45,y:0.75},{x:0.45,y:0.60},{x:0.55,y:0.60},{x:0.55,y:0.75},
      {x:0.30,y:0.50},{x:0.50,y:0.32},{x:0.70,y:0.50}
    ];
  }
  return [];
}

function buildShape(){
  if (drawMode !== 'figuras') { shapePts = []; return; }
  const base = getNormalizedShape(shapeType);
  shapePts = [];
  if (!base || !base.length) return;
  const margin = 0.08;
  const w = width*(1-2*margin), h = height*(1-2*margin);
  const ox = width*margin, oy = height*margin;
  for (const p of base){
    shapePts.push({ x: ox + p.x*w, y: oy + p.y*h });
  }
}

// Punto más cercano sobre la polilínea
function nearestPointOnPolyline(x, y, pts, closed=false){
  if (!pts || pts.length < 2) return {pt:null, i:-1, t:0, d2:Infinity, tan:{x:0,y:0}};
  let best = {pt:null, i:-1, t:0, d2:Infinity, tan:{x:0,y:0}};
  const n = pts.length;
  const lim = closed ? n : n-1;
  for (let i=0; i<lim; i++){
    const a = pts[i];
    const b = pts[(i+1)%n];
    const abx = b.x - a.x, aby = b.y - a.y;
    const ab2 = abx*abx + aby*aby + 1e-9;
    let tseg = ((x - a.x)*abx + (y - a.y)*aby)/ab2;
    tseg = constrain(tseg, 0, 1);
    const qx = a.x + abx*tseg;
    const qy = a.y + aby* tseg;
    const dx = qx - x, dy = qy - y;
    const d2 = dx*dx + dy*dy;
    if (d2 < best.d2){
      const len = Math.sqrt(abx*abx + aby*aby) || 1;
      best = {pt:{x:qx,y:qy}, i, t:tseg, d2, tan:{x:abx/len, y:aby/len}};
    }
  }
  return best;
}

function updateParticles(shouldDraw){
  const attractK = 0.015, slideK = 0.06, maxSpd = 4.0;

  for (let i=particles.length-1; i>=0; i--){
    const p = particles[i];

    const ang = noise(p.x*0.002, p.y*0.002, t*0.35)*TWO_PI*2;
    p.vx += Math.cos(ang)*0.01;
    p.vy += Math.sin(ang)*0.01;

    if (drawMode === 'figuras' && shapePts.length > 1){
      const res = nearestPointOnPolyline(p.x, p.y, shapePts, false);
      if (res.pt){
        const nx = res.pt.x - p.x;
        const ny = res.pt.y - p.y;
        const d  = Math.hypot(nx, ny) + 1e-6;
        const far  = 120;
        const nGain = map(d, 0, far, 0.0, 1.0, true);
        const tGain = map(d, 0, far, 1.0, 0.2, true);
        p.vx += (nx/d) * (attractK * nGain);
        p.vy += (ny/d) * (attractK * nGain);
        const j = (noise(p.x*0.01, p.y*0.01, t)*2-1) * 0.15;
        const tx = res.tan.x, ty = res.tan.y;
        p.vx += (tx + -ty*j) * (slideK * tGain);
        p.vy += (ty +  tx*j) * (slideK * tGain);
      }
    }

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > maxSpd){ p.vx = (p.vx/sp)*maxSpd; p.vy = (p.vy/sp)*maxSpd; }

    p.px = p.x; p.py = p.y;
    p.x += p.vx; p.y += p.vy;

    if (shouldDraw) {
      paintLayer.stroke(p.col);
      paintLayer.strokeWeight(p.size);
      paintLayer.line(p.px, p.py, p.x, p.y);
      paintLayer.noStroke(); paintLayer.fill(p.col);
      paintLayer.circle(p.x, p.y, p.size*0.8);
    }

    p.life--;
    if (p.life <= 0 || p.x< -60 || p.x> width+60 || p.y< -60 || p.y> height+60){
      particles.splice(i,1);
    }
  }
}

// ---------- Varios ----------
function clearPaint(){
  paths = [];
  particles = [];
  paintLayer.clear();
  banner("Capa limpia.");
}

function togglePause() {
  paused = !paused;
  banner(paused ? "Pausa" : "Reanudado");
  btnPause.html(paused ? "Reanudar" : "Pausar");
}

function keyPressed() {
  if (key === 'S' || key === 's') saveAndPreview();
  if (key === 'Q' || key === 'q') { makePreview(); state = "end"; }
  if (key === 'P' || key === 'p') togglePause();
  if (key === 'R' || key === 'r') { clearPaint(); collage = []; }
  if (key === 'C' || key === 'c') {
    paletteName = (paletteName === 'calma') ? 'energia' : 'calma';
    selPalette.value(paletteName);
    banner("Paleta: " + paletteName);
  }
  if (key === 'H' || key === 'h') {
    const cur = hudBox.elt.style.display;
    hudBox.elt.style.display = (cur === "none") ? "block" : "none";
  }
}

function getLevel(){
  let level = 0.1;
  if (haveMic && mic) {
    level = mic.getLevel() * (2.5 * sens);
    level = constrain(level, 0, 1.5);
  } else {
    level = abs((noise(t*0.4)-0.4) * (1.2*sens)); // demo
  }
  return level;
}

function updateUIVisibility() {
  btnStart.style('display', state==='intro' ? 'inline-block':'none');
  btnConfig.style('display', state==='intro' ? 'inline-block':'none');

  selPalette.style('display', state==='config' ? 'inline-block':'none');
  sliderSens.style('display', state==='config' ? 'inline-block':'none');
  chkDemo.style('display', state==='config' ? 'inline-block':'none');

  // Estos 3 se ocultan en “paisaje”
  const isPaisaje = (selMode && selMode.value && selMode.value()==='paisaje');
  chkAutoPaint.style('display', (state==='config' && !isPaisaje) ? 'inline-block':'none');
  sliderThresh.style('display', (state==='config' && !isPaisaje) ? 'inline-block':'none');
  sliderDensity.style('display', (state==='config' && !isPaisaje) ? 'inline-block':'none');

  chkPersist.style('display', state==='config' ? 'inline-block':'none');
  sliderDecay.style('display', state==='config' ? 'inline-block':'none');

  if (selMode) selMode.style('display', state==='config' ? 'inline-block':'none');
  if (selShape) {
    let showShape = false;
    try { showShape = (state==='config' && selMode && typeof selMode.value==='function' && selMode.value()==='figuras'); } catch(e){}
    selShape.style('display', showShape ? 'inline-block' : 'none');
  }

  btnRun.style('display', state==='config' ? 'inline-block':'none');

  btnPause.style('display', state==='run' ? 'inline-block':'none');
  btnSave.style('display', state==='run' ? 'inline-block':'none');
  btnClear.style('display', state==='run' ? 'inline-block':'none');
  btnFinish.style('display', state==='run' ? 'inline-block':'none');
  btnBack.style('display', (state==='run'||state==='config') ? 'inline-block':'none');

  btnEndBack.style('display', state==='end' ? 'inline-block':'none');
  helpBox.style('display', state==='end' ? 'none' : 'block');
  hudBox.style('display', state==='end' ? 'none' : 'block');

  if (state!=='end') removeEndBox();
}

function stopAudio() { try { if (mic) mic.stop(); } catch(e) {} haveMic = false; }

function resetWork() {
  clearPaint();
  paused = false; t = 0;
  paletteName = 'calma'; if (btnPause) btnPause.html("Pausar");
  lastSavedURL = null; wantMic = false;
  if (chkDemo) chkDemo.checked(true);
  if (chkAutoPaint) chkAutoPaint.checked(true);
  if (sliderThresh) sliderThresh.value(12);
  if (sliderDensity) sliderDensity.value(200);
  if (chkPersist) chkPersist.checked(true);
  if (sliderDecay) sliderDecay.value(0);
  if (selMode) selMode.value('paisaje');
  if (selShape) selShape.value('montaña');
  drawMode = 'paisaje'; shapeType = 'montaña'; shapePts = [];
  collage = [];
  newScenery();
}

function drawGradient(speed=0.001) {
  for (let y=0; y<height; y+=4) {
    const n = noise(y*0.01, t*speed);
    const c = lerpColor(color('#0f1117'), color('#151a22'), n);
    stroke(c); line(0,y,width,y);
  }
}

function titleBlock(title, subtitle) {
  noStroke(); fill(255); textAlign(CENTER, CENTER);
  textSize(min(64, width*0.06)); text(title, width/2, height*0.34);
  fill(220); textSize(min(18, width*0.02)); text(subtitle, width/2, height*0.34+48);
}

function banner(msg) {
  if (bannerMsg) bannerMsg.remove();
  bannerMsg = createDiv(msg).addClass('banner');
  bannerMsg.parent(select("#app"));
  setTimeout(()=> { if (bannerMsg) bannerMsg.remove(); }, 2500);
}

function pick(arr){ return arr[int(random(arr.length))]; }

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  let old = paintLayer;
  paintLayer = createGraphics(windowWidth, windowHeight);
  paintLayer.pixelDensity(1);
  paintLayer.clear();
  if (old) { paintLayer.image(old, 0, 0, windowWidth, windowHeight); }
  buildShape();
  newScenery(); // reconfigurar al cambiar tamaño también
  updateModeUIVisibility();
}
