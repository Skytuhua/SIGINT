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
  enableRotate:        boolean;
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

  // Left-drag pan state (grab-the-globe)
  private _isPanning     = false;
  private _panGrabPoint: Cartesian3 | null = null;  // globe point grabbed at mousedown (null when started on sky)
  private _panLastScreenX = 0;  // last cursor clientX — used for pixel-delta fallback
  private _panLastScreenY = 0;  // last cursor clientY — used for pixel-delta fallback
  private _panDocMove:   EventListener | null = null;
  private _panDocUp:     EventListener | null = null;
  // Pan inertia: rotation axis + angular velocity (rad/frame), decayed each rAF tick
  private _panInertiaAxis:  Cartesian3 | null = null;
  private _panInertiaSpeed  = 0;

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
  private readonly _s3c: Cartesian3;
  private readonly _scratchQuat: import('cesium').Quaternion;
  private readonly _scratchMat3: import('cesium').Matrix3;

  constructor(viewer: Viewer, Cesium: CesiumType, opts: GoogleMapsNavOptions = {}) {
    this.viewer = viewer;
    this.C      = Cesium;
    this.canvas = viewer.scene.canvas as HTMLCanvasElement;
    this.opts   = opts;

    this._s2  = new Cesium.Cartesian2();
    this._s3  = new Cesium.Cartesian3();
    this._s3b = new Cesium.Cartesian3();
    this._s3c = new Cesium.Cartesian3();
    this._scratchQuat = new Cesium.Quaternion();
    this._scratchMat3 = new Cesium.Matrix3();
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
      enableRotate:        ctrl.enableRotate,
      maximumMovementRatio: ctrl.maximumMovementRatio,
    };

    // ── Remap Cesium's built-in controller ───────────────────────────────
    // We own LEFT_DRAG ourselves (custom pole-safe pan via _onPanDown).
    // Cesium's built-in rotate suffers from gimbal lock near the poles.
    ctrl.rotateEventTypes = [];

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
    // Left-drag: custom pan (or orbit around a selected target when available).
    // Always register _onPanDown; if getOrbitTarget is set, also register
    // _onLeftMouseDown in the capture phase so it gets first crack at left-clicks
    // — when it finds an orbit target it stops propagation, otherwise _onPanDown runs.
    this._on('pointerdown', this._onPanDown as EventListener);
    if (this.opts.getOrbitTarget) {
      this._onCapture('pointerdown', this._onLeftMouseDown as EventListener);
    }
    // Right-drag: orbit
    this._on('pointerdown', this._onMouseDown   as EventListener);
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

    // Clean up any in-progress drags
    this._endPan();
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
      ctrl.enableRotate        = s.enableRotate;
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

  /** Left pointerdown (capture): when getOrbitTarget is set, orbit around that target instead of pan. */
  private _onLeftMouseDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const getTarget = this.opts.getOrbitTarget;
    if (!getTarget) return;
    const anchor = getTarget();
    if (!anchor) return;
    // Release Cesium's pointer capture so our document-level listeners fire
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
    e.stopPropagation();
    this._tiltAnchor  = this.C.Cartesian3.clone(anchor);
    this._tiltLastX   = e.clientX;
    this._tiltLastY   = e.clientY;
    this._isTilting   = true;
    this._isLeftOrbit = true;
    this.viewer.scene.screenSpaceCameraController.enableTilt = false;
    const onMove: EventListener = (ev) => this._onTiltMove(ev as PointerEvent);
    const onUp:   EventListener = ()   => this._endTilt(true);
    this._tiltDocMove = onMove;
    this._tiltDocUp   = onUp;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  };

  private _onMouseDown = (e: PointerEvent): void => {
    if (e.button !== 2) return; // right-button only
    // Release Cesium's pointer capture so our document-level listeners fire
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
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
    const onMove: EventListener = (ev) => this._onTiltMove(ev as PointerEvent);
    const onUp:   EventListener = ()   => this._endTilt(true);
    this._tiltDocMove = onMove;
    this._tiltDocUp   = onUp;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  };

  private _onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  // ── Left-drag pan (grab the globe) ──────────────────────────────────────

  private _onPanDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;              // left-button only
    if (e.shiftKey || e.altKey) return;      // let Cesium handle modified drags

    // Release Cesium's pointer capture so our document-level listeners fire
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const grabPoint = this._pickGlobe(this._toC2(e.offsetX, e.offsetY));

    e.preventDefault();
    this._isPanning    = true;
    this._panGrabPoint = grabPoint ? this.C.Cartesian3.clone(grabPoint) : null;
    this._panLastScreenX = e.clientX;
    this._panLastScreenY = e.clientY;
    // Kill any residual inertia when the user grabs the globe
    this._panInertiaSpeed = 0;

    // Disable Cesium's built-in interactions during our drag
    this.viewer.scene.screenSpaceCameraController.enableRotate = false;

    const onMove: EventListener = (ev) => this._onPanMove(ev as PointerEvent);
    const onUp:   EventListener = ()   => this._endPan();
    this._panDocMove = onMove;
    this._panDocUp   = onUp;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  };

  /** Camera latitude clamp — prevents the camera from reaching the poles. */
  private static readonly _MAX_CAM_LAT = 80 * Math.PI / 180; // ~1.396 rad

  private _onPanMove(e: MouseEvent): void {
    if (!this._isPanning) return;

    const C      = this.C;
    const camera = this.viewer.camera;

    // Ensure camera transform is IDENTITY so positionWC === position
    if (!C.Matrix4.equals(camera.transform, C.Matrix4.IDENTITY)) {
      camera.lookAtTransform(C.Matrix4.IDENTITY);
    }

    // Pixel delta (always tracked for the off-globe fallback)
    const pxDx = e.clientX - this._panLastScreenX;
    const pxDy = e.clientY - this._panLastScreenY;
    this._panLastScreenX = e.clientX;
    this._panLastScreenY = e.clientY;

    // Where does the cursor point on the globe NOW?
    const rect = this.canvas.getBoundingClientRect();
    const ox   = e.clientX - rect.left;
    const oy   = e.clientY - rect.top;
    const currentPoint = this._pickGlobe(this._toC2(ox, oy));

    let axis:  import('cesium').Cartesian3;
    let angle: number;

    if (currentPoint && this._panGrabPoint) {
      // ── On-globe: arbitrary-axis rotation (Google Earth style) ──────
      const grabDir    = C.Cartesian3.normalize(this._panGrabPoint, this._s3);
      const currentDir = C.Cartesian3.normalize(currentPoint, this._s3b);

      const cross   = C.Cartesian3.cross(currentDir, grabDir, this._s3c);
      const crossMag = C.Cartesian3.magnitude(cross);
      if (crossMag < 1e-10) return;
      axis = C.Cartesian3.divideByScalar(cross, crossMag, this._s3c);

      const dot = Math.max(-1, Math.min(1, C.Cartesian3.dot(currentDir, grabDir)));
      angle = Math.acos(dot);
      if (angle < 1e-8) return;
    } else {
      // ── Off-globe fallback: convert pixel movement to rotation ──────
      if (pxDx === 0 && pxDy === 0) return;
      const factor = this._getAltitudeScaleFactor();
      const sens   = NAV_CONFIG.ROTATE_SENSITIVITY * factor;

      // Horizontal: rotate around the surface normal at camera position
      // Vertical: rotate around the camera's right axis
      const ellipsoid = this.viewer.scene.globe.ellipsoid;
      const camUp   = ellipsoid.geodeticSurfaceNormal(camera.positionWC, this._s3c);
      const camRight = C.Cartesian3.normalize(camera.rightWC, this._s3);

      // Combine: weighted sum of camUp (for dx) and camRight (for dy)
      const hAxis = C.Cartesian3.multiplyByScalar(camUp,    pxDx * sens, this._s3b);
      const vAxis = C.Cartesian3.multiplyByScalar(camRight, -pxDy * sens, this._s3);
      const combined = C.Cartesian3.add(hAxis, vAxis, this._s3b);
      angle = C.Cartesian3.magnitude(combined);
      if (angle < 1e-8) return;
      axis = C.Cartesian3.normalize(combined, this._s3c);
    }

    // Store inertia BEFORE scratch objects get overwritten
    this._panInertiaAxis  = C.Cartesian3.clone(axis, this._panInertiaAxis ?? undefined);
    this._panInertiaSpeed = angle;

    // Build rotation and compute new camera state
    const quat = C.Quaternion.fromAxisAngle(axis, angle, this._scratchQuat);
    const mat  = C.Matrix3.fromQuaternion(quat, this._scratchMat3);

    const newPos = C.Matrix3.multiplyByVector(mat, camera.positionWC, this._s3);
    const newDir = C.Matrix3.multiplyByVector(mat, camera.directionWC, this._s3b);
    const newUp  = C.Matrix3.multiplyByVector(mat, camera.upWC, this._s3c);

    // ── Latitude clamp: reject moves that push camera past ±80° ──────
    const newCarto = C.Cartographic.fromCartesian(newPos);
    if (Math.abs(newCarto.latitude) > GoogleMapsNav._MAX_CAM_LAT) return;

    camera.setView({
      destination: C.Cartesian3.clone(newPos),
      orientation: {
        direction: C.Cartesian3.clone(newDir),
        up:        C.Cartesian3.clone(newUp),
      },
    });
  }

  private _endPan(): void {
    this._isPanning    = false;
    this._panGrabPoint = null;

    if (this._panDocMove) {
      document.removeEventListener('pointermove', this._panDocMove);
      this._panDocMove = null;
    }
    if (this._panDocUp) {
      document.removeEventListener('pointerup', this._panDocUp);
      this._panDocUp = null;
    }

    if (!this.viewer.isDestroyed()) {
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    }
    // _panInertiaAxis + _panInertiaSpeed are intentionally kept — the rAF loop decays them
  }

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
      // ── Axis-angle orbit (no gimbal lock at poles) ──────────────────
      // Instead of HeadingPitchRange (which uses heading — degenerate at
      // poles), rotate the camera position around the anchor using the
      // anchor's surface normal (horizontal) and the camera's right axis
      // (vertical).  This is the approach Google Earth uses.

      const ellipsoid = this.viewer.scene.globe.ellipsoid;

      // Vector from anchor to camera (the "arm" we rotate)
      const arm = C.Cartesian3.subtract(camera.positionWC, anchor, this._s3);
      const dist = C.Cartesian3.magnitude(arm);
      if (dist < 1) return;

      // Anchor's surface normal — well-defined everywhere including poles
      const anchorUp = ellipsoid.geodeticSurfaceNormal(anchor, this._s3c);

      // ── Horizontal rotation (dx): spin around anchorUp ──────────────
      const hAngle = -dx * rotSens;
      const hQuat  = C.Quaternion.fromAxisAngle(anchorUp, hAngle, this._scratchQuat);
      const hMat   = C.Matrix3.fromQuaternion(hQuat, this._scratchMat3);
      let rotatedArm = C.Matrix3.multiplyByVector(hMat, arm, this._s3b);

      // ── Vertical rotation (dy): tilt around the right axis ──────────
      // Compute current elevation angle (camera above anchor's horizon)
      const armNorm = C.Cartesian3.normalize(rotatedArm, this._s3);
      const sinElev = C.Cartesian3.dot(armNorm, anchorUp);
      const currentElevDeg = C.Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, sinElev))));

      // Map pitch limits to elevation: elev = 90 + pitch
      const minElevDeg = 90 + NAV_CONFIG.MIN_PITCH_DEG; // ~1 deg (nearly straight down)
      const maxElevDeg = 90 + NAV_CONFIG.MAX_PITCH_DEG;  // ~85 deg (near horizon)

      let vAngleDeg = C.Math.toDegrees(dy * tiltSens);
      const newElevDeg = currentElevDeg + vAngleDeg;
      if (newElevDeg < minElevDeg) vAngleDeg = minElevDeg - currentElevDeg;
      if (newElevDeg > maxElevDeg) vAngleDeg = maxElevDeg - currentElevDeg;

      if (Math.abs(vAngleDeg) > 0.001) {
        // Right axis = anchorUp × arm (perpendicular to both)
        const rightAxis = C.Cartesian3.cross(anchorUp, rotatedArm, this._s3);
        const rightMag  = C.Cartesian3.magnitude(rightAxis);
        if (rightMag > 0.001) {
          C.Cartesian3.divideByScalar(rightAxis, rightMag, rightAxis);
          const vAngle = C.Math.toRadians(vAngleDeg);
          const vQuat  = C.Quaternion.fromAxisAngle(rightAxis, vAngle, this._scratchQuat);
          const vMat   = C.Matrix3.fromQuaternion(vQuat, this._scratchMat3);
          rotatedArm   = C.Matrix3.multiplyByVector(vMat, rotatedArm, this._s3b);
        }
      }

      // ── Apply new camera position and look at anchor ────────────────
      const newPos = C.Cartesian3.add(anchor, rotatedArm, this._s3);
      camera.position = newPos;
      camera.direction = C.Cartesian3.normalize(
        C.Cartesian3.subtract(anchor, newPos, this._s3b), this._s3b
      );
      // Align "up" with the surface normal at the new position to prevent roll drift
      camera.up = ellipsoid.geodeticSurfaceNormal(newPos, this._s3c);
      // Re-orthogonalize the camera frame
      camera.right = C.Cartesian3.normalize(
        C.Cartesian3.cross(camera.direction, camera.up, this._s3), this._s3
      );
      camera.up = C.Cartesian3.normalize(
        C.Cartesian3.cross(camera.right, camera.direction, this._s3c), this._s3c
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
      document.removeEventListener('pointermove', this._tiltDocMove);
      this._tiltDocMove = null;
    }
    if (this._tiltDocUp) {
      document.removeEventListener('pointerup', this._tiltDocUp);
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
      this._applyPanInertia();
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

  /** Decay pan momentum after mouse-up — gives the globe a "throw" feel. */
  private _applyPanInertia(): void {
    if (this._isPanning || !this._panInertiaAxis || this._panInertiaSpeed < 1e-6) return;
    if (this.viewer.isDestroyed()) return;

    const C      = this.C;
    const camera = this.viewer.camera;

    const quat = C.Quaternion.fromAxisAngle(this._panInertiaAxis, this._panInertiaSpeed, this._scratchQuat);
    const mat  = C.Matrix3.fromQuaternion(quat, this._scratchMat3);

    const newPos = C.Matrix3.multiplyByVector(mat, camera.positionWC, this._s3);
    const newDir = C.Matrix3.multiplyByVector(mat, camera.directionWC, this._s3b);
    const newUp  = C.Matrix3.multiplyByVector(mat, camera.upWC, this._s3c);

    // Latitude clamp: kill inertia if it pushes camera past ±80°
    const newCarto = C.Cartographic.fromCartesian(newPos);
    if (Math.abs(newCarto.latitude) > GoogleMapsNav._MAX_CAM_LAT) {
      this._panInertiaSpeed = 0;
      return;
    }

    camera.setView({
      destination: C.Cartesian3.clone(newPos),
      orientation: {
        direction: C.Cartesian3.clone(newDir),
        up:        C.Cartesian3.clone(newUp),
      },
    });

    // Exponential decay
    this._panInertiaSpeed *= NAV_CONFIG.PAN_INERTIA;
    if (this._panInertiaSpeed < 1e-6) {
      this._panInertiaSpeed = 0;
    }
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
