import React, { useState } from 'react';
import ReactDOM from 'react-dom';

export default function PurchasePriceCheckModal({diffs,onAccept,onClose}: any){
  const [checked,setChecked]=useState<any>(()=>{const m: any={};diffs.forEach((_: any,i: any)=>{m[i]=true;});return m;});
  const allChecked=diffs.every((_: any,i: any)=>checked[i]);
  const fmtPrice=(p: any)=>p!=null?'$'+Number(p).toFixed(2):'—';
  const fmtDate=(ms: any)=>ms?new Date(ms).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
  const selectedCount=diffs.filter((_: any,i: any)=>checked[i]).length;
  return ReactDOM.createPortal(
    React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
      React.createElement('div',{style:{background:'#0d0d1a',border:'1px solid #2a2a3e',borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:780,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 8px 40px rgba(0,0,0,0.7)'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',marginBottom:16}},
          React.createElement('div',{style:{fontSize:15,fontWeight:800,color:'#f1f5f9',flex:1}},'BC Purchase Price Updates'),
          React.createElement('button',{onClick:onClose,style:{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20,lineHeight:1,padding:'2px 6px'}},'✕')
        ),
        React.createElement('div',{style:{fontSize:12,color:'#94a3b8',marginBottom:12}},
          `${diffs.length} item${diffs.length!==1?'s have':' has'} updated pricing in BC Purchase Prices`
        ),
        React.createElement('div',{style:{flex:1,overflowY:'auto'}},
          React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
            React.createElement('thead',null,
              React.createElement('tr',{style:{background:'#111128',position:'sticky',top:0}},
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'center',width:30}},
                  React.createElement('input',{type:'checkbox',checked:allChecked,onChange:(e: any)=>{const v=e.target.checked;const m: any={};diffs.forEach((_: any,i: any)=>{m[i]=v;});setChecked(m);}})
                ),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'left',color:'#64748b',fontWeight:600}},'Part #'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'left',color:'#64748b',fontWeight:600}},'Description'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:'#64748b',fontWeight:600}},'BOM Price'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:'#4ade80',fontWeight:700}},'BC Price'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'center',color:'#64748b',fontWeight:600}},'Δ'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:'#64748b',fontWeight:600}},'BOM Date'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:'#4ade80',fontWeight:600}},'BC Date')
              )
            ),
            React.createElement('tbody',null,
              diffs.map((d: any,i: any)=>{
                const delta=d.bcPrice-d.bomPrice;
                const deltaColor=delta>0.005?'#f87171':delta<-0.005?'#4ade80':'#64748b';
                const deltaStr=delta>0.005?'+'+fmtPrice(delta):delta<-0.005?fmtPrice(delta):'—';
                return React.createElement('tr',{key:i,style:{borderTop:'1px solid #1a1a2e',opacity:checked[i]?1:0.5}},
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'center'}},
                    React.createElement('input',{type:'checkbox',checked:!!checked[i],onChange:(e: any)=>setChecked((prev: any)=>({...prev,[i]:e.target.checked}))})
                  ),
                  React.createElement('td',{style:{padding:'5px 8px',fontWeight:600,color:'#f1f5f9',fontFamily:'monospace',fontSize:11}},d.partNumber),
                  React.createElement('td',{style:{padding:'5px 8px',color:'#94a3b8',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},d.description),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:'#94a3b8',fontVariantNumeric:'tabular-nums'}},fmtPrice(d.bomPrice)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:'#4ade80',fontWeight:700,fontVariantNumeric:'tabular-nums'}},fmtPrice(d.bcPrice)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'center',color:deltaColor,fontWeight:700,fontSize:11,fontVariantNumeric:'tabular-nums'}},deltaStr),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:'#64748b',fontSize:11}},fmtDate(d.bomDate)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:'#4ade80',fontSize:11}},fmtDate(d.bcDate))
                );
              })
            )
          )
        ),
        React.createElement('div',{style:{paddingTop:12,display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center'}},
          React.createElement('span',{style:{fontSize:11,color:'#64748b',marginRight:'auto'}},`${selectedCount} of ${diffs.length} selected`),
          React.createElement('button',{onClick:()=>{onAccept(diffs.filter((_: any,i: any)=>checked[i]));},disabled:selectedCount===0,style:{background:'#0d2010',border:'1px solid #4ade80',color:'#4ade80',padding:'6px 16px',borderRadius:6,cursor:selectedCount>0?'pointer':'not-allowed',fontSize:12,fontFamily:'inherit',fontWeight:700,opacity:selectedCount>0?1:0.5}},`Accept ${selectedCount} Update${selectedCount!==1?'s':''}`),
          React.createElement('button',{onClick:onClose,style:{background:'#1a1a2a',border:'1px solid #2a2a3e',color:'#94a3b8',padding:'6px 16px',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}},'Dismiss')
        )
      )
    )
  ,document.body);
}
