/**
 * googleMapsNav.ts — Google Maps–style navigation for the Cesium globe.
 *
 * Drop-in replacement for Cesium's default ScreenSpaceCameraController behaviour:
 *   Left-drag   → ground-following pan (grab-the-map feel)
 *   Scroll wheel → smooth zoom in/out toward screen centre
 *   Right-drag   → orbit: horizontal = heading rotate, vertical = pitch tilt
 *                  with hard pitch limits and no roll accumulation
 *   Dbl-click    → zoom in ×2 toward screen centre  (Shift → zoom out ×2)
 *                  entity picks are forwarded to the existing Cesium handler
 *   Inertia      → Cesium's built-in inertiaSpin for pan momentum
 *
 * Usage:
 *   const nav = new GoogleMapsNav(viewer, Cesium);
 *   nav.enable();
 *   // later:
 *   nav.destroy(); // restores original controller settings
 *
 * All behaviour constants live in NAV_CONFIG — the single tuning surface.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export const NAV_CONFIG = {
  // Pan momentum (Cesium built-in inertiaTranslate: 0 = instant stop, ~1 = never stops)
  PAN_INERTIA: 0.85,

  // Wheel zoom
  // ZOOM_FRACTION: fraction of camera→surface distance moved per "standard notch" (≈120 px).
  ZOOM_FRACTION: 0.15,
  // ZOOM_SMOOTHING: lerp factor per rAF tick — higher = snappier, lower = silkier.
  ZOOM_SMOOTHING: 0.18,

  // Altitude clamps (metres above terrain / ellipsoid)
  MIN_ZOOM_M: 120,
  MAX_ZOOM_M: 45_000_000,

  // Right-drag orbit sensitivity (radians per canvas pixel)
  TILT_SENSITIVITY:   0.005,
  ROTATE_SENSITIVITY: 0.005,

  // Altitude-based sensitivity scaling: when zoomed out, movement is reduced.
  // At camera height <= this (m), scale is 1; above it, scale = REF / height.
  PAN_REFERENCE_ALT_M: 800_000,

  // Pitch envelope for tilt (Cesium uses negative pitch = looking down)
  MIN_PITCH_DEG: -89,   // near-vertical / straight-down limit
  MAX_PITCH_DEG: -5,    // near-horizontal / horizon-flip limit

  // Double-click zoom animation
  DBLCLICK_ZOOM_IN_FACTOR:  0.5,  // 0.5 → halve altitude → zoom in 2×
  DBLCLICK_ZOOM_OUT_FACTOR: 2.0,  // 2.0 → double altitude → zoom out 2×
  DBLCLICK_DURATION_S: 0.45,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type CesiumType = typeof import('cesium');
type Viewer     = import('cesium').Viewer;
type Cartesian2 = import('cesium').Cartesian2;
type Cartesian3 = import('cesium').Cartesian3;

interface SavedControllerState {
  translateEventTypes: unknown;
  rotateEventTypes:    unknown;
  tiltEventTypes:      unknown;
  zoomEventTypes:      unknown;
  lookEventTypes:      unknown;
  inertiaSpin:         number;
  inertiaTranslate:    number;
  inertiaZoom:         number;
  enableTilt:          boolean;
  maximumMovementRatio: number;
}

export interface GoogleMapsNavOptions {
  /** Match the CesiumGlobe `disableZoom` prop — skips attaching the wheel handler. */
  disableZoom?: boolean;
  /** When set, left-drag orbits around this target (e.g. selected flight/satellite) instead of panning. */
  getOrbitTarget?: () => Cartesian3 | null;
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class GoogleMapsNav {
  private readonly viewer: Viewer;
  private readonly C: CesiumType;
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: GoogleMapsNavOptions;

  private enabled = false;
  private savedState: SavedControllerState | null = null;

  // Tracked DOM listeners for clean teardown
  private _canvasListeners: Array<[string, EventListener]> = [];
  private _canvasCaptureListeners: Array<[string, EventListener]> = [];

  // Wheel / smooth-zoom state
  private _pendingZoom  = 0;
  private _zoomAnchor: import('cesium').Cartesian3 | null = null;  // screen-centre globe point

  // Right-drag orbit state (also used for left-drag orbit when getOrbitTarget is set)
  private _isTilting    = false;
  private _isLeftOrbit  = false;  // true when orbit was started with left button around selected icon
  private _tiltLastX    = 0;
  private _tiltLastY    = 0;
  private _tiltAnchor: Cartesian3 | null = null;
  private _tiltDocMove: EventListener | null = null;
  private _tiltDocUp:   EventListener | null = null;

  // rAF handle
  private _rafId: number | null = null;

  // Scratch objects (avoid allocations in the rAF hot path)
  private readonly _s2:  Cartesian2;
  private readonly _s3:  Cartesian3;
  private readonly _s3b: Cartesian3;

  constructor(viewer: Viewer, Cesium: CesiumType, opts: GoogleMapsNavOptions = {}) {
    this.viewer = viewer;
    this.C      = Cesium;
    this.canvas = viewer.scene.canvas as HTMLCanvasElement;
    this.opts   = opts;

    this._s2  = new Cesium.Cartesian2();
    this._s3  = new Cesium.Cartesian3();
    this._s3b = new Cesium.Cartesian3();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    const ctrl = this.viewer.scene.screenSpaceCameraController;
    const C    = this.C;

    // Save original settings for full restoration on disable()
    this.savedState = {
      translateEventTypes: ctrl.translateEventTypes,
      rotateEventTypes:    ctrl.rotateEventTypes,
      tiltEventTypes:      ctrl.tiltEventTypes,
      zoomEventTypes:      ctrl.zoomEventTypes,
      lookEventTypes:      ctrl.lookEventTypes,
      inertiaSpin:         ctrl.inertiaSpin,
      inertiaTranslate:    ctrl.inertiaTranslate,
      inertiaZoom:         ctrl.inertiaZoom,
      enableTilt:          ctrl.enableTilt,
      maximumMovementRatio: ctrl.maximumMovementRatio,
    };

    // ── Remap Cesium's built-in controller ───────────────────────────────
    // In 3D globe mode, rotateEventTypes IS the ground-following pan.
    // translateEventTypes is only meaningful in 2D/Columbus view — we leave it alone.
    ctrl.rotateEventTypes = [C.CameraEventType.LEFT_DRAG];

    // We own RIGHT_DRAG ourselves (custom pitch-clamped orbit via _onMouseDown).
    // Keep SHIFT+LEFT_DRAG and PINCH for Cesium's built-in tilt as a secondary path.
    ctrl.tiltEventTypes = [
      { eventType: C.CameraEventType.LEFT_DRAG, modifier: C.KeyboardEventModifier.SHIFT },
      C.CameraEventType.PINCH,
    ];

    // Exclude WHEEL and MIDDLE_DRAG from Cesium's zoom — our _onWheel owns zooming.
    ctrl.zoomEventTypes = [
      C.CameraEventType.PINCH,
    ];

    // ALT+LEFT_DRAG → free-look (unchanged from viewer.ts)
    ctrl.lookEventTypes = [
      { eventType: C.CameraEventType.LEFT_DRAG, modifier: C.KeyboardEventModifier.ALT },
    ];

    // ── Inertia ──────────────────────────────────────────────────────────
    // In 3D globe mode inertiaSpin governs the pan momentum (not inertiaTranslate).
    ctrl.inertiaSpin = NAV_CONFIG.PAN_INERTIA;
    ctrl.inertiaZoom = 0.55;

    // ── Attach DOM handlers ───────────────────────────────────────────────
    if (!this.opts.disableZoom) {
      this._on('wheel',    this._onWheel    as EventListener);
      this._on('dblclick', this._onDblClick as EventListener);
    }
    this._on('mousedown',   this._onMouseDown   as EventListener);
    if (this.opts.getOrbitTarget) {
      this._onCapture('mousedown', this._onLeftMouseDown as EventListener);
    }
    this._on('contextmenu', this._onContextMenu as EventListener);

    // ── Start the smooth-zoom rAF loop ───────────────────────────────────
    this._startLoop();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    // Stop rAF
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Remove canvas listeners
    for (const [type, fn] of this._canvasListeners) {
      this.canvas.removeEventListener(type, fn);
    }
    this._canvasListeners = [];
    for (const [type, fn] of this._canvasCaptureListeners) {
      this.canvas.removeEventListener(type, fn, true);
    }
    this._canvasCaptureListeners = [];

    // Clean up any in-progress right-drag
    this._endTilt(/* restoreEnableTilt */ false);

    // Restore saved ScreenSpaceCameraController state
    if (this.savedState) {
      const ctrl = this.viewer.scene.screenSpaceCameraController;
      const s    = this.savedState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctrl.translateEventTypes = s.translateEventTypes as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctrl.rotateEventTypes    = s.rotateEventTypes    as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctrl.tiltEventTypes      = s.tiltEventTypes      as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctrl.zoomEventTypes      = s.zoomEventTypes      as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctrl.lookEventTypes      = s.lookEventTypes      as any;
      ctrl.inertiaSpin         = s.inertiaSpin;
      ctrl.inertiaTranslate    = s.inertiaTranslate;
      ctrl.inertiaZoom         = s.inertiaZoom;
      ctrl.enableTilt          = s.enableTilt;
      ctrl.maximumMovementRatio = s.maximumMovementRatio;
      this.savedState = null;
    }
  }

  /** Full teardown — call when the viewer is about to be destroyed. */
  destroy(): void {
    this.disable();
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private _onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // belt-and-suspenders alongside the outer section handler

    // Normalise to pixel units so trackpad and mouse wheel behave similarly.
    // A standard physical wheel notch on Windows is ±120 px after normalisation.
    let delta = e.deltaY;
    if (e.deltaMode === 1 /* DOM_DELTA_LINE */) delta *= 40;
    else if (e.deltaMode === 2 /* DOM_DELTA_PAGE */) delta *= 800;

    // Pick the screen-centre globe point as the zoom anchor so that the centre
    // of the view stays pinned during zoom (works correctly with any pitch).
    // Re-picked every wheel event so it stays accurate as the camera moves.
    const cx     = this.canvas.clientWidth  / 2;
    const cy     = this.canvas.clientHeight / 2;
    const anchor = this._pickGlobe(this._toC2(cx, cy));
    if (anchor) {
      // Clone into stored anchor (allocate once if null, reuse thereafter)
      this._zoomAnchor = this.C.Cartesian3.clone(anchor, this._zoomAnchor ?? undefined);
    }
    // If the globe is not visible at screen centre (pointing at sky and no prior anchor), skip.
    if (!this._zoomAnchor) return;

    this._pendingZoom += delta;
  };

  private _onDblClick = (e: MouseEvent): void => {
    const cursorPos = this._toC2(e.offsetX, e.offsetY);

    // When an entity is under the cursor the existing Cesium ScreenSpaceEventHandler
    // in CesiumGlobe.tsx owns the interaction (flight / satellite tracking).
    const pick = this.viewer.scene.pick(cursorPos);
    if (pick) return;

    const C      = this.C;
    const camera = this.viewer.camera;

    // Zoom toward the screen centre — pick the globe point at the canvas mid-point.
    const cx = this.canvas.clientWidth  / 2;
    const cy = this.canvas.clientHeight / 2;
    const centrePos = this._toC2(cx, cy);
    const anchor    = this._pickGlobe(centrePos);
    if (!anchor) return;

    const currentAlt = C.Cartographic.fromCartesian(camera.positionWC).height;
    const factor = e.shiftKey
      ? NAV_CONFIG.DBLCLICK_ZOOM_OUT_FACTOR
      : NAV_CONFIG.DBLCLICK_ZOOM_IN_FACTOR;
    const newAlt = Math.max(
      NAV_CONFIG.MIN_ZOOM_M,
      Math.min(NAV_CONFIG.MAX_ZOOM_M, currentAlt * factor)
    );

    const cartoAnchor = C.Cartographic.fromCartesian(anchor);
    camera.flyTo({
      destination: C.Cartesian3.fromRadians(
        cartoAnchor.longitude,
        cartoAnchor.latitude,
        newAlt
      ),
      orientation: {
        heading: camera.heading,
        pitch:   camera.pitch,
        roll:    0,
      },
      duration: NAV_CONFIG.DBLCLICK_DURATION_S,
    });
  };

  /** Left mousedown (capture): when getOrbitTarget is set, orbit around that target instead of pan. */
  private _onLeftMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const getTarget = this.opts.getOrbitTarget;
    if (!getTarget) return;
    const anchor = getTarget();
    if (!anchor) return;
    e.preventDefault();
    e.stopPropagation();
    this._tiltAnchor  = this.C.Cartesian3.clone(anchor);
    this._tiltLastX   = e.clientX;
    this._tiltLastY   = e.clientY;
    this._isTilting   = true;
    this._isLeftOrbit = true;
    this.viewer.scene.screenSpaceCameraController.enableTilt = false;
    const onMove: EventListener = (ev) => this._onTiltMove(ev as MouseEvent);
    const onUp:   EventListener = ()   => this._endTilt(true);
    this._tiltDocMove = onMove;
    this._tiltDocUp   = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };

  private _onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 2) return; // right-button only
    e.preventDefault();
    this._isLeftOrbit = false;

    const anchor = this._pickGlobe(this._toC2(e.offsetX, e.offsetY));
    this._tiltAnchor = anchor ? this.C.Cartesian3.clone(anchor) : null;
    this._tiltLastX  = e.clientX;
    this._tiltLastY  = e.clientY;
    this._isTilting  = true;

    // Prevent Cesium's built-in tilt from competing with ours
    this.viewer.scene.screenSpaceCameraController.enableTilt = false;

    // Attach to document so the drag continues past the canvas edge
    const onMove: EventListener = (ev) => this._onTiltMove(ev as MouseEvent);
    const onUp:   EventListener = ()   => this._endTilt(true);
    this._tiltDocMove = onMove;
    this._tiltDocUp   = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };

  private _onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  /** Scale factor in (0, 1]: 1 at low altitude, smaller when zoomed out to reduce sensitivity. */
  private _getAltitudeScaleFactor(): number {
    const height = this.C.Cartographic.fromCartesian(this.viewer.camera.positionWC).height;
    return Math.min(1, NAV_CONFIG.PAN_REFERENCE_ALT_M / Math.max(1, height));
  }

  // ── Right-drag orbit ─────────────────────────────────────────────────────

  private _onTiltMove(e: MouseEvent): void {
    if (!this._isTilting) return;

    const dx = e.clientX - this._tiltLastX;
    const dy = e.clientY - this._tiltLastY;
    this._tiltLastX = e.clientX;
    this._tiltLastY = e.clientY;
    if (dx === 0 && dy === 0) return;

    const C      = this.C;
    const camera = this.viewer.camera;
    // For left-drag orbit around selected icon, refresh anchor each move (follows moving target)
    let anchor = this._tiltAnchor;
    if (this._isLeftOrbit && this.opts.getOrbitTarget) {
      const next = this.opts.getOrbitTarget();
      if (next) {
        anchor = this.C.Cartesian3.clone(next, anchor ?? undefined);
        this._tiltAnchor = anchor;
      }
    }

    const factor = this._getAltitudeScaleFactor();
    const rotSens  = NAV_CONFIG.ROTATE_SENSITIVITY * factor;
    const tiltSens = NAV_CONFIG.TILT_SENSITIVITY * factor;

    if (anchor) {
      // ── Orbit around anchor using HeadingPitchRange ─────────────────
      // heading: clockwise from North — drag right (+dx) → heading increases
      const newHeading   = camera.heading + dx * rotSens;
      // pitch: negative = looking down — drag down (+dy) → more horizontal → pitch increases
      const currentPitch = C.Math.toDegrees(camera.pitch);
      const rawPitch     = currentPitch + C.Math.toDegrees(dy * tiltSens);
      const clampedPitch = Math.max(NAV_CONFIG.MIN_PITCH_DEG, Math.min(NAV_CONFIG.MAX_PITCH_DEG, rawPitch));

      const dist = C.Cartesian3.distance(camera.positionWC, anchor);

      // camera.lookAt with HeadingPitchRange orbits the camera around anchor
      // at a fixed distance while looking at it — exactly Google Maps orbit behaviour.
      camera.lookAt(
        anchor,
        new C.HeadingPitchRange(newHeading, C.Math.toRadians(clampedPitch), dist)
      );
    } else {
      // Fallback when anchor not available (e.g. clicked on sky)
      if (dx !== 0) camera.rotateLeft(-(dx * rotSens));
      if (dy !== 0) {
        const dPitch     = dy * tiltSens;
        const pitchAfter = C.Math.toDegrees(camera.pitch) + C.Math.toDegrees(dPitch);
        if (pitchAfter >= NAV_CONFIG.MIN_PITCH_DEG && pitchAfter <= NAV_CONFIG.MAX_PITCH_DEG) {
          camera.rotateUp(dPitch);
        }
      }
    }
  }

  private _endTilt(restoreEnableTilt: boolean): void {
    const wasLeftOrbit = this._isLeftOrbit;
    this._isTilting   = false;
    this._isLeftOrbit = false;
    this._tiltAnchor = null;

    if (this._tiltDocMove) {
      document.removeEventListener('mousemove', this._tiltDocMove);
      this._tiltDocMove = null;
    }
    if (this._tiltDocUp) {
      document.removeEventListener('mouseup', this._tiltDocUp);
      this._tiltDocUp = null;
    }

    if (!this.viewer.isDestroyed()) {
      // Release lookAt only for right-drag; when left-dragging around selected icon, globe keeps lock
      if (!wasLeftOrbit) {
        this.viewer.camera.lookAtTransform(this.C.Matrix4.IDENTITY);
      }
      if (restoreEnableTilt) {
        this.viewer.scene.screenSpaceCameraController.enableTilt = true;
      }
    }
  }

  // ── Smooth zoom loop ─────────────────────────────────────────────────────

  private _startLoop(): void {
    const tick = () => {
      if (!this.enabled) return;
      this._applySmoothedZoom();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  /**
   * Each rAF tick, drain a fraction of the accumulated wheel delta and translate
   * the camera toward/away from the stored screen-centre anchor point.
   *
   * Moving along the camera→anchor vector (rather than the look direction) keeps
   * the screen centre pinned correctly at any pitch angle, and avoids the
   * horizontal drift that `camera.moveForward/Backward` causes when the camera
   * is tilted (e.g. after an entity-tracking animation ends).
   *
   * We also detect and release any active `lookAt` transform before moving —
   * entity-tracking animations (`focusFlightSelection`) leave the constraint live
   * after they complete, which causes the globe to jump if the camera is moved
   * while the constraint is still applied.
   */
  private _applySmoothedZoom(): void {
    if (Math.abs(this._pendingZoom) < 0.5 || !this._zoomAnchor) return;
    if (this.viewer.isDestroyed()) return;

    const C      = this.C;
    const camera = this.viewer.camera;

    // ── Release any active lookAt constraint before moving ────────────────
    // `focusFlightSelection` (and similar animations) call `camera.lookAt()`
    // every frame and never release the constraint after the animation ends.
    // If we move the camera while that constraint is active the globe jumps
    // back to the tracked target.  Safe to skip when a tilt drag is in
    // progress — that's our own intentional use of lookAt.
    if (!this._isTilting && !C.Matrix4.equals(camera.transform, C.Matrix4.IDENTITY)) {
      const pos = C.Cartesian3.clone(camera.positionWC);
      const dir = C.Cartesian3.clone(camera.directionWC);
      const up  = C.Cartesian3.clone(camera.upWC);
      camera.lookAtTransform(C.Matrix4.IDENTITY);
      camera.setView({ destination: pos, orientation: { direction: dir, up } });
    }

    const step = this._pendingZoom * NAV_CONFIG.ZOOM_SMOOTHING;
    this._pendingZoom -= step;

    // ── Anchor-based move ─────────────────────────────────────────────────
    // Direction vector from camera toward the anchor (screen-centre surface point).
    const toAnchor = C.Cartesian3.subtract(this._zoomAnchor, camera.positionWC, this._s3b);
    const dist     = C.Cartesian3.magnitude(toAnchor);
    if (dist < 1) return;
    C.Cartesian3.normalize(toAnchor, toAnchor);

    // step < 0  →  zoom in  →  move toward anchor  →  moveMeters > 0
    // step > 0  →  zoom out →  move away from anchor →  moveMeters < 0
    const moveMeters = -(dist * NAV_CONFIG.ZOOM_FRACTION * step / 120);

    const newPos = C.Cartesian3.add(
      camera.positionWC,
      C.Cartesian3.multiplyByScalar(toAnchor, moveMeters, this._s3),
      this._s3,
    );

    const newAlt = C.Cartographic.fromCartesian(newPos).height;
    if (newAlt < NAV_CONFIG.MIN_ZOOM_M || newAlt > NAV_CONFIG.MAX_ZOOM_M) {
      this._pendingZoom = 0;
      return;
    }

    camera.position = C.Cartesian3.clone(newPos);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Return the 3-D world point on the globe surface under a canvas pixel.
   * Tries the terrain-aware globe first, falls back to the ellipsoid.
   */
  private _pickGlobe(screenPos: Cartesian2): Cartesian3 | null {
    const scene = this.viewer.scene;
    const ray   = scene.camera.getPickRay(screenPos);
    if (!ray) return null;
    return scene.globe.pick(ray, scene) ?? scene.camera.pickEllipsoid(screenPos) ?? null;
  }

  /** Write canvas-relative pixel coords into the reusable Cartesian2 scratch. */
  private _toC2(x: number, y: number): Cartesian2 {
    this._s2.x = x;
    this._s2.y = y;
    return this._s2;
  }

  /** Attach a listener to the canvas and remember it for teardown. */
  private _on(type: string, handler: EventListener): void {
    this.canvas.addEventListener(type, handler);
    this._canvasListeners.push([type, handler]);
  }

  /** Attach a capture-phase listener for teardown. */
  private _onCapture(type: string, handler: EventListener): void {
    this.canvas.addEventListener(type, handler, true);
    this._canvasCaptureListeners.push([type, handler]);
  }
}
