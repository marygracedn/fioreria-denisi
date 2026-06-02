import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);

// ── Supabase ──────────────────────────────────────────────────────────────────
const SB_URL = process.env.REACT_APP_SUPABASE_URL;
const SB_KEY = process.env.REACT_APP_SUPABASE_KEY;
const HDR = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

const sbGet  = async (t, q="") => { if(!SB_OK) return []; try { const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers: HDR }); return r.ok ? r.json() : []; } catch { return []; } };
const sbIns  = async (t, d)    => { if(!SB_OK) return; try { await fetch(`${SB_URL}/rest/v1/${t}`, { method:"POST", headers:{...HDR,"Prefer":"return=representation"}, body:JSON.stringify(d) }); } catch {} };
const sbDel  = async (t, id)   => { if(!SB_OK) return; try { await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method:"DELETE", headers: HDR }); } catch {} };
const sbSet  = async (k, v)    => { if(!SB_OK) return; try { await fetch(`${SB_URL}/rest/v1/impostazioni`, { method:"POST", headers:{...HDR,"Prefer":"resolution=merge-duplicates"}, body:JSON.stringify({chiave:k,valore:v}) }); } catch {} };
const sbSets = async ()        => { if(!SB_OK) return {}; try { const r = await sbGet("impostazioni","select=chiave,valore"); return Object.fromEntries((r||[]).map(x=>[x.chiave,x.valore])); } catch { return {}; } };

// ── Constants ─────────────────────────────────────────────────────────────────
const TODAY = new Date();
const PALETTE = ["#e8a598","#a8c5a0","#b8a9c9","#f5c97e","#b8c9e8","#d4a8c5","#c5d4a8","#e8c5a8"];
const DEFAULT_SERVICES = [
  { id:"bouquet",      label:"💐 Bouquet",               color:"#e8a598", dailyMax:2,    minDaysAhead:3 },
  { id:"composizione", label:"🌸 Composizione Floreale", color:"#a8c5a0", dailyMax:2,    minDaysAhead:3 },
  { id:"appuntamento", label:"🌿 Consulenza",            color:"#b8a9c9", dailyMax:1,    minDaysAhead:0 },
  { id:"giftcard",     label:"🎁 Gift Card",             color:"#f5c97e", dailyMax:null, minDaysAhead:0 },
];
const TIME_SLOTS  = ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const DAYS_IT     = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
const MONTHS_IT   = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DEFAULT_PWD = "fioreria2026";

// ── Helpers ───────────────────────────────────────────────────────────────────
const getDIM    = (y,m)   => new Date(y,m+1,0).getDate();
const getFirst  = (y,m)   => (new Date(y,m,1).getDay()+6)%7;
const dk        = (y,m,d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const addDays   = (dt,n)  => { const d=new Date(dt); d.setDate(d.getDate()+n); return d; };
const countSvc  = (bks,date,sid) => bks.filter(b=>b.date===date&&b.service.id===sid).length;

// ── Styles ────────────────────────────────────────────────────────────────────
const IS = { width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #f5cfc6",fontFamily:"Georgia,serif",fontSize:14,color:"#9b2c50",background:"#fff8f6",outline:"none",boxSizing:"border-box",resize:"vertical" };
const GB = { padding:"13px 24px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#c94f72,#a83058)",color:"#fff",fontFamily:"Georgia,serif",fontSize:14,cursor:"pointer",fontWeight:"bold" };
const BB = { marginTop:14,background:"transparent",border:"none",color:"#c49090",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13,padding:"8px 0",display:"block",width:"100%",textAlign:"center" };
const NB = { background:"transparent",border:"1px solid #f5cfc6",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:20,color:"#9b2c50" };

// ── AI email ──────────────────────────────────────────────────────────────────
async function genEmail(booking) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
        messages:[{role:"user",content:`Sei il sistema di prenotazione di "Mariagrazia De Nisi Floral Design Studio". Scrivi un'email di conferma prenotazione elegante e calda in italiano per: Nome: ${booking.name}, Servizio: ${booking.service}, Data: ${booking.date}, Orario: ${booking.time||"da concordare"}, Note: ${booking.note||"nessuna"}. Includi: ringraziamento, dettagli prenotazione, contatto per modifiche (tel: 02 1234567), chiudi con saluto floreale. SOLO corpo email, max 150 parole.`}]
      })
    });
    const d = await r.json();
    return d.content?.[0]?.text || "";
  } catch { return ""; }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICE TIERS EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function PriceTiersEditor({ label, tiers, onChange }) {
  const [newT, setNewT] = useState("");
  const [editI, setEditI] = useState(null);
  const [editV, setEditV] = useState("");
  const add = () => { const v=newT.trim(); if(!v||tiers.includes(v))return; onChange([...tiers,v]); setNewT(""); };
  const save = i => { const v=editV.trim(); if(!v)return; const n=[...tiers]; n[i]=v; onChange(n); setEditI(null); };
  const del = i => { if(tiers.length<=1){alert("Almeno una fascia.");return;} onChange(tiers.filter((_,j)=>j!==i)); };
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:"#9b2c50",marginBottom:8}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:9}}>
        {tiers.map((t,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:3,background:"#fff8f6",border:"1.5px solid #f5cfc6",borderRadius:9,padding:"3px 8px"}}>
            {editI===i ? <>
              <input value={editV} onChange={e=>setEditV(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save(i)} style={{width:60,padding:"2px 5px",borderRadius:5,border:"1px solid #f5cfc6",fontFamily:"Georgia,serif",fontSize:12,color:"#9b2c50",outline:"none"}}/>
              <button onClick={()=>save(i)} style={{background:"#c94f72",border:"none",borderRadius:4,color:"#fff",fontSize:10,cursor:"pointer",padding:"2px 5px"}}>✓</button>
              <button onClick={()=>setEditI(null)} style={{background:"none",border:"none",color:"#c49090",fontSize:10,cursor:"pointer"}}>✕</button>
            </> : <>
              <span style={{fontSize:13,fontWeight:"bold",color:"#9b2c50"}}>{t}</span>
              <button onClick={()=>{setEditI(i);setEditV(t);}} style={{background:"none",border:"none",color:"#c49090",fontSize:10,cursor:"pointer"}}>✏️</button>
              <button onClick={()=>del(i)} style={{background:"none",border:"none",color:"#e07070",fontSize:10,cursor:"pointer"}}>✕</button>
            </>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6}}>
        <input value={newT} onChange={e=>setNewT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder='Es. "150€"' style={{...IS,fontSize:12,padding:"7px 10px"}}/>
        <button onClick={add} style={{...GB,fontSize:12,padding:"7px 14px"}}>+</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDIO ADDRESS EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function StudioAddressEditor({ address, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({...address});
  const save = () => { onChange(draft); setEditing(false); };
  return (
    <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",fontSize:13}}>🏪 Indirizzo Ritiro in Studio</div>
        <button onClick={()=>{setDraft({...address});setEditing(!editing);}} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #f5cfc6",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer"}}>{editing?"Annulla":"✏️ Modifica"}</button>
      </div>
      {!editing ? (
        <div style={{fontSize:13,color:"#6a5a54",lineHeight:1.8}}>
          <div style={{fontWeight:"bold",color:"#9b2c50"}}>{address.nome}</div>
          <div>{address.via}</div><div>{address.cap} {address.citta}</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[{k:"nome",l:"Nome"},{k:"via",l:"Via"},{k:"cap",l:"CAP"},{k:"citta",l:"Città"}].map(f=>(
            <div key={f.k}>
              <label style={{display:"block",fontSize:11,color:"#c49090",marginBottom:2}}>{f.l}</label>
              <input value={draft[f.k]} onChange={e=>setDraft(p=>({...p,[f.k]:e.target.value}))} style={{...IS,fontSize:13,padding:"7px 10px"}}/>
            </div>
          ))}
          <button onClick={save} style={{...GB,width:"100%",fontSize:13}}>💾 Salva</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK CALENDAR
// ══════════════════════════════════════════════════════════════════════════════
function BlockCalendar({ blockedDays, onToggle, blockedSlots, onToggleSlot, fullDays, onToggleFullDay, dayLimits, onDayLimitChange, limits, minDays, dayMinDays, onDayMinDaysChange, services, dayServices, onToggleDayService, paymentMethods, dayPayments, onToggleDayPayment }) {
  const t = new Date();
  const cY=t.getFullYear(), cM=t.getMonth();
  const [vY,setVY]=useState(cY), [vM,setVM]=useState(cM), [sel,setSel]=useState(null);
  const dim=getDIM(vY,vM), fd=getFirst(vY,vM);
  const pM=()=>{if(vY===cY&&vM===cM)return; if(vM===0){setVM(11);setVY(y=>y-1);}else setVM(m=>m-1);};
  const nM=()=>{if(vM===11){setVM(0);setVY(y=>y+1);}else setVM(m=>m+1);};
  const isPast=d=>new Date(vY,vM,d)<new Date(cY,cM,t.getDate());
  const key=d=>`${vY}-${String(vM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const MESI=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

  return (
    <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
      <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>🚫 Gestione disponibilità per giorno</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={pM} disabled={vY===cY&&vM===cM} style={{...NB,width:28,height:28,fontSize:16,opacity:vY===cY&&vM===cM?0.2:1}}>‹</button>
        <span style={{fontSize:13,fontWeight:"bold",color:"#9b2c50"}}>{MESI[vM]} {vY}</span>
        <button onClick={nM} style={{...NB,width:28,height:28,fontSize:16}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:3}}>
        {["L","M","M","G","V","S","D"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,color:"#c49090",fontWeight:"bold"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array(fd).fill(null).map((_,i)=><div key={"e"+i}/>)}
        {Array(dim).fill(null).map((_,i)=>{
          const d=i+1, k=key(d), past=isPast(d);
          const isB=blockedDays.includes(k), isF=fullDays.includes(k), isSel=sel===k;
          const hasSl=(blockedSlots[k]||[]).length>0;
          return (
            <button key={d} disabled={past} onClick={()=>setSel(isSel?null:k)} style={{aspectRatio:"1",border:isSel?"2px solid #c94f72":isB?"2px solid #e07070":isF?"2px solid #e07030":"2px solid transparent",borderRadius:7,background:isB?"#fde8e8":isF?"#fff0e0":past?"#f8f4f2":"#fef4f1",color:past?"#ccc":isB?"#c0504d":isF?"#b05010":"#9b2c50",cursor:past?"not-allowed":"pointer",fontSize:11,position:"relative"}}>
              {d}{hasSl&&!isB&&<span style={{position:"absolute",bottom:1,right:2,width:3,height:3,borderRadius:"50%",background:"#f5a898"}}/>}
            </button>
          );
        })}
      </div>

      {sel && (
        <div style={{marginTop:12,padding:12,background:"#fff8f6",borderRadius:11}}>
          <div style={{fontWeight:"bold",color:"#9b2c50",fontSize:12,marginBottom:10}}>{sel.split("-").reverse().join("/")}</div>

          {/* Block/Full day */}
          <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
            <button onClick={()=>onToggle(sel)} style={{flex:1,padding:"7px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:11,fontWeight:"bold",background:blockedDays.includes(sel)?"#fce8e4":"#fde8e8",color:blockedDays.includes(sel)?"#c94f72":"#c0504d"}}>
              {blockedDays.includes(sel)?"✅ Sblocca giorno":"🚫 Blocca giorno"}
            </button>
            <button onClick={()=>onToggleFullDay(sel)} style={{flex:1,padding:"7px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:11,fontWeight:"bold",background:fullDays.includes(sel)?"#fce8e4":"#fff0e0",color:fullDays.includes(sel)?"#c94f72":"#b05010"}}>
              {fullDays.includes(sel)?"✅ Rimuovi Completo":"🔴 Segna Completo"}
            </button>
          </div>

          {!blockedDays.includes(sel) && <>
            {/* Services */}
            <div style={{fontSize:11,fontWeight:"bold",color:"#9b2c50",marginBottom:6}}>🌸 Servizi attivi:</div>
            {services.map(svc=>{
              const active=(dayServices[sel]??services.map(s=>s.id)).includes(svc.id);
              return (
                <div key={svc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,padding:"5px 9px",borderRadius:8,background:active?svc.color+"22":"#f8f4f2",border:`1px solid ${active?svc.color:"#e8d8d0"}`}}>
                  <span style={{fontSize:11,color:active?"#9b2c50":"#bbb"}}>{svc.label}</span>
                  <button onClick={()=>onToggleDayService(sel,svc.id)} style={{padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:10,fontWeight:"bold",background:active?"#c94f72":"#e8d8d0",color:active?"#fff":"#9a8a84"}}>
                    {active?"✅":"⭕"}
                  </button>
                </div>
              );
            })}

            {/* Payments */}
            <div style={{fontSize:11,fontWeight:"bold",color:"#9b2c50",margin:"10px 0 6px"}}>💳 Pagamenti attivi:</div>
            {[{id:"carta",l:"💳 Carta"},{id:"paypal",l:"🅿️ PayPal"},{id:"consegna",l:"💵 Contanti/Gift"}].filter(m=>paymentMethods[m.id]).map(m=>{
              const dp=dayPayments[sel]??paymentMethods, active=dp[m.id]!==false;
              return (
                <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,padding:"5px 9px",borderRadius:8,background:active?"#fff8f6":"#f8f4f2",border:`1px solid ${active?"#f5cfc6":"#e8d8d0"}`}}>
                  <span style={{fontSize:11,color:active?"#9b2c50":"#bbb"}}>{m.l}</span>
                  <button onClick={()=>onToggleDayPayment(sel,m.id,!active)} style={{padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:10,fontWeight:"bold",background:active?"#c94f72":"#e8d8d0",color:active?"#fff":"#9a8a84"}}>{active?"✅":"⭕"}</button>
                </div>
              );
            })}

            {/* Daily limits */}
            <div style={{fontSize:11,fontWeight:"bold",color:"#9b2c50",margin:"10px 0 6px"}}>📊 Disponibilità:</div>
            {services.map(svc=>{
              const val=(dayLimits[sel]?.[svc.id]!==undefined)?dayLimits[sel][svc.id]:(limits[svc.id]??svc.dailyMax??"-");
              return (
                <div key={svc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,padding:"5px 9px",borderRadius:8,background:"#fff",border:"1px solid #f5cfc6"}}>
                  <span style={{fontSize:11,color:"#9b2c50"}}>{svc.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>onDayLimitChange(sel,svc.id,Math.max(0,(val==="-"?limits[svc.id]??0:val)-1))} style={{width:22,height:22,borderRadius:5,border:"1px solid #f5cfc6",background:"#fff8f6",fontSize:13,cursor:"pointer",color:"#9b2c50"}}>−</button>
                    <span style={{fontSize:13,fontWeight:"bold",color:"#9b2c50",minWidth:20,textAlign:"center"}}>{val}</span>
                    <button onClick={()=>onDayLimitChange(sel,svc.id,(val==="-"?limits[svc.id]??0:val)+1)} style={{width:22,height:22,borderRadius:5,border:"1px solid #f5cfc6",background:"#fff8f6",fontSize:13,cursor:"pointer",color:"#9b2c50"}}>+</button>
                    {dayLimits[sel]?.[svc.id]!==undefined&&<button onClick={()=>onDayLimitChange(sel,svc.id,limits[svc.id])} style={{fontSize:10,color:"#c49090",background:"none",border:"none",cursor:"pointer"}}>↺</button>}
                  </div>
                </div>
              );
            })}

            {/* Min days ahead per day */}
            <div style={{fontSize:11,fontWeight:"bold",color:"#9b2c50",margin:"10px 0 6px"}}>⏳ Anticipo minimo:</div>
            {services.filter(s=>s.id!=="giftcard").map(svc=>{
              const val=(dayMinDays[sel]?.[svc.id]!==undefined)?dayMinDays[sel][svc.id]:(minDays[svc.id]??0);
              return (
                <div key={svc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,padding:"5px 9px",borderRadius:8,background:"#fff",border:"1px solid #f5cfc6"}}>
                  <span style={{fontSize:11,color:"#9b2c50"}}>{svc.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>onDayMinDaysChange(sel,svc.id,Math.max(0,val-1))} style={{width:22,height:22,borderRadius:5,border:"1px solid #f5cfc6",background:"#fff8f6",fontSize:13,cursor:"pointer",color:"#9b2c50"}}>−</button>
                    <div style={{textAlign:"center",minWidth:24}}><span style={{fontSize:13,fontWeight:"bold",color:"#9b2c50"}}>{val}</span><div style={{fontSize:8,color:"#c49090"}}>gg</div></div>
                    <button onClick={()=>onDayMinDaysChange(sel,svc.id,val+1)} style={{width:22,height:22,borderRadius:5,border:"1px solid #f5cfc6",background:"#fff8f6",fontSize:13,cursor:"pointer",color:"#9b2c50"}}>+</button>
                    {dayMinDays[sel]?.[svc.id]!==undefined&&<button onClick={()=>onDayMinDaysChange(sel,svc.id,minDays[svc.id])} style={{fontSize:10,color:"#c49090",background:"none",border:"none",cursor:"pointer"}}>↺</button>}
                  </div>
                </div>
              );
            })}

            {/* Block slots */}
            <div style={{fontSize:11,fontWeight:"bold",color:"#9b2c50",margin:"10px 0 6px"}}>🕐 Blocca orari:</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
              {TIME_SLOTS.map(slot=>{
                const isBS=(blockedSlots[sel]||[]).includes(slot);
                return (
                  <button key={slot} onClick={()=>onToggleSlot(sel,slot)} style={{padding:"5px 2px",borderRadius:6,border:isBS?"2px solid #e07070":"2px solid #f5cfc6",background:isBS?"#fde8e8":"#fff",color:isBS?"#c0504d":"#9b2c50",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif",fontWeight:isBS?"bold":"normal"}}>
                    {isBS?<s>{slot}</s>:slot}
                  </button>
                );
              })}
            </div>
          </>}
        </div>
      )}
      <div style={{fontSize:10,color:"#c49090",marginTop:10}}>🚫 Rosso=bloccato &nbsp;🟠 Arancio=completo &nbsp;🟡 Punto=orari parziali</div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// STRIPE PAYMENT
// ══════════════════════════════════════════════════════════════════════════════
function CheckoutForm({ onSuccess, onBack, amount, description }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    if(!stripe||!elements) return;
    setLoading(true); setError("");
    const { error: se } = await elements.submit();
    if(se) { setError(se.message); setLoading(false); return; }
    const { error: ce } = await stripe.confirmPayment({ elements, confirmParams:{return_url:window.location.href}, redirect:"if_required" });
    if(ce) { setError(ce.message); setLoading(false); }
    else onSuccess();
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"#fff8f6",borderRadius:11,padding:12,border:"1px solid #f5cfc6"}}>
        <div style={{fontSize:12,color:"#c49090"}}>Importo</div>
        <div style={{fontSize:20,fontWeight:"bold",color:"#9b2c50"}}>€{amount}</div>
        <div style={{fontSize:12,color:"#c49090"}}>{description}</div>
      </div>
      <PaymentElement options={{layout:"tabs"}}/>
      {error&&<div style={{color:"#c0504d",fontSize:12,padding:"8px 10px",background:"#fde8e8",borderRadius:8}}>{error}</div>}
      <button onClick={handleSubmit} disabled={!stripe||loading} style={{padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#c94f72,#a83058)",color:"#fff",fontFamily:"Georgia,serif",fontSize:14,cursor:!stripe||loading?"not-allowed":"pointer",fontWeight:"bold",opacity:!stripe||loading?0.6:1}}>
        {loading?"⏳ Elaborazione...":"🔒 Paga ora"}
      </button>
      <button onClick={onBack} disabled={loading} style={{marginTop:4,background:"transparent",border:"none",color:"#c49090",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13,padding:"8px 0"}}>← Indietro</button>
    </div>
  );
}

function StripePayment({ amount, description, onSuccess, onBack }) {
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(()=>{
    fetch("/api/create-payment-intent",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({amount,currency:"eur",description}) })
      .then(r=>r.json()).then(d=>{ if(d.clientSecret) setClientSecret(d.clientSecret); else setErr("Errore nel sistema di pagamento."); })
      .catch(()=>setErr("Errore di connessione.")).finally(()=>setLoading(false));
  },[]);
  if(loading) return <div style={{textAlign:"center",padding:32,color:"#c49090"}}>🌸 Inizializzazione...</div>;
  if(err) return <div style={{color:"#c0504d",padding:16,textAlign:"center"}}>{err}<br/><button onClick={onBack} style={{marginTop:8,background:"transparent",border:"none",color:"#c49090",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13}}>← Indietro</button></div>;
  return (
    <Elements stripe={stripePromise} options={{clientSecret,appearance:{theme:"stripe",variables:{colorPrimary:"#c94f72",colorBackground:"#fff8f6",fontFamily:"Georgia, serif"}}}}>
      <CheckoutForm onSuccess={onSuccess} onBack={onBack} amount={amount} description={description}/>
    </Elements>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PASSWORD EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function PasswordEditor({ savedPwd, onPwdChange }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    if(current !== savedPwd) { setError("Password attuale errata."); return; }
    if(newPwd.length < 6)    { setError("La nuova password deve avere almeno 6 caratteri."); return; }
    if(newPwd !== confirm)   { setError("Le password non coincidono."); return; }
    onPwdChange(newPwd);
    setEditing(false); setCurrent(""); setNewPwd(""); setConfirm(""); setError("");
    setSuccess(true); setTimeout(()=>setSuccess(false), 3000);
  };

  return (
    <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:editing?12:0}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",fontSize:13}}>🔒 Password Admin</div>
        <button onClick={()=>{setEditing(!editing);setError("");}} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #f5cfc6",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer"}}>
          {editing?"Annulla":"✏️ Modifica"}
        </button>
      </div>
      {success&&<div style={{color:"#2d6a3e",fontSize:12,marginTop:4}}>✅ Password aggiornata!</div>}
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {[{k:"current",l:"Password attuale",v:current,set:setCurrent},{k:"new",l:"Nuova password (min. 6 caratteri)",v:newPwd,set:setNewPwd},{k:"confirm",l:"Conferma nuova password",v:confirm,set:setConfirm}].map(f=>(
            <div key={f.k}>
              <label style={{display:"block",fontSize:11,color:"#c49090",marginBottom:3}}>{f.l}</label>
              <input type="password" value={f.v} onChange={e=>f.set(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:9,border:"1.5px solid #f5cfc6",fontFamily:"Georgia,serif",fontSize:13,color:"#9b2c50",background:"#fff8f6",outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          {error&&<div style={{color:"#c0504d",fontSize:12}}>{error}</div>}
          <button onClick={handleSave} style={{padding:"10px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#c94f72,#a83058)",color:"#fff",fontFamily:"Georgia,serif",fontSize:13,cursor:"pointer",fontWeight:"bold"}}>
            💾 Salva nuova password
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════════════════════════════════════
function AdminPanel({ bookings, onDelete, onClose, savedPwd, onPwdChange, limits, onLimitsChange, minDays, onMinDaysChange, blockedDays, blockedSlots, onToggleBlockedDay, onToggleBlockedSlot, fullDays, onToggleFullDay, dayLimits, onDayLimitChange, dayMinDays, onDayMinDaysChange, paymentMethods, onPaymentMethodsChange, services, onServicesChange, dayServices, onToggleDayService, dayPayments, onToggleDayPayment, studioAddress, onStudioAddressChange, priceTiersBouquet, onPTBChange, priceTiersComp, onPTCChange, notes, onNotesChange }) {
  const [filter,setFilter]=useState("tutti"), [search,setSearch]=useState(""), [exp,setExp]=useState(null), [emailModal,setEmailModal]=useState(null);
  const rd=new Date(), todayK=dk(rd.getFullYear(),rd.getMonth(),rd.getDate());
  const list=bookings.filter(b=>{
    const mf=filter==="tutti"||(filter==="oggi"&&b.date===todayK)||(filter==="futuri"&&b.date>todayK)||(filter==="passati"&&b.date<todayK);
    const ms=!search||b.name.toLowerCase().includes(search.toLowerCase())||b.phone.includes(search);
    return mf&&ms;
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const stats={oggi:bookings.filter(b=>b.date===todayK).length, futuri:bookings.filter(b=>b.date>todayK).length, total:bookings.length};
  const handleEmail=async b=>{
    setEmailModal({booking:b,text:"",loading:true});
    const text=await genEmail({name:b.name,service:b.service.label,date:b.date,time:b.time,note:b.note});
    setEmailModal({booking:b,text,loading:false});
  };

  return (
    <div style={{minHeight:"100vh",background:"#fdf0ec",fontFamily:"Georgia,serif"}}>
      <div style={{background:"linear-gradient(135deg,#a83058,#c94f72)",padding:"20px 20px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{color:"#f5c4d0",fontSize:11,letterSpacing:5,textTransform:"uppercase"}}>Pannello Admin</div>
          <h2 style={{margin:"4px 0 0",color:"#f5ede8",fontWeight:"normal",fontSize:20}}>🌿 Gestione Prenotazioni</h2>
        </div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:10,color:"#f5ede8",padding:"7px 14px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:12}}>← Sito</button>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,padding:"14px 14px 0"}}>
        {[["📅","Oggi",stats.oggi],["🔜","Prossime",stats.futuri],["📋","Totale",stats.total]].map(([icon,label,val])=>(
          <div key={label} style={{background:"#fff",borderRadius:14,padding:"12px 10px",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:18}}>{icon}</div>
            <div style={{fontSize:22,fontWeight:"bold",color:"#9b2c50"}}>{val}</div>
            <div style={{fontSize:11,color:"#c49090"}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Cambia password */}
      <PasswordEditor savedPwd={savedPwd} onPwdChange={onPwdChange}/>

      {/* Disponibilità generale */}
      <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>⚙️ Disponibilità giornaliera</div>
        {services.map(svc=>(
          <div key={svc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"10px 12px",borderRadius:11,border:`1.5px solid ${svc.color}`,background:svc.color+"18"}}>
            <span style={{fontSize:13,color:"#9b2c50",fontWeight:"bold"}}>{svc.label}</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={()=>onLimitsChange(svc.id,Math.max(0,(limits[svc.id]??0)-1))} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #f5cfc6",background:"#fff",fontSize:18,cursor:"pointer",color:"#9b2c50"}}>−</button>
              <span style={{fontSize:18,fontWeight:"bold",color:"#9b2c50",minWidth:20,textAlign:"center"}}>{svc.dailyMax===null?"∞":(limits[svc.id]??svc.dailyMax)}</span>
              <button onClick={()=>onLimitsChange(svc.id,(limits[svc.id]??0)+1)} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #f5cfc6",background:"#fff",fontSize:18,cursor:"pointer",color:"#9b2c50"}}>+</button>
            </div>
          </div>
        ))}

        {/* Min days */}
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:10,marginTop:14,fontSize:13}}>⏳ Giorni minimi di anticipo</div>
        {services.filter(s=>s.id!=="giftcard").map(svc=>(
          <div key={svc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"10px 12px",borderRadius:11,border:"1.5px solid #f5cfc6",background:"#fff8f6"}}>
            <span style={{fontSize:13,color:"#9b2c50",fontWeight:"bold"}}>{svc.label}</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={()=>onMinDaysChange(svc.id,Math.max(0,(minDays[svc.id]??0)-1))} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #f5cfc6",background:"#fff",fontSize:18,cursor:"pointer",color:"#9b2c50"}}>−</button>
              <div style={{textAlign:"center",minWidth:36}}><span style={{fontSize:18,fontWeight:"bold",color:"#9b2c50"}}>{minDays[svc.id]??svc.minDaysAhead}</span><div style={{fontSize:9,color:"#c49090"}}>giorni</div></div>
              <button onClick={()=>onMinDaysChange(svc.id,(minDays[svc.id]??0)+1)} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #f5cfc6",background:"#fff",fontSize:18,cursor:"pointer",color:"#9b2c50"}}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Services editor */}
      <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>🌸 Gestione Servizi</div>
        {services.map((svc,i)=>(
          <div key={svc.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:9,padding:"10px 12px",borderRadius:11,border:`1.5px solid ${svc.color}`,background:svc.color+"22"}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:svc.color,flexShrink:0}}/>
            <span style={{flex:1,fontSize:13,color:"#9b2c50",fontWeight:"bold"}}>{svc.label}</span>
            <button onClick={()=>{const l=window.prompt("Nome del servizio:",svc.label);if(l)onServicesChange(prev=>prev.map((s,j)=>j===i?{...s,label:l}:s));}} style={{padding:"4px 9px",borderRadius:7,border:"1px solid #f5cfc6",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:11,cursor:"pointer"}}>✏️</button>
            <button onClick={()=>{if(services.length<=1){alert("Almeno un servizio.");return;}if(window.confirm(`Rimuovere "${svc.label}"?`))onServicesChange(prev=>prev.filter((_,j)=>j!==i));}} style={{padding:"4px 9px",borderRadius:7,border:"1px solid #e8a598",background:"#fff",color:"#c0504d",fontFamily:"Georgia,serif",fontSize:11,cursor:"pointer"}}>🗑</button>
          </div>
        ))}
        <button onClick={()=>{const l=window.prompt("Nome del nuovo servizio:");if(!l)return;onServicesChange(prev=>[...prev,{id:"svc_"+Date.now(),label:l,color:PALETTE[prev.length%PALETTE.length],dailyMax:2,minDaysAhead:0}]);}} style={{width:"100%",padding:"10px",borderRadius:11,border:"2px dashed #f5cfc6",background:"transparent",color:"#c94f72",fontFamily:"Georgia,serif",fontSize:13,cursor:"pointer"}}>+ Aggiungi servizio</button>
      </div>

      {/* Price tiers */}
      <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>💰 Fasce di Prezzo</div>
        <PriceTiersEditor label="💐 Bouquet" tiers={priceTiersBouquet} onChange={onPTBChange}/>
        <PriceTiersEditor label="🌸 Composizione" tiers={priceTiersComp} onChange={onPTCChange}/>
      </div>

      {/* Payment methods */}
      <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>💳 Metodi di pagamento</div>
        {[{id:"carta",icon:"💳",label:"Carta di credito / debito"},{id:"paypal",icon:"🅿️",label:"PayPal"},{id:"consegna",icon:"💵",label:"Pagamento in contanti o Gift card"}].map(m=>(
          <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9,padding:"10px 12px",borderRadius:11,border:`1.5px solid ${paymentMethods[m.id]?"#c94f72":"#e8d8d0"}`,background:paymentMethods[m.id]?"#fff8f6":"#f8f4f2"}}>
            <span style={{fontSize:13,color:paymentMethods[m.id]?"#9b2c50":"#bbb"}}>{m.icon} {m.label}</span>
            <button onClick={()=>onPaymentMethodsChange(p=>({...p,[m.id]:!p[m.id]}))} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:12,fontWeight:"bold",background:paymentMethods[m.id]?"#c94f72":"#e8d8d0",color:paymentMethods[m.id]?"#fff":"#9a8a84"}}>
              {paymentMethods[m.id]?"✅ Attivo":"⭕ Off"}
            </button>
          </div>
        ))}
      </div>

      {/* Notes editor */}
      <div style={{margin:"12px 14px 0",background:"#fff",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:12,fontSize:13}}>📝 Note a piè di pagina</div>
        {[{k:"bouquetFlowers",l:"💐 Bouquet — nota fiori"},{k:"compFlowers",l:"🌸 Composizione — nota fiori"},{k:"bouquetMinOrder",l:"💐 Bouquet — minimo ordine"},{k:"compMinOrder",l:"🌸 Composizione — minimo ordine"},{k:"consulenza",l:"🌿 Consulenza — nota finale"}].map(n=>(
          <div key={n.k} style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,color:"#c49090",marginBottom:4}}>{n.l}</label>
            <textarea value={notes[n.k]} onChange={e=>onNotesChange(p=>({...p,[n.k]:e.target.value}))} rows={2} style={{...IS,fontSize:12}}/>
          </div>
        ))}
      </div>

      {/* Studio address */}
      <StudioAddressEditor address={studioAddress} onChange={onStudioAddressChange}/>

      {/* Block calendar */}
      <BlockCalendar blockedDays={blockedDays} onToggle={onToggleBlockedDay} blockedSlots={blockedSlots} onToggleSlot={onToggleBlockedSlot} fullDays={fullDays} onToggleFullDay={onToggleFullDay} dayLimits={dayLimits} onDayLimitChange={onDayLimitChange} limits={limits} minDays={minDays} dayMinDays={dayMinDays} onDayMinDaysChange={onDayMinDaysChange} services={services} dayServices={dayServices} onToggleDayService={onToggleDayService} paymentMethods={paymentMethods} dayPayments={dayPayments} onToggleDayPayment={onToggleDayPayment}/>

      {/* Search & filters */}
      <div style={{padding:"12px 14px 0"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cerca nome o telefono..." style={{...IS,marginBottom:9}}/>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {["tutti","oggi","futuri","passati"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",background:filter===f?"#c94f72":"#f5d5cc",color:filter===f?"#fff":"#9b2c50",fontFamily:"Georgia,serif",fontSize:12,fontWeight:filter===f?"bold":"normal"}}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings list */}
      <div style={{padding:"12px 14px 40px",display:"flex",flexDirection:"column",gap:9}}>
        {list.length===0&&<div style={{textAlign:"center",color:"#c49090",padding:28,fontSize:14}}>Nessuna prenotazione trovata.</div>}
        {list.map(b=>(
          <div key={b.id} style={{background:"#fff",borderRadius:15,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",border:`2px solid ${b.service.color}`,overflow:"hidden"}}>
            <div onClick={()=>setExp(exp===b.id?null:b.id)} style={{padding:"13px 15px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <span style={{fontWeight:"bold",color:"#9b2c50",fontSize:14}}>{b.name}</span>
                  <span style={{fontSize:11,background:b.service.color+"44",color:"#9b2c50",padding:"2px 7px",borderRadius:7}}>{b.service.label.replace(/\p{Emoji}/gu,"").trim()}</span>
                </div>
                <div style={{color:"#c49090",fontSize:12,marginTop:2}}>📅 {b.date.split("-").reverse().join("/")} {b.time&&b.time!=="—"?`• 🕐 ${b.time}`:""}</div>
              </div>
              <span style={{color:"#c49090"}}>{exp===b.id?"▲":"▼"}</span>
            </div>
            {exp===b.id&&(
              <div style={{padding:"0 15px 15px",borderTop:"1px solid #fdf0ec"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:11}}>
                  {[["📞",b.phone],["📧",b.email||"—"],["📦",b.delivery||"—"],["💳",b.payment||"—"]].map(([icon,val],i)=>(
                    <div key={i} style={{background:"#fef4f1",borderRadius:9,padding:"7px 10px",fontSize:12}}>
                      <span style={{color:"#c49090"}}>{icon} </span>
                      <span style={{color:"#9b2c50",fontWeight:"bold"}}>{val}</span>
                    </div>
                  ))}
                </div>
                {b.note&&<div style={{marginTop:8,background:"#fef4f1",borderRadius:9,padding:"7px 10px",fontSize:12,color:"#9b2c50"}}>📝 {b.note}</div>}
                <div style={{display:"flex",gap:7,marginTop:11,flexWrap:"wrap"}}>
                  <button onClick={()=>handleEmail(b)} style={{...GB,fontSize:12,padding:"8px 14px"}}>✉️ Genera Email</button>
                  <button onClick={()=>{if(window.confirm(`Eliminare prenotazione di ${b.name}?`))onDelete(b.id);}} style={{padding:"8px 14px",borderRadius:10,border:"1px solid #e8a598",background:"#fff",color:"#c0504d",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer"}}>🗑 Elimina</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Email modal */}
      {emailModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div style={{background:"#fff",borderRadius:20,padding:22,maxWidth:460,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{margin:0,color:"#9b2c50",fontWeight:"normal",fontSize:17}}>✉️ Email di Conferma</h3>
              <button onClick={()=>setEmailModal(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#c49090"}}>✕</button>
            </div>
            {emailModal.loading
              ?<div style={{textAlign:"center",padding:28,color:"#c49090"}}><div style={{fontSize:28,marginBottom:8}}>🌸</div>Generazione...</div>
              :<>
                <div style={{background:"#fff8f6",borderRadius:11,padding:14,fontSize:13,color:"#9b2c50",lineHeight:1.75,whiteSpace:"pre-wrap",border:"1px solid #f5cfc6",maxHeight:220,overflowY:"auto"}}>{emailModal.text}</div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button onClick={()=>{navigator.clipboard.writeText(emailModal.text);alert("Copiato!");}} style={{...GB,flex:1,fontSize:12}}>📋 Copia</button>
                  <button onClick={()=>handleEmail(emailModal.booking)} style={{padding:"12px 14px",borderRadius:10,border:"1px solid #f5cfc6",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer"}}>🔄</button>
                </div>
              </>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function FloralBooking() {
  // ── view ────────────────────────────────────────────────────────────────────
  const [view,setView]   = useState("client");
  const [aPwd,setAPwd]   = useState(""), [aErr,setAErr] = useState(false);
  const [savedPwd,setSavedPwd] = useState(DEFAULT_PWD);

  // ── calendar ─────────────────────────────────────────────────────────────
  const [vY,setVY] = useState(TODAY.getFullYear());
  const [vM,setVM] = useState(TODAY.getMonth());
  const cY=TODAY.getFullYear(), cM=TODAY.getMonth();

  // ── booking flow ────────────────────────────────────────────────────────
  const [step,setStep]           = useState("calendar");
  const [selected,setSelected]   = useState(null);
  const [service,setService]     = useState(null);
  const [time,setTime]           = useState(null);
  const [price,setPrice]         = useState(null);
  const [priceComp,setPriceComp] = useState(null);
  const [delivery,setDelivery]   = useState(null);
  const [payment,setPayment]     = useState(null);
  const [noteBouquet,setNB]      = useState("");
  const [noteComp,setNC]         = useState("");
  const [noteGift,setNG]         = useState("");
  const [evento,setEvento]       = useState({tipo:"",data:"",luogo:""});
  const [form,setForm]           = useState({name:"",phone:"",email:"",note:"",via:"",civico:"",citta:"",cap:""});

  // ── data ─────────────────────────────────────────────────────────────────
  const [bookings,setBookings]   = useState([]);
  const [confirmed,setConfirmed] = useState(null);
  const [showStripe,setShowStripe] = useState(false);
  const [stripePid,setStripePid] = useState(null);
  const [emailTxt,setEmailTxt]   = useState(""), [emailLoading,setEL] = useState(false);

  // ── settings ─────────────────────────────────────────────────────────────
  const [services,setServices]       = useState(DEFAULT_SERVICES);
  const [limits,setLimits]           = useState({bouquet:2,composizione:2,appuntamento:1});
  const [minDays,setMinDays]         = useState({bouquet:3,composizione:3,appuntamento:0});
  const [blockedDays,setBD]          = useState([]);
  const [blockedSlots,setBS]         = useState({});
  const [fullDays,setFD]             = useState([]);
  const [dayLimits,setDL]            = useState({});
  const [dayMinDays,setDMD]          = useState({});
  const [dayServices,setDS]          = useState({});
  const [dayPayments,setDP]          = useState({});
  const [paymentMethods,setPM]       = useState({carta:true,paypal:true,consegna:true});
  const [studioAddress,setSA]        = useState({nome:"Mariagrazia De Nisi",via:"Contrada Torrevecchia 124",cap:"88022",citta:"Curinga (CZ)"});
  const [priceTiersBouquet,setPTB]   = useState(["30€","50€","50-100€","80€","100€","100€+","Non specificato"]);
  const [priceTiersComp,setPTC]      = useState(["50€","50-100€","100€+","Non specificato"]);
  const [notes,setNotes]             = useState({bouquetFlowers:"(N.b.: La disponibilità di alcuni fiori varia in base alla stagionalità.)",compFlowers:"(N.b.: La disponibilità di alcuni fiori varia in base alla stagionalità.)",bouquetMinOrder:"(N.b. minimo d'ordine di 30€)",compMinOrder:"(N.b. minimo d'ordine 50€)",consulenza:"(N.b. Sarete ricontattati telefonicamente per concordare ulteriori dettagli sull'appuntamento.)"});

  // ── Load Google Font ───────────────────────────────────────────────────────
  useEffect(()=>{
    ["https://fonts.googleapis.com","https://fonts.gstatic.com"].forEach((href,i)=>{
      const l=document.createElement("link"); l.rel="preconnect"; l.href=href;
      if(i===1) l.crossOrigin="anonymous"; document.head.appendChild(l);
    });
    const l=document.createElement("link"); l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Monsieur+La+Doulaise&display=swap";
    document.head.appendChild(l);
  },[]);

  // ── Load from Supabase ─────────────────────────────────────────────────────
  useEffect(()=>{
    sbGet("prenotazioni","select=*&order=data.asc,ora.asc").then(rows=>{
      if(!rows||!rows.length) return;
      setBookings(rows.map(r=>({
        id:r.id, date:r.data, time:r.ora,
        service:DEFAULT_SERVICES.find(s=>s.id===r.servizio_id)||{id:r.servizio_id,label:r.servizio_label,color:r.servizio_colore,dailyMax:2,minDaysAhead:0},
        name:r.nome, phone:r.telefono, email:r.email||"", note:r.note||"",
        via:r.via||"", civico:r.civico||"", citta:r.citta||"", cap:r.cap||"",
        delivery:r.delivery, payment:r.payment, price:r.price, priceComp:r.price_comp,
        noteBouquet:r.note_bouquet||"", noteComp:r.note_composizione||"",
        evento:r.evento_tipo?{tipo:r.evento_tipo,data:r.evento_data||"",luogo:r.evento_luogo||""}:null,
      })));
    });
    sbSets().then(s=>{
      if(s.limits)            setLimits(s.limits);
      if(s.minDays)           setMinDays(s.minDays);
      if(s.blockedDays)       setBD(s.blockedDays);
      if(s.blockedSlots)      setBS(s.blockedSlots);
      if(s.fullDays)          setFD(s.fullDays);
      if(s.dayLimits)         setDL(s.dayLimits);
      if(s.dayMinDays)        setDMD(s.dayMinDays);
      if(s.dayServices)       setDS(s.dayServices);
      if(s.dayPayments)       setDP(s.dayPayments);
      if(s.paymentMethods)    setPM(s.paymentMethods);
      if(s.services)          setServices(s.services);
      if(s.studioAddress)     setSA(s.studioAddress);
      if(s.priceTiersBouquet) setPTB(s.priceTiersBouquet);
      if(s.priceTiersComp)    setPTC(s.priceTiersComp);
      if(s.notes)             setNotes(s.notes);
      if(s.adminPwd)          setSavedPwd(s.adminPwd);
    });
  },[]);

  // ── Save settings to Supabase ─────────────────────────────────────────────
  useEffect(()=>{ sbSet("limits",limits); },[limits]);
  useEffect(()=>{ sbSet("minDays",minDays); },[minDays]);
  useEffect(()=>{ sbSet("blockedDays",blockedDays); },[blockedDays]);
  useEffect(()=>{ sbSet("blockedSlots",blockedSlots); },[blockedSlots]);
  useEffect(()=>{ sbSet("fullDays",fullDays); },[fullDays]);
  useEffect(()=>{ sbSet("dayLimits",dayLimits); },[dayLimits]);
  useEffect(()=>{ sbSet("dayMinDays",dayMinDays); },[dayMinDays]);
  useEffect(()=>{ sbSet("dayServices",dayServices); },[dayServices]);
  useEffect(()=>{ sbSet("dayPayments",dayPayments); },[dayPayments]);
  useEffect(()=>{ sbSet("paymentMethods",paymentMethods); },[paymentMethods]);
  useEffect(()=>{ sbSet("services",services); },[services]);
  useEffect(()=>{ sbSet("studioAddress",studioAddress); },[studioAddress]);
  useEffect(()=>{ sbSet("priceTiersBouquet",priceTiersBouquet); },[priceTiersBouquet]);
  useEffect(()=>{ sbSet("priceTiersComp",priceTiersComp); },[priceTiersComp]);
  useEffect(()=>{ sbSet("notes",notes); },[notes]);
  useEffect(()=>{ sbSet("adminPwd",savedPwd); },[savedPwd]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const reset = () => {
    setStep("calendar"); setSelected(null); setService(null); setTime(null);
    setPrice(null); setPriceComp(null); setDelivery(null); setPayment(null);
    setNB(""); setNC(""); setNG("");
    setEvento({tipo:"",data:"",luogo:""});
    setForm({name:"",phone:"",email:"",note:"",via:"",civico:"",citta:"",cap:""});
    setConfirmed(null); setEmailTxt(""); setEL(false);
    setShowStripe(false); setStripePid(null);
  };

  const handleLogin = () => {
    if(aPwd===savedPwd) { setView("admin"); setAErr(false); setAPwd(""); }
    else setAErr(true);
  };

  const handleDelete = id => { setBookings(p=>p.filter(x=>x.id!==id)); sbDel("prenotazioni",id); };

  const handleToggleBlockedDay = dateStr => setBD(p=>p.includes(dateStr)?p.filter(d=>d!==dateStr):[...p,dateStr]);
  const handleToggleBlockedSlot = (dateStr,slot) => setBS(p=>{ const s=p[dateStr]||[]; return {...p,[dateStr]:s.includes(slot)?s.filter(x=>x!==slot):[...s,slot]}; });
  const handleToggleFullDay = dateStr => setFD(p=>p.includes(dateStr)?p.filter(d=>d!==dateStr):[...p,dateStr]);
  const handleDayLimitChange = (dateStr,sid,val) => setDL(p=>({...p,[dateStr]:{...(p[dateStr]||{}),[sid]:Math.max(0,val)}}));
  const handleDayMinDaysChange = (dateStr,sid,val) => setDMD(p=>({...p,[dateStr]:{...(p[dateStr]||{}),[sid]:Math.max(0,val)}}));
  const handleToggleDayService = (dateStr,sid) => setDS(p=>{ const active=p[dateStr]??services.map(s=>s.id); return {...p,[dateStr]:active.includes(sid)?active.filter(id=>id!==sid):[...active,sid]}; });
  const handleToggleDayPayment = (dateStr,pid,val) => setDP(p=>({...p,[dateStr]:{...(paymentMethods),...(p[dateStr]||{}),[pid]:val}}));

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const prevMonth = () => { if(vY===cY&&vM===cM)return; if(vM===0){setVM(11);setVY(y=>y-1);}else setVM(m=>m-1); };
  const nextMonth = () => { if(vM===11){setVM(0);setVY(y=>y+1);}else setVM(m=>m+1); };
  const dim=getDIM(vY,vM), fd=getFirst(vY,vM);
  const isToday  = d => d===TODAY.getDate()&&vM===cM&&vY===cY;
  const isPast   = d => new Date(vY,vM,d)<new Date(cY,cM,TODAY.getDate());
  const isSel    = d => selected&&selected.day===d&&selected.month===vM&&selected.year===vY;

  const getEffMax = (key,sid) => (dayLimits[key]?.[sid]!==undefined)?dayLimits[key][sid]:(limits[sid]??services.find(s=>s.id===sid)?.dailyMax??null);
  const getEffMin = (key,sid) => (dayMinDays[key]?.[sid]!==undefined)?dayMinDays[key][sid]:(minDays[sid]??services.find(s=>s.id===sid)?.minDaysAhead??0);

  const isDayDisabled = d => {
    if(isPast(d)) return true;
    const k=dk(vY,vM,d);
    if(blockedDays.includes(k)||fullDays.includes(k)) return true;
    const dt=new Date(vY,vM,d);
    const activeIds=dayServices[k]??services.map(s=>s.id);
    return services.every(svc=>{
      if(!activeIds.includes(svc.id)) return true;
      const minDate=addDays(TODAY,getEffMin(k,svc.id));
      if(dt<minDate) return true;
      const max=getEffMax(k,svc.id);
      if(max!==null&&countSvc(bookings,k,svc.id)>=max) return true;
      return false;
    });
  };

  const dayLoad = d => {
    const k=dk(vY,vM,d);
    if(fullDays.includes(k)) return 2;
    const activeIds=dayServices[k]??services.map(s=>s.id);
    const allFull=services.every(svc=>{
      if(!activeIds.includes(svc.id)) return true;
      const max=getEffMax(k,svc.id);
      return max!==null&&countSvc(bookings,k,svc.id)>=max;
    });
    const anyBooked=services.some(svc=>countSvc(bookings,k,svc.id)>0);
    return allFull?2:anyBooked?1:0;
  };

  const availableServices = () => {
    if(!selected) return [];
    const k=dk(selected.year,selected.month,selected.day);
    const dt=new Date(selected.year,selected.month,selected.day);
    const activeIds=dayServices[k]??services.map(s=>s.id);
    return services.filter(svc=>{
      if(!activeIds.includes(svc.id)) return false;
      const minDate=addDays(TODAY,getEffMin(k,svc.id));
      if(dt<minDate) return false;
      const max=getEffMax(k,svc.id);
      if(max!==null&&countSvc(bookings,k,svc.id)>=max) return false;
      return true;
    });
  };

  const getBookedTimes = () => {
    if(!selected) return [];
    const k=dk(selected.year,selected.month,selected.day);
    const booked=bookings.filter(b=>b.date===k).map(b=>b.time);
    const blocked=blockedSlots[k]||[];
    return [...new Set([...booked,...blocked])];
  };

  const handleDay = d => {
    if(isDayDisabled(d)) return;
    setSelected({year:vY,month:vM,day:d});
    setStep("service"); setService(null); setTime(null);
    setPrice(null); setPriceComp(null); setDelivery(null); setPayment(null);
  };

  const doConfirm = async (paymentId) => {
    const pm = paymentId||payment;
    const k=dk(selected.year,selected.month,selected.day);
    const nb={id:crypto.randomUUID(),date:k,time:time||"—",service,name:form.name,phone:form.phone,email:form.email,note:form.note,via:form.via,civico:form.civico,citta:form.citta,cap:form.cap,delivery,payment:pm,price,priceComp,noteBouquet,noteComp,noteGift,evento:service?.id==="appuntamento"?{...evento}:null};
    setBookings(p=>[...p,nb]);
    setConfirmed({...nb,form:{...form}});
    setStep("confirm");
    sbIns("prenotazioni",{id:nb.id,data:k,ora:nb.time,servizio_id:service.id,servizio_label:service.label,servizio_colore:service.color,nome:form.name,telefono:form.phone,email:form.email,note:form.note,via:form.via,civico:form.civico,citta:form.citta,cap:form.cap,delivery,payment:pm,price,price_comp:priceComp,note_bouquet:noteBouquet,note_composizione:noteComp,evento_tipo:evento?.tipo||null,evento_data:evento?.data||null,evento_luogo:evento?.luogo||null});
    if(form.email){ setEL(true); setEmailTxt(""); genEmail({name:form.name,service:service.label,date:`${selected.day} ${MONTHS_IT[selected.month]} ${selected.year}`,time:nb.time,note:form.note}).then(t=>{setEmailTxt(t);setEL(false);}); }
    setForm({name:"",phone:"",email:"",note:"",via:"",civico:"",citta:"",cap:""});
  };

  const selDateStr = selected?`${selected.day} ${MONTHS_IT[selected.month]} ${selected.year}`:"";

  // ── Step bar config ────────────────────────────────────────────────────────
  const allSteps = [
    {k:"calendar",l:"📅 Data"},
    {k:"service", l:"🌸 Servizio"},
    {k:"note",    l:"📝 Note"},
    {k:"noteComp",l:"📝 Note"},
    {k:"noteGift",l:"🎁 Gift"},
    {k:"price",   l:"💰 Prezzo"},
    {k:"priceComp",l:"💰 Prezzo"},
    {k:"time",    l:"🕐 Orario"},
    {k:"evento",  l:"🎊 Evento"},
    {k:"delivery",l:"📦 Consegna"},
    {k:"payment", l:"💳 Pagamento"},
    {k:"form",    l:"📝 Dati"},
    {k:"confirm", l:"✅ Conferma"},
  ];
  const visibleSteps = allSteps.filter(s=>{
    const sid=service?.id;
    if(s.k==="note"     && sid!=="bouquet")      return false;
    if(s.k==="noteComp" && sid!=="composizione") return false;
    if(s.k==="noteGift" && sid!=="giftcard")     return false;
    if(s.k==="price"    && sid!=="bouquet")      return false;
    if(s.k==="priceComp"&& sid!=="composizione") return false;
    if(s.k==="time"     && sid==="giftcard")     return false;
    if(s.k==="evento"   && sid!=="appuntamento") return false;
    if(s.k==="delivery" && (sid==="appuntamento"||sid==="giftcard")) return false;
    if(s.k==="payment"  && sid==="appuntamento") return false;
    if(s.k==="payment"  && sid==="giftcard" && !["carta","paypal"].some(id=>paymentMethods[id])) return false;
    return true;
  });
  const stepKeys = visibleSteps.map(s=>s.k);

  // ── Active payment methods for selected date ────────────────────────────
  const activePayments = () => {
    const k = selected ? dk(selected.year,selected.month,selected.day) : "";
    const dp = dayPayments[k] ?? paymentMethods;
    const all = [{id:"carta",icon:"💳",title:"Carta di credito / debito",sub:"Pagamento sicuro online"},
            {id:"paypal",icon:"🅿️",title:"PayPal",sub:"Paga con il tuo account PayPal"},
            {id:"consegna",icon:"💵",title:"Pagamento in contanti o Gift card",sub:"Contanti o buono regalo"}];
    if(service?.id==="giftcard") return all.filter(m=>m.id!=="consegna"&&dp[m.id]!==false&&paymentMethods[m.id]);
    return all.filter(m=>dp[m.id]!==false&&paymentMethods[m.id]);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Admin Login
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="adminLogin") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#fdf0ec,#fce4dc)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,padding:30,maxWidth:340,width:"100%",boxShadow:"0 8px 40px rgba(169,48,88,0.12)",textAlign:"center"}}>
        <div style={{fontSize:38,marginBottom:8}}>🌿</div>
        <h2 style={{color:"#9b2c50",fontWeight:"normal",fontSize:20,margin:"0 0 5px"}}>Area Riservata</h2>
        <p style={{color:"#c49090",fontSize:13,margin:"0 0 20px"}}>Accesso pannello gestione</p>
        <input type="password" value={aPwd} onChange={e=>{setAPwd(e.target.value);setAErr(false);}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Password" style={{...IS,marginBottom:8,textAlign:"center"}}/>
        {aErr&&<div style={{color:"#c0504d",fontSize:12,marginBottom:8}}>Password errata.</div>}
        <button onClick={handleLogin} style={{...GB,width:"100%",marginTop:6}}>Accedi →</button>
        <button onClick={()=>setView("client")} style={BB}>← Torna al sito</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Admin Panel
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="admin") return (
    <AdminPanel
      bookings={bookings} onDelete={handleDelete} onClose={()=>setView("client")}
      savedPwd={savedPwd} onPwdChange={setSavedPwd}
      limits={limits} onLimitsChange={(id,val)=>setLimits(p=>({...p,[id]:val}))}
      minDays={minDays} onMinDaysChange={(id,val)=>setMinDays(p=>({...p,[id]:Math.max(0,val)}))}
      blockedDays={blockedDays} onToggleBlockedDay={handleToggleBlockedDay}
      blockedSlots={blockedSlots} onToggleBlockedSlot={handleToggleBlockedSlot}
      fullDays={fullDays} onToggleFullDay={handleToggleFullDay}
      dayLimits={dayLimits} onDayLimitChange={handleDayLimitChange}
      dayMinDays={dayMinDays} onDayMinDaysChange={handleDayMinDaysChange}
      paymentMethods={paymentMethods} onPaymentMethodsChange={setPM}
      services={services} onServicesChange={setServices}
      dayServices={dayServices} onToggleDayService={handleToggleDayService}
      dayPayments={dayPayments} onToggleDayPayment={handleToggleDayPayment}
      studioAddress={studioAddress} onStudioAddressChange={setSA}
      priceTiersBouquet={priceTiersBouquet} onPTBChange={setPTB}
      priceTiersComp={priceTiersComp} onPTCChange={setPTC}
      notes={notes} onNotesChange={setNotes}
    />
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Client Booking
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#fdf0ec 0%,#fce4dc 50%,#fad4cc 100%)",fontFamily:"Georgia,serif"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#c94f72,#a83058)",padding:"20px 22px 16px",textAlign:"center",position:"relative"}}>
        <button onClick={()=>setView("adminLogin")} style={{position:"absolute",right:14,top:66,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,color:"rgba(255,255,255,0.6)",padding:"5px 10px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:11}}>🔒 Admin</button>
        <div style={{fontSize:32,letterSpacing:1,color:"#f5ede8",fontFamily:"'Monsieur La Doulaise','Dancing Script',cursive",fontWeight:"normal",textTransform:"none",lineHeight:1.1}}>Mariagrazia De Nisi</div>
        <div style={{fontSize:10,letterSpacing:5,color:"#f5c4d0",textTransform:"uppercase",marginBottom:6}}>Floral Design Studio</div>
        <div style={{marginTop:4,color:"#f5ede8",fontSize:15}}>🌸 Scegli un Servizio</div>
      </div>

      {/* Step bar */}
      <div style={{display:"flex",justifyContent:"center",gap:5,padding:"13px 14px 0",flexWrap:"wrap"}}>
        {visibleSteps.map((s,i,arr)=>{
          const ci=stepKeys.indexOf(step), si=stepKeys.indexOf(s.k);
          return (
            <div key={s.k} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{padding:"4px 10px",borderRadius:20,fontSize:11,background:si===ci?"#c94f72":si<ci?"#e8998a":"#f5d5cc",color:si===ci?"#fff":si<ci?"#fff":"#b09090",fontWeight:si===ci?"bold":"normal",transition:"all 0.3s"}}>{s.l}</div>
              {i<arr.length-1&&<span style={{color:"#e0b8b8",fontSize:10}}>›</span>}
            </div>
          );
        })}
      </div>

      <div style={{maxWidth:500,margin:"0 auto",padding:"13px 14px 40px"}}>

        {/* ── CALENDAR ── */}
        {step==="calendar"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <button onClick={prevMonth} disabled={vY===cY&&vM===cM} style={{...NB,opacity:vY===cY&&vM===cM?0.2:1}}>‹</button>
              <div style={{fontWeight:"bold",fontSize:17,color:"#9b2c50"}}>{MONTHS_IT[vM]} {vY}</div>
              <button onClick={nextMonth} style={NB}>›</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
              {DAYS_IT.map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"#e0b8b8",fontWeight:"bold",padding:"3px 0"}}>{d}</div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
              {Array(fd).fill(null).map((_,i)=><div key={"e"+i}/>)}
              {Array(dim).fill(null).map((_,i)=>{
                const d=i+1, disabled=isDayDisabled(d), sel=isSel(d), tod=isToday(d);
                const load=disabled?-1:dayLoad(d);
                return (
                  <button key={d} onClick={()=>handleDay(d)} disabled={disabled} style={{aspectRatio:"1",border:tod?"2px solid #c94f72":sel?"2px solid #e8a598":"2px solid transparent",borderRadius:10,background:sel?"#c94f72":tod?"#fce8e4":disabled?"#f8f4f2":"#fff",color:sel?"#fff":disabled?"#ccc":"#9b2c50",cursor:disabled?"not-allowed":"pointer",fontFamily:"Georgia,serif",fontSize:13,fontWeight:tod||sel?"bold":"normal",position:"relative",transition:"all 0.15s"}}>
                    {d}
                    {!disabled&&load>0&&<span style={{position:"absolute",bottom:2,right:3,width:4,height:4,borderRadius:"50%",background:load===2?"#e07070":"#f5a898"}}/>}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",gap:12,marginTop:14,fontSize:11,color:"#c49090",justifyContent:"center",flexWrap:"wrap"}}>
              <span>🟡 Parzialmente libero</span><span>🔴 Completo</span>
            </div>
          </div>
        )}

        {/* ── SERVICE ── */}
        {step==="service"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>📅 {selDateStr}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:11,fontSize:14}}>Seleziona il servizio:</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {services.map(svc=>{
                const avail=availableServices().find(s=>s.id===svc.id), disabled=!avail;
                const k=dk(selected.year,selected.month,selected.day);
                const used=countSvc(bookings,k,svc.id), max=getEffMax(k,svc.id);
                let reason="";
                if(disabled){
                  const dt=new Date(selected.year,selected.month,selected.day);
                  const em=getEffMin(k,svc.id);
                  if(dt<addDays(TODAY,em)) reason=`⚠️ Min. ${em} giorni di anticipo`;
                  else if(max!==null&&used>=max) reason="🚫 Completo";
                }
                return (
                  <button key={svc.id} onClick={()=>{if(!disabled){setService(svc);if(svc.id==="giftcard")setTime("—");setStep(svc.id==="bouquet"?"note":svc.id==="composizione"?"noteComp":svc.id==="giftcard"?"noteGift":"time");}}} disabled={disabled}
                    style={{padding:"13px 15px",borderRadius:12,border:`2px solid ${disabled?"#e0d8d4":svc.color}`,background:disabled?"#f8f4f2":"#fff",cursor:disabled?"not-allowed":"pointer",textAlign:"left",fontFamily:"Georgia,serif",fontSize:13,color:disabled?"#bbb":"#9b2c50",transition:"all 0.15s",opacity:disabled?0.7:1}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontWeight:"bold"}}>{svc.label}</span>
                      {max!==null&&!disabled&&<span style={{fontSize:11,color:"#c49090",background:"#fef4f1",padding:"2px 7px",borderRadius:7}}>{max-used===1?"Ultimo posto":`Rimanenti: ${max-used}`}</span>}
                    </div>
                    {disabled&&reason&&<div style={{fontSize:11,color:"#c09080",marginTop:3}}>{reason}</div>}
                  </button>
                );
              })}
            </div>
            <button onClick={()=>setStep("calendar")} style={BB}>← Torna al calendario</button>
          </div>
        )}

        {/* ── NOTE BOUQUET ── */}
        {step==="note"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #e8a598"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>💐 Bouquet — {selDateStr}</div>
            </div>
            <p style={{fontSize:14,color:"#9b2c50",lineHeight:1.75,margin:"0 0 6px"}}>Hai già in mente il tuo bouquet? Quali fiori e colori vorresti inserire? Quali evitare?<br/>Scrivi qui sotto.</p>
            <p style={{fontSize:11,color:"#c49090",margin:"0 0 12px",fontStyle:"italic",lineHeight:1.6}}>{notes.bouquetFlowers}</p>
            <textarea value={noteBouquet} onChange={e=>setNB(e.target.value)} placeholder="Es. Rose bianche e peonie rosa..." rows={5} style={IS}/>
            <button onClick={()=>setStep("price")} style={{...GB,width:"100%",marginTop:14,fontSize:14}}>Continua →</button>
            <button onClick={()=>setStep("service")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── NOTE COMPOSIZIONE ── */}
        {step==="noteComp"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #a8c5a0"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>🌸 Composizione — {selDateStr}</div>
            </div>
            <p style={{fontSize:14,color:"#9b2c50",lineHeight:1.75,margin:"0 0 6px"}}>Hai già un vaso o un contenitore? Portamelo!<br/>Quali fiori e colori vorresti inserire? Quali evitare?<br/>Scrivi qui sotto.</p>
            <p style={{fontSize:11,color:"#c49090",margin:"0 0 12px",fontStyle:"italic",lineHeight:1.6}}>{notes.compFlowers}</p>
            <textarea value={noteComp} onChange={e=>setNC(e.target.value)} placeholder="Es. Ho un vaso bianco, vorrei ranuncoli rosa..." rows={5} style={IS}/>
            <button onClick={()=>setStep("priceComp")} style={{...GB,width:"100%",marginTop:14,fontSize:14}}>Continua →</button>
            <button onClick={()=>setStep("service")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── NOTE GIFT CARD ── */}
        {step==="noteGift"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5c97e"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>🎁 Gift Card — {selDateStr}</div>
            </div>
            <p style={{fontSize:14,color:"#9b2c50",lineHeight:1.75,margin:"0 0 12px"}}>Scegli l&apos;importo del buono regalo e/o lascia un messaggio.</p>
            <textarea value={noteGift} onChange={e=>setNG(e.target.value)} placeholder="Es. Gift card da 50€ con scritto: Buon compleanno!" rows={5} style={IS}/>
            <button onClick={()=>setStep("payment")} style={{...GB,width:"100%",marginTop:14,fontSize:14}}>Continua →</button>
            <button onClick={()=>setStep("service")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── PRICE BOUQUET ── */}
        {step==="price"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #e8a598"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>💐 Bouquet — {selDateStr}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:11,fontSize:14}}>Seleziona la fascia di prezzo:</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9}}>
              {priceTiersBouquet.map((p,i)=>(
                <button key={p} onClick={()=>{setPrice(p);setStep("time");}} style={{padding:"18px 10px",borderRadius:13,border:price===p?"2px solid #c94f72":"2px solid #e8a598",background:price===p?"#c94f72":"#fff",color:price===p?"#fff":"#9b2c50",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:18,fontWeight:"bold",transition:"all 0.15s",gridColumn:i===priceTiersBouquet.length-1?"span 2":"auto"}}>
                  {p}
                </button>
              ))}
            </div>
            <p style={{fontSize:11,color:"#c49090",fontStyle:"italic",margin:"12px 0 4px",textAlign:"center"}}>{notes.bouquetMinOrder}</p>
            <button onClick={()=>setStep("note")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── PRICE COMPOSIZIONE ── */}
        {step==="priceComp"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #a8c5a0"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Hai scelto</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>🌸 Composizione — {selDateStr}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:11,fontSize:14}}>Seleziona la fascia di prezzo:</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9}}>
              {priceTiersComp.map((p,i)=>(
                <button key={p} onClick={()=>{setPriceComp(p);setStep("time");}} style={{padding:"18px 10px",borderRadius:13,border:priceComp===p?"2px solid #c94f72":"2px solid #a8c5a0",background:priceComp===p?"#c94f72":"#fff",color:priceComp===p?"#fff":"#9b2c50",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:18,fontWeight:"bold",transition:"all 0.15s",gridColumn:(i===priceTiersComp.length-1||i===priceTiersComp.length-2)?"span 2":"auto"}}>
                  {p}
                </button>
              ))}
            </div>
            <p style={{fontSize:11,color:"#c49090",fontStyle:"italic",margin:"12px 0 4px",textAlign:"center"}}>{notes.compMinOrder}</p>
            <button onClick={()=>setStep("noteComp")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── TIME ── */}
        {step==="time"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Prenotazione per</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>📅 {selDateStr}</div>
              <div style={{color:"#c49090",fontSize:13}}>{service?.label}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:11,fontSize:14}}>Scegli l&apos;orario:</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
              {TIME_SLOTS.map(t=>{
                const booked=getBookedTimes().includes(t), sel=time===t;
                return (
                  <button key={t} onClick={()=>!booked&&setTime(t)} disabled={booked} style={{padding:"10px 4px",borderRadius:10,border:sel?"2px solid #c94f72":booked?"2px solid #f0d5cc":"2px solid #f5d5cc",background:sel?"#c94f72":booked?"#f8f4f2":"#fff",color:sel?"#fff":booked?"#ccc":"#9b2c50",cursor:booked?"not-allowed":"pointer",fontFamily:"Georgia,serif",fontSize:13,fontWeight:sel?"bold":"normal",transition:"all 0.15s"}}>
                    {booked?<s>{t}</s>:t}
                  </button>
                );
              })}
            </div>
            {time&&<button onClick={()=>setStep(service?.id==="appuntamento"?"evento":"delivery")} style={{...GB,width:"100%",marginTop:16,fontSize:14}}>Continua →</button>}
            <button onClick={()=>setStep(service?.id==="bouquet"?"price":service?.id==="composizione"?"priceComp":"service")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── EVENTO ── */}
        {step==="evento"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #b8a9c9"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Consulenza per</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>📅 {selDateStr} • {time}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:14,fontSize:14}}>🎊 Raccontaci il tuo evento</div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <div>
                <label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:6}}>Tipo di evento *</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7}}>
                  {["💍 Matrimonio","🎂 Compleanno","🍼 Battesimo","🤝 Cerimonia","🎓 Laurea","💼 Evento aziendale","✨ Altro"].map(t=>(
                    <button key={t} onClick={()=>setEvento(p=>({...p,tipo:t}))} style={{padding:"10px 8px",borderRadius:10,border:evento.tipo===t?"2px solid #c94f72":"2px solid #f5d5cc",background:evento.tipo===t?"#c94f72":"#fff",color:evento.tipo===t?"#fff":"#9b2c50",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:12,transition:"all 0.15s"}}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>Data dell&apos;evento *</label>
                <input type="date" value={evento.data} onChange={e=>setEvento(p=>({...p,data:e.target.value}))} style={IS}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>Luogo dell&apos;evento</label>
                <input type="text" value={evento.luogo} onChange={e=>setEvento(p=>({...p,luogo:e.target.value}))} placeholder="Es. Villa Rossi, Catanzaro" style={IS}/>
              </div>
            </div>
            <button onClick={()=>setStep("form")} disabled={!evento.tipo||!evento.data} style={{...GB,width:"100%",marginTop:14,fontSize:14,opacity:evento.tipo&&evento.data?1:0.5,cursor:evento.tipo&&evento.data?"pointer":"not-allowed"}}>Continua →</button>
            <button onClick={()=>setStep("time")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── DELIVERY ── */}
        {step==="delivery"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{color:"#c49090",fontSize:12}}>Prenotazione per</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>📅 {selDateStr} • {time}</div>
              <div style={{color:"#c49090",fontSize:13}}>{service?.label}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:14,fontSize:14}}>Ritiro o consegna?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                {id:"ritiro", icon:"🏪", title:"Ritiro in studio", sub:null, badge:"GRATUITO", bc:"#a8c5a0"},
                {id:"acconia", icon:"🚚", title:"Consegna — Acconia (CZ)", sub:"Consegna a domicilio in zona Acconia", badge:"2€", bc:"#f5c97e"},
                {id:"dintorni", icon:"🗺️", title:"Consegna — Dintorni e oltre", sub:"Fuori zona Acconia", badge:"DA 6€", bc:"#e8a598"},
              ].map(opt=>(
                <button key={opt.id} onClick={()=>{setDelivery(opt.id);setStep(opt.id==="ritiro"?"payment":"form");}} style={{padding:"15px 16px",borderRadius:14,border:delivery===opt.id?"2px solid #c94f72":"2px solid #f5d5cc",background:delivery===opt.id?"#c94f72":"#fff",cursor:"pointer",textAlign:"left",fontFamily:"Georgia,serif",color:delivery===opt.id?"#fff":"#9b2c50",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:24}}>{opt.icon}</span>
                    <div>
                      <div style={{fontWeight:"bold",fontSize:13}}>{opt.title}</div>
                      {opt.id==="ritiro"&&<div style={{fontSize:11,opacity:0.75,marginTop:2,lineHeight:1.5}}>{studioAddress.nome}<br/>{studioAddress.via}<br/>{studioAddress.cap} {studioAddress.citta}</div>}
                      {opt.sub&&<div style={{fontSize:11,opacity:0.75,marginTop:2}}>{opt.sub}</div>}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:"bold",background:delivery===opt.id?"rgba(255,255,255,0.2)":opt.bc+"44",color:delivery===opt.id?"#fff":"#9b2c50",padding:"4px 10px",borderRadius:20}}>{opt.badge}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setStep("time")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── STRIPE ── */}
        {showStripe&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Pagamento sicuro con Stripe</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>{service?.label}</div>
            </div>
            <StripePayment
              amount={parseFloat((price||priceComp||"0").replace(/[^0-9.]/g,""))||0}
              description={service?.label+" — "+selDateStr}
              onSuccess={()=>{ setShowStripe(false); doConfirm(stripePid); }}
              onBack={()=>setShowStripe(false)}
            />
          </div>
        )}

        {/* ── FORM ── */}
        {step==="form"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{color:"#c49090",fontSize:12}}>Riepilogo prenotazione</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>{selDateStr}{time&&time!=="—"?` • ${time}`:""}</div>
              <div style={{color:"#c49090",fontSize:13}}>{service?.label}{price?` — ${price}`:""}{priceComp?` — ${priceComp}`:""}</div>
              {delivery&&<div style={{fontSize:12,color:"#e8998a",marginTop:2}}>{delivery==="ritiro"?"🏪 Ritiro in studio":delivery==="acconia"?"🚚 Acconia (2€)":"🗺️ Dintorni (da 6€)"}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {[{k:"name",l:"Nome e Cognome *",t:"text",p:"Es. Maria Rossi"},{k:"phone",l:"Telefono *",t:"tel",p:"Es. 333 1234567"},{k:"email",l:"Email (per conferma automatica)",t:"email",p:"Es. maria@email.it"},{k:"note",l:"Note",t:"text",p:"Indicazioni sulla consegna, ecc..."}].map(f=>(
                <div key={f.k}>
                  <label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>{f.l}</label>
                  {f.k==="note"
                    ?<textarea value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} rows={3} style={IS}/>
                    :<input type={f.t} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} style={IS}/>
                  }
                </div>
              ))}
              {(delivery==="acconia"||delivery==="dintorni")&&(
                <div>
                  <div style={{fontSize:12,fontWeight:"bold",color:"#9b2c50",marginBottom:8,paddingTop:8,borderTop:"1px solid #fdf0ec"}}>📍 Indirizzo di consegna *</div>
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    <div style={{display:"flex",gap:9}}>
                      <div style={{flex:3}}><label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>Via / Piazza *</label><input value={form.via} onChange={e=>setForm(p=>({...p,via:e.target.value}))} placeholder="Es. Via Roma" style={IS}/></div>
                      <div style={{flex:1}}><label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>N° *</label><input value={form.civico} onChange={e=>setForm(p=>({...p,civico:e.target.value}))} placeholder="12" style={IS}/></div>
                    </div>
                    <div style={{display:"flex",gap:9}}>
                      <div style={{flex:3}}><label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>Città *</label><input value={form.citta} onChange={e=>setForm(p=>({...p,citta:e.target.value}))} placeholder="Es. Acconia" style={IS}/></div>
                      <div style={{flex:1}}><label style={{display:"block",fontSize:12,color:"#c49090",marginBottom:4}}>CAP *</label><input value={form.cap} onChange={e=>setForm(p=>({...p,cap:e.target.value}))} placeholder="88040" style={IS}/></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {form.email&&<div style={{marginTop:8,fontSize:11,color:"#e8998a",background:"#fce8e4",borderRadius:8,padding:"6px 10px"}}>✉️ Verrà generata un&apos;email di conferma personalizzata</div>}
            <button
              onClick={()=>(delivery==="acconia"||delivery==="dintorni")?setStep("payment"):doConfirm()}
              disabled={!form.name||!form.phone||((delivery==="acconia"||delivery==="dintorni")&&(!form.via||!form.civico||!form.citta||!form.cap))}
              style={{...GB,width:"100%",marginTop:14,fontSize:14,opacity:(form.name&&form.phone&&(delivery===null||delivery==="ritiro"||(form.via&&form.civico&&form.citta&&form.cap)))?1:0.5,cursor:(form.name&&form.phone&&(delivery===null||delivery==="ritiro"||(form.via&&form.civico&&form.citta&&form.cap)))?"pointer":"not-allowed"}}>
              {service?.id==="giftcard"?"🎁 Conferma Acquisto":(delivery==="acconia"||delivery==="dintorni")?"Continua →":"🌸 Conferma Prenotazione"}
            </button>
            <button onClick={()=>setStep(service?.id==="appuntamento"?"evento":service?.id==="giftcard"?"noteGift":delivery==="ritiro"?"payment":"delivery")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── PAYMENT ── */}
        {step==="payment"&&(
          <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #f5d5cc"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{color:"#c49090",fontSize:12}}>Prenotazione per</div>
              <div style={{color:"#9b2c50",fontWeight:"bold",fontSize:15,marginTop:3}}>📅 {selDateStr}{time&&time!=="—"?` • ${time}`:""}</div>
              <div style={{color:"#c49090",fontSize:13}}>{delivery==="ritiro"?"🏪 Ritiro in studio":delivery==="acconia"?"🚚 Consegna Acconia":"🗺️ Consegna dintorni"}</div>
            </div>
            <div style={{fontWeight:"bold",color:"#9b2c50",marginBottom:14,fontSize:14}}>💳 Modalità di pagamento</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {activePayments().map(opt=>(
                <button key={opt.id} onClick={()=>{ setPayment(opt.id); if(opt.id==="carta"||opt.id==="paypal"){ setStripePid(opt.id); setShowStripe(true); } else if(service?.id==="giftcard") doConfirm(opt.id); else if(delivery==="ritiro") setStep("form"); else doConfirm(opt.id); }} style={{padding:"15px 18px",borderRadius:14,border:payment===opt.id?"2px solid #c94f72":"2px solid #f5d5cc",background:payment===opt.id?"#c94f72":"#fff",cursor:"pointer",textAlign:"left",fontFamily:"Georgia,serif",color:payment===opt.id?"#fff":"#9b2c50",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s"}}>
                  <span style={{fontSize:24}}>{opt.icon}</span>
                  <div><div style={{fontWeight:"bold",fontSize:13}}>{opt.title}</div><div style={{fontSize:11,opacity:0.75,marginTop:2}}>{opt.sub}</div></div>
                </button>
              ))}
            </div>
            <button onClick={()=>setStep(service?.id==="giftcard"?"noteGift":delivery==="ritiro"?"delivery":"form")} style={BB}>← Indietro</button>
          </div>
        )}

        {/* ── CONFIRM ── */}
        {step==="confirm"&&confirmed&&(
          <div style={{background:"#fff",borderRadius:20,padding:26,boxShadow:"0 4px 28px rgba(169,48,88,0.09)",border:"1px solid #e8998a",textAlign:"center"}}>
            <div style={{fontSize:46,marginBottom:8}}>🌸</div>
            <h2 style={{color:"#9b2c50",fontWeight:"normal",fontSize:20,margin:"0 0 5px"}}>Prenotazione Confermata!</h2>
            <p style={{color:"#c49090",fontSize:14,margin:"0 0 18px"}}>Grazie {confirmed.name}! Ti aspettiamo.</p>
            <div style={{background:"#fef4f1",borderRadius:13,padding:16,textAlign:"left",marginBottom:16}}>
              {[
                ["📅 Data",`${confirmed.date.split("-").reverse().join("/")} `],
                ...(confirmed.time&&confirmed.time!=="—"?[["🕐 Orario",confirmed.time]]:[]),
                ["🌸 Servizio",confirmed.service.label],
                ...(confirmed.price?[["💰 Fascia",confirmed.price]]:[]),
                ...(confirmed.priceComp?[["💰 Fascia",confirmed.priceComp]]:[]),
                ...(confirmed.noteBouquet?[["📝 Note fiori",confirmed.noteBouquet]]:[]),
                ...(confirmed.noteComp?[["📝 Note composizione",confirmed.noteComp]]:[]),
                ...(confirmed.noteGift?[["🎁 Messaggio",confirmed.noteGift]]:[]),
                ...(confirmed.evento?.tipo?[["🎊 Evento",confirmed.evento.tipo]]:[]),
                ...(confirmed.evento?.data?[["📅 Data evento",confirmed.evento.data]]:[]),
                ...(confirmed.evento?.luogo?[["📍 Luogo",confirmed.evento.luogo]]:[]),
                ...(confirmed.delivery?[["📦 Modalità",confirmed.delivery==="ritiro"?"🏪 Ritiro in studio (gratuito)":confirmed.delivery==="acconia"?"🚚 Acconia — 2€":"🗺️ Dintorni — da 6€"]]:[]),
                ...((confirmed.delivery!=="ritiro"&&confirmed.via)?[["📍 Indirizzo",`${confirmed.via} ${confirmed.civico}, ${confirmed.cap} ${confirmed.citta}`]]:[]),
                ...(confirmed.payment?[["💳 Pagamento",confirmed.payment==="carta"?"💳 Carta":confirmed.payment==="paypal"?"🅿️ PayPal":"💵 Contanti/Gift card"]]:[]),
                ["👤 Nome",confirmed.name],
                ["📞 Telefono",confirmed.phone],
                ...(confirmed.email?[["📧 Email",confirmed.email]]:[]),
                ...(confirmed.note?[["📝 Note",confirmed.note]]:[]),
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:10,marginBottom:7,fontSize:13}}>
                  <span style={{color:"#c49090",minWidth:90}}>{k}</span>
                  <span style={{color:"#9b2c50",fontWeight:"bold"}}>{v}</span>
                </div>
              ))}
            </div>

            {confirmed.email&&(
              <div style={{background:"#fce8e4",borderRadius:13,padding:14,textAlign:"left",marginBottom:16}}>
                <div style={{fontWeight:"bold",color:"#9b2c50",fontSize:13,marginBottom:7}}>✉️ Email di conferma</div>
                {emailLoading
                  ?<div style={{color:"#c49090",fontSize:13,textAlign:"center",padding:10}}>🌸 Generazione...</div>
                  :<>
                    <div style={{background:"#fff",borderRadius:9,padding:11,fontSize:12,color:"#9b2c50",lineHeight:1.75,whiteSpace:"pre-wrap",border:"1px solid #f5cfc6",maxHeight:160,overflowY:"auto"}}>{emailTxt}</div>
                    <button onClick={()=>{navigator.clipboard.writeText(emailTxt);alert("Copiato!");}} style={{marginTop:9,padding:"6px 13px",borderRadius:8,border:"1px solid #f5cfc6",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer"}}>📋 Copia email</button>
                  </>
                }
              </div>
            )}

            {confirmed.service?.id==="appuntamento"&&(
              <p style={{fontSize:11,color:"#c49090",fontStyle:"italic",textAlign:"center",margin:"0 0 16px",lineHeight:1.7,padding:"0 8px"}}>{notes.consulenza}</p>
            )}
            <button onClick={reset} style={{padding:"11px 26px",borderRadius:12,border:"2px solid #c94f72",background:"#fff",color:"#9b2c50",fontFamily:"Georgia,serif",fontSize:13,cursor:"pointer"}}>← Nuova Prenotazione</button>
          </div>
        )}

      </div>
    </div>
  );
}
