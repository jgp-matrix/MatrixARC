// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function EngineeringQuestionsModal({panel,uid,onUpdate,onSave,onClose,memberMap}){
  const eqs=panel.engineeringQuestions||[];
  const [answers,setAnswers]=useState(()=>{const m={};eqs.forEach(q=>{if(q.answer)m[q.id]=q.answer;});return m;});
  const [emailPicker,setEmailPicker]=useState(false);
  const [emailTo,setEmailTo]=useState("");
  const [emailSending,setEmailSending]=useState(false);
  const openCount=eqs.filter(q=>q.status==="open").length;
  const answeredCount=eqs.filter(q=>q.status==="answered").length;
  const skippedCount=eqs.filter(q=>q.status==="skipped").length;
  const onQuoteCount=eqs.filter(q=>q.status==="on_quote").length;
  function updateQ(id,fields){
    const updated={...panel,engineeringQuestions:eqs.map(q=>q.id===id?{...q,...fields}:q)};
    onUpdate(updated);try{onSave(updated);}catch(e){}
  }
  const sevColors={critical:"#ef4444",warning:"#f59e0b",info:"#818cf8"};
  const statusLabels={open:"Open",answered:"Answered",skipped:"Skipped",on_quote:"On Quote"};
  const statusColors={open:"#f59e0b",answered:"#4ade80",skipped:"#94a3b8",on_quote:"#38bdf8"};
  async function sendEngineerEmail(){
    if(!emailTo)return;
    setEmailSending(true);
    try{
      const openQs=eqs.filter(q=>q.status==="open"||q.status==="skipped");
      await firebase.app().functions().httpsCallable("sendEngineerQuestionEmail")({
        to:emailTo,projectName:panel.drawingNo||panel.name||"Panel",
        bcProjectNumber:panel.bcProjectNumber||"",panelName:panel.name||"Panel",
        questions:openQs.map(q=>({question:q.question,category:q.category,severity:q.severity,rowRef:q.rowRef}))
      });
      setEmailPicker(false);setEmailTo("");
    }catch(e){console.warn("Email failed:",e);}
    setEmailSending(false);
  }
  return ReactDOM.createPortal(
    React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16},onMouseDown:e=>{if(e.target===e.currentTarget)onClose();}},
      React.createElement("div",{style:{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",maxWidth:620,width:"95%",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 12px 48px rgba(0,0,0,0.6)"}},
        React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexShrink:0}},
          React.createElement("span",{style:{fontSize:16,fontWeight:800,color:C.text,flex:1}},"Engineering Questions"),
          React.createElement("span",{style:{fontSize:10,fontWeight:700,color:"#f59e0b",background:"#f59e0b22",borderRadius:10,padding:"2px 8px"}},openCount+" open"),
          answeredCount>0&&React.createElement("span",{style:{fontSize:10,fontWeight:700,color:"#4ade80",background:"#4ade8022",borderRadius:10,padding:"2px 8px"}},answeredCount+" answered"),
          skippedCount>0&&React.createElement("span",{style:{fontSize:10,fontWeight:700,color:"#94a3b8",background:"#94a3b822",borderRadius:10,padding:"2px 8px"}},skippedCount+" skipped"),
          onQuoteCount>0&&React.createElement("span",{style:{fontSize:10,fontWeight:700,color:"#38bdf8",background:"#38bdf822",borderRadius:10,padding:"2px 8px"}},onQuoteCount+" on quote")
        ),
        React.createElement("div",{style:{overflowY:"auto",flex:1,marginBottom:12}},
          eqs.length===0?React.createElement("div",{style:{color:C.muted,fontSize:13,textAlign:"center",padding:24}},"No engineering questions yet. Questions will be generated during extraction and compliance review."):
          eqs.map(q=>React.createElement("div",{key:q.id,style:{marginBottom:10,padding:"10px 14px",background:q.status==="open"?"rgba(250,204,21,0.04)":"rgba(255,255,255,0.02)",border:`1px solid ${q.status==="open"?"rgba(250,204,21,0.2)":"rgba(255,255,255,0.06)"}`,borderRadius:8}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}},
              React.createElement("span",{style:{fontSize:9,fontWeight:800,color:sevColors[q.severity]||C.muted,textTransform:"uppercase",letterSpacing:0.5}},q.severity),
              React.createElement("span",{style:{fontSize:9,fontWeight:700,color:C.sub,background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 6px"}},q.category),
              React.createElement("span",{style:{fontSize:9,color:C.muted}},q.source==="bom"?"BOM Extraction":"Compliance Review"),
              React.createElement("span",{style:{marginLeft:"auto",fontSize:9,fontWeight:700,color:statusColors[q.status],background:statusColors[q.status]+"22",borderRadius:4,padding:"1px 6px"}},statusLabels[q.status])
            ),
            React.createElement("div",{style:{fontSize:13,color:C.text,lineHeight:1.5,marginBottom:6}},q.question),
            q.rowRef&&React.createElement("div",{style:{fontSize:10,color:C.muted,marginBottom:6}},"Ref: ",q.rowRef),
            q.status==="answered"?
              React.createElement("div",{style:{fontSize:12,color:"#4ade80",fontWeight:600,padding:"4px 8px",background:"rgba(74,222,128,0.08)",borderRadius:4}},"Answer: ",q.answer):
            q.status==="on_quote"?
              React.createElement("div",{style:{fontSize:12,color:"#38bdf8",fontWeight:600,fontStyle:"italic"}},"Included on customer quote"):
            q.status==="skipped"?
              React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                React.createElement("button",{onClick:()=>updateQ(q.id,{status:"open"}),style:{fontSize:11,color:C.accent,background:"none",border:`1px solid ${C.accent}44`,borderRadius:4,padding:"3px 10px",cursor:"pointer"}},"Reopen")
              ):
            React.createElement("div",null,
              q.options&&q.options.length>0&&React.createElement("div",{style:{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}},
                q.options.map((opt,oi)=>React.createElement("button",{key:oi,onClick:()=>setAnswers(a=>({...a,[q.id]:opt})),
                  style:{background:answers[q.id]===opt?C.accent+"33":"rgba(255,255,255,0.04)",color:answers[q.id]===opt?C.accent:C.sub,
                    border:`1px solid ${answers[q.id]===opt?C.accent:C.border}`,borderRadius:5,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}},opt))
              ),
              React.createElement("input",{value:answers[q.id]||"",onChange:e=>setAnswers(a=>({...a,[q.id]:e.target.value})),placeholder:"Type your answer…",
                style:{width:"100%",background:"#0a0a14",border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"5px 8px",fontSize:11,outline:"none",boxSizing:"border-box",marginBottom:6}}),
              React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                React.createElement("button",{onClick:()=>{if(!answers[q.id])return;updateQ(q.id,{answer:answers[q.id],answeredBy:uid,answeredAt:Date.now(),status:"answered"});},
                  disabled:!answers[q.id],style:{fontSize:11,color:"#4ade80",background:answers[q.id]?"rgba(74,222,128,0.1)":"transparent",border:"1px solid #4ade8044",borderRadius:4,padding:"3px 10px",cursor:answers[q.id]?"pointer":"default",opacity:answers[q.id]?1:0.4,fontWeight:600}},"Answer"),
                React.createElement("button",{onClick:()=>updateQ(q.id,{status:"skipped"}),style:{fontSize:11,color:"#94a3b8",background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 10px",cursor:"pointer"}},"Skip"),
                React.createElement("button",{onClick:()=>updateQ(q.id,{status:"on_quote"}),style:{fontSize:11,color:"#38bdf8",background:"none",border:"1px solid #38bdf844",borderRadius:4,padding:"3px 10px",cursor:"pointer"}},"Include on Quote")
              )
            )
          ))
        ),
        React.createElement("div",{style:{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",flexShrink:0,borderTop:`1px solid ${C.border}`,paddingTop:12}},
          React.createElement("button",{onClick:()=>setEmailPicker(true),style:{fontSize:12,color:"#818cf8",background:"none",border:"1px solid #818cf844",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:600}},"Email Controls Engineer"),
          React.createElement("button",{onClick:onClose,style:{fontSize:12,color:C.muted,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 14px",cursor:"pointer"}},"Close")
        ),
        emailPicker&&React.createElement("div",{style:{marginTop:10,padding:"10px 14px",background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:8}},
          React.createElement("div",{style:{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}},"Send open questions to:"),
          memberMap&&Object.keys(memberMap).length>0&&React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}},
            Object.entries(memberMap).map(([muid,m])=>React.createElement("button",{key:muid,onClick:()=>setEmailTo(m.email),
              style:{fontSize:11,color:emailTo===m.email?C.accent:C.sub,background:emailTo===m.email?C.accent+"22":"rgba(255,255,255,0.04)",border:`1px solid ${emailTo===m.email?C.accent:C.border}`,borderRadius:4,padding:"3px 8px",cursor:"pointer"}},
              m.firstName||m.email.split("@")[0]))
          ),
          React.createElement("div",{style:{display:"flex",gap:6}},
            React.createElement("input",{value:emailTo,onChange:e=>setEmailTo(e.target.value),placeholder:"email@company.com",
              style:{flex:1,background:"#0d0d14",border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"5px 8px",fontSize:11,outline:"none"}}),
            React.createElement("button",{onClick:sendEngineerEmail,disabled:!emailTo||emailSending,
              style:{fontSize:11,color:"#fff",background:C.accent,border:"none",borderRadius:4,padding:"5px 12px",cursor:"pointer",fontWeight:700,opacity:emailTo&&!emailSending?1:0.4}},emailSending?"Sending…":"Send"),
            React.createElement("button",{onClick:()=>{setEmailPicker(false);setEmailTo("");},
              style:{fontSize:11,color:C.muted,background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",cursor:"pointer"}},"Cancel")
          )
        )
      )
    ),document.body
  );
}

export default EngineeringQuestionsModal;
