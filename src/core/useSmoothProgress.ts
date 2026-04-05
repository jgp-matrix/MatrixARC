// @ts-nocheck
// Extracted from monolith — smooth animated progress bar hook
import { useState, useRef, useCallback, useEffect } from 'react';

export function useSmoothProgress(estSeconds=15){
  const [state,setState]=useState(null);
  const timer=useRef(null);
  const startTime=useRef(0);
  const est=useRef(estSeconds);
  const msgRef=useRef("");
  const baseRef=useRef(0);
  const prevPctRef=useRef(0);
  const wentBackRef=useRef(false);
  const wentBackTimer=useRef(null);

  const tick=useCallback(()=>{
    const elapsed=(Date.now()-startTime.current)/1000;
    const t=Math.min(elapsed/est.current,1);
    const curve=Math.pow(t,0.9);
    const pct=baseRef.current+(97-baseRef.current)*curve;
    setState({msg:msgRef.current,pct:Math.min(97,Math.round(pct)),wentBack:wentBackRef.current});
    timer.current=requestAnimationFrame(tick);
  },[]);

  const start=useCallback((msg,seconds)=>{
    if(seconds)est.current=seconds;
    msgRef.current=msg||"";
    baseRef.current=0;
    prevPctRef.current=0;
    wentBackRef.current=false;
    startTime.current=Date.now();
    if(timer.current)cancelAnimationFrame(timer.current);
    setState({msg:msgRef.current,pct:0,wentBack:false});
    timer.current=requestAnimationFrame(tick);
  },[tick]);

  const phase=useCallback((msg,seconds)=>{
    const elapsed=(Date.now()-startTime.current)/1000;
    const t=Math.min(elapsed/est.current,1);
    baseRef.current=Math.min(97,Math.round(baseRef.current+(97-baseRef.current)*Math.pow(t,0.9)));
    est.current=seconds||est.current;
    msgRef.current=msg||msgRef.current;
    startTime.current=Date.now();
  },[]);

  const update=useCallback((msg)=>{
    msgRef.current=msg||msgRef.current;
  },[]);

  const set=useCallback((pct,msg)=>{
    const rounded=Math.min(97,Math.round(pct));
    if(rounded<prevPctRef.current-1){
      wentBackRef.current=true;
      if(wentBackTimer.current)clearTimeout(wentBackTimer.current);
      wentBackTimer.current=setTimeout(()=>{wentBackRef.current=false;},15000);
    }
    prevPctRef.current=rounded;
    baseRef.current=Math.min(97,pct);
    startTime.current=Date.now();
    if(msg)msgRef.current=msg;
    setState({msg:msgRef.current,pct:rounded,wentBack:wentBackRef.current});
    if(!timer.current)timer.current=requestAnimationFrame(tick);
  },[tick]);

  const dismissTimer=useRef(null);
  const finish=useCallback((msg)=>{
    if(timer.current){cancelAnimationFrame(timer.current);timer.current=null;}
    if(dismissTimer.current)clearTimeout(dismissTimer.current);
    baseRef.current=0;
    setState(msg?{msg,pct:100}:null);
    if(msg)dismissTimer.current=setTimeout(()=>setState(null),3500);
  },[]);

  const stop=useCallback(()=>{
    if(timer.current){cancelAnimationFrame(timer.current);timer.current=null;}
    baseRef.current=0;
    setState(null);
  },[]);

  const running=useCallback(()=>!!timer.current,[]);

  useEffect(()=>()=>{if(timer.current)cancelAnimationFrame(timer.current);},[]);

  return{progress:state,start,phase,update,set,finish,stop,running};
}
