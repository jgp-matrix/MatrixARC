// ─── Login Screen ────────────────────────────────────────────────────────────
// Extracted verbatim from monolith v1.19.376 line 7028

import React, { useState, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { APP_VERSION, fbAuth } from '@/core/globals';
import firebase from 'firebase/compat/app';

export default function LoginScreen({invite}: any){
  const [email,setEmail]=useState(invite?.e||"");
  const [pass,setPass]=useState("");
  const [mode,setMode]=useState(invite?"register":"login");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const emailRef=useRef<any>(null);

  async function submit(e: any){
    e.preventDefault();setErr("");setLoading(true);
    try{
      if(mode==="login")await fbAuth.signInWithEmailAndPassword(email,pass);
      else await fbAuth.createUserWithEmailAndPassword(email,pass);
    }catch(ex: any){
      if(ex.code==="auth/email-already-in-use"){
        setMode("login");
        setErr("That email already has an account — sign in below, or use Forgot Password to reset it.");
      } else if(["auth/user-not-found","auth/wrong-password","auth/invalid-credential","auth/invalid-email"].includes(ex.code)){
        setErr("Email or password not recognized. Please try again, or use Forgot Password to reset it.");
      } else {
        setErr(ex.message);
      }
    }
    setLoading(false);
  }
  async function google(){
    setLoading(true);
    try{await fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());}
    catch(ex: any){setErr(ex.message);}
    setLoading(false);
  }
  async function microsoft(){
    setLoading(true);
    try{
      const provider=new firebase.auth.OAuthProvider("microsoft.com");
      provider.setCustomParameters({prompt:"select_account"});
      await fbAuth.signInWithPopup(provider);
    }catch(ex: any){
      if(ex.code==="auth/account-exists-with-different-credential"){
        if(ex.email)setEmail(ex.email);
        setErr("An account with this email already exists — please sign in with your email and password below.");
      } else {
        setErr(ex.message);
      }
    }
    setLoading(false);
  }
  async function sendReset(e: any){
    e.preventDefault();setErr("");setLoading(true);
    try{
      await fbAuth.sendPasswordResetEmail(email);
      setResetSent(true);
    }catch(ex: any){setErr(ex.message);}
    setLoading(false);
  }
  function switchMode(m: any){
    // Capture actual DOM value first — browser autocomplete may not fire onChange
    if(emailRef.current)setEmail(emailRef.current.value);
    setMode(m);setErr("");setResetSent(false);
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at 50% 0%,#1a1a3e 0%,${C.bg} 60%)`}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:104,marginBottom:10}}>&#x2B21;</div>
        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:64,fontWeight:900,letterSpacing:8,color:C.accent,lineHeight:1}}>ARC</div>
        <div style={{fontSize:14,color:C.muted,fontWeight:500,marginTop:6,letterSpacing:2}}>by <span style={{color:"#38bdf8",fontWeight:700,letterSpacing:1}}>Parallax</span> Software</div>
        <div style={{fontSize:13,color:C.muted,marginTop:4,opacity:0.6}}>{APP_VERSION}</div>
      </div>
      {invite&&(
        <div style={{background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:12,padding:"14px 20px",marginBottom:20,textAlign:"center",width:"100%",maxWidth:400}}>
          <div style={{fontSize:15,fontWeight:700,color:C.accent,marginBottom:4}}>You've been invited to APEX ARC</div>
          <div style={{fontSize:13,color:C.sub}}>Create an account or sign in to join your team workspace.</div>
        </div>
      )}
      <div style={{...card(),width:"100%",maxWidth:400}}>
        {mode==="reset"?(
          resetSent?(
            <div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:12}}>Check your email</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}}>A password reset link was sent to <strong style={{color:C.text}}>{email}</strong>. Check your inbox and follow the link to set a new password.</div>
              <button onClick={()=>switchMode("login")} style={btn(C.accent,"#fff",{width:"100%"})}>Back to Sign In</button>
            </div>
          ):(
            <div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Reset Password</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Enter your email and we'll send a reset link.</div>
              <form onSubmit={sendReset}>
                <div style={{marginBottom:16}}><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email" style={inp()} required/></div>
                {err&&<div style={{color:C.red,fontSize:12,marginBottom:12,lineHeight:1.5}}>{err}</div>}
                <button type="submit" disabled={loading} style={btn(C.accent,"#fff",{width:"100%",opacity:loading?0.6:1})}>{loading?"Sending\u2026":"Send Reset Link"}</button>
              </form>
              <div style={{textAlign:"center",marginTop:14,fontSize:12,color:C.muted}}>
                <button onClick={()=>switchMode("login")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontWeight:600,fontSize:12}}>Back to Sign In</button>
              </div>
            </div>
          )
        ):(
          <div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>{mode==="login"?"Sign In":"Create Account"}</div>
            <form onSubmit={submit}>
              <div style={{marginBottom:10}}><input ref={emailRef} value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email" style={inp()} required/></div>
              <div style={{marginBottom:6}}><input value={pass} onChange={e=>setPass(e.target.value)} type="password" placeholder="Password" style={inp()} required/></div>
              <div style={{textAlign:"right",marginBottom:14}}>
                <button type="button" onClick={()=>switchMode("reset")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>Forgot password?</button>
              </div>
              {err&&<div style={{color:C.red,fontSize:12,marginBottom:12,lineHeight:1.5}}>{err}</div>}
              <button type="submit" disabled={loading} style={btn(C.accent,"#fff",{width:"100%",opacity:loading?0.6:1})}>{loading?"Please wait\u2026":mode==="login"?"Sign In":"Create Account"}</button>
            </form>
            <div style={{textAlign:"center",margin:"14px 0",color:C.muted,fontSize:12}}>or</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={google} disabled={loading} style={btn("#fff","#1a1a1a",{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8})}>
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Continue with Google
              </button>
              <button onClick={microsoft} disabled={loading} style={btn("#2f2f2f","#fff",{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8})}>
                <svg width="16" height="16" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                Continue with Microsoft
              </button>
            </div>
            <div style={{textAlign:"center",marginTop:14,fontSize:12,color:C.muted}}>
              {mode==="login"?"No account? ":"Have an account? "}
              <button onClick={()=>switchMode(mode==="login"?"register":"login")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontWeight:600,fontSize:12}}>
                {mode==="login"?"Register":"Sign In"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
