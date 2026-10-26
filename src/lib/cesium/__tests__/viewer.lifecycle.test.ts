import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({viewer:null as any,resolveTerrain:null as any,resolveTiles:null as any,terrain:vi.fn(),tiles:vi.fn(),constructed:vi.fn()}));
vi.mock('cesium',()=>({
 Viewer:class {constructor(){state.constructed();return state.viewer;}},
 OpenStreetMapImageryProvider:class {},
 CesiumTerrainProvider:{fromIonAssetId:state.terrain},
 Cesium3DTileset:{fromIonAssetId:state.tiles},
 CameraEventType:{},KeyboardEventModifier:{},
 Cartesian3:{fromDegrees:()=>({})},Math:{toRadians:(value:number)=>value},
}));
import { initViewer } from '../viewer';
async function flush(){for(let i=0;i<15;i++)await Promise.resolve();await vi.dynamicImportSettled();}
beforeEach(()=>{
 vi.stubGlobal('window',{});
 let destroyed=false;
 state.viewer={isDestroyed:()=>destroyed,destroy:vi.fn(()=>{destroyed=true;}),cesiumWidget:{},scene:{screenSpaceCameraController:{},globe:{},primitives:{add:vi.fn()}},camera:{setView:vi.fn()}};
 state.constructed.mockClear();
 state.terrain.mockImplementation(()=>new Promise(resolve=>{state.resolveTerrain=resolve;}));
 state.tiles.mockImplementation(()=>new Promise(resolve=>{state.resolveTiles=resolve;}));
});
it('destroys an allocated viewer immediately when unmounted during terrain loading',async()=>{
 const controller=new AbortController();
 const pending=initViewer({} as HTMLElement,controller.signal);
 await flush();
 expect(state.constructed).toHaveBeenCalledOnce();
 controller.abort();
 expect(state.viewer.destroy).toHaveBeenCalledOnce();
 state.resolveTerrain({});
 await expect(pending).rejects.toHaveProperty('name','AbortError');
 expect(state.viewer.terrainProvider).toBeUndefined();
});
it('disposes tiles returned after unmount instead of attaching to a destroyed viewer',async()=>{
 state.terrain.mockResolvedValue({});
 const controller=new AbortController();
 const pending=initViewer({} as HTMLElement,controller.signal);
 await flush();
 const tiles={destroy:vi.fn(),isDestroyed:()=>false};
 controller.abort();
 state.resolveTiles(tiles);
 await expect(pending).rejects.toHaveProperty('name','AbortError');
 expect(tiles.destroy).toHaveBeenCalledOnce();
 expect(state.viewer.scene.primitives.add).not.toHaveBeenCalled();
});
