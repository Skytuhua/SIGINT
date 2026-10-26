import { expect, it, vi } from 'vitest';
vi.mock('cesium',()=>({PostProcessStage:class {}}));
import { applyStylePreset } from '../postprocess';
it('does not add postprocessing stages after the viewer is destroyed during import',async()=>{
 let destroyed=false;
 const add=vi.fn();
 const viewer={isDestroyed:()=>destroyed,scene:{postProcessStages:{add,remove:vi.fn(),bloom:{enabled:false}}}};
 const pending=applyStylePreset(viewer as any,'normal');
 destroyed=true;
 await pending;
 expect(add).not.toHaveBeenCalled();
});
