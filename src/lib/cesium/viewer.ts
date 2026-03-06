// viewer.ts 閳?Cesium Viewer initialization (browser-only, called inside useEffect)
// IMPORTANT: This file must only be imported dynamically or inside useEffect.
// Never import at module top-level in a Next.js page/component.

declare const CESIUM_BASE_URL: string;

export const DEFAULT_HOME_VIEW = {
  lat: 40.7128,
  lon: -74.006,
  altM: 1_200_000,
  heading: 0,
  pitch: -90,
};

function configureCameraControls(
  viewer: import('cesium').Viewer,
  Cesium: typeof import('cesium')
) {
  const controller = viewer.scene.screenSpaceCameraController;

  controller.enableRotate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableTranslate = true;
  controller.enableLook = true;

  // Keep movement responsive at low FPS and reduce abrupt camera jumps.
  controller.inertiaSpin = 0.75;
  controller.inertiaTranslate = 0.75;
  controller.inertiaZoom = 0.55;
  // Lower ratio = less movement per frame; reduces sensitivity when zoomed out (default 0.1).
  controller.maximumMovementRatio = 0.08;
  controller.minimumZoomDistance = 120;
  controller.maximumZoomDistance = 45_000_000;

  // More discoverable defaults:
  // - Left drag: rotate
  // - Right drag or Shift+Left drag: tilt
  // - Pinch / middle drag / wheel: zoom (wheel over globe is captured by WorldViewApp so page does not scroll)
  // - Alt+Left drag: free look
  controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
  controller.tiltEventTypes = [
    Cesium.CameraEventType.RIGHT_DRAG,
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.SHIFT,
    },
    Cesium.CameraEventType.PINCH,
  ];
  controller.zoomEventTypes = [
    Cesium.CameraEventType.PINCH,
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.WHEEL,
  ];
  controller.lookEventTypes = [
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.ALT,
    },
  ];
}

export async function preloadCesium(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Must set CESIUM_BASE_URL before any Cesium import resolves asset URLs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CESIUM_BASE_URL = '/cesium';

  try {
    const Cesium = await import('cesium');
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? '';
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[viewer] Cesium preload failed', error);
    }
  }
}

export async function initViewer(container: HTMLElement): Promise<import('cesium').Viewer> {
  // Must set CESIUM_BASE_URL before any Cesium import resolves asset URLs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CESIUM_BASE_URL = '/cesium';

  // Dynamic import so Next.js never bundles this on the server
  const Cesium = await import('cesium');


  Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? '';

  // Use a base imagery provider that works without Ion so the globe is never black.
  // When Ion token is valid, Cesium's default would use World Imagery; when missing or
  // when Ion fails, the default leaves the globe black. OSM always loads.
  const baseImagery = new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
  });

  // Create viewer with all default controls disabled (we build our own UI)
  const viewer = new Cesium.Viewer(container, {
    imageryProvider: baseImagery,
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    requestRenderMode: false,
    maximumRenderTimeChange: Infinity,
  } as Record<string, unknown>);
  configureCameraControls(viewer, Cesium);

  // Hide default credit display 閳?we add our own attribution
  if (viewer.cesiumWidget.creditContainer) {
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';
  }

  // 閳光偓閳光偓 Terrain 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
  try {
    const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
    viewer.terrainProvider = terrain;
  } catch {
    console.warn('[viewer] Cesium World Terrain unavailable, using ellipsoid');
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  }

  // 閳光偓閳光偓 3D Tiles (Google Photorealistic 閳?OSM Buildings fallback) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
  try {
    const google3dTiles = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
    viewer.scene.primitives.add(google3dTiles);
  } catch {
    console.warn('[viewer] Google 3D Tiles unavailable, trying OSM Buildings');
    try {
      const osmBuildings = await Cesium.createOsmBuildingsAsync();
      viewer.scene.primitives.add(osmBuildings);
    } catch {
      console.warn('[viewer] OSM Buildings also unavailable 閳?plain globe only');
    }
  }

  // 閳光偓閳光偓 Scene defaults 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.atmosphereLightIntensity = 20.0;
  viewer.scene.highDynamicRange = false;

  // 閳光偓閳光偓 Initial camera: looking at NYC from ~8 km altitude 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_HOME_VIEW.lon,
      DEFAULT_HOME_VIEW.lat,
      DEFAULT_HOME_VIEW.altM
    ),
    orientation: {
      heading: Cesium.Math.toRadians(DEFAULT_HOME_VIEW.heading),
      pitch: Cesium.Math.toRadians(DEFAULT_HOME_VIEW.pitch),
      roll: 0,
    },
  });

  return viewer;
}

/** Fly the camera to a scene (lat, lon, altM, heading, pitch) */
export async function flyToScene(
  viewer: import('cesium').Viewer,
  lat: number,
  lon: number,
  altM: number,
  heading = 0,
  pitch = -45,
  duration = 1.1
): Promise<void> {
  const Cesium = await import('cesium');
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
    orientation: {
      heading: Cesium.Math.toRadians(heading),
      pitch: Cesium.Math.toRadians(pitch),
      roll: 0,
    },
    duration,
  });
}

export async function flyHome(viewer: import('cesium').Viewer): Promise<void> {
  return flyToScene(
    viewer,
    DEFAULT_HOME_VIEW.lat,
    DEFAULT_HOME_VIEW.lon,
    DEFAULT_HOME_VIEW.altM,
    DEFAULT_HOME_VIEW.heading,
    DEFAULT_HOME_VIEW.pitch
  );
}
