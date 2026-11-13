
import React, { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

const ISO: [number, number, number] = [0, 0, 0];

/** Beschriftungen sind standardmäßig aus; sie erscheinen nur, wenn der Schalter in der Steuerleiste aktiv ist. */
const ShowLabelsContext = React.createContext(false);

function Label({ position, text, color = "#33495e" }: { position: [number, number, number]; text: string; color?: string }) {
  const show = React.useContext(ShowLabelsContext);
  if (!show) return null;
  return (
    <Html position={position} center distanceFactor={16} style={{ pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(80,100,120,0.35)",
          borderRadius: 4,
          padding: "1px 4px",
          fontSize: 10,
          fontWeight: 500,
          color,
          whiteSpace: "nowrap",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        {text}
      </div>
    </Html>
  );
}

function Room() {
  return (
    <group>
      {/* Boden */}
      <mesh position={[0, -1.55, 0]}>
        <boxGeometry args={[8, 0.1, 8]} />
        <meshStandardMaterial color="#dfe6ec" />
      </mesh>
      {/* Rückwand */}
      <mesh position={[0, 0, -4]}>
        <boxGeometry args={[8, 3, 0.1]} />
        <meshStandardMaterial color="#e8edf2" />
      </mesh>
      {/* Seitenwand */}
      <mesh position={[-4, 0, 0]}>
        <boxGeometry args={[0.1, 3, 8]} />
        <meshStandardMaterial color="#e2e8ee" />
      </mesh>
    </group>
  );
}

function Table() {
  return (
    <group>
      {/* Tischplatte (endet kopfwärts mit Abstand vor dem C-Bogen, wie der Kopf des Patienten) */}
      <mesh position={[0.675, -0.25, 0]}>
        <boxGeometry args={[3.25, 0.1, 0.8]} />
        <meshStandardMaterial color="#4a647e" />
      </mesh>
      {/* Tischfuß */}
      <mesh position={[1.9, -0.9, 0]}>
        <boxGeometry args={[0.5, 1.2, 0.6]} />
        <meshStandardMaterial color="#8fa3b5" />
      </mesh>
      <mesh position={[1.9, -1.45, 0]}>
        <boxGeometry args={[1.0, 0.1, 0.8]} />
        <meshStandardMaterial color="#6b7a88" />
      </mesh>
      {/* Untertischschutz ist entfernt */}
      <Label position={[2.1, -0.45, 0.45]} text="Liege (Angio-Tisch)" />
    </group>
  );
}

function Patient() {
  return (
    <group position={[0.45, 0, 0]}>
      {/* Körper (Oberkörper) – elliptischer Querschnitt, Breite : Höhe = 2,5 : 1 */}
      <mesh position={[-0.55, -0.08, 0]} scale={[0.55, 0.12, 0.3]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      {/* Beine (separat, runde Kapselform) */}
      <mesh position={[0.55, -0.13, 0.09]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.07, 0.9, 8, 16]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      <mesh position={[0.55, -0.13, -0.09]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.07, 0.9, 8, 16]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      {/* Kopf */}
      <mesh position={[-1.2, -0.04, 0]}>
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      {/* Grünes Abdecktuch: von den Knöcheln bis über den Genitalbereich */}
      <mesh position={[0.55, -0.04, 0]}>
        <boxGeometry args={[0.95, 0.03, 0.34]} />
        <meshStandardMaterial color="#2f7d5a" />
      </mesh>
      <mesh position={[-0.05, -0.005, 0]}>
        <boxGeometry args={[0.35, 0.04, 0.66]} />
        <meshStandardMaterial color="#2f7d5a" />
      </mesh>
      <Label position={[-0.4, 0.35, 0]} text="Patient" color="#5a4a3a" />
    </group>
  );
}

function CArm({ laoDeg }: { laoDeg: number }) {
  const rad = (laoDeg * Math.PI) / 180;
  // C-Bogen über dem Kopf des Patienten (Kopf liegt bei x = -0.75)
  return (
    <group position={[-0.75, 0, 0]} rotation={[rad, 0, 0]}>
      {/* C-förmiger Bogen (Öffnung zum Fußende) */}
      <mesh rotation={[0, 0, Math.PI * 0.3]}>
        <torusGeometry args={[1.15, 0.09, 16, 80, Math.PI * 1.4]} />
        <meshStandardMaterial color="#3f5a75" />
      </mesh>
      {/* Detektor oben (Eingangsfläche 25 x 25 cm) */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[0.25, 0.15, 0.25]} />
        <meshStandardMaterial color="#2e4b66" />
      </mesh>
      <Label position={[0, 1.25, 0]} text="Detektor" />
      {/* Röhre unten */}
      <mesh position={[0, -1.05, 0]}>
        <boxGeometry args={[0.35, 0.3, 0.5]} />
        <meshStandardMaterial color="#2e4b66" />
      </mesh>
      {/* Brennfleck (Punktquelle) in der Röhre */}
      <mesh position={[0, -0.9, 0]}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshStandardMaterial color="#d94f4f" emissive="#d94f4f" emissiveIntensity={1} />
      </mesh>
      <Label position={[0.45, -1.15, 0]} text="Röhre" />
      {/* Divergierender Strahl: Punktquelle (Brennfleck) auffächernd auf 25 x 25 cm Detektorfläche */}
      <mesh position={[0, 0.0125, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry
          args={[0.25 / Math.SQRT2, 0.002, 1.825, 4, 1, true]}
        />
        <meshStandardMaterial
          color="#d94f4f"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CArmStand() {
  return (
    <group position={[-0.75, 0, 0]}>
      {/* Stützsäule am Kopfende (Anlenkung am C, bleibt bei LAO/RAO-Drehung ortsfest) */}
      <mesh position={[-1.33, 0, 0]}>
        <boxGeometry args={[0.4, 0.14, 0.14]} />
        <meshStandardMaterial color="#8fa3b5" />
      </mesh>
      <mesh position={[-1.5, -0.75, 0]}>
        <boxGeometry args={[0.18, 1.5, 0.18]} />
        <meshStandardMaterial color="#b7c4cf" />
      </mesh>
      <mesh position={[-1.5, -1.45, 0]}>
        <boxGeometry args={[0.9, 0.1, 0.9]} />
        <meshStandardMaterial color="#5a6b7a" />
      </mesh>
    </group>
  );
}

function LeadGlass() {
  // Bleiglasscheibe hängt an der Decke über der Brust (Scheibenebene quer bei x = -0.3).
  // Breite: von der Patienten-Mittelachse (z = 0) bis 60 cm nach außen (z = 0.6).
  // Höhe: 80 cm (y = -0.15 bis 0.65). Unterkante liegt 5 cm über der Tischplatte.
  // Ausschnitt: Profil des Brustquerschnitts an dieser Stelle (Halbachsen z = 0.28, y = 0.112),
  // aufgeweitet um 5 cm Abstand (Halbachsen z = 0.33, y = 0.162, Mittelpunkt y = -0.08).
  const shape = React.useMemo(() => {
    const a = 0.33;
    const b = 0.162;
    const cy = -0.08;
    const s = new THREE.Shape();
    s.moveTo(0, 0.65);
    s.lineTo(0.72, 0.65);
    s.lineTo(0.72, -0.15);
    s.lineTo(0.298, -0.15);
    for (let phi = -25.6; phi <= 90.001; phi += 6) {
      const t = (phi * Math.PI) / 180;
      s.lineTo(a * Math.cos(t), cy + b * Math.sin(t));
    }
    s.closePath();
    return s;
  }, []);
  return (
    // Rein vertikal gedreht: Scheibenebene steht senkrecht zur Verbindungslinie
    // C-Bogen-Isozentrum (ueber dem Kopf, x = -0.75) -> Untersucher:in.
    // Richtung: (1.2, 0.7625) => ca. 32° Gieren statt 59° wie zuvor; Anlenkung
    // bleibt an der Patienten-Mittelachse, Erweiterung um 20 % bleibt.
    <group position={[-0.3, 0, 0]} rotation={[0, -0.566, 0]}>
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color="#bfe3f2"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Deckenhalterung */}
      <mesh position={[0, 1.075, 0.18]}>
        <cylinderGeometry args={[0.015, 0.015, 0.85, 10]} />
        <meshStandardMaterial color="#6b7a88" />
      </mesh>
      <mesh position={[0, 1.075, 0.54]}>
        <cylinderGeometry args={[0.015, 0.015, 0.85, 10]} />
        <meshStandardMaterial color="#6b7a88" />
      </mesh>
      <Label position={[0, 0.8, 0.3]} text="Bleiglasscheibe" color="#2b6a86" />
      {/* Untertischschutz (dunkelgrau, undurchsichtig): vertikal in der Ebene der
          Bleiglasscheibe, ab Tischhöhe herabhängend bis knapp über den Boden. */}
      <mesh position={[0, -0.875, 0.24]}>
        <boxGeometry args={[0.03, 1.15, 0.48]} />
        <meshStandardMaterial color="#454b52" />
      </mesh>
      <mesh position={[0, -0.8, 0.6]}>
        <boxGeometry args={[0.03, 1.3, 0.24]} />
        <meshStandardMaterial color="#454b52" />
      </mesh>
      <Label position={[0, -1.2, 0.5]} text="Untertischschutz" />
    </group>
  );
}

function Console() {
  return (
    <group position={[2.8, 0, -3.4]}>
      <mesh position={[0, -0.9, 0]}>
        <boxGeometry args={[1.4, 1.2, 0.6]} />
        <meshStandardMaterial color="#c9d4dd" />
      </mesh>
      <mesh position={[-0.3, -0.15, 0.1]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.5, 0.35, 0.04]} />
        <meshStandardMaterial color="#2e4b66" />
      </mesh>
      <mesh position={[0.4, -0.15, 0.1]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.04]} />
        <meshStandardMaterial color="#2e4b66" />
      </mesh>
      <Label position={[0, 0.35, 0.3]} text="Systemkonsole" />
    </group>
  );
}

function Examiner() {
  // 1,80 m große Figur (Kopfoberkante bei 1,80 m), weiß bekleidet (Strahlenschutz-
  // bzw. OP-Kleidung), leicht elliptischer Rumpf. Direkt der Leistengegend des
  // Patienten zugewandt, Füße auf dem Boden.
  return (
    <group position={[0.36, -1.5, 0.61]} rotation={[0, Math.PI, 0]} scale={1.03}>
      {/* Beine */}
      <mesh position={[0.1, 0.42, 0]}>
        <capsuleGeometry args={[0.07, 0.7, 8, 16]} />
        <meshStandardMaterial color="#f4f4ef" />
      </mesh>
      <mesh position={[-0.1, 0.42, 0]}>
        <capsuleGeometry args={[0.07, 0.7, 8, 16]} />
        <meshStandardMaterial color="#f4f4ef" />
      </mesh>
      {/* Rumpf (leicht elliptischer Querschnitt) */}
      <mesh position={[0, 1.15, 0]} scale={[0.23, 0.32, 0.14]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#f4f4ef" />
      </mesh>
      {/* Arme */}
      <mesh position={[0.28, 1.1, 0]}>
        <capsuleGeometry args={[0.05, 0.5, 8, 16]} />
        <meshStandardMaterial color="#f4f4ef" />
      </mesh>
      <mesh position={[-0.28, 1.1, 0]}>
        <capsuleGeometry args={[0.05, 0.5, 8, 16]} />
        <meshStandardMaterial color="#f4f4ef" />
      </mesh>
      {/* Kopf (Oberkante bei 1,80 m) */}
      <mesh position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      <Label position={[0, 1.85, 0]} text="Untersucher:in" />
    </group>
  );
}

function IsoMarker() {
  return (
    <group position={ISO}>
      <mesh>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial color="#d94f4f" />
      </mesh>
      <Label position={[0.1, 0.12, 0]} text="Isozentrum" color="#d94f4f" />
    </group>
  );
}

/** Frei schwebender Monitor in Blickrichtung der Untersucher:in, ca. 1 m hinter der Liege,
 *  mit stilisierter Kopfangiographie (Karotiden, Verzweigungen, Schädelumriss). */
function AngioScreen() {
  const texture = React.useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 400;
    const ctx = c.getContext("2d")!;
    // Fluoro-Hintergrund
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, 512, 400);
    ctx.lineCap = "round";
    // Schädelumriss (seitlich)
    ctx.strokeStyle = "#333d4a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(256, 195, 150, 165, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Halswirbelsäule
    ctx.beginPath();
    ctx.moveTo(256, 360);
    ctx.lineTo(256, 400);
    ctx.stroke();
    // A. carotis interna (Hauptstämme)
    ctx.strokeStyle = "#e9f0cf";
    const trunk = (x0: number, cx: number, x1: number, y1: number) => {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x0, 400);
      ctx.quadraticCurveTo(cx, 330, x1, y1);
      ctx.stroke();
    };
    trunk(196, 205, 214, 240);
    trunk(316, 307, 298, 240);
    // Circulus-artige Bögen
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(214, 240);
    ctx.quadraticCurveTo(235, 215, 256, 212);
    ctx.quadraticCurveTo(278, 215, 298, 240);
    ctx.stroke();
    // A. cerebri media (seitliche Verzweigungen)
    const branch = (
      x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number
    ) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
    };
    branch(216, 238, 160, 215, 120, 185, 4);
    branch(120, 185, 95, 165, 90, 130, 2.5);
    branch(122, 190, 100, 200, 105, 235, 2);
    branch(298, 238, 355, 215, 392, 185, 4);
    branch(392, 185, 415, 165, 420, 130, 2.5);
    branch(390, 190, 412, 200, 407, 235, 2);
    // A. cerebri anterior (median, aufsteigend)
    branch(256, 212, 250, 160, 245, 105, 4);
    branch(245, 105, 240, 70, 236, 45, 2.5);
    branch(256, 212, 268, 160, 272, 108, 3);
    branch(272, 108, 282, 75, 286, 52, 2);
    // kleine Rami
    branch(245, 150, 215, 135, 200, 120, 1.5);
    branch(272, 150, 300, 132, 316, 118, 1.5);
    branch(160, 210, 145, 240, 150, 265, 1.5);
    branch(352, 210, 368, 240, 362, 265, 1.5);
    // Aneurysma-Marker
    ctx.fillStyle = "#e05252";
    ctx.beginPath();
    ctx.arc(259, 138, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e05252";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(259, 138, 16, 0, Math.PI * 2);
    ctx.stroke();
    // Bildbeschriftung
    ctx.fillStyle = "#8b95a4";
    ctx.font = "16px monospace";
    ctx.fillText("Cerebrale Angiographie - p.a.", 14, 24);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group position={[0.36, 0.05, -1.32]}>
      <mesh>
        <boxGeometry args={[0.7, 0.55, 0.04]} />
        <meshStandardMaterial color="#1c222b" />
      </mesh>
      <mesh position={[0, 0, 0.023]}>
        <planeGeometry args={[0.64, 0.48]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <Label position={[0, 0.42, 0]} text="Monitor (Kopfangiographie)" />
    </group>
  );
}

/** Reagiert auf Knopfdruck und setzt die Kamera; danach übernimmt wieder OrbitControls. */
function ViewSetter({ view }: { view: { pos: [number, number, number]; n: number } }) {
  const { camera, controls } = useThree() as any;
  const last = useRef(-1);
  useEffect(() => {
    if (view.n !== last.current) {
      last.current = view.n;
      camera.position.set(...view.pos);
      if (controls) {
        controls.target.set(...ISO);
        controls.update();
      }
    }
  }, [view, camera, controls]);
  return null;
}

export default function App() {
  const [lao, setLao] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [view, setView] = useState<{ pos: [number, number, number]; n: number }>({
    pos: [4.5, 1.8, 4.5],
    n: 0,
  });
  const nRef = useRef(0);
  const goto = (pos: [number, number, number]) => {
    nRef.current += 1;
    setView({ pos, n: nRef.current });
  };

  const btn =
    "px-3 py-1.5 text-sm rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors";

  return (
    <div className="min-h-screen bg-slate-100 p-4 flex flex-col gap-3">
      <div className="w-full max-w-5xl mx-auto bg-slate-800 rounded-lg px-4 py-3 text-white text-lg font-bold text-center">
        Angio-Untersuchungsraum – 3D-Ansicht
      </div>

      <div className="w-full max-w-5xl mx-auto bg-white rounded-xl shadow overflow-hidden">
        <Canvas camera={{ position: [4.5, 1.8, 4.5], fov: 50 }} dpr={[1, 2]}>
          <ShowLabelsContext.Provider value={showLabels}>
          {/* Globaler Maßstab: die Szene wird relativ zur 1,80 m großen Untersucher:in
              um 20 % verkleinert (Boden bleibt auf Höhe y = -1.5 fixiert). */}
          <group scale={0.8} position={[0, -0.3, 0]}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[5, 6, 4]} intensity={0.9} />
          <directionalLight position={[-4, 3, -5]} intensity={0.35} />
          <Room />
          <Table />
          <Patient />
          <CArmStand />
          <CArm laoDeg={lao} />
          <LeadGlass />
          <Console />
          <IsoMarker />
          <OrbitControls makeDefault target={ISO} enableDamping dampingFactor={0.08} minDistance={1.2} maxDistance={12} maxPolarAngle={Math.PI * 0.55} />
          <ViewSetter view={view} />
          </group>
          <Examiner />
          <AngioScreen />
          </ShowLabelsContext.Provider>
        </Canvas>
      </div>

      <div className="w-full max-w-5xl mx-auto bg-white rounded-xl shadow p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">C-Bogen: LAO/RAO-Angulation (Drehung um die Patientenchse)</span>
          <span className="font-mono text-slate-900 bg-slate-100 px-3 py-1 rounded-md border border-slate-300">
            {lao > 0 ? "LAO" : lao < 0 ? "RAO" : "0°"} {lao !== 0 ? `${Math.abs(lao)}°` : ""}
          </span>
        </div>
        <input
          type="range"
          min={-90}
          max={90}
          step={1}
          value={lao}
          onChange={(e) => setLao(Number(e.target.value))}
          className="w-full accent-blue-700"
        />
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => setShowLabels((s) => !s)}>
            {showLabels ? "Beschriftungen ausblenden" : "Beschriftungen anzeigen"}
          </button>
          <span className="text-sm text-slate-500 self-center mr-1">Kamera:</span>
          <button className={btn} onClick={() => goto([0, 0, 6])}>Frontal</button>
          <button className={btn} onClick={() => goto([6, 0, 0])}>Seitlich</button>
          <button className={btn} onClick={() => goto([-6, 0, 0])}>Kopfende</button>
          <button className={btn} onClick={() => goto([0, 5.5, 0])}>Von oben</button>
          <button className={btn} onClick={() => goto([4.5, 1.8, 4.5])}>Übersicht</button>
          <span className="text-sm text-slate-500 self-center ml-3">C-Bogen:</span>
          <button className={btn} onClick={() => setLao(0)}>0° (p.a.)</button>
          <button className={btn} onClick={() => setLao(90)}>90° LAO</button>
          <button className={btn} onClick={() => setLao(-90)}>90° RAO</button>
        </div>
        <p className="text-xs text-slate-500">
          Frei bewegen: Ziehen mit der Maus = um das Isozentrum rotieren, Scrollen = zoomen, Ziehen mit rechter Maustaste = verschieben.
          Der C-Bogen (Detektor, Röhre, Zentralstrahl) dreht per Regler um die Patientenchse; die Stützsäule bleibt am Kopfende fixiert.
        </p>
      </div>
    </div>
  );
}
