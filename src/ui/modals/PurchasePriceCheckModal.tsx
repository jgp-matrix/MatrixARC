// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function PurchasePriceCheckModal({diffs,onAccept,onClose}){
  const [checked,setChecked]=useState(()=>{const m={};diffs.forEach((_,i)=>{m[i]=true;});return m;});
  const allChecked=diffs.every((_,i)=>checked[i]);
  const fmtPrice=p=>p!=null?'$'+Number(p).toFixed(2):'—';
  const fmtDate=ms=>ms?new Date(ms).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
  const selectedCount=diffs.filter((_,i)=>checked[i]).length;
  return ReactDOM.createPortal(
    React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
      React.createElement('div',{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:780,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',marginBottom:16}},
          React.createElement('div',{style:{fontSize:15,fontWeight:800,color:C.text,flex:1}},'💲 BC Purchase Price Updates'),
          React.createElement('button',{onClick:onClose,style:{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:20,lineHeight:1,padding:'2px 6px'}},'✕')
        ),
        React.createElement('div',{style:{fontSize:12,color:C.muted,marginBottom:12}},
          `${diffs.length} item${diffs.length!==1?'s have':' has'} updated pricing in BC Purchase Prices`
        ),
        React.createElement('div',{style:{flex:1,overflowY:'auto'}},
          React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
            React.createElement('thead',null,
              React.createElement('tr',{style:{background:C.bg,position:'sticky',top:0}},
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'center',width:30}},
                  React.createElement('input',{type:'checkbox',checked:allChecked,onChange:e=>{const v=e.target.checked;const m={};diffs.forEach((_,i)=>{m[i]=v;});setChecked(m);}})
                ),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'left',color:C.muted,fontWeight:600}},'Part #'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'left',color:C.muted,fontWeight:600}},'Description'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:C.muted,fontWeight:600}},'BOM Price'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:C.green,fontWeight:700}},'BC Price'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'center',color:C.muted,fontWeight:600}},'Δ'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:C.muted,fontWeight:600}},'BOM Date'),
                React.createElement('th',{style:{padding:'6px 8px',textAlign:'right',color:C.green,fontWeight:600}},'BC Date')
              )
            ),
            React.createElement('tbody',null,
              diffs.map((d,i)=>{
                const delta=d.bcPrice-d.bomPrice;
                const deltaColor=delta>0.005?C.red:delta<-0.005?C.green:C.muted;
                const deltaStr=delta>0.005?'+'+fmtPrice(delta):delta<-0.005?fmtPrice(delta):'—';
                return React.createElement('tr',{key:i,style:{borderTop:`1px solid ${C.border}`,opacity:checked[i]?1:0.5}},
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'center'}},
                    React.createElement('input',{type:'checkbox',checked:!!checked[i],onChange:e=>setChecked(prev=>({...prev,[i]:e.target.checked}))})
                  ),
                  React.createElement('td',{style:{padding:'5px 8px',fontWeight:600,color:C.text,fontFamily:'monospace',fontSize:11}},d.partNumber),
                  React.createElement('td',{style:{padding:'5px 8px',color:C.muted,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},d.description),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:C.muted,fontVariantNumeric:'tabular-nums'}},fmtPrice(d.bomPrice)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:C.green,fontWeight:700,fontVariantNumeric:'tabular-nums'}},fmtPrice(d.bcPrice)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'center',color:deltaColor,fontWeight:700,fontSize:11,fontVariantNumeric:'tabular-nums'}},deltaStr),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:C.muted,fontSize:11}},fmtDate(d.bomDate)),
                  React.createElement('td',{style:{padding:'5px 8px',textAlign:'right',color:C.green,fontSize:11}},fmtDate(d.bcDate))
                );
              })
            )
          )
        ),
        React.createElement('div',{style:{paddingTop:12,display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center'}},
          React.createElement('span',{style:{fontSize:11,color:C.muted,marginRight:'auto'}},`${selectedCount} of ${diffs.length} selected`),
          React.createElement('button',{onClick:()=>{onAccept(diffs.filter((_,i)=>checked[i]));},disabled:selectedCount===0,style:{background:C.greenDim,border:`1px solid ${C.green}`,color:C.green,padding:'6px 16px',borderRadius:6,cursor:selectedCount>0?'pointer':'not-allowed',fontSize:12,fontFamily:'inherit',fontWeight:700,opacity:selectedCount>0?1:0.5}},`✓ Accept ${selectedCount} Update${selectedCount!==1?'s':''}`),
          React.createElement('button',{onClick:onClose,style:{background:C.bg,border:`1px solid ${C.border}`,color:C.muted,padding:'6px 16px',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}},'Dismiss')
        )
      )
    )
  ,document.body);
}

export default PurchasePriceCheckModal;
