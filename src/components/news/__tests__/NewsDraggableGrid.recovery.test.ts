import {createElement} from "react";
import {act,create,type ReactTestRenderer} from "react-test-renderer";
import {afterEach,expect,it,vi} from "vitest";
import NewsDraggableGrid from "../NewsDraggableGrid";
import CategoryFeedPanel from "../CategoryFeedPanel";
import {useSIGINTStore} from "../../../store";
vi.mock("../../../hooks/useIsMobile",()=>({useIsMobile:()=>true}));
let renderer:ReactTestRenderer|undefined;
afterEach(()=>{act(()=>renderer?.unmount());renderer=undefined;vi.useRealTimers();vi.unstubAllGlobals();});
it("keeps empty mobile category mounted so its lazy fetch can recover",async()=>{
 vi.useFakeTimers();
 vi.stubGlobal("window",{location:{origin:"https://local"}});
 const fetchMock=vi.fn(()=>Promise.resolve(Response.json({items:[]})));
 vi.stubGlobal("fetch",fetchMock);
 const before=useSIGINTStore.getState();
 useSIGINTStore.setState({news:{...before.news,feedItems:[],categoryPanelHasArticles:{}}});
 const config:any={id:"news-cat-tech",category:"tech",dedicatedFeeds:["tech"]};
 function Probe(){
  const hasArticles=useSIGINTStore(s=>s.news.categoryPanelHasArticles[config.id]);
  return createElement(NewsDraggableGrid,{panels:[{id:config.id,node:createElement(CategoryFeedPanel,{config})}],emptyCategoryPanelIds:hasArticles===false?[config.id]:[]});
 }
 await act(async()=>{renderer=create(createElement(Probe));});
 expect(useSIGINTStore.getState().news.categoryPanelHasArticles[config.id]).toBe(false);
 expect(renderer!.root.findAllByType(CategoryFeedPanel)).toHaveLength(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(3500);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(fetchMock).toHaveBeenCalled();
});
