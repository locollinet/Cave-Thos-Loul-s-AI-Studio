import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, Info, RotateCcw, Sparkles } from 'lucide-react';
import type { CellarSlotCell } from '@/lib/cellar';
import { eur } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import type { Wine, WineColor } from '@/types';

interface CellarScene3DProps {
  matrix: CellarSlotCell[][];
  highlightQuery: string;
  emptyOnly: boolean;
  onSelectWine: (wine: Wine) => void;
}

const WINE_COLOR_HEX: Record<WineColor, number> = {
  rouge: 0x470c14,
  blanc: 0xbf903b,
  bulles: 0x1f3818,
  rose: 0x8a3848,
  orange: 0x9c5921,
  doux: 0xb58221,
  spiritueux: 0x5e3816,
  autre: 0x2e2722,
};

export function CellarScene3D({
  matrix,
  highlightQuery,
  emptyOnly,
  onSelectWine,
}: CellarScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<CellarSlotCell | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Stocke la fonction pour réinitialiser la vue caméra
  const resetCameraRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId = 0;
    const width = container.clientWidth || 800;
    const height = 520;

    // Scène, caméra et rendu
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120d0b);
    scene.fog = new THREE.FogExp2(0x120d0b, 0.035);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.replaceChildren(renderer.domElement);

    // Éclairage d'ambiance cave voutée
    const ambientLight = new THREE.AmbientLight(0xffeedb, 0.9);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffdfb8, 1.4);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff9e43, 1.2, 20);
    rimLight.position.set(-6, 4, 3);
    scene.add(rimLight);

    // Groupe du casier à vin
    const rackGroup = new THREE.Group();
    scene.add(rackGroup);

    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 6;

    const slotWidth = 1.05;
    const slotHeight = 1.05;
    const rackDepth = 1.6;

    const totalWidth = cols * slotWidth;
    const totalHeight = rows * slotHeight;

    // Matériau bois de chêne vieilli pour la structure du casier
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x241a14,
      roughness: 0.75,
      metalness: 0.1,
    });

    const brassMaterial = new THREE.MeshStandardMaterial({
      color: 0x91733e,
      roughness: 0.35,
      metalness: 0.8,
    });

    // Poutres horizontales (étagères)
    for (let r = 0; r <= rows; r++) {
      const shelfGeom = new THREE.BoxGeometry(totalWidth + 0.2, 0.08, rackDepth);
      const shelfMesh = new THREE.Mesh(shelfGeom, woodMaterial);
      shelfMesh.position.set(0, (rows / 2 - r) * slotHeight, 0);
      rackGroup.add(shelfMesh);

      // Filet laiton sur la face avant
      const trimGeom = new THREE.BoxGeometry(totalWidth + 0.2, 0.02, 0.02);
      const trimMesh = new THREE.Mesh(trimGeom, brassMaterial);
      trimMesh.position.set(0, (rows / 2 - r) * slotHeight, rackDepth / 2 + 0.01);
      rackGroup.add(trimMesh);
    }

    // Séparateurs verticaux
    for (let c = 0; c <= cols; c++) {
      const dividerGeom = new THREE.BoxGeometry(0.08, totalHeight, rackDepth);
      const dividerMesh = new THREE.Mesh(dividerGeom, woodMaterial);
      dividerMesh.position.set((c - cols / 2) * slotWidth, 0, 0);
      rackGroup.add(dividerMesh);
    }

    // Géométrie de bouteille de vin (corps + épaule + goulot)
    const bodyGeom = new THREE.CylinderGeometry(0.36, 0.36, 1.15, 20);
    const shoulderGeom = new THREE.CylinderGeometry(0.14, 0.36, 0.35, 20);
    const neckGeom = new THREE.CylinderGeometry(0.13, 0.14, 0.45, 20);
    const capsuleGeom = new THREE.CylinderGeometry(0.14, 0.145, 0.25, 20);

    // Mappage des maillages interactifs pour le raycaster
    const interactiveMeshes: THREE.Mesh[] = [];
    const meshToCell = new Map<THREE.Mesh, CellarSlotCell>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = matrix[r][c];
        const x = (c - cols / 2 + 0.5) * slotWidth;
        const y = (rows / 2 - r - 0.5) * slotHeight;
        const z = 0;

        if (cell.isOccupied && cell.wines[0]) {
          const firstWine = cell.wines[0].wine;
          const isMatch = highlightQuery.trim() !== '' && cell.isOccupied;
          const isDimmed = emptyOnly || (highlightQuery.trim() !== '' && !isMatch);

          const bottleColor = WINE_COLOR_HEX[firstWine.color] ?? 0x470c14;

          const glassMat = new THREE.MeshPhysicalMaterial({
            color: bottleColor,
            roughness: 0.15,
            metalness: 0.1,
            transmission: 0.6,
            ior: 1.5,
            transparent: true,
            opacity: isDimmed ? 0.2 : 0.95,
            emissive: isMatch ? 0xd4af37 : 0x000000,
            emissiveIntensity: isMatch ? 0.4 : 0,
          });

          const bottleGroup = new THREE.Group();
          bottleGroup.position.set(x, y, z);
          // Allonger la bouteille dans l'alvéole
          bottleGroup.rotation.x = Math.PI / 2;

          const bodyMesh = new THREE.Mesh(bodyGeom, glassMat);
          bodyMesh.position.y = -0.2;
          bottleGroup.add(bodyMesh);

          const shoulderMesh = new THREE.Mesh(shoulderGeom, glassMat);
          shoulderMesh.position.y = 0.55;
          bottleGroup.add(shoulderMesh);

          const neckMesh = new THREE.Mesh(neckGeom, glassMat);
          neckMesh.position.y = 0.95;
          bottleGroup.add(neckMesh);

          const capMat = new THREE.MeshStandardMaterial({
            color: firstWine.isExceptional ? 0xd4af37 : 0x8a2332,
            roughness: 0.3,
            metalness: 0.7,
          });
          const capMesh = new THREE.Mesh(capsuleGeom, capMat);
          capMesh.position.y = 1.05;
          bottleGroup.add(capMesh);

          rackGroup.add(bottleGroup);

          // Mesh invisible pour faciliter la détection du raycaster
          const hitGeom = new THREE.BoxGeometry(slotWidth * 0.9, slotHeight * 0.9, rackDepth * 0.9);
          const hitMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitMesh = new THREE.Mesh(hitGeom, hitMat);
          hitMesh.position.set(x, y, z);
          rackGroup.add(hitMesh);

          interactiveMeshes.push(hitMesh);
          meshToCell.set(hitMesh, cell);
        } else {
          // Alvéole vide : indicateur subtil si 'emptyOnly' actif
          if (emptyOnly) {
            const ringGeom = new THREE.RingGeometry(0.2, 0.26, 24);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x10b981,
              side: THREE.DoubleSide,
            });
            const ringMesh = new THREE.Mesh(ringGeom, ringMat);
            ringMesh.position.set(x, y, rackDepth / 2 + 0.02);
            rackGroup.add(ringMesh);
          }
        }
      }
    }

    // Positionnement par défaut de la caméra
    const defaultDist = Math.max(totalWidth, totalHeight) * 1.5;
    const defaultPos = new THREE.Vector3(0, 0.4, defaultDist);
    camera.position.copy(defaultPos);
    camera.lookAt(0, 0, 0);

    resetCameraRef.current = () => {
      camera.position.copy(defaultPos);
      rackGroup.rotation.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
    };

    // Contrôles de rotation et zoom légers à la souris / toucher
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycaster pour détecter la bouteille survolée
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const cell = meshToCell.get(hit);
        if (cell) setHoveredCell(cell);
        container.style.cursor = 'pointer';
      } else {
        setHoveredCell(null);
        container.style.cursor = isDragging ? 'grabbing' : 'grab';
      }

      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      rackGroup.rotation.y += deltaX * 0.006;
      rackGroup.rotation.x = Math.max(-0.4, Math.min(0.4, rackGroup.rotation.x + deltaY * 0.006));
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(3, Math.min(20, camera.position.z + e.deltaY * 0.01));
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const cell = meshToCell.get(hit);
        if (cell && cell.wines[0]) {
          onSelectWine(cell.wines[0].wine);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('click', onClick);

    // Boucle d'animation
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
    setIsReady(true);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('click', onClick);
      renderer.dispose();
    };
  }, [matrix, highlightQuery, emptyOnly, onSelectWine]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-amber-950/40 bg-[#120d0b] shadow-2xl">
      {/* Canevas 3D */}
      <div ref={containerRef} className="size-full cursor-grab" />

      {/* Barre d'aide et de recentrage caméra */}
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-amber-500/20 bg-black/60 px-3 py-1.5 text-xs text-amber-200/80 backdrop-blur-md">
        <Info className="size-3.5 text-amber-400" />
        <span>Glisser pour pivoter · Molette pour zoomer · Clic sur bouteille</span>
      </div>

      <button
        type="button"
        onClick={() => resetCameraRef.current()}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-black/60 px-3 py-1.5 text-xs text-amber-200 hover:bg-black/90 hover:text-white backdrop-blur-md transition-colors"
      >
        <RotateCcw className="size-3.5" />
        <span>Recentrer vue</span>
      </button>

      {/* HUD d'information au survol */}
      {hoveredCell && hoveredCell.isOccupied && hoveredCell.wines[0] && (
        <div className="pointer-events-none absolute bottom-5 left-5 z-20 w-80 rounded-2xl border border-amber-500/40 bg-[#161210]/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            Alvéole {hoveredCell.binCode} · Immersion 3D
          </div>
          {hoveredCell.wines.map(({ wine, qty }, i) => (
            <div key={i} className="mt-2 border-t border-amber-950/60 pt-2 first:mt-0 first:border-0 first:pt-0">
              <div className="text-xs uppercase tracking-wider text-amber-400/80">{wine.producer}</div>
              <div className="font-display text-lg text-white leading-tight mt-0.5">{wine.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-amber-200/80">
                <span className="font-semibold text-amber-300">{wine.vintage}</span>
                <span>·</span>
                <span>{formatLabel(wine.formatCl)}</span>
                <span>·</span>
                <span className="font-mono text-emerald-400 font-medium">{qty} btl</span>
              </div>
              {wine.sellPriceHT && (
                <div className="mt-2 text-xs text-amber-500/90">
                  Prix de vente : <span className="font-semibold text-white">{eur(wine.sellPriceHT)} HT</span>
                </div>
              )}
            </div>
          ))}
          <div className="mt-2 text-[10px] text-amber-400/70 flex items-center gap-1">
            <Eye className="size-3" /> Cliquer pour ouvrir la fiche
          </div>
        </div>
      )}
    </div>
  );
}
