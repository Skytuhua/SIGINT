import {createElement} from "react";
import {act, create, type ReactTestRenderer} from "react-test-renderer";
import {afterEach, expect, it, vi} from "vitest";
import {useNewsStream} from "../useNewsStream";
let renderer:ReactTestRenderer|undefined;
afterEach(()=>{act(()=>renderer?.unmount()); renderer=undefined; vi.unstubAllGlobals(); vi.useRealTimers();});
it("expires five-minute items from display and local search as time advances", async()=>{
 vi.useFakeTimers(); vi.setSystemTime(1800000000000);
 let source:any;
 class FakeEventSource { onmessage:any; onerror:any; onopen:any; constructor(public url:string) {source=this;} close(){} }
 vi.stubGlobal("EventSource",FakeEventSource);
 let current:any;
 function Probe(){current=useNewsStream({timeWindow:"5m"}); return null;}
 act(()=>{renderer=create(createElement(Probe));});
 const item={ id:"old",timestamp:Date.now()-4*60000, headline:"old", entities:[], tickers:[], sourceDomain:"a" };
 act(()=>source.onmessage({data:JSON.stringify({type:"snapshot",items:[item],sourceHealth:{},expectedFlowPerMin:1})}));
 await act(async()=>{await vi.advanceTimersByTimeAsync(2*60000); });
 expect(current.items).toHaveLength(0);
 await act(async()=>{ source.onmessage({data:JSON.stringify({type:"heartbeat",serverTime:Date.now()})});});
 expect(current.items).toHaveLength(0);
 expect(current.searchLocal("")).toHaveLength(0);
});
