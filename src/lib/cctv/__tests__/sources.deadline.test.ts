import { afterEach, expect, it, vi } from 'vitest';
import { fetchAllCctvCameras } from '../sources';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('returns the healthy source when the other camera source reaches its deadline',async()=>{
 vi.useFakeTimers();
 const healthy={id:'ok'};
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=> url.endsWith('/otc')
  ? Promise.resolve(new Response(JSON.stringify([healthy])))
  : new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true}))));
 let result:unknown;
 void fetchAllCctvCameras({timeoutMs:500}).then(value=>{result=value;});
 await vi.advanceTimersByTimeAsync(501);
 expect(result).toEqual([healthy]);
});
it('aborts camera source requests with the owning mount signal',async()=>{
 const controller=new AbortController();
 const signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',vi.fn((_url:string,init?:RequestInit)=>{
  if(init?.signal)signals.push(init.signal);
  return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true}));
 }));
 const pending=fetchAllCctvCameras({signal:controller.signal});
 await Promise.resolve();
 controller.abort();
 expect(signals).toHaveLength(2);
 expect(signals.every(signal=>signal.aborted)).toBe(true);
 await expect(pending).rejects.toHaveProperty("name","AbortError");
});

it('does not report both failed camera sources as a successful empty update',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('source unavailable'))));
 await expect(fetchAllCctvCameras()).rejects.toThrow('All camera sources failed');
});
