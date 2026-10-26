import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
const boot = vi.hoisted(()=>({ resolve: null as any, workerCount:0, terminateCount:0, style:vi.fn(), pending:false, cameraResolve:null as any, cameraSignal:null as AbortSignal|null, handlers:new Map<string,any[]>() }));
vi.mock('../../lib/cesium/viewer', ()=>({DEFAULT_HOME_VIEW:{lat:0,lon:0,altM:1e6,heading:0,pitch:-90},flyToScene:vi.fn(),initViewer: vi.fn(()=>new Promise(r=>boot.resolve=r))}));
vi.mock('../../lib/cesium/postprocess',()=>({applyStylePreset:boot.style}));
vi.mock('../../lib/cctv/sources',()=>({fetchAllCctvCameras:(options?:{signal?:AbortSignal})=>{boot.cameraSignal=options?.signal??null;return boot.pending?new Promise(resolve=>{boot.cameraResolve=resolve;}):Promise.resolve([]);}}));
vi.mock('../../lib/runtime/fetchJson',()=>({fetchJsonWithPolicy:()=>Promise.resolve([]),isAbortError:()=>false}));
vi.mock('../../lib/cesium/layers',()=>Object.fromEntries('renderSatellites renderFlights renderDisasterAlerts renderCctv renderOrbitPath renderFlightHighlight renderFlightPath renderSatelliteHighlight clearLayer clearAllOrbitLayers updateFlightPositions renderTradeRoutesLayer clearTradeRoutesLayer tickTradeRouteAnimation getActiveTradeRouteHandle identifyTradeRoutePick renderGpsJamZones renderAirspaceAnomalies renderDisappearedFlights setFlightVectorsVisible renderVolcanoes renderNuclearSites renderMilitaryBases renderCountryBorders'.split(' ').map(k=>[k,vi.fn()])));
vi.mock('cesium',()=>{
 class Vec {constructor(public x=1,public y=1,public z=1){}clone(){return new Vec(this.x,this.y,this.z);}static clone(v:any){return new Vec(v.x,v.y,v.z);}static fromDegrees(..._args:any[]){return new Vec();}static fromRadians(..._args:any[]){return new Vec();}static distance(..._args:any[]){return 100000;}static lerp(..._args:any[]){return new Vec();}static subtract(..._args:any[]){return new Vec();}static normalize(..._args:any[]){return new Vec();}}
 return {ScreenSpaceEventType:{LEFT_CLICK:'left',MOUSE_MOVE:'move',LEFT_DOUBLE_CLICK:'double',LEFT_DOWN:'leftDown',RIGHT_DOWN:'rightDown',MIDDLE_DOWN:'middleDown',WHEEL:'wheel',PINCH_START:'pinchStart'},Cartesian3:Vec,HeadingPitchRange:class{},Math:{toRadians:(x:number)=>x*Math.PI/180},JulianDate:{now:()=>new Date(),toDate:(x:any)=>x},EasingFunction:{CUBIC_OUT:(x:number)=>x},Matrix4:{IDENTITY:{}}};
});
import { useSIGINTStore } from '../../store';
import CesiumGlobe from '../CesiumGlobe';
let renderer:ReturnType<typeof create>|null=null;
let viewer:any;
let ready:any;
async function flush(){for(let i=0;i<50;i++)await Promise.resolve();}
function event(){const listeners=new Set<any>();return {listeners,addEventListener:vi.fn((f:any)=>listeners.add(f)),removeEventListener:vi.fn((f:any)=>listeners.delete(f))};}
beforeEach(()=>{
 vi.useFakeTimers(); boot.workerCount=0; boot.terminateCount=0; boot.pending=false; boot.style.mockClear();
 boot.handlers.clear();
 vi.stubGlobal('HTMLInputElement',class{});vi.stubGlobal('HTMLTextAreaElement',class{});
 vi.stubGlobal('window',{addEventListener:vi.fn((type,fn)=>boot.handlers.set(type,[...(boot.handlers.get(type)||[]),fn])),removeEventListener:vi.fn()});
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve({json:()=>Promise.resolve({features:[]})})));
 vi.stubGlobal('Worker',class{constructor(){boot.workerCount++;}postMessage(){} terminate(){boot.terminateCount++;}});
 viewer={isDestroyed:vi.fn(()=>false),destroy:vi.fn(),camera:{positionCartographic:{latitude:0,longitude:0,height:1000000},heading:0,pitch:0,positionWC:{x:1,y:1,z:1},directionWC:{x:1,y:1,z:1},upWC:{x:1,y:1,z:1,clone:()=>({x:1,y:1,z:1})},cancelFlight:vi.fn(),lookAt:vi.fn(),lookAtTransform:vi.fn(),setView:vi.fn()},scene:{screenSpaceCameraController:{},globe:{ellipsoid:{geodeticSurfaceNormal:()=>({x:1,y:1,z:1})}},preRender:event(),postRender:event()},screenSpaceEventHandler:{setInputAction:vi.fn()},dataSources:{length:0}};
 const s=useSIGINTStore.getState();
 useSIGINTStore.setState({layers:Object.fromEntries(Object.keys(s.layers).map(k=>[k,false])) as any,ui:{...s.ui,stylePreset:'normal',showBloom:false,sharpen:false}});
 ready=vi.fn();
});
afterEach(()=>{act(()=>renderer?.unmount());renderer=null;vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('destroys a viewer returned after unmount without allocating resources',async()=>{
 boot.pending=true;
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();});
 expect(boot.resolve).toBeTypeOf('function');
 act(()=>renderer!.unmount());renderer=null;
 await act(async()=>{boot.resolve(viewer);await flush();});
 expect(boot.workerCount).toBe(0); expect(viewer.destroy).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('applies every rendered postprocessing parameter with the same preset',async()=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onReady:ready}),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();boot.resolve(viewer);await flush();});
 // Dynamic Cesium import may settle on a later event-loop turn.
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 expect(ready).toHaveBeenCalled();expect(boot.style).toHaveBeenCalledTimes(1);
 act(()=>useSIGINTStore.getState().setUi({showBloom:true,sharpen:true}));
 expect(boot.style).toHaveBeenCalledTimes(2);
 for (const [param, value] of Object.entries({crtDistortion:0.71,crtInstability:0.61,nvgBrightness:0.51,flirContrast:0.41})) {
  act(()=>useSIGINTStore.getState().setUi({[param]:value}));
  expect(boot.style.mock.calls.at(-1)?.[2][param]).toBe(value);
 }
 expect(boot.style).toHaveBeenCalledTimes(6);
});

it('makes controls ready while optional webcam requests remain pending',async()=>{
 boot.pending=true;
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onReady:ready}),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 expect(boot.workerCount).toBe(1); expect(ready).toHaveBeenCalledOnce();
 expect(viewer.screenSpaceEventHandler.setInputAction).toHaveBeenCalled();
 act(()=>useSIGINTStore.getState().setStylePreset('nvg'));
 expect(boot.style).toHaveBeenCalledTimes(2);
});
it('preserves native select keyboard navigation',async()=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();});
 const e={key:'ArrowDown',target:{tagName:'SELECT'},preventDefault:vi.fn()};
 for(const handler of boot.handlers.get('keydown')||[])handler(e);
 expect(e.preventDefault).not.toHaveBeenCalled();
});

it('clearing selection removes the custom flight focus animation immediately',async()=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onReady:ready}),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 expect(ready).toHaveBeenCalled();
 const countBefore=viewer.scene.postRender.listeners.size;
 act(()=>useSIGINTStore.getState().selectEntity({type:'flight',id:'test-flight',data:{icao:'test-flight',lat:1,lon:1,altM:10000}} as any));
 expect(viewer.scene.postRender.listeners.size).toBe(countBefore+1);
 act(()=>useSIGINTStore.getState().clearSelectionContext());
 const lookAtBefore=viewer.camera.lookAt.mock.calls.length;
 vi.advanceTimersByTime(400);
 for(const listener of [...viewer.scene.postRender.listeners])listener();
 expect(viewer.scene.postRender.listeners.size).toBe(countBefore);
 expect(viewer.camera.lookAt.mock.calls.length).toBe(lookAtBefore);
});

it('cancels old focus on replacement selection and manual navigation',async()=>{
 let controls:any;
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onControlApi:(api:any)=>controls=api}),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 const baseline=viewer.scene.postRender.listeners.size;
 act(()=>useSIGINTStore.getState().selectEntity({type:'flight',id:'first',data:{icao:'first',lat:1,lon:1,altM:10000}} as any));
 act(()=>useSIGINTStore.getState().selectEntity({type:'flight',id:'second',data:{icao:'second',lat:2,lon:2,altM:10000}} as any));
 expect(viewer.scene.postRender.listeners.size).toBe(baseline+1);
 await act(async()=>{await controls.gotoHome();});
 expect(viewer.scene.postRender.listeners.size).toBe(baseline);
});
it('scopes hotkeys to the focused globe and honors disabled, handled and modified events',async()=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({contains:(target:any)=>target?.inGlobe===true})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 const send=(overrides:any={})=>{const e={key:'ArrowDown',target:{tagName:'CANVAS',inGlobe:true},preventDefault:vi.fn(),...overrides};for(const handler of boot.handlers.get('keydown')||[])handler(e);return e;};
 expect(send({target:{tagName:'DIV'}}).preventDefault).not.toHaveBeenCalled();
 expect(send({defaultPrevented:true}).preventDefault).not.toHaveBeenCalled();
 expect(send({ctrlKey:true}).preventDefault).not.toHaveBeenCalled();
 act(()=>useSIGINTStore.getState().setHotkeysEnabled(false));
 expect(send().preventDefault).not.toHaveBeenCalled();
 act(()=>useSIGINTStore.getState().setHotkeysEnabled(true));
 expect(send().preventDefault).toHaveBeenCalledOnce();
});

it('tears down ready resources and ignores optional cameras returned after unmount',async()=>{
 boot.pending=true;
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onReady:ready}),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 expect(ready).toHaveBeenCalledOnce();
 const camerasBefore=useSIGINTStore.getState().liveData.cctv;
 act(()=>renderer!.unmount());renderer=null;
 expect(boot.cameraSignal?.aborted).toBe(true);
 expect(boot.terminateCount).toBe(1);
 expect(viewer.destroy).toHaveBeenCalledOnce();
 expect(viewer.scene.preRender.listeners.size).toBe(0);
 expect(viewer.scene.postRender.listeners.size).toBe(0);
 expect(vi.getTimerCount()).toBe(0);
 await act(async()=>{boot.cameraResolve([{id:'late-camera'}]);await flush();});
 expect(useSIGINTStore.getState().liveData.cctv).toBe(camerasBefore);
});
it('stops initialization when unmounted while the initial style is pending',async()=>{
 let resolveStyle:()=>void=()=>{};
 boot.style.mockImplementationOnce(()=>new Promise<void>(resolve=>{resolveStyle=resolve;}));
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 act(()=>renderer!.unmount());renderer=null;
 await act(async()=>{resolveStyle();await flush();});
 expect(boot.workerCount).toBe(0);
 expect(viewer.destroy).toHaveBeenCalledOnce();
 expect(vi.getTimerCount()).toBe(0);
});
it('cancels a satellite focus animation when a map gesture starts',async()=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 const baseline=viewer.scene.postRender.listeners.size;
 act(()=>useSIGINTStore.getState().selectEntity({type:'satellite',id:'sat',data:{noradId:'sat',lat:1,lon:1,altKm:500}} as any));
 expect(viewer.scene.postRender.listeners.size).toBe(baseline+1);
 const gesture=viewer.screenSpaceEventHandler.setInputAction.mock.calls.find((call:any[])=>call[1]==='wheel')[0];
 act(()=>gesture());
 expect(viewer.scene.postRender.listeners.size).toBe(baseline);
});

it.each([
 ['flight', 'flight'],
 ['flight', 'satellite'],
 ['satellite', 'flight'],
 ['satellite', 'satellite'],
] as const)('double-click %s to %s replaces the old animation and keeps the new one', async(firstType, nextType)=>{
 let controls:any;
 await act(async()=>{renderer=create(createElement(CesiumGlobe,{onControlApi:(api:any)=>controls=api}),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 const doubleClick=viewer.screenSpaceEventHandler.setInputAction.mock.calls.find((call:any[])=>call[1]==='double')[0];
 const baseline=new Set(viewer.scene.postRender.listeners);
 const timersBefore=vi.getTimerCount();
 const pickEntity=(type:'flight'|'satellite',id:string)=>({id:{type,id,data:type==='flight'
  ? {icao:id,lat:1,lon:1,altM:10000}
  : {noradId:id,lat:2,lon:2,altKm:500}}});
 viewer.scene.pick=()=>pickEntity(firstType,'old-target');
 act(()=>doubleClick({position:{}}));
 expect(viewer.scene.postRender.listeners.size).toBe(baseline.size+1);
 const oldAnimation=[...viewer.scene.postRender.listeners].find(listener=>!baseline.has(listener));
 viewer.scene.pick=()=>pickEntity(nextType,'new-target');
 act(()=>doubleClick({position:{}}));
 expect(useSIGINTStore.getState().selection.selectedEntity?.id).toBe('new-target');
 expect(viewer.scene.postRender.listeners.has(oldAnimation)).toBe(false);
 expect(viewer.scene.postRender.listeners.size).toBe(baseline.size+1);
 expect(vi.getTimerCount()).toBe(timersBefore);
 // Both clear and explicit navigation must still be able to stop the new tween.
 if(nextType==='flight') act(()=>useSIGINTStore.getState().clearSelectionContext());
 else await act(async()=>{await controls.gotoHome();});
 expect(viewer.scene.postRender.listeners.size).toBe(baseline.size);
 act(()=>renderer!.unmount());renderer=null;
 expect(viewer.scene.postRender.listeners.size).toBe(0);
 expect(vi.getTimerCount()).toBe(0);
});

it.each([
 {name:'unmapped stale highlight',pick:{id:{type:'flight_highlight',id:'missing-from-live-flights'}}},
 {name:'invalid empty flight identifier',pick:{id:{type:'flight',id:'   ',data:{icao:'',lat:2,lon:2,altM:10000}}}},
])('ignores $name without cancelling valid current focus',async({pick})=>{
 await act(async()=>{renderer=create(createElement(CesiumGlobe),{createNodeMock:()=>({})});await flush();boot.resolve(viewer);await flush();});
 await act(async()=>{await vi.dynamicImportSettled();await flush();});
 const doubleClick=viewer.screenSpaceEventHandler.setInputAction.mock.calls.find((call:any[])=>call[1]==='double')[0];
 viewer.scene.pick=()=>({id:{type:'flight',id:'valid-target',data:{icao:'valid-target',lat:1,lon:1,altM:10000}}});
 act(()=>doubleClick({position:{}}));
 const listenersBefore=new Set(viewer.scene.postRender.listeners);
 const timersBefore=vi.getTimerCount();
 viewer.scene.pick=()=>pick;
 act(()=>doubleClick({position:{}}));
 expect(useSIGINTStore.getState().selection.selectedEntity?.id).toBe('valid-target');
 expect(viewer.scene.postRender.listeners).toEqual(listenersBefore);
 expect(vi.getTimerCount()).toBe(timersBefore);
});
