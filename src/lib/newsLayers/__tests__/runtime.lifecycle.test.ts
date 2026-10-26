import {expect,it,vi} from "vitest";
import {NewsLayerRuntime} from "../runtime";
const mocks=vi.hoisted(()=>({cache:vi.fn(),register:vi.fn(()=>vi.fn())}));
vi.mock("../../runtime/globalRefreshRuntime",()=>({globalRefreshRuntime:{register:mocks.register,trigger:vi.fn()}}));
vi.mock("../pipeline",()=>({loadLayerFromCache:mocks.cache,runLayerPipeline:vi.fn()}));
it("ignores delayed cache data and cannot resurrect a disposed runtime",async()=>{
 let resolve!:(data:any)=>void;
 mocks.cache.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const layer:any={id:"test",dataSource:{refreshMs:60000},performance:{maxFeatures:10}};
 const onData=vi.fn(); const runtime=new NewsLayerRuntime([layer],{onData,onHealth:vi.fn()});
 const pending=runtime.primeFromCache("test");
 runtime.dispose();
 resolve({type:"FeatureCollection",features:[]}); await pending;
 expect(onData).not.toHaveBeenCalled();
 // Both map syncLayerMountedState methods do this unconditionally after their cache await.
 runtime.enable("test");
 expect(mocks.register).not.toHaveBeenCalled();
 runtime.dispose();
});
it("invalidates delayed cache priming when a layer is disabled", async () => {
 let resolve!: (data: any) => void;
 mocks.cache.mockReturnValueOnce(new Promise(r => { resolve = r; }));
 const layer: any = { id: "disabled", dataSource: { refreshMs: 60000 }, performance: { maxFeatures: 10 } };
 const onData = vi.fn();
 const runtime = new NewsLayerRuntime([layer], { onData, onHealth: vi.fn() });
 const pending = runtime.primeFromCache(layer.id);
 runtime.disable(layer.id);
 resolve({ type: "FeatureCollection", features: [] });
 await pending;
 expect(onData).not.toHaveBeenCalled();
 runtime.dispose();
});
