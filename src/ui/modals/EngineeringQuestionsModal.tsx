import { useState } from 'react';
import ReactDOM from 'react-dom';
import { C } from '@/core/constants';

declare const firebase: any;

function EngineeringQuestionsModal({panel,uid,onUpdate,onSave,onClose,memberMap}: any){
  const eqs=panel.engineeringQuestions||[];
  const [answers,setAnswers]=useState(()=>{const m: any={};eqs.forEach((q: any)=>{if(q.answer)m[q.id]=q.answer;});return m;});
  const [emailPicker,setEmailPicker]=useState(false);
  const [emailTo,setEmailTo]=useState("");
  const [emailSending,setEmailSending]=useState(false);
  const openCount=eqs.filter((q: any)=>q.status==="open").length;
  const answeredCount=eqs.filter((q: any)=>q.status==="answered").length;
  const skippedCount=eqs.filter((q: any)=>q.status==="skipped").length;
  const onQuoteCount=eqs.filter((q: any)=>q.status==="on_quote").length;
  function updateQ(id: any,fields: any){
    const updated={...panel,engineeringQuestions:eqs.map((q: any)=>q.id===id?{...q,...fields}:q)};
    onUpdate(updated);try{onSave(updated);}catch(e){}
  }
  const sevColors: any={critical:"#ef4444",warning:"#f59e0b",info:"#818cf8"};
  const statusLabels: any={open:"Open",answered:"Answered",skipped:"Skipped",on_quote:"On Quote"};
  const statusColors: any={open:"#f59e0b",answered:"#4ade80",skipped:"#94a3b8",on_quote:"#38bdf8"};
  async function sendEngineerEmail(){
    if(!emailTo)return;
    setEmailSending(true);
    try{
      const openQs=eqs.filter((q: any)=>q.status==="open"||q.status==="skipped");
      await firebase.app().functions().httpsCallable("sendEngineerQuestionEmail")({
        to:emailTo,projectName:panel.drawingNo||panel.name||"Panel",
        bcProjectNumber:panel.bcProjectNumber||"",panelName:panel.name||"Panel",
        questions:openQs.map((q: any)=>({question:q.question,category:q.category,severity:q.severity,rowRef:q.rowRef}))
      });
      setEmailPicker(false);setEmailTo("");
    }catch(e){console.warn("Email failed:",e);}
    setEmailSending(false);
  }
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onMouseDown={(e: any)=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",maxWidth:620,width:"95%",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 12px 48px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexShrink:0}}>
          <span style={{fontSize:16,fontWeight:800,color:C.text,flex:1}}>Engineering Questions</span>
          <span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"#f59e0b22",borderRadius:10,padding:"2px 8px"}}>{openCount+" open"}</span>
          {answeredCount>0&&<span style={{fontSize:10,fontWeight:700,color:"#4ade80",background:"#4ade8022",borderRadius:10,padding:"2px 8px"}}>{answeredCount+" answered"}</span>}
          {skippedCount>0&&<span style={{fontSize:10,fontWeight:700,color:"#94a3b8",background:"#94a3b822",borderRadius:10,padding:"2px 8px"}}>{skippedCount+" skipped"}</span>}
          {onQuoteCount>0&&<span style={{fontSize:10,fontWeight:700,color:"#38bdf8",background:"#38bdf822",borderRadius:10,padding:"2px 8px"}}>{onQuoteCount+" on quote"}</span>}
        </div>
        <div style={{overflowY:"auto",flex:1,marginBottom:12}}>
          {eqs.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:24}}>No engineering questions yet. Questions will be generated during extraction and compliance review.</div>:
          eqs.map((q: any)=><div key={q.id} style={{marginBottom:10,padding:"10px 14px",background:q.status==="open"?"rgba(250,204,21,0.04)":"rgba(255,255,255,0.02)",border:`1px solid ${q.status==="open"?"rgba(250,204,21,0.2)":"rgba(255,255,255,0.06)"}`,borderRadius:8}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:9,fontWeight:800,color:sevColors[q.severity]||C.muted,textTransform:"uppercase",letterSpacing:0.5}}>{q.severity}</span>
              <span style={{fontSize:9,fontWeight:700,color:C.sub,background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 6px"}}>{q.category}</span>
              <span style={{fontSize:9,color:C.muted}}>{q.source==="bom"?"BOM Extraction":"Compliance Review"}</span>
              <span style={{marginLeft:"auto",fontSize:9,fontWeight:700,color:statusColors[q.status],background:statusColors[q.status]+"22",borderRadius:4,padding:"1px 6px"}}>{statusLabels[q.status]}</span>
            </div>
            <div style={{fontSize:13,color:C.text,lineHeight:1.5,marginBottom:6}}>{q.question}</div>
            {q.rowRef&&<div style={{fontSize:10,color:C.muted,marginBottom:6}}>Ref: {q.rowRef}</div>}
            {q.status==="answered"?
              <div style={{fontSize:12,color:"#4ade80",fontWeight:600,padding:"4px 8px",background:"rgba(74,222,128,0.08)",borderRadius:4}}>Answer: {q.answer}</div>:
            q.status==="on_quote"?
              <div style={{fontSize:12,color:"#38bdf8",fontWeight:600,fontStyle:"italic"}}>Included on customer quote</div>:
            q.status==="skipped"?
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>updateQ(q.id,{status:"open"})} style={{fontSize:11,color:C.accent,background:"none",border:`1px solid ${C.accent}44`,borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>Reopen</button>
              </div>:
            <div>
              {q.options&&q.options.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {q.options.map((opt: any,oi: number)=><button key={oi} onClick={()=>setAnswers((a: any)=>({...a,[q.id]:opt}))}
                  style={{background:answers[q.id]===opt?C.accent+"33":"rgba(255,255,255,0.04)",color:answers[q.id]===opt?C.accent:C.sub,
                    border:`1px solid ${answers[q.id]===opt?C.accent:C.border}`,borderRadius:5,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{opt}</button>)
                }
              </div>}
              <input value={answers[q.id]||""} onChange={(e: any)=>setAnswers((a: any)=>({...a,[q.id]:e.target.value}))} placeholder="Type your answer…"
                style={{width:"100%",background:"#0a0a14",border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"5px 8px",fontSize:11,outline:"none",boxSizing:"border-box",marginBottom:6}}/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>{if(!answers[q.id])return;updateQ(q.id,{answer:answers[q.id],answeredBy:uid,answeredAt:Date.now(),status:"answered"});}}
                  disabled={!answers[q.id]} style={{fontSize:11,color:"#4ade80",background:answers[q.id]?"rgba(74,222,128,0.1)":"transparent",border:"1px solid #4ade8044",borderRadius:4,padding:"3px 10px",cursor:answers[q.id]?"pointer":"default",opacity:answers[q.id]?1:0.4,fontWeight:600}}>Answer</button>
                <button onClick={()=>updateQ(q.id,{status:"skipped"})} style={{fontSize:11,color:"#94a3b8",background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>Skip</button>
                <button onClick={()=>updateQ(q.id,{status:"on_quote"})} style={{fontSize:11,color:"#38bdf8",background:"none",border:"1px solid #38bdf844",borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>Include on Quote</button>
              </div>
            </div>
            }
          </div>)
          }
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",flexShrink:0,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <button onClick={()=>setEmailPicker(true)} style={{fontSize:12,color:"#818cf8",background:"none",border:"1px solid #818cf844",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:600}}>Email Controls Engineer</button>
          <button onClick={onClose} style={{fontSize:12,color:C.muted,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 14px",cursor:"pointer"}}>Close</button>
        </div>
        {emailPicker&&<div style={{marginTop:10,padding:"10px 14px",background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>Send open questions to:</div>
          {memberMap&&Object.keys(memberMap).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
            {Object.entries(memberMap).map(([muid,m]: any)=><button key={muid} onClick={()=>setEmailTo(m.email)}
              style={{fontSize:11,color:emailTo===m.email?C.accent:C.sub,background:emailTo===m.email?C.accent+"22":"rgba(255,255,255,0.04)",border:`1px solid ${emailTo===m.email?C.accent:C.border}`,borderRadius:4,padding:"3px 8px",cursor:"pointer"}}>
              {m.firstName||m.email.split("@")[0]}</button>)
            }
          </div>}
          <div style={{display:"flex",gap:6}}>
            <input value={emailTo} onChange={(e: any)=>setEmailTo(e.target.value)} placeholder="email@company.com"
              style={{flex:1,background:"#0d0d14",border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"5px 8px",fontSize:11,outline:"none"}}/>
            <button onClick={sendEngineerEmail} disabled={!emailTo||emailSending}
              style={{fontSize:11,color:"#fff",background:C.accent,border:"none",borderRadius:4,padding:"5px 12px",cursor:"pointer",fontWeight:700,opacity:emailTo&&!emailSending?1:0.4}}>{emailSending?"Sending…":"Send"}</button>
            <button onClick={()=>{setEmailPicker(false);setEmailTo("");}}
              style={{fontSize:11,color:C.muted,background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>}
      </div>
    </div>,
    document.body
  );
}

export default EngineeringQuestionsModal;
