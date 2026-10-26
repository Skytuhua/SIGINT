import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import DataTable from '../table/DataTable';
import InlineFilter from '../controls/InlineFilter';
// Render the table's actual filtered rows without needing browser layout measurements.
vi.mock('@tanstack/react-virtual', () => ({useVirtualizer: ({count}: {count:number}) => ({
 getTotalSize:()=>count*22,
 getVirtualItems:()=>Array.from({length:count},(_,index)=>({index,start:index*22})),
})}));
it.each([
 {field:'heading', values:[0,9,80,90,100],query:'90',expected:[90]},
 {field:'mag', values:[0,4,4.2,5.2,6],query:'4.2',expected:[4.2]},
])('matches the complete text entered for numeric $field filters',({field,values,query,expected})=>{
 let renderer:ReturnType<typeof create>;
 const selected:number[]=[];
 act(()=>{renderer=create(createElement(DataTable,{tableId:`numeric-${field}`,data:values.map(value=>({[field]:value})),columns:[{accessorKey:field,header:field}],onRowClick:(row:unknown)=>selected.push((row as Record<string,number>)[field])}));});
 act(()=>renderer!.root.findAllByType(InlineFilter)[1].props.onChange(query));
 act(()=>renderer!.root.findAllByProps({role:'row'}).filter(row=>row.props.onClick).forEach(row=>row.props.onClick()));
 expect(selected).toEqual(expected);
 act(()=>renderer!.unmount());
});
