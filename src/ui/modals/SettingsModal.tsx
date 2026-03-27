import { useState, useEffect } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbDb, fbAuth, _appCtx, _apiKey, _bcConfig, _bcToken,
  acquireBcToken,
} from '@/core/globals';
import { saveBcConfig } from '@/services/firebase/firestore';
import firebase from 'firebase/compat/app';

import { getCompanyId as bcGetCompanyId } from '@/services/businessCentral/client';

import { tryGraphTokenSilent, acquireGraphToken } from '@/services/graphEmail';

// ─── Wired implementations ──────────────────────────────────────────────────
import { isAdmin } from '@/core/globals';

export default function SettingsModal({uid,onClose,onNameChange}: any){
  const [key,setKey]=useState("");
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(false);
  const [apiTestMsg,setApiTestMsg]=useState<any>(null); // {ok:bool, text:string}
  const [apiTesting,setApiTesting]=useState(false);
  const [firstName,setFirstName]=useState("");
  const [nameSaved,setNameSaved]=useState(false);

  const [curPass,setCurPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [confPass,setConfPass]=useState("");
  const [pwLoading,setPwLoading]=useState(false);
  const [pwErr,setPwErr]=useState("");
  const [pwOk,setPwOk]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const [graphStatus,setGraphStatus]=useState("checking"); // checking|authorized|unauthorized|loading

  // BC Environment config
  const [bcEnvName,setBcEnvName]=useState((_bcConfig as any)?.env || "");
  const [bcCompName,setBcCompName]=useState((_bcConfig as any)?.companyName || "");
  const [bcClientIdVal,setBcClientIdVal]=useState((_bcConfig as any)?.clientId || "");
  const [bcSaving,setBcSaving]=useState(false);
  const [bcSaved,setBcSaved]=useState(false);
  const [bcErr,setBcErr]=useState("");
  const [bcConfirm,setBcConfirm]=useState(false);
  const [bcConnStatus,setBcConnStatus]=useState(()=>_bcToken?"connected":"unknown"); // "unknown"|"testing"|"connected"|"failed"
  const [bcConnDetail,setBcConnDetail]=useState("");
  async function testBcConnection(){
    setBcConnStatus("testing");setBcConnDetail("");
    try{
      const token=await acquireBcToken(true);
      if(!token){setBcConnStatus("failed");setBcConnDetail("Could not acquire token");return;}
      const compId=await bcGetCompanyId();
      if(compId){setBcConnStatus("connected");setBcConnDetail((_bcConfig as any)?.companyName || "");}
      else{setBcConnStatus("failed");setBcConnDetail("Company '"+((_bcConfig as any)?.companyName || "")+"' not found in environment");}
    }catch(e: any){setBcConnStatus("failed");setBcConnDetail(e.message||"Connection error");}
  }

  const email=(fbAuth.currentUser as any)?.email||"";

  useEffect(()=>{
    Promise.all([
      fbDb.doc(`users/${uid}/config/api`).get(),
      fbDb.doc(`users/${uid}/config/profile`).get(),
    ]).then(([apiDoc,profileDoc]: any)=>{
      if(apiDoc.exists)setKey(apiDoc.data().key||"");
      if(profileDoc.exists)setFirstName(profileDoc.data().firstName||"");
    }).finally(()=>setLoading(false));
    // Check if Mail.Send is already consented
    tryGraphTokenSilent().then((tok: any)=>setGraphStatus(tok?"authorized":"unauthorized")).catch(()=>setGraphStatus("unauthorized"));
  },[uid]);

  async function authorizeOutlook(){
    setGraphStatus("loading");
    const tok=await acquireGraphToken();
    setGraphStatus(tok?"authorized":"unauthorized");
  }

  async function saveName(){
    const name=firstName.trim();
    await fbDb.doc(`users/${uid}/config/profile`).set({firstName:name},{merge:true});
    if(onNameChange)onNameChange(name);
    setNameSaved(true);setTimeout(()=>setNameSaved(false),2000);
  }

  async function save(){
    await fbDb.doc(`users/${uid}/config/api`).set({key});
    (_apiKey as any);// reference only — mutation via globals setter
    setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  async function testApiKey(){
    const k=key.trim()||_apiKey;
    if(!k){setApiTestMsg({ok:false,text:"No API key entered"});return;}
    setApiTesting(true);setApiTestMsg(null);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":k,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:20,messages:[{role:"user",content:"Say OK"}]})});
      const d=await r.json();
      if(r.ok){setApiTestMsg({ok:true,text:"API key is working — "+d.model});}
      else{setApiTestMsg({ok:false,text:(d.error?.message||"Error "+r.status)});}
    }catch(e: any){setApiTestMsg({ok:false,text:e.message});}
    setApiTesting(false);
  }

  async function sendReset(){
    setPwErr("");setPwLoading(true);
    try{
      await fbAuth.sendPasswordResetEmail((fbAuth.currentUser as any).email);
      setResetSent(true);
    }catch(ex: any){setPwErr(ex.message);}
    setPwLoading(false);
  }

  async function changePassword(e: any){
    e.preventDefault();setPwErr("");
    if(newPass.length<6){setPwErr("New password must be at least 6 characters.");return;}
    if(newPass!==confPass){setPwErr("Passwords do not match.");return;}
    setPwLoading(true);
    try{
      const user=fbAuth.currentUser as any;
      const cred=(firebase.auth as any).EmailAuthProvider.credential(user.email,curPass);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPass);
      setPwOk(true);setCurPass("");setNewPass("");setConfPass("");
      setTimeout(()=>setPwOk(false),3000);
    }catch(ex: any){
      if(ex.code==="auth/wrong-password"||ex.code==="auth/invalid-credential")setPwErr("Current password is incorrect.");
      else if(ex.code==="auth/operation-not-allowed")setPwErr("Password sign-in is not enabled for this account.");
      else setPwErr(ex.message);
    }
    setPwLoading(false);
  }

  const isEmailProvider=(fbAuth.currentUser as any)?.providerData?.some((p: any)=>p.providerId==="password");

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:460}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:18,fontWeight:700,flex:1}}>Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px",borderRadius:4}} onMouseEnter={(e: any)=>e.currentTarget.style.color=C.text} onMouseLeave={(e: any)=>e.currentTarget.style.color=C.muted}>✕</button>
        </div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>ARC configuration</div>

        {/* Account */}
        <div style={{marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:10}}>Account</div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>Email</label>
            <div style={{fontSize:14,color:C.text,padding:"8px 10px",borderRadius:6,border:`1px solid ${C.border}`,userSelect:"all" as const}}>{email}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>First Name</label>
              <input value={firstName} onChange={(e: any)=>setFirstName(e.target.value)} placeholder="Your first name"
                onKeyDown={(e: any)=>{if(e.key==="Enter")saveName();}}
                style={inp()}/>
            </div>
            <button onClick={saveName} disabled={loading}
              style={btn(nameSaved?C.green:C.accent,"#fff",{opacity:loading?0.5:1,flexShrink:0,marginBottom:1})}>
              {nameSaved?"✓ Saved":"Save"}
            </button>
          </div>
        </div>

        {isAdmin()&&<><div style={{marginBottom:20}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:6,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Anthropic API Key <span style={{fontSize:9,color:C.red,fontWeight:700,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:4,padding:"1px 5px",marginLeft:6,verticalAlign:"middle"}}>ADMIN ONLY</span></label>
          {loading
            ?<div style={{color:C.muted,fontSize:13,padding:"9px 0"}}>Loading…</div>
            :<input value={key} onChange={(e: any)=>setKey(e.target.value)} type="text" placeholder="sk-ant-…" style={inp()}/>
          }
          <div style={{fontSize:11,color:C.muted,marginTop:6}}>Stored in your Firebase project. Shared across all team members.</div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:6}}>
          <button onClick={onClose} style={btn(C.border,C.sub,{flex:1})}>Close</button>
          <button onClick={testApiKey} disabled={apiTesting||loading} style={btn("#1e3a5f","#93c5fd",{flex:1,opacity:apiTesting||loading?0.5:1})}>
            {apiTesting?"Testing…":"Test Key"}
          </button>
          <button onClick={save} disabled={loading||!key.trim()} style={btn(saved?C.green:C.accent,"#fff",{flex:1,opacity:loading||!key.trim()?0.5:1})}>
            {saved?"✓ Saved":"Save Key"}
          </button>
        </div>
        {apiTestMsg&&<div style={{fontSize:12,color:apiTestMsg.ok?C.green:C.red,marginBottom:16,padding:"6px 10px",background:apiTestMsg.ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${apiTestMsg.ok?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,wordBreak:"break-word" as const}}>{apiTestMsg.text}</div>}
        </>}

        {/* Outlook Email Integration */}
        <div style={{marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:6}}>Outlook Email — RFQ Sending</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>Authorize ARC to send RFQ emails via your Microsoft 365 / Outlook account. Required for the <strong style={{color:C.text}}>Email RFQs</strong> feature.</div>
          {graphStatus==="checking"&&<div style={{fontSize:12,color:C.muted}}>Checking authorization…</div>}
          {graphStatus==="authorized"&&<div style={{fontSize:12,color:C.green,display:"flex",alignItems:"center",gap:6}}>Outlook email authorized — RFQ sending is ready.</div>}
          {(graphStatus==="unauthorized"||graphStatus==="loading")&&(
            <button onClick={authorizeOutlook} disabled={graphStatus==="loading"} style={btn(C.accent,"#fff",{fontSize:12,opacity:graphStatus==="loading"?0.6:1})}>
              {graphStatus==="loading"?"Authorizing…":"Authorize Outlook Email"}
            </button>
          )}
        </div>

        {/* BC Environment Configuration — Admin only */}
        {isAdmin()&&<div style={{marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:6}}>Business Central Environment <span style={{fontSize:9,color:C.red,fontWeight:700,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:4,padding:"1px 5px",marginLeft:6,verticalAlign:"middle"}}>ADMIN ONLY</span></div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>Configure the BC environment connection. <strong style={{color:C.yellow}}>Warning:</strong> Changing the environment will disconnect all existing projects from BC.</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"6px 10px",borderRadius:6,flexWrap:"wrap" as const}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:bcConnStatus==="connected"?C.green:bcConnStatus==="failed"?C.red:bcConnStatus==="testing"?C.yellow:C.muted,flexShrink:0,boxShadow:bcConnStatus==="testing"?"0 0 6px "+C.yellow:"none"}}/>
            <span style={{fontSize:12,color:C.text,flex:1}}>Current: <strong>{(_bcConfig as any)?.env || ""}</strong></span>
            <span style={{fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 10px",
              background:bcConnStatus==="connected"?C.greenDim:bcConnStatus==="failed"?"rgba(239,68,68,0.1)":bcConnStatus==="testing"?"rgba(234,179,8,0.1)":"rgba(100,116,139,0.1)",
              color:bcConnStatus==="connected"?C.green:bcConnStatus==="failed"?C.red:bcConnStatus==="testing"?C.yellow:C.muted,
              border:`1px solid ${bcConnStatus==="connected"?C.green+"44":bcConnStatus==="failed"?C.red+"44":bcConnStatus==="testing"?C.yellow+"44":C.muted+"44"}`}}>
              {bcConnStatus==="connected"?"BC Connected":bcConnStatus==="failed"?"Connection Failed":bcConnStatus==="testing"?"Testing…":"Not Tested"}
            </span>
            {bcConnStatus!=="testing"&&<button onClick={testBcConnection} style={{fontSize:11,color:C.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,padding:0}}>Test</button>}
          </div>
          {bcConnDetail&&bcConnStatus==="failed"&&<div style={{fontSize:11,color:C.red,marginBottom:8,marginTop:-8}}>{bcConnDetail}</div>}
          <div style={{display:"grid",gap:8,marginBottom:12}}>
            <div>
              <label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Environment Name</label>
              <input value={bcEnvName} onChange={(e: any)=>setBcEnvName(e.target.value)} style={inp()} placeholder="e.g. Production"/>
            </div>
            <div>
              <label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Company Name</label>
              <input value={bcCompName} onChange={(e: any)=>setBcCompName(e.target.value)} style={inp()} placeholder="e.g. Matrix Systems LLC"/>
            </div>
            <div>
              <label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Client ID (Azure App Registration)</label>
              <input value={bcClientIdVal} onChange={(e: any)=>setBcClientIdVal(e.target.value)} style={inp()} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
            </div>
          </div>
          {bcErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{bcErr}</div>}
          {bcSaved&&<div style={{color:C.green,fontSize:12,marginBottom:8}}>BC environment updated successfully.</div>}
          {!bcConfirm?(
            <button onClick={()=>{
              setBcErr("");setBcSaved(false);
              if(!bcEnvName.trim()||!bcCompName.trim()||!bcClientIdVal.trim()){setBcErr("All fields are required.");return;}
              if(bcEnvName===(_bcConfig as any)?.env&&bcCompName===(_bcConfig as any)?.companyName&&bcClientIdVal===(_bcConfig as any)?.clientId){setBcErr("No changes detected.");return;}
              setBcConfirm(true);
            }} disabled={bcSaving} style={btn("#334155","#fff",{fontSize:12})}>
              Save Environment
            </button>
          ):(
            <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:12}}>
              <div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:6}}>Confirm Environment Change</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>This will switch from <strong style={{color:C.text}}>{(_bcConfig as any)?.env || ""}</strong> to <strong style={{color:C.text}}>{bcEnvName}</strong>. All existing projects will be disconnected from BC and will need to be re-linked.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{
                  setBcSaving(true);setBcErr("");
                  try{
                    await saveBcConfig(_appCtx.companyId as string,{env:bcEnvName.trim(),companyName:bcCompName.trim(),clientId:bcClientIdVal.trim()});
                    setBcSaved(true);setBcConfirm(false);
                    testBcConnection();
                  }catch(ex: any){setBcErr("Failed to save: "+ex.message);}
                  setBcSaving(false);
                }} disabled={bcSaving} style={btn(C.red,"#fff",{fontSize:12,opacity:bcSaving?0.6:1})}>
                  {bcSaving?"Saving…":"Yes, Switch Environment"}
                </button>
                <button onClick={()=>setBcConfirm(false)} disabled={bcSaving} style={btn(C.border,C.text,{fontSize:12})}>Cancel</button>
              </div>
            </div>
          )}
        </div>}

        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:20}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:12,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Change Password</label>
          {!isEmailProvider?(
            <div style={{fontSize:13,color:C.muted,padding:"10px 12px",borderRadius:8}}>
              Your account uses Google Sign-In and does not have a password. Use "Forgot password?" on the login screen to set one.
            </div>
          ):(
            <form onSubmit={changePassword}>
              <div style={{marginBottom:4}}><input value={curPass} onChange={(e: any)=>setCurPass(e.target.value)} type="password" placeholder="Current password" style={inp()} required/></div>
              <div style={{textAlign:"right" as const,marginBottom:10}}>
                {resetSent
                  ?<span style={{fontSize:12,color:C.green}}>Reset link sent to {(fbAuth.currentUser as any)?.email}</span>
                  :<button type="button" onClick={sendReset} disabled={pwLoading} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,padding:0}}>Forgot password?</button>
                }
              </div>
              <div style={{marginBottom:8}}><input value={newPass} onChange={(e: any)=>setNewPass(e.target.value)} type="password" placeholder="New password (min 6 chars)" style={inp()} required/></div>
              <div style={{marginBottom:10}}><input value={confPass} onChange={(e: any)=>setConfPass(e.target.value)} type="password" placeholder="Confirm new password" style={inp()} required/></div>
              {pwErr&&<div style={{color:C.red,fontSize:12,marginBottom:10,lineHeight:1.5}}>{pwErr}</div>}
              {pwOk&&<div style={{color:C.green,fontSize:12,marginBottom:10}}>Password updated successfully.</div>}
              <button type="submit" disabled={pwLoading} style={btn(C.accent,"#fff",{width:"100%",opacity:pwLoading?0.6:1})}>
                {pwLoading?"Updating…":"Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
