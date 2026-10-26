import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import { selectFlightRows, selectQuakeRows, selectSatelliteRows, selectKpiTiles, selectRingSummary } from '../../../lib/dashboard/selectors';
import { useSIGINTStore } from '../../../store';
import LiveCctvPanel from '../LiveCctvPanel';
import CctvFeedView from '../inspector/CctvFeedView';
const viewport=vi.hoisted(()=>({mobile:true}));
vi.mock('../../../hooks/useIsMobile', () => ({useIsMobile: () => viewport.mobile}));
let renderer: ReturnType<typeof create> | null = null;
beforeEach(() => {vi.useFakeTimers();viewport.mobile=true;});
afterEach(()=>{act(()=>renderer?.unmount()); renderer=null; vi.useRealTimers();});
it('preserves empty operational feeds without demonstration rows',()=>{
 const s=useSIGINTStore.getState().liveData;
 const empty={...s, flights:[],military:[],earthquakes:[],satellites:[],satelliteCatalog:[]};
 const output={flights:selectFlightRows(empty).length,quakes:selectQuakeRows(empty).length,sats:selectSatelliteRows(empty).length};
 expect(output).toEqual({flights:0,quakes:0,sats:0});
});
it('omits KPI deltas without a defined historical comparison',()=>{
 const result=selectKpiTiles(useSIGINTStore.getState().liveData);
 expect(result.every(x=>x.delta===null)).toBe(true);
});
it('retains military records when the commercial table exceeds 500 flights',()=>{
 const s=useSIGINTStore.getState().liveData;
 const flight={icao:'dummy',lat:1,lon:1,altM:10000,speedMs:100,heading:0,callsign:'dummy',vRate:0,onGround:false,isMilitary:false,isMock:false};
 const flights=Array.from({length:500},(_,i)=>({...flight,icao:`c${i}`}));
 const rows=selectFlightRows({...s,flights,military:[{...flight,icao:'extra',isMilitary:true}]});
 expect(rows.some(x=>x.id==='extra')).toBe(true);
});
it('single camera mode visits every camera before wrapping',()=>{
 const cameras=Array.from({length:4},(_,i)=>({id:`cam${i}`,name:`Cam ${i}`,city:'Test',lat:1,lon:1,snapshotUrl:`/api/snapshot/${i}`,streamFormat:'JPEG' as const,refreshSeconds:30}));
 act(()=>{renderer=create(createElement(LiveCctvPanel,{panelId:'test',cameras,lockHeaderProps:{locked:false,onToggleLock:()=>{}},onRefresh:()=>{},loading:false}));});
 const ids=[];
 for(let i=0;i<5;i++){
   ids.push(renderer!.root.findByType(CctvFeedView).props.camera.id);
   act(()=>renderer!.root.findByProps({'aria-label':'Refresh panel data'}).props.onClick());
 }
 expect(ids).toEqual(['cam0','cam1','cam2','cam3','cam0']);
});

it('keeps unmeasured row histories and deltas absent',()=>{
 const state=useSIGINTStore.getState().liveData;
 const flight={icao:'measured',lat:1,lon:1,altM:10000,speedMs:100,heading:0,callsign:null,vRate:0,onGround:false,isMilitary:false,isMock:false};
 const quake={id:'measured',lat:1,lon:1,mag:4.2,depthKm:10,place:'Actual event',time:123,type:'earthquake',url:''};
 const sat={noradId:'measured',name:'Actual satellite',lat:1,lon:1,altKm:500};
 const rows=[...selectFlightRows({...state,flights:[flight],military:[]}),...selectQuakeRows({...state,earthquakes:[quake]}),...selectSatelliteRows({...state,satelliteCatalog:[],satellites:[sat]})];
 expect(rows.every(row=>row.delta===null && row.spark.length===0)).toBe(true);
});
it('keeps the empty source summary at zero',()=>{
 const state=useSIGINTStore.getState().liveData;
 expect(selectRingSummary({...state,flights:[],military:[],earthquakes:[],cctv:[]}).every(row=>row.value===0)).toBe(true);
});
it('filters the seismic table at inclusive magnitude thresholds and preserves emptiness',()=>{
 const state=useSIGINTStore.getState().liveData;
 const quake={id:'quake',lat:1,lon:1,mag:0,depthKm:10,place:'Actual event',time:123,type:'earthquake',url:''};
 const data={...state,earthquakes:[0,3.9,4,5,5.1].map(mag=>({...quake,id:`q-${mag}`,mag}))};
 expect(selectQuakeRows(data,{minMagnitude:4,maxMagnitude:5}).map(row=>row.mag)).toEqual([5,4]);
 expect(selectQuakeRows(data,{minMagnitude:0,maxMagnitude:0}).map(row=>row.mag)).toEqual([0]);
 expect(selectQuakeRows({...data,earthquakes:[]},{minMagnitude:0,maxMagnitude:10})).toEqual([]);
});

it('desktop grid advances to the next group of four cameras',()=>{
 viewport.mobile=false;
 const cameras=Array.from({length:8},(_,i)=>({id:`grid${i}`,name:`Cam ${i}`,city:'Test',lat:1,lon:1,snapshotUrl:`/api/snapshot/${i}`,streamFormat:'JPEG' as const,refreshSeconds:30}));
 act(()=>{renderer=create(createElement(LiveCctvPanel,{panelId:'grid',cameras,lockHeaderProps:{locked:false,onToggleLock:()=>{}},onRefresh:()=>{},loading:false}));});
 const displayed=()=>renderer!.root.findAllByType(CctvFeedView).map(view=>view.props.camera.id);
 expect(displayed()).toEqual(['grid0','grid1','grid2','grid3']);
 act(()=>renderer!.root.findByProps({'aria-label':'Refresh panel data'}).props.onClick());
 expect(displayed()).toEqual(['grid4','grid5','grid6','grid7']);
});
