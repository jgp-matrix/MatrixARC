// @ts-nocheck
// Extracted from monolith public/index.html — function SettingsModal (lines 18304-18532)
// Slimmed version: Account, Outlook auth, T&C, Change Password only.
// API keys, BC environment, vendor panels moved to APISetupModal.

import React, { useState, useEffect, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, fbAuth, fbDb, setApiKey } from '@/core/globals';

// Graph token stubs — TODO: extract real MS Graph auth module
async function tryGraphTokenSilent(): Promise<any> { return null; }
async function acquireGraphToken(): Promise<any> { return null; }

const firebase: any = (window as any).firebase || {};

function SettingsModal({uid,onClose,onNameChange}){
  const [firstName,setFirstName]=useState("");
  const [loading,setLoading]=useState(true);
  const [nameSaved,setNameSaved]=useState(false);

  const [curPass,setCurPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [confPass,setConfPass]=useState("");
  const [pwLoading,setPwLoading]=useState(false);
  const [pwErr,setPwErr]=useState("");
  const [pwOk,setPwOk]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const [graphStatus,setGraphStatus]=useState("checking"); // checking|authorized|unauthorized|loading
  const [tcText,setTcText]=useState("");
  const [tcLoading,setTcLoading]=useState(true);
  const [tcSaved,setTcSaved]=useState(false);
  const settingsBackdropRef=useRef(null);
  useEffect(()=>{if(settingsBackdropRef.current)settingsBackdropRef.current.scrollTop=0;},[]);

  const email=fbAuth.currentUser?.email||"";

  useEffect(()=>{
    fbDb.doc(`users/${uid}/config/profile`).get().then(profileDoc=>{
      if(profileDoc.exists)setFirstName(profileDoc.data().firstName||"");
    }).finally(()=>setLoading(false));
    // Check if Mail.Send is already consented
    tryGraphTokenSilent().then(tok=>setGraphStatus(tok?"authorized":"unauthorized")).catch(()=>setGraphStatus("unauthorized"));
    // Load T&C from company config
    if(_appCtx.companyId){
      fbDb.doc(`companies/${_appCtx.companyId}`).get().then(d=>{
        if(d.exists&&d.data().termsAndConditions)setTcText(d.data().termsAndConditions);
      }).finally(()=>setTcLoading(false));
    }else setTcLoading(false);
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

  async function sendReset(){
    setPwErr("");setPwLoading(true);
    try{
      await fbAuth.sendPasswordResetEmail(fbAuth.currentUser.email);
      setResetSent(true);
    }catch(ex){setPwErr(ex.message);}
    setPwLoading(false);
  }

  async function changePassword(e){
    e.preventDefault();setPwErr("");
    if(newPass.length<6){setPwErr("New password must be at least 6 characters.");return;}
    if(newPass!==confPass){setPwErr("Passwords do not match.");return;}
    setPwLoading(true);
    try{
      const user=fbAuth.currentUser;
      const cred=firebase.auth.EmailAuthProvider.credential(user.email,curPass);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPass);
      setPwOk(true);setCurPass("");setNewPass("");setConfPass("");
      setTimeout(()=>setPwOk(false),3000);
    }catch(ex){
      if(ex.code==="auth/wrong-password"||ex.code==="auth/invalid-credential")setPwErr("Current password is incorrect.");
      else if(ex.code==="auth/operation-not-allowed")setPwErr("Password sign-in is not enabled for this account.");
      else setPwErr(ex.message);
    }
    setPwLoading(false);
  }

  const isEmailProvider=fbAuth.currentUser?.providerData?.some(p=>p.providerId==="password");

  return(
    <div ref={settingsBackdropRef} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"16px"}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...card(),width:"100%",maxWidth:900,margin:"16px 0"}} onMouseDown={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:36,fontWeight:900,flex:1}}>⚙ Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>✕</button>
        </div>
        <div style={{marginBottom:20}}/>

        {/* Account */}
        <div style={{marginBottom:20,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Account</div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>Email</label>
            <div style={{fontSize:14,color:C.text,padding:"8px 10px",background:C.surface,borderRadius:6,border:`1px solid ${C.border}`,userSelect:"all"}}>{email}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>First Name</label>
              <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Your first name"
                onKeyDown={e=>{if(e.key==="Enter")saveName();}}
                style={inp()}/>
            </div>
            <button onClick={saveName} disabled={loading}
              style={btn(nameSaved?C.green:C.accent,"#fff",{opacity:loading?0.5:1,flexShrink:0,marginBottom:1})}>
              {nameSaved?"✓ Saved":"Save"}
            </button>
          </div>
        </div>

        {/* Outlook Email Integration */}
        <div style={{marginBottom:20,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Outlook Email — RFQ Sending</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>Authorize ARC to send RFQ emails via your Microsoft 365 / Outlook account. Required for the <strong style={{color:C.text}}>✉ Email RFQs</strong> feature.</div>
          {graphStatus==="checking"&&<div style={{fontSize:12,color:C.muted}}>Checking authorization…</div>}
          {graphStatus==="authorized"&&<div style={{fontSize:12,color:C.green,display:"flex",alignItems:"center",gap:6}}>✓ Outlook email authorized — RFQ sending is ready.</div>}
          {(graphStatus==="unauthorized"||graphStatus==="loading")&&(
            <button onClick={authorizeOutlook} disabled={graphStatus==="loading"} style={btn(C.accent,"#fff",{fontSize:12,opacity:graphStatus==="loading"?0.6:1})}>
              {graphStatus==="loading"?"Authorizing…":"Authorize Outlook Email"}
            </button>
          )}
        </div>

        {/* BC Environment, Codale, Mouser, DigiKey, Pricing Reports — moved to API Setup modal (v1.19.379) */}

        {/* Terms & Conditions */}
        <div style={{marginBottom:20,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Quote Terms & Conditions</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:8,lineHeight:1.6}}>
            Paste your full Terms & Conditions below. These will appear on page 2 of the printed Client Quote. Use the format:<br/>
            <code style={{fontSize:10,color:C.accent}}>1. Section Title: Section body text here.</code>
          </div>
          {tcLoading?<div style={{fontSize:12,color:C.muted}}>Loading…</div>:(
            <>
              <textarea value={tcText} onChange={e=>setTcText(e.target.value)} rows={12} placeholder={"1. Definitions: (a) \"Matrix\" shall mean Matrix Systems LLC...\n2. Prevailing Documentation: (a) Matrix's proposal...\n3. Engineering and Drawings: ..."} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:11,lineHeight:1.5,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
              <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
                <button onClick={async()=>{
                  if(!_appCtx.companyId)return;
                  await fbDb.doc(`companies/${_appCtx.companyId}`).update({termsAndConditions:tcText});
                  _appCtx.termsAndConditions=tcText;
                  setTcSaved(true);setTimeout(()=>setTcSaved(false),2000);
                }} style={btn(C.accent,"#fff",{fontSize:12,padding:"6px 18px"})}>Save T&C</button>
                {tcSaved&&<span style={{fontSize:12,color:C.green}}>✓ Saved</span>}
              </div>
            </>
          )}
        </div>

        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:20}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Change Password</label>
          {!isEmailProvider?(
            <div style={{fontSize:13,color:C.muted,padding:"10px 12px",background:C.surface,borderRadius:8}}>
              Your account uses Google Sign-In and does not have a password. Use "Forgot password?" on the login screen to set one.
            </div>
          ):(
            <form onSubmit={changePassword}>
              <div style={{marginBottom:4}}><input value={curPass} onChange={e=>setCurPass(e.target.value)} type="password" placeholder="Current password" style={inp()} required/></div>
              <div style={{textAlign:"right",marginBottom:10}}>
                {resetSent
                  ?<span style={{fontSize:12,color:C.green}}>✓ Reset link sent to {fbAuth.currentUser?.email}</span>
                  :<button type="button" onClick={sendReset} disabled={pwLoading} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,padding:0}}>Forgot password?</button>
                }
              </div>
              <div style={{marginBottom:8}}><input value={newPass} onChange={e=>setNewPass(e.target.value)} type="password" placeholder="New password (min 6 chars)" style={inp()} required/></div>
              <div style={{marginBottom:10}}><input value={confPass} onChange={e=>setConfPass(e.target.value)} type="password" placeholder="Confirm new password" style={inp()} required/></div>
              {pwErr&&<div style={{color:C.red,fontSize:12,marginBottom:10,lineHeight:1.5}}>{pwErr}</div>}
              {pwOk&&<div style={{color:C.green,fontSize:12,marginBottom:10}}>✓ Password updated successfully.</div>}
              <button type="submit" disabled={pwLoading} style={btn(C.accent,"#fff",{width:"100%",opacity:pwLoading?0.6:1})}>
                {pwLoading?"Updating…":"Update Password"}
              </button>
            </form>
          )}
        </div>

        {/* Close button at bottom */}
        <div style={{marginTop:24,textAlign:"center"}}>
          <button onClick={onClose} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 48px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
