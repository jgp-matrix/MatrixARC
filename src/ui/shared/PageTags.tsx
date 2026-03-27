import { C } from '@/core/constants';

function PageTags({types,onChange,detecting}: any){
  const all=["bom","schematic","backpanel","enclosure","pid"];
  const colors: any={bom:C.accent,schematic:C.green,backpanel:C.purple,enclosure:(C as any).teal||"#0d9488",pid:C.muted};
  const labels: any={bom:"BOM",schematic:"Schematic",backpanel:"Back Panel",enclosure:"Enclosure",pid:"P&ID"};
  if(detecting)return<span style={{fontSize:10,color:C.yellow,fontWeight:600}}>{"🤖 Detecting…"}</span>;
  return(
    <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
      {types.length===0&&<span style={{fontSize:10,color:C.muted,lineHeight:"20px"}}>tag:</span>}
      {all.map((t: any)=>{
        const active=types.includes(t);
        return(
          <button key={t} onClick={()=>{const next=active?types.filter((x: any)=>x!==t):[...types,t];onChange(next);}}
            style={{background:active?colors[t]+"33":"transparent",color:active?colors[t]:C.muted,border:`1px solid ${active?colors[t]+"88":C.border}`,borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.1s"}}>
            {labels[t]}
          </button>
        );
      })}
    </div>
  );
}

export default PageTags;
