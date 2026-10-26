import {createElement} from "react";
import {act,create} from "react-test-renderer";
import {afterEach,expect,it,vi} from "vitest";
import NewsWorldMap from "../NewsWorldMap";
import MapLibreNewsMap from "../MapLibreNewsMap";
vi.mock("../../../hooks/useIsMobile",()=>({useIsMobile:()=>false}));
vi.mock("../CountryDetailModal",()=>({default:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
it.each([["Leaflet", NewsWorldMap], ["MapLibre", MapLibreNewsMap]] as const)("mounts %s when browser storage getItem is denied", (_name, MapComponent) => {
 vi.stubGlobal("window",{location:{search:""},localStorage:{getItem(){throw new DOMException("Storage denied","SecurityError");}}});
 let renderer:ReturnType<typeof create> | undefined;
 try { expect(()=>act(()=>{renderer=create(createElement(MapComponent));})).not.toThrow(); }
 finally { act(()=>renderer?.unmount()); }
});
it.each([["Leaflet", NewsWorldMap], ["MapLibre", MapLibreNewsMap]] as const)("mounts %s when obtaining localStorage is denied", (_name, MapComponent) => {
 const fakeWindow={location:{search:""}};
 Object.defineProperty(fakeWindow,"localStorage",{get(){throw new DOMException("Storage denied","SecurityError");}});
 vi.stubGlobal("window",fakeWindow);
 let renderer:ReturnType<typeof create> | undefined;
 try { expect(()=>act(()=>{renderer=create(createElement(MapComponent));})).not.toThrow(); }
 finally { act(()=>renderer?.unmount()); }
});
