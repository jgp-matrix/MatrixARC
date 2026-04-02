import { useState, useEffect } from 'react';
import { fbDb, _bcToken } from '@/core/globals';

declare const firebase: any;
declare const BC_ODATA_BASE: string;
declare const BC_MFR_CODE_NAMES: Record<string, string>;
declare function bcPushPurchasePrice(partNumber: string, vendor: string, price: number, date: number, uom: string): Promise<void>;

// ── VENDOR PRICING SYNC — MODULE-LEVEL STATE ──
// Sync runs independently of any component. Components subscribe via useVendorSyncState().
export let _vSync: any = {running:false,status:null,result:null,error:null,abort:false,uid:null};
const _vSyncListeners = new Set<(s: any) => void>();
export function _vSyncNotify(){const s={..._vSync};for(const fn of _vSyncListeners)fn(s);}

export function useVendorSyncState(){
  const[s,set]=useState({..._vSync});
  useEffect(()=>{_vSyncListeners.add(set);return()=>{_vSyncListeners.delete(set);};},[]);
  return s;
}

export async function startVendorSync(uid: string, dkVendor: string, mouserVendor: string){
  if(_vSync.running)return;
  _vSync={running:true,status:null,result:null,error:null,abort:false,uid};
  _vSyncNotify();
  const _start=Date.now();
  try{
    // 1. Fetch all BC items
    _vSync.status={phase:"Fetching BC items\u2026",total:0,searched:0,dkFound:0,mouserFound:0,dkWritten:0,mouserWritten:0,errors:0};
    _vSyncNotify();
    const allItems: any[]=[];let skip=0;
    while(!_vSync.abort){
      const r=await fetch(`${BC_ODATA_BASE}/ItemCard?$select=No,Description,Manufacturer_Code&$top=200&$skip=${skip}`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)break;
      const batch=((await r.json()).value||[]) as any[];
      if(!batch.length)break;
      allItems.push(...batch);skip+=200;
      _vSync.status={..._vSync.status,phase:`Fetching BC items\u2026 ${allItems.length} so far`};
      _vSyncNotify();
      if(batch.length<200)break;
    }
    if(!allItems.length){_vSync.error="No items found in BC";_vSync.running=false;_vSyncNotify();return;}

    const searchItems=allItems.map((i: any)=>({
      partNumber:i.No,
      manufacturer:i.Manufacturer_Code?BC_MFR_CODE_NAMES[i.Manufacturer_Code]||null:null
    }));
    _vSync.status={..._vSync.status,phase:`Searching ${allItems.length} items\u2026`,total:allItems.length};
    _vSyncNotify();

    // 2. Batch through Cloud Function (10 items, Mouser rate-limited)
    const BATCH=10;
    const fn=firebase.functions().httpsCallable("searchVendorPricing",{timeout:300000});
    const allResults: any[]=[];
    let dkFound=0,mouserFound=0,dkWritten=0,mouserWritten=0,errors=0;

    for(let i=0;i<searchItems.length&&!_vSync.abort;i+=BATCH){
      const batch=searchItems.slice(i,i+BATCH);
      const batchNum=Math.floor(i/BATCH)+1;
      const totalBatches=Math.ceil(searchItems.length/BATCH);
      _vSync.status={..._vSync.status,
        phase:`Batch ${batchNum}/${totalBatches} \u2014 DigiKey & Mouser\u2026`,
        detail:batch.map((b: any)=>b.partNumber).join(', ').slice(0,80)};
      _vSyncNotify();
      let batchResults: any[]=[];
      try{
        const r=await fn({items:batch});
        batchResults=r.data.results||[];
      }catch(e: any){
        console.error("VENDOR BATCH ERROR:",e.message);
        batch.forEach((b: any)=>batchResults.push({partNumber:b.partNumber,
          digikey:{found:false,error:e.message},mouser:{found:false,error:e.message}}));
      }
      // Write found prices to BC immediately
      for(const res of batchResults){
        allResults.push(res);
        const dk=res.digikey||{};const mo=res.mouser||{};
        if(dk.found&&dk.price>0&&dkVendor){
          dkFound++;
          try{await bcPushPurchasePrice(res.partNumber,dkVendor,dk.price,Date.now(),"EA");dkWritten++;}
          catch(e: any){errors++;console.warn("DK write failed:",res.partNumber,e.message);}
        }
        if(mo.found&&mo.price>0&&mouserVendor){
          mouserFound++;
          try{await bcPushPurchasePrice(res.partNumber,mouserVendor,mo.price,Date.now(),"EA");mouserWritten++;}
          catch(e: any){errors++;console.warn("Mouser write failed:",res.partNumber,e.message);}
        }
      }
      _vSync.status={..._vSync.status,searched:allResults.length,dkFound,mouserFound,dkWritten,mouserWritten,errors};
      _vSyncNotify();
    }

    const durationMs=Date.now()-_start;
    _vSync.status={phase:"Complete",total:allItems.length,searched:allResults.length,dkFound,mouserFound,dkWritten,mouserWritten,errors,detail:""};
    _vSync.result={totalItems:allItems.length,dkFound,mouserFound,dkWritten,mouserWritten,errors,durationMs,results:allResults};
    _vSyncNotify();

    // Save sync log
    try{
      await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
        vendor:"DigiKey+Mouser",runAt:Date.now(),totalItems:allItems.length,
        found:dkFound+mouserFound,errors,writtenToBC:dkWritten+mouserWritten,durationMs,
        dkFound,mouserFound,dkWritten,mouserWritten,
        results:allResults.map((r: any)=>({
          partNumber:r.partNumber,
          dkFound:!!(r.digikey?.found),dkPrice:r.digikey?.price||null,dkMfr:r.digikey?.manufacturer||null,dkError:r.digikey?.error||null,
          mouserFound:!!(r.mouser?.found),mouserPrice:r.mouser?.price||null,mouserMfr:r.mouser?.manufacturer||null,mouserError:r.mouser?.error||null,
        }))
      });
    }catch(e){console.warn("Failed to save vendor sync log:",e);}
  }catch(e: any){_vSync.error=e.message||"Sync failed";_vSyncNotify();}
  _vSync.running=false;
  _vSyncNotify();
}
