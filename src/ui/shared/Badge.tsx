import { C } from '@/core/constants';

function Badge({status}: any){
  const map: any={
    draft:["#3d1a00","#f97316","Draft"],
    in_progress:[C.yellowDim,C.yellow,"In Progress"],
    extracted:[C.greenDim,C.green,"Ready"],
    validated:[C.greenDim,C.green,"Ready"],
    costed:[C.greenDim,C.green,"Ready"],
    quoted:[C.greenDim,C.green,"Ready"],
    pushed_to_bc:["#0d1f3c","#38bdf8","Pushed to BC"],
    imported:["#1a1040","#a78bfa","Imported"]
  };
  const [bg,col,label]=map[status]||map.draft;
  return<span style={{background:bg,color:col,borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap"}}>{label.toUpperCase()}</span>;
}

export default Badge;
