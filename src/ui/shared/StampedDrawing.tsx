import React from 'react';

function StampedDrawing({src,overlay,width,height,onClick}: any){
  width=width||420;height=height||381;
  const canvasRef=React.useRef<any>(null);
  React.useEffect(()=>{
    if(!src)return;
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{
      canvas.width=width;canvas.height=height;
      ctx.fillStyle='#080810';ctx.fillRect(0,0,width,height);
      ctx.drawImage(img,0,0,width,height);
      if(overlay){
        const barH=14;
        ctx.fillStyle='rgba(255,255,255,0.88)';ctx.fillRect(0,0,width,barH);
        ctx.fillStyle='#cc0000';ctx.fillRect(0,barH-1,width,1);
        ctx.font='bold 11px Arial,sans-serif';ctx.fillStyle='#cc0000';ctx.textBaseline='middle';
        const y=barH/2;
        ctx.textAlign='left';ctx.fillText((overlay.left||'').slice(0,40),6,y);
        ctx.textAlign='center';ctx.fillText(overlay.center||'',width/2,y);
        ctx.textAlign='right';ctx.fillText((overlay.right||'').slice(0,50),width-6,y);
      }
    };
    img.onerror=()=>{const c=canvasRef.current;if(!c)return;c.getContext('2d').fillStyle='#080810';c.getContext('2d').fillRect(0,0,width,height);};
    img.src=src;
  },[src,JSON.stringify(overlay),width,height]);
  return <canvas ref={canvasRef} width={width} height={height} onClick={onClick} style={{borderRadius:6,display:'block',cursor:'zoom-in'}}/>;
}

export default StampedDrawing;
