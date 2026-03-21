import { useEffect, useMemo, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import VueImmobilier from './components/VueImmobilier'
import CatalogueProgrammes from './components/CatalogueProgrammes'
import MesDossiersImmo from './components/MesDossiersImmo'
import PipelineVEFA from './components/PipelineVEFA'
import OutilsCGP from './components/OutilsCGP'

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE']
const STATUS_OPTIONS = ['Signé','En cours','Prévu','Annulé']
const PRIORITY_OPTIONS = ['Normale','Haute','Urgente']
const PRODUCTS = ['PER Individuel','Assurance Vie Française','SCPI','Produits Structurés','Private Equity','Prévoyance TNS','Mutuelle Santé','Autre']
const COMPANIES = ['SwissLife','Abeille Assurances','Generali','Cardif (BNP Paribas)','Spirica','Autre']
const SOURCES = ['Téléprospection','Leads Facebook','Parrainage Client','Réseau Personnel','Site Web Entasis','LinkedIn','Autre']
const EMPTY_OBJECTIFS = MONTHS.reduce((a,m)=>{a[m]={pp_target:0,pu_target:0};return a},{})
const LEAD_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/* ─────────────────────────────────────────────────────────────────────────────
   UTILS
───────────────────────────────────────────────────────────────────────────── */
const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
const annualize = (ppm) => Number(ppm||0)*12
const uid = () => typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`deal_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
const currentMonth = () => MONTHS[new Date().getMonth()]||'MARS'
const pct = (v,t) => t>0?Math.min(999,Math.round((v/t)*100)):0
const initials = (name='') => name.split(' ').slice(0,2).map(n=>n[0]||'').join('').toUpperCase()||'?'

function emptyDeal(code='') {
  return {id:uid(),month:currentMonth(),client:'',product:'PER Individuel',pp_m:0,pu:0,advisor_code:code||'',co_advisor_code:'',source:'Téléprospection',status:'En cours',company:'SwissLife',notes:'',priority:'Normale',tags:[],date_expected:'',date_signed:'',client_phone:'',client_email:'',client_age:''}
}
function normalizeDeal(d) {
  return {...d,pp_m:Number(d.pp_m||0),pu:Number(d.pu||0),client_age:d.client_age===''||d.client_age==null?null:Number(d.client_age)}
}

const STATUS_CLASS = {
  'Signé':'badge badge-signed','En cours':'badge badge-progress',
  'Prévu':'badge badge-forecast','Annulé':'badge badge-cancelled',
}
const PRIORITY_CLASS = {
  'Urgente':'badge badge-urgent','Haute':'badge badge-high','Normale':'badge badge-normal',
}

function dealMatchesAdvisor(d,c){return d.advisor_code===c||d.co_advisor_code===c}
function isPipeline(s){return s==='En cours'||s==='Prévu'}
function sumAnnualPp(deals){return deals.reduce((s,d)=>s+annualize(d.pp_m),0)}
function sumPu(deals){return deals.reduce((s,d)=>s+Number(d.pu||0),0)}

function advisorMetrics(deals,month,code){
  const scoped=deals.filter(d=>d.month===month&&dealMatchesAdvisor(d,code))
  const signed=scoped.filter(d=>d.status==='Signé')
  const pipeline=scoped.filter(d=>isPipeline(d.status))
  const ppS=sumAnnualPp(signed), puS=sumPu(signed)
  const ppP=sumAnnualPp(pipeline), puP=sumPu(pipeline)
  return {
    total:scoped.length,signedCount:signed.length,pipelineCount:pipeline.length,
    ppSigned:ppS,puSigned:puS,ppPipeline:ppP,puPipeline:puP,
    ppProjected:ppS+ppP,puProjected:puS+puP,
    signRate:scoped.length>0?Math.round((signed.length/scoped.length)*100):0,
    avgPp:signed.length>0?ppS/signed.length:0,
    hotDeals:scoped.filter(d=>d.priority==='Urgente'||d.priority==='Haute'),
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEAL AGE UTILS
───────────────────────────────────────────────────────────────────────────── */
function dealAge(deal){
  if(!deal.created_at)return null
  return Math.floor((Date.now()-new Date(deal.created_at))/(1000*60*60*24))
}
function ageLabel(days){
  if(days===null)return null
  if(days===0)return "Auj."
  if(days===1)return "Hier"
  if(days<7)return `${days}j`
  if(days<30)return `${Math.floor(days/7)}sem`
  return `${Math.floor(days/30)}mois`
}
function ageSeverity(days,status){
  if(!isPipeline(status)||days===null)return 'ok'
  if(days>60)return 'critical'
  if(days>30)return 'warn'
  return 'ok'
}

/* ─────────────────────────────────────────────────────────────────────────────
   ICONS (inline SVG)
───────────────────────────────────────────────────────────────────────────── */
const Icon = {
  Dashboard: ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity=".8"/><rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity=".5"/><rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".5"/><rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".3"/></svg>,
  Pipeline:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="3" height="12" rx="1.5" fill="currentColor" opacity=".9"/><rect x="6.5" y="6" width="3" height="10" rx="1.5" fill="currentColor" opacity=".7"/><rect x="11" y="3" width="3" height="13" rx="1.5" fill="currentColor" opacity=".5"/><rect x="15.5" y="7" width="3" height="9" rx="1.5" fill="currentColor" opacity=".3"/></svg>,
  Dossiers:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><path d="M3 6a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" fill="currentColor" opacity=".8"/></svg>,
  Forecast:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><polyline points="2,15 6,9 10,11 14,5 18,8" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Team:      ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7" r="3" fill="currentColor" opacity=".8"/><circle cx="14" cy="7" r="2.5" fill="currentColor" opacity=".5"/><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/><path d="M14 12c2 0 4 1.5 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".5"/></svg>,
  Leads:     ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" fill="currentColor" opacity=".85"/></svg>,
  Plus:      ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  Close:     ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  Edit:      ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 1.5l2.5 2.5-7 7L2 12l.5-2.5 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Trash:     ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 3.5h10M5 3.5V2h3v1.5M3 3.5l.8 7.5h5.4l.8-7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Refresh:   ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 012 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 3.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Clock:     ()=><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  Market:    ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="10" width="2" height="6" rx=".5" fill="currentColor" opacity=".9"/><line x1="4" y1="7" x2="4" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><line x1="4" y1="16" x2="4" y2="18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><rect x="9" y="5" width="2" height="8" rx=".5" fill="currentColor" opacity=".7"/><line x1="10" y1="2" x2="10" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5"/><line x1="10" y1="13" x2="10" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5"/><rect x="15" y="7" width="2" height="7" rx=".5" fill="currentColor" opacity=".5"/><line x1="16" y1="4" x2="16" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".4"/><line x1="16" y1="14" x2="16" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".4"/></svg>,
  Calendar:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8"/><path d="M3 8h14" stroke="currentColor" strokeWidth="1.2" opacity=".5"/><path d="M7 2v3M13 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><circle cx="7" cy="12" r="1" fill="currentColor" opacity=".6"/><circle cx="10" cy="12" r="1" fill="currentColor" opacity=".4"/><circle cx="13" cy="12" r="1" fill="currentColor" opacity=".4"/></svg>,
  CalPlus:   ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M1.5 5.5h10M4.5 1v2M8.5 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M6.5 7.5v2M5.5 8.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  Link:      ()=><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 7L7.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M4 5.5l-1 1a2.121 2.121 0 003 3l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M8 6.5l1-1a2.121 2.121 0 00-3-3l-1 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Phone:     ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2.5c0 5.5 3 8.5 8.5 8.5l1-2.5-2-1-1 1c-1.5-.5-3-2-3.5-3.5l1-1-1-2L2 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/></svg>,
  Mail:      ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="3" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M1.5 4l5 3.5L11.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  Prospect:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><circle cx="7.5" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".85"/><path d="M2.5 17c0-3 2.2-5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/><path d="M12.5 12l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".7"/></svg>,
  Copy:      ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M9 4V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V8a1 1 0 001 1H4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Building:  ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="12" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8"/><rect x="7" y="6" width="2" height="2" rx=".5" fill="currentColor" opacity=".6"/><rect x="11" y="6" width="2" height="2" rx=".5" fill="currentColor" opacity=".6"/><rect x="7" y="10" width="2" height="2" rx=".5" fill="currentColor" opacity=".5"/><rect x="11" y="10" width="2" height="2" rx=".5" fill="currentColor" opacity=".5"/><rect x="8.5" y="14" width="3" height="4" rx=".5" fill="currentColor" opacity=".7"/></svg>,
  Catalogue: ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".8"/><rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".6"/><rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".6"/><rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".4"/></svg>,
  ImmoFolder:()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><path d="M3 6a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" fill="currentColor" opacity=".6"/><rect x="7" y="9" width="2" height="2" rx=".3" fill="currentColor" opacity=".9"/><rect x="10" y="9" width="2" height="2" rx=".3" fill="currentColor" opacity=".7"/></svg>,
  Kanban:    ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".8"/><rect x="8" y="3" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".6"/><rect x="14" y="3" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".5"/></svg>,
  Outils:    ()=><svg className="nav-item-icon" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1M4.2 15.8l2.1-2.1M13.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".6"/></svg>,
}

/* ─────────────────────────────────────────────────────────────────────────────
   AGE BADGE
───────────────────────────────────────────────────────────────────────────── */
function AgeBadge({deal,compact=false}){
  const days=dealAge(deal)
  if(days===null)return null
  const sev=ageSeverity(days,deal.status)
  const label=ageLabel(days)
  const styles={
    ok:      {color:'var(--t3)',       bg:'var(--bg)',          bd:'var(--bd)'},
    warn:    {color:'var(--progress)', bg:'var(--progress-bg)', bd:'var(--progress-bd)'},
    critical:{color:'var(--cancelled)',bg:'var(--cancelled-bg)',bd:'var(--cancelled-bd)'},
  }
  const s=styles[sev]
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',gap:3,
      fontSize:compact?10:11,fontWeight:500,
      padding:compact?'1px 5px':'2px 6px',
      borderRadius:4,border:`1px solid ${s.bd}`,
      color:s.color,background:s.bg,whiteSpace:'nowrap',
    }}>
      {sev!=='ok'&&<span style={{opacity:.8}}>⚑ </span>}
      {label}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   STALE PIPELINE ALERT
───────────────────────────────────────────────────────────────────────────── */
function StalePipelineAlert({deals,onEdit}){
  const stale=deals
    .filter(d=>isPipeline(d.status))
    .map(d=>({...d,_age:dealAge(d)}))
    .filter(d=>d._age>30)
    .sort((a,b)=>b._age-a._age)

  const critical=stale.filter(d=>d._age>60)
  const warn=stale.filter(d=>d._age<=60)
  if(!stale.length)return null

  return (
    <div style={{
      background:'var(--progress-bg)',border:'1px solid var(--progress-bd)',
      borderRadius:'var(--rad-lg)',padding:'14px 18px',marginBottom:20,
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div>
          <div className="section-kicker" style={{color:'var(--progress)',marginBottom:2}}>Vieillissement pipeline</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--t1)'}}>
            {critical.length>0&&<span style={{color:'var(--cancelled)'}}>{critical.length} dossier{critical.length>1?'s':''} à risque (+60j)</span>}
            {critical.length>0&&warn.length>0&&<span style={{color:'var(--t3)'}}> · </span>}
            {warn.length>0&&<span style={{color:'var(--progress)'}}>{warn.length} dossier{warn.length>1?'s':''} en attente (+30j)</span>}
          </div>
        </div>
        <span className="text-xs text-muted">{stale.length} dossier{stale.length>1?'s':''} sans mouvement</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {stale.slice(0,5).map(deal=>(
          <div key={deal.id}
            onClick={()=>onEdit(deal)}
            style={{
              display:'flex',alignItems:'center',gap:10,
              background:'white',border:'1px solid var(--bd)',
              borderRadius:'var(--rad)',padding:'8px 12px',
              cursor:'pointer',transition:'box-shadow .15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-xs)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
          >
            <AgeBadge deal={deal} compact/>
            <span style={{fontWeight:600,fontSize:13,color:'var(--t1)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.client}</span>
            <span style={{fontSize:12,color:'var(--t3)'}}>{deal.product}</span>
            <span className={STATUS_CLASS[deal.status]||'badge'}>{deal.status}</span>
            <span style={{fontSize:12,fontWeight:600,color:'var(--t1)',minWidth:80,textAlign:'right'}}>{euro(annualize(deal.pp_m))}</span>
          </div>
        ))}
        {stale.length>5&&<div style={{fontSize:11.5,color:'var(--t3)',textAlign:'center',paddingTop:4}}>+ {stale.length-5} autres dossiers</div>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIG MISSING
───────────────────────────────────────────────────────────────────────────── */
function ConfigMissing() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">ENTASIS</div>
        <div className="auth-brand-sub">Configuration requise</div>
        <p style={{fontSize:14,color:'var(--t2)',marginBottom:16}}>
          Ajoute les variables d'environnement dans <span className="code">.env</span> ou Vercel :
        </p>
        <pre style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',padding:'12px 14px',fontSize:12.5,color:'var(--t2)',lineHeight:1.7}}>
          VITE_SUPABASE_URL=https://…supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=sb_publishable_…
        </pre>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUTH SCREEN
───────────────────────────────────────────────────────────────────────────── */
function AuthScreen() {
  const [loading,setLoading]=useState(false)
  const [msg,setMsg]=useState('')

  async function signInGoogle(){
    setLoading(true);setMsg('')
    const{error}=await supabase.auth.signInWithOAuth({
      provider:'google',
      options:{
        scopes:'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
        redirectTo:window.location.origin,
        queryParams:{access_type:'offline',prompt:'consent',hd:'entasis-conseil.fr'},
      }
    })
    if(error){setMsg(error.message);setLoading(false)}
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{textAlign:'center'}}>
        <div className="auth-brand">ENTASIS</div>
        <div className="auth-brand-sub">CRM Patrimonial · Équipe interne</div>
        <div style={{margin:'28px 0 24px',fontSize:14,color:'var(--t2)',lineHeight:1.6}}>
          Connecte-toi avec ton compte<br/>
          <strong style={{color:'var(--t1)'}}>@entasis-conseil.fr</strong>
        </div>
        <button
          className="btn btn-primary w-full"
          style={{gap:12,justifyContent:'center',padding:'12px 20px',fontSize:14}}
          disabled={loading}
          onClick={signInGoogle}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading?'Redirection…':'Se connecter avec Google'}
        </button>
        {msg&&<div className="auth-notice" style={{marginTop:16}}>{msg}</div>}
        <div style={{marginTop:16,fontSize:11.5,color:'var(--t3)',lineHeight:1.6}}>
          Accès réservé aux comptes @entasis-conseil.fr<br/>
          Google Agenda sera automatiquement connecté
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────────────────────── */
function Sidebar({profile,activeTab,setActiveTab,onSignOut,deals,month,leadsAvailable,prospectsNew,dossiersImmoCount}){
  const isManager=profile?.role==='manager'

  const hotCount=useMemo(()=>{
    const code=profile?.advisor_code
    if(!code)return 0
    return deals.filter(d=>d.month===month&&dealMatchesAdvisor(d,code)&&(d.priority==='Urgente'||d.priority==='Haute')&&isPipeline(d.status)).length
  },[deals,month,profile])

  const pipelineCount=useMemo(()=>deals.filter(d=>d.month===month&&isPipeline(d.status)).length,[deals,month])

  const navItems = [
    {key:'dashboard', label: isManager?'Vue cabinet':'Mon mois', Icon:Icon.Dashboard},
    {key:'leads',     label:'Leads Live',  Icon:Icon.Leads, badge:leadsAvailable||0, badgeGold:true},
    {key:'pipeline',  label:'Pipeline',  Icon:Icon.Pipeline,  badge:isManager?pipelineCount:hotCount},
    {key:'dossiers',  label:'Dossiers',  Icon:Icon.Dossiers},
    {key:'forecast',  label:'Prévisionnel', Icon:Icon.Forecast},
    {key:'agenda',    label:'Agenda',    Icon:Icon.Calendar},
    {key:'market',    label:'Marchés',   Icon:Icon.Market},
    {key:'prospection', label:'Prospection', Icon:Icon.Prospect, badge:prospectsNew},
    ...(isManager?[{key:'team', label:'Équipe', Icon:Icon.Team}]:[]),
    {key:'outils', label:'Outils CGP', Icon:Icon.Outils},
  ]

  const immoItems = [
    {key:'immo-dashboard', label:'Vue Immo', Icon:Icon.Building},
    {key:'immo-programmes', label:'Programmes', Icon:Icon.Catalogue},
    {key:'immo-dossiers', label:'Mes Dossiers', Icon:Icon.ImmoFolder, badge:dossiersImmoCount||0},
    {key:'immo-pipeline', label:'Pipeline VEFA', Icon:Icon.Kanban},
  ]

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-wordmark">ENTASIS</div>
        <div className="brand-sub">CRM Patrimonial</div>
      </div>
      <div className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(({key,label,Icon:NavIcon,badge,badgeGold})=>(
          <button key={key} className={`nav-item${activeTab===key?' active':''}`} onClick={()=>setActiveTab(key)}>
            <NavIcon/>
            {label}
            {badge>0&&(
              <span className="nav-item-badge" style={badgeGold?{background:'var(--gold)',color:'white'}:{}}>
                {badge}
              </span>
            )}
          </button>
        ))}
        <div className="nav-divider"/>
        <div className="nav-section-label">Immobilier Neuf</div>
        {immoItems.map(({key,label,Icon:NavIcon,badge})=>(
          <button key={key} className={`nav-item${activeTab===key?' active':''}`} onClick={()=>setActiveTab(key)}>
            <NavIcon/>
            {label}
            {badge>0&&(
              <span className="nav-item-badge">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{initials(profile?.full_name||profile?.email||'U')}</div>
          <div>
            <div className="user-name">{profile?.full_name||profile?.email||'Utilisateur'}</div>
            <div className="user-role">{profile?.role==='manager'?'Direction':'Conseiller'}{profile?.role!=='manager'&&profile?.advisor_code?` · ${profile.advisor_code}`:''}</div>
          </div>
        </div>
        <button className="btn-signout" onClick={onSignOut}>Se déconnecter</button>
      </div>
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TOP BAR
───────────────────────────────────────────────────────────────────────────── */
const PAGE_TITLES={dashboard:'Vue d\'ensemble',pipeline:'Pipeline commercial',dossiers:'Dossiers clients',forecast:'Prévisionnel',agenda:'Agenda & Relances',market:'Marchés financiers 📈',team:'Équipe',leads:'Leads Live ⚡',prospection:'Prospection LinkedIn','immo-dashboard':'Immobilier Neuf','immo-programmes':'Catalogue Programmes','immo-dossiers':'Mes Dossiers Immobilier','immo-pipeline':'Pipeline VEFA',outils:'Outils CGP'}

function TopBar({activeTab,month,setMonth,onNewDeal,onRefresh}){
  return (
    <div className="topbar">
      <div className="topbar-title">{PAGE_TITLES[activeTab]||'CRM'}</div>
      <div className="topbar-actions">
        {activeTab!=='leads'&&activeTab!=='prospection'&&(
          <select className="month-select" value={month} onChange={e=>setMonth(e.target.value)}>
            {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><Icon.Refresh/></button>
        {activeTab!=='leads'&&activeTab!=='prospection'&&<button className="btn btn-gold" onClick={onNewDeal}><Icon.Plus/> Nouveau dossier</button>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEAD TIMER HOOK — countdown 30min depuis taken_at
───────────────────────────────────────────────────────────────────────────── */
function useLeadTimer(lead){
  const [remaining,setRemaining]=useState(null)
  useEffect(()=>{
    if(lead.status!=='contacted'||!lead.taken_at){setRemaining(null);return}
    function calc(){
      const elapsed=Date.now()-new Date(lead.taken_at).getTime()
      const rem=Math.max(0,LEAD_TIMEOUT_MS-elapsed)
      setRemaining(rem)
      return rem
    }
    calc()
    const iv=setInterval(()=>{const r=calc();if(r===0)clearInterval(iv)},1000)
    return()=>clearInterval(iv)
  },[lead.status,lead.taken_at])
  return remaining
}

function TimerBadge({remaining}){
  if(remaining===null)return null
  const mins=Math.floor(remaining/60000)
  const secs=Math.floor((remaining%60000)/1000)
  const urgent=remaining<5*60000
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,
      padding:'2px 7px',borderRadius:4,fontVariantNumeric:'tabular-nums',
      background:urgent?'var(--cancelled-bg)':'var(--progress-bg)',
      border:`1px solid ${urgent?'var(--cancelled-bd)':'var(--progress-bd)'}`,
      color:urgent?'var(--cancelled)':'var(--progress)',
    }}>
      <Icon.Clock/> {mins}:{secs.toString().padStart(2,'0')}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEAD CARD
───────────────────────────────────────────────────────────────────────────── */
function LeadCard({lead,profile,onTake,onRelease,onCreateRDV,onConvertDeal}){
  const remaining=useLeadTimer(lead)
  const isMyLead=lead.taken_by===profile?.id
  const isTaken=lead.status==='contacted'
  const isBooked=lead.status==='booked'
  const isAvailable=lead.status==='available'||lead.status==='released'
  const isDead=lead.status==='dead'
  const campagneColor={'SUCCESSION':'#7C3AED','LEADS':'#0EA5E9','REUNION':'#10B981'}
  const cc=campagneColor[lead.campagne]||'#6B7280'

  return (
    <div style={{
      background:isMyLead?'rgba(192,155,90,0.04)':isBooked?'rgba(16,185,129,0.04)':'white',
      border:`1.5px solid ${isMyLead?'var(--gold-line)':isBooked?'rgba(16,185,129,0.3)':'var(--bd)'}`,
      borderRadius:'var(--rad-lg)',padding:'11px 13px',
      opacity:isTaken&&!isMyLead?0.5:1,transition:'all .2s',
    }}>
      {/* Ligne 1 — campagne + statut + timer */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,flexWrap:'wrap'}}>
        <span style={{fontSize:9.5,fontWeight:700,letterSpacing:'0.06em',padding:'1px 6px',borderRadius:3,background:cc+'18',color:cc,border:`1px solid ${cc}30`}}>{lead.campagne}</span>
        {isMyLead&&remaining!==null&&<TimerBadge remaining={remaining}/>}
        {isBooked&&<span style={{fontSize:9.5,fontWeight:700,color:'#10B981',background:'rgba(16,185,129,0.1)',padding:'1px 6px',borderRadius:3,border:'1px solid rgba(16,185,129,0.2)'}}>✓ RDV</span>}
        {isTaken&&!isMyLead&&!isBooked&&<span style={{fontSize:9.5,color:'var(--t3)',padding:'1px 5px',borderRadius:3,background:'var(--bg)',border:'1px solid var(--bd)'}}>En appel</span>}
        <span style={{marginLeft:'auto',fontSize:10,color:'var(--t3)'}}>
          {lead.created_at?new Date(lead.created_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}
        </span>
      </div>

      {/* Ligne 2 — nom */}
      <div style={{fontSize:13.5,fontWeight:700,color:'var(--t1)',marginBottom:7,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.nom}</div>

      {/* Ligne 3 — contact */}
      <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
        {lead.telephone&&(
          <a href={`tel:${lead.telephone}`} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:12,fontWeight:600,color:'var(--t1)',textDecoration:'none'}}>
            <Icon.Phone/> {lead.telephone}
          </a>
        )}
        {lead.email&&(
          <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,color:'var(--t3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            <Icon.Mail/> {lead.email}
          </span>
        )}
      </div>

      {/* Ligne 4 — profil financier inline */}
      {(lead.patrimoine_net||lead.tmi||lead.actifs)&&(
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
          {lead.patrimoine_net&&<span style={{fontSize:10.5,color:'#7C3AED',background:'rgba(124,58,237,0.06)',border:'1px solid rgba(124,58,237,0.15)',borderRadius:3,padding:'2px 6px',fontWeight:500}}>💰 {lead.patrimoine_net}</span>}
          {lead.tmi&&<span style={{fontSize:10.5,color:'#0EA5E9',background:'rgba(14,165,233,0.06)',border:'1px solid rgba(14,165,233,0.15)',borderRadius:3,padding:'2px 6px',fontWeight:500}}>TMI {lead.tmi}</span>}
          {lead.actifs&&<span style={{fontSize:10.5,color:'var(--t3)',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:3,padding:'2px 6px'}}>🏠 {lead.actifs.length>22?lead.actifs.slice(0,22)+'…':lead.actifs}</span>}
        </div>
      )}

      {/* Actions */}
      <div style={{display:'flex',gap:6}}>
        {isAvailable&&(
          <button onClick={()=>onTake(lead)}
            style={{flex:1,padding:'7px 10px',background:'var(--gold)',color:'white',border:'none',borderRadius:'var(--rad)',fontSize:12,fontWeight:700,cursor:'pointer'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            ⚡ Je prends ce lead
          </button>
        )}
        {isMyLead&&!isBooked&&(
          <>
            <button onClick={()=>onCreateRDV(lead)}
              style={{flex:1,padding:'7px 10px',background:'#10B981',color:'white',border:'none',borderRadius:'var(--rad)',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
              <Icon.CalPlus/> RDV
            </button>
            <button onClick={()=>onRelease(lead)}
              style={{padding:'7px 10px',background:'transparent',color:'var(--t3)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:11,cursor:'pointer'}}>
              ↩
            </button>
          </>
        )}
        {isBooked&&isMyLead&&(
          <button onClick={()=>onConvertDeal(lead)}
            style={{flex:1,padding:'7px 10px',background:'var(--gold)',color:'white',border:'none',borderRadius:'var(--rad)',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
            <Icon.Plus/> Créer dossier
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEAD RDV MODAL — création Google Calendar depuis un lead
───────────────────────────────────────────────────────────────────────────── */
function LeadRDVModal({open,lead,onClose,onBooked}){
  const [date,setDate]=useState('')
  const [time,setTime]=useState('10:00')
  const [duration,setDuration]=useState('60')
  const [email,setEmail]=useState('')
  const [notes,setNotes]=useState('')

  useEffect(()=>{
    if(open&&lead){
      setDate(new Date().toISOString().slice(0,10))
      setTime('10:00');setDuration('60')
      setEmail(lead.email_confirmed||lead.email||'')
      setNotes('')
    }
  },[open,lead])

  if(!open||!lead)return null

  function toGCalTs(d){return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').slice(0,15)+'Z'}

  async function handleCreate(){
    if(!date||!time)return
    const start=new Date(`${date}T${time}:00`)
    const end=new Date(start.getTime()+Number(duration)*60000)
    const description=[
      `📞 Lead ${lead.campagne} — ${lead.nom}`,
      lead.telephone?`📱 Tél : ${lead.telephone}`:'',
      email?`📧 Email : ${email}`:'',
      lead.patrimoine_net?`💰 Patrimoine : ${lead.patrimoine_net}`:'',
      lead.tmi?`📊 TMI : ${lead.tmi}`:'',
      lead.actifs?`🏠 Actifs : ${lead.actifs}`:'',
      notes?`\n📝 ${notes}`:'',
      `\n🔗 Entasis CRM · Lead ID : ${lead.id}`,
    ].filter(Boolean).join('\n')

    const params=new URLSearchParams({
      action:'TEMPLATE',
      text:`RDV ${lead.nom} — Lead ${lead.campagne}`,
      dates:`${toGCalTs(start)}/${toGCalTs(end)}`,
      details:description,
    })
    window.open(`https://calendar.google.com/calendar/r/eventedit?${params}`,'_blank')

    // Marquer comme booké
    await supabase.from('leads').update({
      status:'booked',
      booked_at:new Date().toISOString(),
      email_confirmed:email||lead.email,
    }).eq('id',lead.id)

    onBooked(lead.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal-panel" style={{maxWidth:520}}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Créer un RDV Google Calendar</div>
            <div className="modal-subtitle">{lead.nom} · Campagne {lead.campagne}</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close/></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Email client (confirme ou corrige)</label>
            <input className="form-input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="client@exemple.fr" type="email"/>
            <div className="form-hint">L'email du formulaire Facebook peut différer de l'email réel</div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Date du RDV</label>
              <input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Heure</label>
              <input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)}/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Durée</label>
            <select className="form-select" value={duration} onChange={e=>setDuration(e.target.value)}>
              {['30','45','60','90','120'].map(d=><option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optionnel)</label>
            <textarea className="form-textarea" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contexte, objectifs, points à préparer…"/>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-gold" onClick={handleCreate} disabled={!date||!time}>
            <Icon.CalPlus/> Ouvrir dans Google Agenda
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEAD ROOM — onglet complet
───────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────────
   LEAD ROW — vue liste compacte
───────────────────────────────────────────────────────────────────────────── */
function LeadRow({lead,profile,onTake,onRelease,onCreateRDV,onConvertDeal,onReset,onKill}){
  const remaining=useLeadTimer(lead)
  const isMyLead=lead.taken_by===profile?.id
  const isBooked=lead.status==='booked'
  const isTaken=lead.status==='contacted'
  const isAvailable=lead.status==='available'||lead.status==='released'
  const isDead=lead.status==='dead'
  const campagneColor={'SUCCESSION':'#7C3AED','LEADS':'#0EA5E9','REUNION':'#10B981'}
  const cc=campagneColor[lead.campagne]||'#6B7280'

  return (
    <div style={{
      display:'grid',gridTemplateColumns:'100px 150px 128px 170px 100px 70px 220px 100px',
      alignItems:'center',
      minHeight:36,
      borderBottom:'1px solid var(--bd)',
      background:isMyLead?'rgba(192,155,90,0.05)':isBooked?'rgba(16,185,129,0.04)':'transparent',
      opacity:isDead?0.35:isTaken&&!isMyLead?0.45:1,textDecoration:isDead?'line-through':'none',
    }}
    onMouseEnter={e=>e.currentTarget.style.background='rgba(192,155,90,0.07)'}
    onMouseLeave={e=>e.currentTarget.style.background=isMyLead?'rgba(192,155,90,0.05)':isBooked?'rgba(16,185,129,0.04)':'transparent'}
    >
      <div style={{padding:'0 8px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',height:'100%'}}>
        <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:2,background:cc+'15',color:cc,border:`1px solid ${cc}25`,whiteSpace:'nowrap'}}>{lead.campagne}</span>
      </div>
      <div style={{padding:'0 10px',borderRight:'1px solid var(--bd)',overflow:'hidden',height:'100%',display:'flex',alignItems:'center'}}>
        <span style={{fontWeight:600,fontSize:12.5,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.nom}</span>
      </div>
      <div style={{padding:'0 10px',borderRight:'1px solid var(--bd)',height:'100%',display:'flex',alignItems:'center'}}>
        {lead.telephone
          ?<a href={`tel:${lead.telephone}`} style={{fontSize:12,fontWeight:500,color:'var(--t1)',textDecoration:'none',whiteSpace:'nowrap'}}>{lead.telephone}</a>
          :<span style={{color:'var(--t3)',fontSize:11}}>—</span>}
      </div>
      <div style={{padding:'0 10px',borderRight:'1px solid var(--bd)',overflow:'hidden',height:'100%',display:'flex',alignItems:'center'}}>
        <span style={{fontSize:11,color:'var(--t3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.email||'—'}</span>
      </div>
      <div style={{padding:'0 8px',borderRight:'1px solid var(--bd)',height:'100%',display:'flex',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#7C3AED',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lead.patrimoine_net||'—'}</span>
      </div>
      <div style={{padding:'0 8px',borderRight:'1px solid var(--bd)',height:'100%',display:'flex',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#0EA5E9',fontWeight:500}}>{lead.tmi||'—'}</span>
      </div>
      <div style={{padding:'0 8px',display:'flex',alignItems:'center',gap:5,height:'100%'}}>
        {isAvailable&&(
          <button onClick={()=>onTake(lead)} style={{padding:'4px 10px',background:'var(--gold)',color:'white',border:'none',borderRadius:4,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
            ⚡ Je prends
          </button>
        )}
        {isMyLead&&!isBooked&&(
          <>
            {remaining!==null&&<TimerBadge remaining={remaining}/>}
            <button onClick={()=>onCreateRDV(lead)} style={{padding:'4px 8px',background:'#10B981',color:'white',border:'none',borderRadius:4,fontSize:11,fontWeight:600,cursor:'pointer'}}>RDV</button>
            <button onClick={()=>onRelease(lead)} style={{padding:'4px 6px',background:'transparent',color:'var(--t3)',border:'1px solid var(--bd)',borderRadius:4,fontSize:11,cursor:'pointer'}}>↩</button>
          </>
        )}
        {isBooked&&(
          <span style={{fontSize:10,fontWeight:700,color:'#10B981',whiteSpace:'nowrap'}}>✓ RDV planifié</span>
        )}
        {isBooked&&isMyLead&&(
          <button onClick={()=>onConvertDeal(lead)} style={{padding:'4px 8px',background:'var(--gold)',color:'white',border:'none',borderRadius:4,fontSize:11,cursor:'pointer'}}>+ Dossier</button>
        )}
        {isTaken&&!isMyLead&&!isBooked&&!isDead&&(
          <span style={{fontSize:10,color:'var(--t3)'}}>En appel…</span>
        )}
        {isDead&&(
          <span style={{fontSize:10,color:'#9CA3AF',fontStyle:'italic'}}>✕ Mort</span>
        )}
        {isMyLead&&!isBooked&&!isDead&&(
          <button onClick={()=>onKill(lead)} title="Marquer non-intéressé" style={{padding:'3px 6px',background:'transparent',color:'#9CA3AF',border:'1px solid #E5E7EB',borderRadius:4,fontSize:10,cursor:'pointer'}}>💀</button>
        )}
        {(profile?.role==='manager'||(isMyLead))&&!isAvailable&&(
          <button onClick={()=>onReset(lead)} title="Annuler / remettre disponible" style={{padding:'3px 6px',background:'transparent',color:'#EF4444',border:'1px solid #FCA5A5',borderRadius:4,fontSize:10,cursor:'pointer',marginLeft:'auto'}}>✕</button>
        )}
      </div>
      <div style={{padding:'0 8px',height:'100%',display:'flex',alignItems:'center',borderLeft:'1px solid var(--bd)'}}>
        <span style={{fontSize:10.5,color:'var(--t3)',whiteSpace:'nowrap'}}>
          {lead.created_at?new Date(lead.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}
        </span>
      </div>
    </div>
  )
}

function LeadRoom({leads,profile,onLeadsChange,onConvertDeal,onRefresh}){
  const [rdvLead,setRdvLead]=useState(null)
  const [rdvOpen,setRdvOpen]=useState(false)
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [campagneF,setCampagneF]=useState('all')
  const [sort,setSort]=useState('newest') // newest | oldest | campagne
  const [viewMode,setViewMode]=useState('list') // cards | list
  const [page,setPage]=useState(1)
  const PAGE_SIZE=viewMode==='cards'?18:50

  // Reset page quand filtre change
  useEffect(()=>setPage(1),[filter,search,campagneF,sort,viewMode])

  // Auto-release après 30 min
  useEffect(()=>{
    const iv=setInterval(async()=>{
      const now=Date.now()
      const toRelease=leads.filter(l=>{
        if(l.status!=='contacted'||!l.taken_at)return false
        return(now-new Date(l.taken_at).getTime())>LEAD_TIMEOUT_MS
      })
      for(const lead of toRelease){
        await supabase.from('leads').update({status:'released',taken_by:null,taken_at:null}).eq('id',lead.id)
      }
    },15000)
    return()=>clearInterval(iv)
  },[leads])

  async function takeLead(lead){
    const{error}=await supabase.from('leads').update({
      status:'contacted',taken_by:profile.id,taken_at:new Date().toISOString(),
    }).eq('id',lead.id).in('status',['available','released'])
    if(error)alert('Ce lead vient d\'être pris par un autre conseiller.')
  }

  async function releaseLead(lead){
    if(!window.confirm('Libérer ce lead pour qu\'un autre conseiller puisse le prendre ?'))return
    await supabase.from('leads').update({status:'released',taken_by:null,taken_at:null}).eq('id',lead.id)
  }
  async function resetLead(lead){
    if(!window.confirm(`Remettre "${lead.nom}" en disponible ?`))return
    await supabase.from('leads').update({status:'available',taken_by:null,taken_at:null,booked_at:null}).eq('id',lead.id)
  }
  async function killLead(lead){
    if(!window.confirm(`Marquer "${lead.nom}" comme non-interesse ?`))return
    await supabase.from('leads').update({status:'dead',taken_by:profile.id}).eq('id',lead.id)
  }

  function handleBooked(leadId){
    onLeadsChange(prev=>prev.map(l=>l.id===leadId?{...l,status:'booked',booked_at:new Date().toISOString()}:l))
  }

  const available=leads.filter(l=>l.status==='available'||l.status==='released')
  const dead=leads.filter(l=>l.status==='dead')
  const mine=leads.filter(l=>l.taken_by===profile?.id&&l.status==='contacted')
  const myBooked=leads.filter(l=>l.taken_by===profile?.id&&l.status==='booked')
  const otherContacted=leads.filter(l=>l.status==='contacted'&&l.taken_by!==profile?.id)
  const booked=leads.filter(l=>l.status==='booked')
  const campagnes=[...new Set(leads.map(l=>l.campagne))].sort()

  // Pipeline de filtrage + tri
  const filtered=useMemo(()=>{
    let list=
      filter==='mine'      ?[...mine,...myBooked]:
      filter==='available' ?available:
      [...available,...mine,...otherContacted,...booked,...dead]

    // filtre campagne
    if(campagneF!=='all')list=list.filter(l=>l.campagne===campagneF)

    // recherche
    if(search.trim()){
      const q=search.toLowerCase()
      list=list.filter(l=>`${l.nom||''} ${l.telephone||''} ${l.email||''} ${l.patrimoine_net||''} ${l.tmi||''}`.toLowerCase().includes(q))
    }

    // tri
    if(sort==='newest')list=[...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
    else if(sort==='oldest')list=[...list].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
    else if(sort==='campagne')list=[...list].sort((a,b)=>(a.campagne||'').localeCompare(b.campagne||''))

    return list
  },[leads,filter,campagneF,search,sort,mine,myBooked,available,otherContacted,booked])

  const totalPages=Math.ceil(filtered.length/PAGE_SIZE)
  const paginated=filtered.slice(0,(page)*PAGE_SIZE)
  const hasMore=page*PAGE_SIZE<filtered.length

  const cardProps={onTake:takeLead,onRelease:releaseLead,onCreateRDV:l=>{setRdvLead(l);setRdvOpen(true)},onConvertDeal,onReset:resetLead,onKill:killLead,profile}

  return (
    <div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Disponibles',value:available.length,color:'var(--gold)',bg:'rgba(192,155,90,0.06)',bd:'var(--gold-line)'},
          {label:'En appel',value:leads.filter(l=>l.status==='contacted').length,color:'var(--progress)',bg:'var(--progress-bg)',bd:'var(--progress-bd)'},
          {label:'RDV planifiés',value:booked.length,color:'#10B981',bg:'rgba(16,185,129,0.06)',bd:'rgba(16,185,129,0.2)'},
          {label:'Total leads',value:leads.length,color:'var(--t2)',bg:'var(--bg)',bd:'var(--bd)'},
          {label:'Non-intéressés',value:leads.filter(l=>l.status==='dead').length,color:'#9CA3AF',bg:'var(--bg)',bd:'var(--bd)'},
        ].map(s=>(
          <div key={s.label} style={{background:s.bg,border:`1px solid ${s.bd}`,borderRadius:'var(--rad-lg)',padding:'14px 18px',cursor:'pointer'}} onClick={()=>{if(s.label==='Disponibles')setFilter('available');else if(s.label==='Total leads')setFilter('all')}}>
            <div style={{fontSize:11,color:'var(--t3)',marginBottom:6,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.label}</div>
            <div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:'var(--font-serif)'}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Barre de contrôle complète */}
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        {/* Filtre statut */}
        <div style={{display:'flex',gap:0,border:'1px solid var(--bd)',borderRadius:'var(--rad)',overflow:'hidden',flexShrink:0}}>
          {[
            {key:'all',label:'Tous'},
            {key:'available',label:`Dispo (${available.length})`},
            {key:'mine',label:`Mes leads (${mine.length+myBooked.length})`},
          ].map(f=>(
            <button key={f.key} onClick={()=>setFilter(f.key)} style={{padding:'7px 12px',fontSize:12,fontWeight:filter===f.key?600:400,background:filter===f.key?'var(--gold)':'white',color:filter===f.key?'white':'var(--t2)',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtre campagne */}
        {campagnes.length>1&&(
          <select className="filter-select" value={campagneF} onChange={e=>setCampagneF(e.target.value)} style={{height:34,fontSize:12}}>
            <option value="all">Toutes campagnes</option>
            {campagnes.map(c=><option key={c} value={c}>{c} · {leads.filter(l=>l.campagne===c).length}</option>)}
          </select>
        )}

        {/* Recherche */}
        <div style={{position:'relative',flex:1,minWidth:160,maxWidth:320}}>
          <input
            className="search-input"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Nom, téléphone, email…"
            style={{width:'100%',paddingLeft:32,height:34,fontSize:12}}
          />
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--t3)',pointerEvents:'none'}}>🔍</span>
          {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--t3)',fontSize:13,padding:0,lineHeight:1}}>×</button>}
        </div>

        {/* Tri */}
        <select className="filter-select" value={sort} onChange={e=>setSort(e.target.value)} style={{height:34,fontSize:12}}>
          <option value="newest">Plus récents</option>
          <option value="oldest">Plus anciens</option>
          <option value="campagne">Par campagne</option>
        </select>

        {/* Vue cards / liste */}
        <div style={{display:'flex',gap:0,border:'1px solid var(--bd)',borderRadius:'var(--rad)',overflow:'hidden',flexShrink:0}}>
          <button onClick={()=>setViewMode('cards')} title="Vue cartes" style={{padding:'7px 10px',background:viewMode==='cards'?'var(--gold)':'white',color:viewMode==='cards'?'white':'var(--t2)',border:'none',cursor:'pointer',fontSize:14}}>⊞</button>
          <button onClick={()=>setViewMode('list')} title="Vue liste" style={{padding:'7px 10px',background:viewMode==='list'?'var(--gold)':'white',color:viewMode==='list'?'white':'var(--t2)',border:'none',cursor:'pointer',fontSize:14}}>≡</button>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <button onClick={onRefresh} title="Rafraîchir les leads" style={{display:'flex',alignItems:'center',gap:4,padding:'5px 10px',background:'white',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:11.5,color:'var(--t2)',cursor:'pointer'}}>
            <Icon.Refresh/> Actualiser
          </button>
          <div style={{fontSize:11.5,color:'var(--t3)',display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#10B981',display:'inline-block'}}/>
            Temps réel
          </div>
        </div>
      </div>

      {/* Résultat recherche */}
      {(search||campagneF!=='all')&&(
        <div style={{fontSize:12,color:'var(--t3)',marginBottom:10,paddingLeft:2}}>
          {filtered.length} résultat{filtered.length!==1?'s':''} sur {leads.length} leads
          {search&&<> · "<strong style={{color:'var(--t1)'}}>{search}</strong>"</>}
          {campagneF!=='all'&&<> · Campagne <strong style={{color:'var(--t1)'}}>{campagneF}</strong></>}
          <button onClick={()=>{setSearch('');setCampagneF('all')}} style={{marginLeft:8,background:'none',border:'none',color:'var(--gold)',cursor:'pointer',fontSize:12,padding:0,textDecoration:'underline'}}>Effacer</button>
        </div>
      )}

      {/* Alerte leads dispo */}
      {available.length>0&&filter!=='available'&&!search&&(
        <div style={{background:'rgba(192,155,90,0.08)',border:'1.5px solid var(--gold-line)',borderRadius:'var(--rad-lg)',padding:'12px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>⚡</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}>{available.length} lead{available.length>1?'s':''} disponible{available.length>1?'s':''}</div>
              <div style={{fontSize:11.5,color:'var(--t3)'}}>Premier arrivé, premier servi</div>
            </div>
          </div>
          <button onClick={()=>setFilter('available')} className="btn btn-gold btn-sm">Voir les leads</button>
        </div>
      )}

      {/* Contenu */}
      {paginated.length>0?(
        <>
          {viewMode==='list'?(
            <div style={{background:'white',border:'1px solid var(--bd)',borderRadius:'var(--rad-lg)',overflow:'visible'}}>
              <div style={{display:'grid',gridTemplateColumns:'100px 150px 128px 170px 100px 70px 220px 100px',background:'var(--bg)',borderBottom:'2px solid var(--bd)'}}>
                {['Campagne','Nom','Téléphone','Email','Patrimoine','TMI','Action','Reçu le'].map(h=>(
                  <div key={h} style={{padding:'6px 8px',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'0.05em',borderRight:'1px solid var(--bd)'}}>{h}</div>
                ))}
              </div>
              {paginated.map(lead=>(
                <LeadRow key={lead.id} lead={lead} {...cardProps}/>
              ))}
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
              {paginated.map(lead=>(
                <LeadCard key={lead.id} lead={lead} {...cardProps}/>
              ))}
            </div>
          )}

          {/* Pagination / Voir plus */}
          {hasMore&&(
            <div style={{textAlign:'center',marginTop:20,display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
              <span style={{fontSize:12.5,color:'var(--t3)'}}>
                {paginated.length} / {filtered.length} leads affichés
              </span>
              <button
                onClick={()=>setPage(p=>p+1)}
                style={{padding:'8px 20px',background:'white',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:13,fontWeight:500,cursor:'pointer',color:'var(--t1)'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--bd)'}
              >
                Voir {Math.min(PAGE_SIZE,filtered.length-paginated.length)} de plus
              </button>
              {filtered.length>PAGE_SIZE&&(
                <button
                  onClick={()=>setPage(Math.ceil(filtered.length/PAGE_SIZE))}
                  style={{padding:'8px 16px',background:'transparent',border:'none',fontSize:12,cursor:'pointer',color:'var(--t3)',textDecoration:'underline'}}
                >
                  Tout afficher ({filtered.length})
                </button>
              )}
            </div>
          )}
        </>
      ):(
        <div className="table-empty-state">
          <div className="empty-icon">{search?'🔍':'⚡'}</div>
          <div className="empty-title">
            {search?`Aucun résultat pour "${search}"`:filter==='mine'?'Aucun lead en cours':filter==='available'?'Aucun lead disponible':'Aucun lead reçu'}
          </div>
          <div className="empty-sub">
            {search?<button onClick={()=>setSearch('')} style={{background:'none',border:'none',color:'var(--gold)',cursor:'pointer',fontSize:13,padding:0,textDecoration:'underline'}}>Effacer la recherche</button>:'Les leads Facebook apparaîtront ici automatiquement via Zapier.'}
          </div>
        </div>
      )}

      <LeadRDVModal open={rdvOpen} lead={rdvLead}
        onClose={()=>{setRdvOpen(false);setRdvLead(null)}}
        onBooked={handleBooked}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PREMIUM AREA CHART
───────────────────────────────────────────────────────────────────────────── */
function AreaChart({actual,projected,target,title,subtitle}){
  const W=400,H=160,PL=4,PR=4,PT=10,PB=28
  const safeProjected=Math.max(projected,actual)
  const maxV=Math.max(target||0,safeProjected||0,actual||0,1)*1.08

  const anchors=[
    {x:PL,   v:actual*0.3},
    {x:PL+(W-PL-PR)*0.38, v:actual},
    {x:PL+(W-PL-PR)*0.7,  v:safeProjected},
    {x:W-PR, v:Math.max(safeProjected,target||0)},
  ]
  const toY=v=>PB+(H-PT-PB)*(1-Math.max(0,Math.min(1,v/maxV)))

  const catmull=(p0,p1,p2,p3)=>{
    const t=0.85
    return [
      {x:p1.x+((p2.x-p0.x)/6)*t, y:p1.y+((p2.y-p0.y)/6)*t},
      {x:p2.x-((p3.x-p1.x)/6)*t, y:p2.y-((p3.y-p1.y)/6)*t},
      {x:p2.x, y:p2.y},
    ]
  }

  const pts=anchors.map(a=>({x:a.x,y:toY(a.v)}))
  const ext=[pts[0],...pts,pts[pts.length-1]]
  let path=`M${pts[0].x},${pts[0].y}`
  for(let i=1;i<pts.length;i++){
    const[c1,c2,p2]=catmull(ext[i-1],ext[i],ext[i+1],ext[i+2])
    path+=` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  }
  const area=`${path} L${pts[pts.length-1].x},${H-PT} L${pts[0].x},${H-PT}Z`
  const targetY=toY(target||0)
  const actualX=PL+(W-PL-PR)*0.38
  const pctS=pct(actual,target||maxV)
  const pctP=pct(safeProjected,target||maxV)

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">{title}</div>
          {subtitle&&<div className="chart-subtitle">{subtitle}</div>}
        </div>
        {target>0&&<div className="chart-meta">
          <div className="chart-target-label">Objectif</div>
          <div className="chart-target-value">{euro(target)}</div>
        </div>}
      </div>
      <div className="chart-body">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{height:H}}>
          <defs>
            <linearGradient id={`fill-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(192,155,90,0.22)"/>
              <stop offset="100%" stopColor="rgba(192,155,90,0.02)"/>
            </linearGradient>
            <linearGradient id={`stroke-${title}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(192,155,90,0.6)"/>
              <stop offset="100%" stopColor="#C09B5A"/>
            </linearGradient>
          </defs>
          {[0.25,0.5,0.75,1].map(t=>{
            const y=PB+(H-PT-PB)*(1-t)
            return <line key={t} x1={PL} y1={y} x2={W-PR} y2={y} className="chart-grid-line"/>
          })}
          {target>0&&<line x1={PL} y1={targetY} x2={W-PR} y2={targetY} className="chart-target-line"/>}
          <path d={area} fill={`url(#fill-${title})`}/>
          <path d={path} fill="none" stroke={`url(#stroke-${title})`} strokeWidth="2.2" strokeLinecap="round"/>
          <line x1={actualX} y1={PT} x2={actualX} y2={H-PT} stroke="rgba(192,155,90,0.2)" strokeWidth="1" strokeDasharray="3 3"/>
          {pts.slice(1,3).map((pt,i)=>(
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="white" stroke="#C09B5A" strokeWidth="2"/>
              <circle cx={pt.x} cy={pt.y} r="2" fill="#C09B5A"/>
            </g>
          ))}
          <text x={actualX-3} y={H-8} className="chart-label" textAnchor="end">Réalisé</text>
          <text x={W-PR} y={H-8} className="chart-label" textAnchor="end">Projeté</text>
        </svg>
        <div className="chart-legend">
          <div className="chart-legend-item"><div className="legend-dot" style={{background:'var(--signed)'}}/>Réalisé : {euro(actual)} ({pctS}%)</div>
          <div className="chart-legend-item"><div className="legend-dot" style={{background:'var(--gold)'}}/>Projeté : {euro(safeProjected)} ({pctP}%)</div>
          {target>0&&<div className="chart-legend-item"><div className="legend-dot" style={{background:'var(--gold)',opacity:0.4}}/>Objectif : {euro(target)}</div>}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANNUAL BAR CHART — 12 mois
───────────────────────────────────────────────────────────────────────────── */
function AnnualChart({deals,objectifs,currentMonth,advisorCode,title,subtitle}){
  const data=MONTHS.map(m=>{
    const scope=advisorCode?deals.filter(d=>d.month===m&&dealMatchesAdvisor(d,advisorCode)):deals.filter(d=>d.month===m)
    const signed=scope.filter(d=>d.status==='Signé')
    const pipeline=scope.filter(d=>isPipeline(d.status))
    const ppS=sumAnnualPp(signed),ppP=sumAnnualPp(pipeline)
    const target=Number(objectifs?.[m]?.pp_target||0)
    return {month:m,ppSigned:ppS,ppPipeline:ppP,ppTotal:ppS+ppP,target}
  })

  const maxVal=Math.max(...data.map(d=>Math.max(d.ppTotal,d.target)),1)*1.12
  const W=680,H=180,PB=36,PT=12,PL=4,PR=4
  const chartW=W-PL-PR
  const barGroupW=chartW/12
  const barW=Math.max(6,barGroupW*0.52)
  const toY=v=>PT+(H-PT-PB)*(1-Math.min(1,v/maxVal))
  const toH=v=>(H-PT-PB)*Math.min(1,v/maxVal)
  const curIdx=MONTHS.indexOf(currentMonth)

  const targetPts=data.map((d,i)=>({x:PL+i*barGroupW+barGroupW/2,y:d.target>0?toY(d.target):null}))
  const targetPath=targetPts.reduce((path,pt)=>{
    if(pt.y===null)return path
    return path+(path===''?`M${pt.x},${pt.y}`:`L${pt.x},${pt.y}`)
  },'')

  const gridVals=[0.25,0.5,0.75,1].map(t=>({y:PT+(H-PT-PB)*(1-t)}))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">{title||'PP annualisée — vue annuelle'}</div>
          {subtitle&&<div className="chart-subtitle">{subtitle}</div>}
        </div>
        <div className="chart-meta">
          <div className="chart-target-label">Année en cours</div>
          <div className="chart-target-value">{euro(data.reduce((s,d)=>s+d.ppSigned,0))}</div>
        </div>
      </div>
      <div className="chart-body">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{height:H}}>
          <defs>
            <linearGradient id="bar-signed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C09B5A"/><stop offset="100%" stopColor="#9A7B3A"/></linearGradient>
            <linearGradient id="bar-pipeline" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(192,155,90,0.35)"/><stop offset="100%" stopColor="rgba(192,155,90,0.15)"/></linearGradient>
          </defs>
          {gridVals.map((g,i)=><line key={i} x1={PL} y1={g.y} x2={W-PR} y2={g.y} stroke="var(--bd)" strokeWidth="0.5"/>)}
          <line x1={PL} y1={H-PB} x2={W-PR} y2={H-PB} stroke="var(--bd)" strokeWidth="1"/>
          {targetPath&&<path d={targetPath} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"/>}
          {data.map((d,i)=>{
            const cx=PL+i*barGroupW+barGroupW/2,bx=cx-barW/2
            const isCurrent=i===curIdx
            const hh=toH(d.ppTotal),sh=toH(d.ppSigned)
            const sy=H-PB-sh,ph=hh-sh,py=sy-ph
            return (
              <g key={d.month}>
                {ph>0.5&&<rect x={bx} y={py} width={barW} height={ph} fill="url(#bar-pipeline)" rx="2" ry="2"/>}
                {sh>0.5&&<rect x={bx} y={sy} width={barW} height={sh} fill={isCurrent?"url(#bar-signed)":"rgba(192,155,90,0.75)"} rx="2" ry="2"/>}
                {isCurrent&&hh>0.5&&<rect x={bx-1} y={Math.min(py,sy)-1} width={barW+2} height={hh+2} fill="none" stroke="var(--gold)" strokeWidth="1.5" rx="3" opacity="0.5"/>}
                <text x={cx} y={H-8} textAnchor="middle" fontSize="9.5" fill={isCurrent?'var(--gold)':'var(--t3)'} fontWeight={isCurrent?'600':'400'} fontFamily="var(--font-sans)">{d.month.slice(0,3)}</text>
              </g>
            )
          })}
        </svg>
        <div className="chart-legend">
          <div className="chart-legend-item"><div className="legend-dot" style={{background:'var(--gold)'}}/>PP signée : {euro(data.reduce((s,d)=>s+d.ppSigned,0))}</div>
          <div className="chart-legend-item"><div className="legend-dot" style={{background:'rgba(192,155,90,0.35)',border:'1px solid var(--gold)'}}/>PP pipeline : {euro(data.reduce((s,d)=>s+d.ppPipeline,0))}</div>
          <div className="chart-legend-item"><div className="legend-dot" style={{background:'var(--gold)',opacity:0.4}}/>Ligne objectif cabinet</div>
          <div className="chart-legend-item" style={{marginLeft:'auto'}}><div className="legend-dot" style={{background:'var(--gold)',outline:'1.5px solid var(--gold)',outlineOffset:1}}/>Mois en cours : <strong style={{color:'var(--t1)'}}>{currentMonth}</strong></div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({label,value,hint,accent,progressValue,delta}){
  const accentClass=accent?`kpi-card-${accent}`:''
  const fill=progressValue!=null?Math.min(100,progressValue):null
  const hasDelta=delta!=null&&delta.raw!==0
  const deltaUp=delta?.raw>0
  return (
    <div className={`kpi-card ${accentClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hasDelta&&(
        <div style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11.5,fontWeight:500,marginTop:4,color:deltaUp?'var(--signed)':'var(--cancelled)'}}>
          <span style={{fontSize:10}}>{deltaUp?'▲':'▼'}</span>
          {deltaUp?'+':''}{delta.label} vs mois préc.
        </div>
      )}
      {!hasDelta&&hint&&<div className="kpi-hint">{hint}</div>}
      {fill!=null&&<>
        <div className="kpi-progress-bar"><div className={`kpi-progress-fill${fill>=100?' over':''}`} style={{width:`${Math.min(100,fill)}%`}}/></div>
        <div className="kpi-hint" style={{marginTop:4}}>{fill}% de l'objectif</div>
      </>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ADVISOR DASHBOARD
───────────────────────────────────────────────────────────────────────────── */
function AdvisorDashboard({deals,objectifs,month,profile}){
  const code=profile?.advisor_code||''
  const m=advisorMetrics(deals,month,code)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0),puTarget=Number(targets.pu_target||0)
  const ppPct=pct(m.ppSigned,ppTarget),ppProjPct=pct(m.ppProjected,ppTarget)
  const landing=ppTarget>0?m.ppProjected-ppTarget:null
  const prevIdx=MONTHS.indexOf(month)-1,prevMonth=prevIdx>=0?MONTHS[prevIdx]:null
  const prev=prevMonth?advisorMetrics(deals,prevMonth,code):{ppSigned:0,puSigned:0,ppPipeline:0,puPipeline:0}
  const dPpSigned={raw:m.ppSigned-prev.ppSigned,label:euro(Math.abs(m.ppSigned-prev.ppSigned))}
  const dPuSigned={raw:m.puSigned-prev.puSigned,label:euro(Math.abs(m.puSigned-prev.puSigned))}
  const dPpPipeline={raw:m.ppPipeline-prev.ppPipeline,label:euro(Math.abs(m.ppPipeline-prev.ppPipeline))}
  const priorities=[...m.hotDeals].sort((a,b)=>({'Urgente':0,'Haute':1,'Normale':2}[a.priority]||2)-({'Urgente':0,'Haute':1,'Normale':2}[b.priority]||2))

  return (
    <div>
      <div className="advisor-hero">
        <div className="advisor-hero-eyebrow">Tableau de bord · {month}</div>
        <div className="advisor-hero-name">{profile?.full_name||code||'Mon mois'}</div>
        <div className="advisor-hero-month">{m.signedCount} dossier{m.signedCount!==1?'s':''} signés · {m.pipelineCount} en pipeline · taux de signature {m.signRate}%</div>
        <div className="advisor-hero-kpis">
          <div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">PP signée</div><div className="advisor-hero-kpi-value gold">{euro(m.ppSigned)}</div></div>
          <div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">PP projetée</div><div className="advisor-hero-kpi-value">{euro(m.ppProjected)}</div></div>
          <div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">PU signée</div><div className="advisor-hero-kpi-value">{euro(m.puSigned)}</div></div>
          <div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">PU projetée</div><div className="advisor-hero-kpi-value">{euro(m.puProjected)}</div></div>
          {ppTarget>0&&<div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">Objectif PP</div><div className="advisor-hero-kpi-value">{ppProjPct}%</div></div>}
          {landing!=null&&<div className="advisor-hero-kpi"><div className="advisor-hero-kpi-label">Atterrissage</div><div className="advisor-hero-kpi-value" style={{color:landing>=0?'#86EFAC':'#FCA5A5'}}>{landing>=0?'+':''}{euro(landing)}</div></div>}
        </div>
      </div>
      <div className="kpi-grid mb-24">
        <KpiCard label="PP signée annualisée" value={euro(m.ppSigned)} hint="Réalisé du mois" accent="gold" progressValue={ppPct} delta={prevMonth?dPpSigned:null}/>
        <KpiCard label="PP en pipeline" value={euro(m.ppPipeline)} hint={`${m.pipelineCount} dossier${m.pipelineCount!==1?'s':''} en cours / prévus`} accent="amber" delta={prevMonth?dPpPipeline:null}/>
        <KpiCard label="PU signée" value={euro(m.puSigned)} hint="Versements uniques signés" accent="green" delta={prevMonth?dPuSigned:null}/>
        <KpiCard label="PU en pipeline" value={euro(m.puPipeline)} hint="À signer ce mois" accent="blue"/>
      </div>
      <div className="grid-2 gap-24" style={{alignItems:'start'}}>
        <div className="flex-col gap-16">
          <AreaChart title="PP annualisée" subtitle="Réalisé vs objectif cabinet" actual={m.ppSigned} projected={m.ppProjected} target={ppTarget}/>
          <AreaChart title="PU" subtitle="Versements uniques" actual={m.puSigned} projected={m.puProjected} target={puTarget}/>
        </div>
        <div>
          <div className="section-header"><div><div className="section-kicker">Actions immédiates</div><div className="section-title">Mes priorités</div></div></div>
          {priorities.length>0?(
            <div className="priorities-list">
              {priorities.map(deal=>(
                <div key={deal.id} className="priority-item">
                  <div className={`priority-item-dot ${deal.priority==='Urgente'?'urgent':deal.priority==='Haute'?'high':'normal'}`}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="priority-item-client truncate">{deal.client}</div>
                    <div className="priority-item-detail">{deal.product} · <span className={STATUS_CLASS[deal.status]||'badge'}>{deal.status}</span></div>
                  </div>
                  <div className="priority-item-amount">{euro(annualize(deal.pp_m))}</div>
                </div>
              ))}
            </div>
          ):(
            <div className="table-empty-state"><div className="empty-icon">✓</div><div className="empty-title">Aucune priorité urgente</div><div className="empty-sub">Tous tes dossiers chauds sont traités.</div></div>
          )}
          {ppTarget>0&&<div style={{marginTop:20,background:'var(--gold-subtle)',border:'1px solid var(--gold-line)',borderRadius:'var(--rad-lg)',padding:'16px 20px'}}>
            <div className="section-kicker" style={{marginBottom:10}}>Pilotage objectif</div>
            <div className="flex gap-16 flex-wrap">
              <div><div className="text-xs text-muted mb-4">Réalisé</div><div className="font-serif" style={{fontSize:18,fontWeight:500}}>{ppPct}%</div></div>
              <div><div className="text-xs text-muted mb-4">Projeté</div><div className="font-serif" style={{fontSize:18,fontWeight:500}}>{ppProjPct}%</div></div>
              <div><div className="text-xs text-muted mb-4">Reste à faire</div><div className="font-serif" style={{fontSize:18,fontWeight:500,color:landing!=null&&landing<0?'var(--cancelled)':'var(--signed)'}}>{ppTarget>0?euro(Math.max(0,ppTarget-m.ppProjected)):'—'}</div></div>
            </div>
          </div>}
        </div>
      </div>
      <div style={{marginTop:28}}>
        <div className="section-header"><div><div className="section-kicker">Vue annuelle</div><div className="section-title">Saisonnalité — 12 mois</div><div className="section-sub">PP annualisée signée + pipeline par mois · mois courant mis en valeur</div></div></div>
        <AnnualChart deals={deals} objectifs={objectifs} currentMonth={month} advisorCode={code} title="PP annualisée — mon année" subtitle={`Conseiller ${code} · barres : signée (plein) + pipeline (transparent)`}/>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MANAGER DASHBOARD
───────────────────────────────────────────────────────────────────────────── */
function ManagerDashboard({deals,objectifs,month,teamProfiles}){
  const monthDeals=deals.filter(d=>d.month===month)
  const signed=monthDeals.filter(d=>d.status==='Signé'),pipeline=monthDeals.filter(d=>isPipeline(d.status))
  const ppS=sumAnnualPp(signed),puS=sumPu(signed),ppP=sumAnnualPp(pipeline),puP=sumPu(pipeline)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0),puTarget=Number(targets.pu_target||0)
  const activeAdvisors=teamProfiles.filter(p=>p.is_active&&p.advisor_code)
  const prevIdx=MONTHS.indexOf(month)-1,prevMonth=prevIdx>=0?MONTHS[prevIdx]:null
  const prevDeals=prevMonth?deals.filter(d=>d.month===prevMonth):[]
  const prevSigned=prevDeals.filter(d=>d.status==='Signé'),prevPipeline=prevDeals.filter(d=>isPipeline(d.status))
  const prevPpS=sumAnnualPp(prevSigned),prevPuS=sumPu(prevSigned),prevPpP=sumAnnualPp(prevPipeline)
  const dPpS={raw:ppS-prevPpS,label:euro(Math.abs(ppS-prevPpS))}
  const dPuS={raw:puS-prevPuS,label:euro(Math.abs(puS-prevPuS))}
  const dPpProj={raw:(ppS+ppP)-(prevPpS+prevPpP),label:euro(Math.abs((ppS+ppP)-(prevPpS+prevPpP)))}

  const advisorRows=useMemo(()=>activeAdvisors.map(p=>{
    const m=advisorMetrics(deals,month,p.advisor_code)
    return {...p,...m}
  }).sort((a,b)=>b.ppSigned-a.ppSigned),[activeAdvisors,deals,month])

  const topPp=advisorRows[0]?.ppSigned||1
  const hotDeals=monthDeals.filter(d=>(d.priority==='Urgente'||d.priority==='Haute')&&isPipeline(d.status)).sort((a,b)=>annualize(b.pp_m)-annualize(a.pp_m)).slice(0,8)

  return (
    <div>
      <div className="section-header"><div><div className="section-kicker">Vue direction · {month}</div><div className="section-title">Tableau de bord cabinet</div><div className="section-sub">{monthDeals.length} dossiers · {signed.length} signés · {pipeline.length} en pipeline{prevMonth&&<span style={{color:'var(--t3)'}}> · vs {prevMonth}</span>}</div></div></div>
      <div className="kpi-grid mb-24">
        <KpiCard label="PP signée cabinet" value={euro(ppS)} hint="Réalisé consolidé" accent="gold" progressValue={pct(ppS,ppTarget)} delta={prevMonth?dPpS:null}/>
        <KpiCard label="PP prévisionnelle" value={euro(ppS+ppP)} hint="Atterrissage projeté" accent="amber" delta={prevMonth?dPpProj:null}/>
        <KpiCard label="PU signée" value={euro(puS)} hint="Versements uniques" accent="green" progressValue={pct(puS,puTarget)} delta={prevMonth?dPuS:null}/>
        <KpiCard label="PU prévisionnelle" value={euro(puS+puP)} hint="Atterrissage projeté" accent="blue"/>
      </div>
      <div className="grid-2 gap-16 mb-24">
        <AreaChart title="PP cabinet annualisée" subtitle="Réalisé + pipeline → objectif" actual={ppS} projected={ppS+ppP} target={ppTarget}/>
        <AreaChart title="PU cabinet" subtitle="Versements uniques consolidés" actual={puS} projected={puS+puP} target={puTarget}/>
      </div>
      <div className="mb-24">
        <div className="section-header"><div><div className="section-kicker">Vue annuelle</div><div className="section-title">Saisonnalité cabinet — 12 mois</div><div className="section-sub">PP annualisée signée + pipeline · ligne objectif cabinet · mois courant mis en valeur</div></div></div>
        <AnnualChart deals={deals} objectifs={objectifs} currentMonth={month} advisorCode={null} title="PP cabinet — vue annuelle" subtitle="Tous conseillers confondus · barres : signée (plein) + pipeline (transparent)"/>
      </div>
      <div className="mb-24">
        <div className="section-header"><div><div className="section-kicker">Performance équipe</div><div className="section-title">Classement conseillers</div></div></div>
        <div className="table-wrap">
          <div className="team-row header"><span>Conseiller</span><span>PP signée</span><span>PP projetée</span><span>Dossiers</span><span>Taux sign.</span></div>
          {advisorRows.map((row,i)=>(
            <div key={row.id} className="team-row">
              <div><div className="team-advisor-name">{i===0&&<span style={{color:'var(--gold)',marginRight:6}}>★</span>}{row.full_name||row.advisor_code}</div><div className="team-advisor-code">{row.advisor_code}</div></div>
              <div className="team-bar-wrap"><div className="team-bar-track"><div className="team-bar-fill signed" style={{width:`${pct(row.ppSigned,topPp)}%`}}/></div><span className="team-amount">{euro(row.ppSigned)}</span></div>
              <div className="team-bar-wrap"><div className="team-bar-track"><div className="team-bar-fill" style={{width:`${pct(row.ppProjected,topPp)}%`}}/></div><span className="team-amount">{euro(row.ppProjected)}</span></div>
              <div className="team-amount" style={{textAlign:'center'}}>{row.total}</div>
              <div><span className={`badge ${row.signRate>=60?'badge-signed':row.signRate>=30?'badge-progress':'badge-cancelled'}`}>{row.signRate}%</span></div>
            </div>
          ))}
          {!advisorRows.length&&<div className="table-empty-state"><div className="empty-icon">👥</div><div className="empty-title">Aucun conseiller configuré</div><div className="empty-sub">Renseigne les profils dans <span className="code">public.profiles</span></div></div>}
        </div>
      </div>
      {hotDeals.length>0&&<div>
        <div className="section-header"><div><div className="section-kicker">Priorité haute ou urgente</div><div className="section-title">Dossiers chauds</div></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Client</th><th>Produit</th><th>PP annualisée</th><th>PU</th><th>Conseiller</th><th>Statut</th><th>Priorité</th></tr></thead>
            <tbody>
              {hotDeals.map(deal=>(
                <tr key={deal.id}>
                  <td><div className="cell-primary">{deal.client}</div><div className="cell-sub">{deal.source||'—'}</div></td>
                  <td>{deal.product}</td>
                  <td className="cell-mono"><strong>{euro(annualize(deal.pp_m))}</strong></td>
                  <td className="cell-mono">{euro(deal.pu)}</td>
                  <td>{deal.advisor_code}{deal.co_advisor_code&&<span className="text-muted text-xs"> · {deal.co_advisor_code}</span>}</td>
                  <td><span className={STATUS_CLASS[deal.status]||'badge'}>{deal.status}</span></td>
                  <td><span className={PRIORITY_CLASS[deal.priority]||'badge'}>{deal.priority}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PIPELINE BOARD
───────────────────────────────────────────────────────────────────────────── */
const PIPELINE_COLS=[
  {id:'En cours', label:'En cours',  cls:'col-progress'},
  {id:'Prévu',    label:'Prévu',     cls:'col-forecast'},
  {id:'Signé',    label:'Signé ✓',   cls:'col-signed'},
  {id:'Annulé',   label:'Annulé',    cls:'col-cancelled'},
]

function PipelineBoard({deals,month,profile,onEdit}){
  const [search,setSearch]=useState('')
  const isManager=profile?.role==='manager'
  const visible=useMemo(()=>{
    let list=deals.filter(d=>d.month===month)
    if(!isManager&&profile?.advisor_code)list=list.filter(d=>dealMatchesAdvisor(d,profile.advisor_code))
    if(search)list=list.filter(d=>`${d.client} ${d.product} ${d.advisor_code}`.toLowerCase().includes(search.toLowerCase()))
    return list
  },[deals,month,profile,isManager,search])
  const byStatus=useMemo(()=>{
    const m={}
    PIPELINE_COLS.forEach(c=>m[c.id]=[])
    visible.forEach(d=>{if(m[d.status])m[d.status].push(d);else m['En cours']=[...(m['En cours']||[]),d]})
    return m
  },[visible])
  const ppByStatus=useMemo(()=>{const m={};PIPELINE_COLS.forEach(c=>m[c.id]=sumAnnualPp(byStatus[c.id]||[]));return m},[byStatus])

  return (
    <div>
      <div className="section-header mb-16">
        <div><div className="section-kicker">Vue kanban</div><div className="section-title">Pipeline commercial</div><div className="section-sub">{visible.length} dossiers · {MONTHS[MONTHS.indexOf(month)]}</div></div>
        <input className="search-input" style={{maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un dossier…"/>
      </div>
      <StalePipelineAlert deals={visible} onEdit={onEdit}/>
      <div className="pipeline-board">
        {PIPELINE_COLS.map(col=>{
          const items=byStatus[col.id]||[]
          return (
            <div key={col.id} className={`pipeline-col ${col.cls}`}>
              <div className="pipeline-col-head">
                <div><div className="pipeline-col-title">{col.label}</div>{ppByStatus[col.id]>0&&<div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{euro(ppByStatus[col.id])} PP</div>}</div>
                <span className="pipeline-col-count">{items.length}</span>
              </div>
              <div className="pipeline-cards">
                {items.map(deal=>(
                  <div key={deal.id} className="pipeline-deal-card" onClick={()=>onEdit(deal)}>
                    <div className="pipeline-deal-client">{deal.client}</div>
                    <div className="pipeline-deal-product">{deal.product} · {deal.company||'—'}</div>
                    <div className="pipeline-deal-amounts">
                      {deal.pp_m>0&&<div className="pipeline-amount">PP <strong>{euro(annualize(deal.pp_m))}</strong></div>}
                      {deal.pu>0&&<div className="pipeline-amount">PU <strong>{euro(deal.pu)}</strong></div>}
                    </div>
                    <div className="pipeline-deal-footer">
                      <span className={PRIORITY_CLASS[deal.priority]||'badge'}>{deal.priority}</span>
                      <div style={{display:'flex',alignItems:'center',gap:6}}><AgeBadge deal={deal} compact/><span style={{fontSize:11,color:'var(--t3)'}}>{deal.advisor_code}</span></div>
                    </div>
                  </div>
                ))}
                {!items.length&&<div className="pipeline-empty">Aucun dossier</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEALS TABLE
───────────────────────────────────────────────────────────────────────────── */
function DealsTable({deals,month,profile,onEdit,onDelete,onRefresh}){
  const [search,setSearch]=useState('')
  const [statusF,setStatusF]=useState('Tous')
  const [productF,setProductF]=useState('Tous')
  const [priorityF,setPriorityF]=useState('Tous')
  const [allMonths,setAllMonths]=useState(false)
  const filtered=useMemo(()=>deals.filter(d=>allMonths||d.month===month).filter(d=>statusF==='Tous'||d.status===statusF).filter(d=>productF==='Tous'||d.product===productF).filter(d=>priorityF==='Tous'||d.priority===priorityF).filter(d=>`${d.client} ${d.product} ${d.company} ${d.advisor_code} ${d.co_advisor_code||''}`.toLowerCase().includes(search.toLowerCase())),[deals,month,allMonths,search,statusF,productF,priorityF])
  const ppTotal=sumAnnualPp(filtered.filter(d=>d.status==='Signé'))
  const puTotal=sumPu(filtered.filter(d=>d.status==='Signé'))

  return (
    <div>
      <div className="section-header"><div><div className="section-kicker">Référentiel</div><div className="section-title">Dossiers clients</div><div className="section-sub">{filtered.length} dossier{filtered.length!==1?'s':''} · PP signée {euro(ppTotal)} · PU signée {euro(puTotal)}</div></div></div>
      <div className="card card-p mb-16">
        <div className="table-toolbar">
          <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Recherche client, produit, conseiller…"/>
          <select className="filter-select" value={statusF} onChange={e=>setStatusF(e.target.value)}><option value="Tous">Tous statuts</option>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</select>
          <select className="filter-select" value={productF} onChange={e=>setProductF(e.target.value)}><option value="Tous">Tous produits</option>{PRODUCTS.map(p=><option key={p}>{p}</option>)}</select>
          <select className="filter-select" value={priorityF} onChange={e=>setPriorityF(e.target.value)}><option value="Tous">Toutes priorités</option>{PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}</select>
          <label className="flex items-center gap-8 text-sm text-muted" style={{cursor:'pointer',whiteSpace:'nowrap'}}>
            <input type="checkbox" checked={allMonths} onChange={e=>setAllMonths(e.target.checked)} style={{accentColor:'var(--gold)'}}/>
            Tous les mois
          </label>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}><Icon.Refresh/> Rafraîchir</button>
        </div>
      </div>
      <div className="table-wrap">
        {filtered.length>0?(
          <table className="data-table">
            <thead><tr><th>Client</th><th>Produit</th><th>PP annualisée</th><th>PU</th><th>Conseiller</th><th>Mois</th><th>Statut</th><th>Priorité</th><th>Ancienneté</th><th>Compagnie</th><th></th></tr></thead>
            <tbody>
              {filtered.map(deal=>(
                <tr key={deal.id}>
                  <td><div className="cell-primary">{deal.client}</div><div className="cell-sub">{deal.source||'—'}</div></td>
                  <td>{deal.product}</td>
                  <td className="cell-mono"><strong>{euro(annualize(deal.pp_m))}</strong><div className="cell-sub">{euro(deal.pp_m)}/mois</div></td>
                  <td className="cell-mono">{deal.pu>0?euro(deal.pu):'—'}</td>
                  <td>{deal.advisor_code}{deal.co_advisor_code&&<span className="cell-sub"> co: {deal.co_advisor_code}</span>}</td>
                  <td><span style={{fontSize:12,color:'var(--t3)'}}>{deal.month}</span></td>
                  <td><span className={STATUS_CLASS[deal.status]||'badge'}>{deal.status}</span></td>
                  <td><span className={PRIORITY_CLASS[deal.priority]||'badge'}>{deal.priority}</span></td>
                  <td><AgeBadge deal={deal}/></td>
                  <td><span style={{fontSize:12,color:'var(--t3)'}}>{deal.company||'—'}</span></td>
                  <td><div className="table-actions"><button className="btn btn-outline btn-sm" onClick={()=>onEdit(deal)}><Icon.Edit/></button><button className="btn btn-danger btn-sm" onClick={()=>onDelete(deal)}><Icon.Trash/></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        ):(
          <div className="table-empty-state"><div className="empty-icon">📂</div><div className="empty-title">Aucun dossier trouvé</div><div className="empty-sub">Modifie les filtres ou crée un nouveau dossier.</div></div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   FORECAST VIEW
───────────────────────────────────────────────────────────────────────────── */
function ForecastView({deals,objectifs,month,profile,teamProfiles,canEditObjectifs,onSaveObjectif}){
  const isManager=profile?.role==='manager'
  const [formObj,setFormObj]=useState({pp_target:'',pu_target:''})
  useEffect(()=>{setFormObj({pp_target:objectifs?.[month]?.pp_target??'',pu_target:objectifs?.[month]?.pu_target??''})},[objectifs,month])
  async function submitObj(e){e.preventDefault();if(!canEditObjectifs)return;await onSaveObjectif({month,pp_target:Number(formObj.pp_target||0),pu_target:Number(formObj.pu_target||0)})}
  const visibleProfiles=useMemo(()=>{const base=(teamProfiles||[]).filter(p=>p?.is_active&&p?.advisor_code);if(isManager)return base;return base.filter(p=>p.advisor_code===profile?.advisor_code)},[teamProfiles,profile,isManager])
  const targets=objectifs[month]||{pp_target:0,pu_target:0}

  return (
    <div>
      <div className="section-header"><div><div className="section-kicker">Atterrissage commercial</div><div className="section-title">{isManager?'Prévisionnels équipe':'Mon prévisionnel'}</div><div className="section-sub">Dossiers signés, en cours et prévus uniquement · {month}</div></div></div>
      <div className="card mb-24">
        <div className="panel-head" style={{flexWrap:'wrap',gap:12}}>
          <div><div className="section-kicker" style={{marginBottom:2}}>Objectif global · {month}</div><div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>Objectifs du cabinet — consolidé équipe</div></div>
          <div className="notice notice-gold" style={{margin:0,fontSize:12,padding:'6px 12px'}}>Ces objectifs s'appliquent au <strong>cabinet entier</strong>, pas à chaque conseiller individuellement.</div>
        </div>
        <div className="panel-body">
          {canEditObjectifs?(
            <form onSubmit={submitObj}>
              <div className="form-row form-row-2 mb-16">
                <div className="form-group"><label className="form-label">PP annualisée cible cabinet (€)</label><input className="form-input" type="number" value={formObj.pp_target} onChange={e=>setFormObj(p=>({...p,pp_target:e.target.value}))}/><div className="form-hint">Objectif total du cabinet pour {month}</div></div>
                <div className="form-group"><label className="form-label">PU cible cabinet (€)</label><input className="form-input" type="number" value={formObj.pu_target} onChange={e=>setFormObj(p=>({...p,pu_target:e.target.value}))}/><div className="form-hint">Versements uniques attendus pour {month}</div></div>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Enregistrer les objectifs cabinet</button>
            </form>
          ):(
            <div className="objectif-display">
              <div className="objectif-value-card"><div className="objectif-value-label">PP annualisée cible cabinet</div><div className="objectif-value-num">{euro(targets.pp_target||0)}</div></div>
              <div className="objectif-value-card"><div className="objectif-value-label">PU cible cabinet</div><div className="objectif-value-num">{euro(targets.pu_target||0)}</div></div>
            </div>
          )}
        </div>
      </div>
      {visibleProfiles.map(p=>{
        const code=p.advisor_code,m=advisorMetrics(deals,month,code)
        return (
          <div key={code} className="forecast-advisor-block">
            <div className="forecast-advisor-head">
              <div><div className="forecast-name">{p.full_name||code}</div><div className="forecast-code">{code} · {p.role==='manager'?'Direction':'Conseiller'}</div></div>
              <div className="forecast-metrics">
                <div className="forecast-metric"><div className="forecast-metric-label">PP signée</div><div className="forecast-metric-value">{euro(m.ppSigned)}</div></div>
                <div className="forecast-metric"><div className="forecast-metric-label">PP projetée</div><div className="forecast-metric-value">{euro(m.ppProjected)}</div></div>
                <div className="forecast-metric"><div className="forecast-metric-label">PU projetée</div><div className="forecast-metric-value">{euro(m.puProjected)}</div></div>
                <div className="forecast-metric"><div className="forecast-metric-label">Dossiers</div><div className="forecast-metric-value">{m.total}</div></div>
              </div>
            </div>
            <div className="forecast-charts-grid">
              <AreaChart title={`PP annualisée · ${code}`} actual={m.ppSigned} projected={m.ppProjected} target={0}/>
              <AreaChart title={`PU · ${code}`} actual={m.puSigned} projected={m.puProjected} target={0}/>
            </div>
            {(Number(targets.pp_target)||Number(targets.pu_target))>0&&(
              <div style={{padding:'10px 20px 16px',display:'flex',gap:24,flexWrap:'wrap'}}>
                {Number(targets.pp_target)>0&&<div style={{fontSize:12,color:'var(--t3)'}}>Contribution PP cabinet : <strong style={{color:'var(--t2)'}}>{pct(m.ppProjected,targets.pp_target)}%</strong><span style={{marginLeft:6,fontSize:11,color:'var(--t3)'}}>({euro(m.ppProjected)} / {euro(targets.pp_target)} obj. cabinet)</span></div>}
                {Number(targets.pu_target)>0&&<div style={{fontSize:12,color:'var(--t3)'}}>Contribution PU cabinet : <strong style={{color:'var(--t2)'}}>{pct(m.puProjected,targets.pu_target)}%</strong><span style={{marginLeft:6,fontSize:11,color:'var(--t3)'}}>({euro(m.puProjected)} / {euro(targets.pu_target)} obj. cabinet)</span></div>}
              </div>
            )}
          </div>
        )
      })}
      {!visibleProfiles.length&&<div className="card"><div className="table-empty-state"><div className="empty-icon">📊</div><div className="empty-title">Aucun conseiller actif</div><div className="empty-sub">Renseigne les profils avec <span className="code">advisor_code</span> dans <span className="code">public.profiles</span></div></div></div>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   AGENDA VIEW
───────────────────────────────────────────────────────────────────────────── */
function fmtDay(d){ return d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}) }
function fmtTime(d){ if(!d)return ''; return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) }
function isToday(d){ const t=new Date(); return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear() }
function toGCalDate(date){ return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').slice(0,15)+'Z' }
function openGCalEvent({title,startDate,startTime,durationMin,description}){
  const start=new Date(`${startDate}T${startTime}:00`),end=new Date(start.getTime()+durationMin*60000)
  const params=new URLSearchParams({action:'TEMPLATE',text:title,dates:`${toGCalDate(start)}/${toGCalDate(end)}`,details:description||'',trp:'false'})
  window.open(`https://calendar.google.com/calendar/r/eventedit?${params}`,'_blank')
}

function RelanceModal({open,onClose,deals,defaultDate}){
  const [title,setTitle]=useState('')
  const [date,setDate]=useState(new Date().toISOString().slice(0,10))
  const [time,setTime]=useState('10:00')
  const [duration,setDuration]=useState('60')
  const [dealId,setDealId]=useState('')
  const [notes,setNotes]=useState('')
  const activePipeline=deals.filter(d=>isPipeline(d.status))
  useEffect(()=>{if(open){setTitle('');setDate(defaultDate||new Date().toISOString().slice(0,10));setTime('10:00');setDuration('60');setDealId('');setNotes('')}},[open,defaultDate])
  useEffect(()=>{const d=activePipeline.find(d=>d.id===dealId);if(d)setTitle(`Relance — ${d.client} (${d.product})`)},[dealId])
  if(!open)return null
  function handleCreate(){
    if(!title||!date)return
    const deal=deals.find(d=>d.id===dealId)
    const description=[notes||'',deal?`\n📎 Dossier : ${deal.client} — ${deal.product} — ${deal.advisor_code}\nPP : ${euro(annualize(deal.pp_m))} | Statut : ${deal.status}`:''].filter(Boolean).join('\n').trim()
    openGCalEvent({title,startDate:date,startTime:time,durationMin:Number(duration),description})
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal-panel" style={{maxWidth:520}}>
        <div className="modal-head"><div className="modal-title">Planifier une relance</div><button className="modal-close" onClick={onClose}><Icon.Close/></button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Lier à un dossier (optionnel)</label><select className="form-select" value={dealId} onChange={e=>setDealId(e.target.value)}><option value="">— Aucun dossier lié —</option>{activePipeline.map(d=><option key={d.id} value={d.id}>{d.client} · {d.product} · {d.advisor_code}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Titre</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex. Relance signature PER — Dupont"/></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Heure</label><input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>
          </div>
          <div className="form-group"><label className="form-label">Durée</label><select className="form-select" value={duration} onChange={e=>setDuration(e.target.value)}>{['15','30','45','60','90','120'].map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contexte, objectif, points à aborder…"/></div>
        </div>
        <div className="modal-foot"><button className="btn btn-outline" onClick={onClose}>Annuler</button><button className="btn btn-gold" onClick={handleCreate} disabled={!title||!date}><Icon.CalPlus/> Ouvrir dans Google Agenda</button></div>
      </div>
    </div>
  )
}


const FUNDS_DEFAULT=[
    {name:'Lazard Japon AC H EUR',        isin:'FR0014008M81', cat:'Actions Japon',        refSymbol:'INDEX:NKY',        refLabel:'Nikkei 225', color:'#EF4444'},
    {name:'AXA Or et Matières Premières', isin:'FR0010011171', cat:'Matières premières',   refSymbol:'TVC:GOLD',       refLabel:'Or',         color:'#F59E0B'},
    {name:'AP Meeschaert Gl. Convictions',isin:'FR001400CSI0', cat:'Actions Monde Value',  refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#10B981'},
    {name:'Fidelity Em Mkts A-USD',       isin:'LU0261950470', morningstarId:'FOGBR05KLN', cat:'Actions Ém. Marchés',  refSymbol:'AMEX:EEM',       refLabel:'EEM ETF',    color:'#F97316'},
    {name:'Fidelity Global Technology',   isin:'LU0099574567', morningstarId:'F0GBR04D20', cat:'Actions Technologie',  refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ', color:'#7C3AED'},
    {name:'Quadrige France Smallcaps',    isin:'FR0011466093', cat:'Actions France Small', refSymbol:'INDEX:CAC40',      refLabel:'CAC 40',     color:'#0EA5E9'},
    {name:'Pictet Clean Energy Transtn',  isin:'LU0280435461', yahooTicker:'0P00008OBP.F', cat:'Énergie Propre',       refSymbol:'AMEX:ICLN',        refLabel:'ICLN ETF',   color:'#06B6D4'},
    {name:'First Eagle Amundi Intl',      isin:'LU0068578508', yahooTicker:'0P0000RXYQ.F', cat:'Actions Monde Flex.',  refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#84CC16'},
    {name:'Groupama Global Disruption',   isin:'LU1897556517', cat:'Actions Innovation',   refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ', color:'#EC4899'},
    {name:'Claresco USA',                 isin:'LU1379103812', cat:'Actions USA',          refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#6366F1'},
  ]

const FUND_COLORS=['#EF4444','#F59E0B','#10B981','#F97316','#7C3AED','#0EA5E9','#06B6D4','#84CC16','#EC4899','#6366F1','#14B8A6','#8B5CF6','#F43F5E','#22C55E','#3B82F6']

function MarketView(){
  const [funds,setFunds]=useState(FUNDS_DEFAULT)
  const [navData,setNavData]=useState({})
  const [loading,setLoading]=useState(true)
  const [lastUpdate,setLastUpdate]=useState(null)
  const [selectedFund,setSelectedFund]=useState(null)
  const [addModal,setAddModal]=useState(false)
  const [newFund,setNewFund]=useState({name:'',isin:'',cat:'',refLabel:'',refSymbol:''})
  const [addError,setAddError]=useState('')
  const [addLoading,setAddLoading]=useState(false)
  const [editPerfIsin,setEditPerfIsin]=useState(null)
  const [editPerfVals,setEditPerfVals]=useState({perf1W:'',perf1M:'',perf3M:'',perf1Y:''})

  async function fetchNAV(isin, yahooTicker, morningstarId){
    try{
      const params=new URLSearchParams({isin})
      if(yahooTicker) params.set('ticker',yahooTicker)
      if(morningstarId) params.set('msId',morningstarId)
      const r=await fetch(`/api/nav?${params}`)
      if(!r.ok)return null
      return await r.json()
    }catch{return null}
  }

  async function loadAllNAV(){
    setLoading(true)
    const results=await Promise.all(funds.map(f=>fetchNAV(f.isin, f.yahooTicker, f.morningstarId)))
    const map={}
    results.forEach((d,i)=>{if(d&&d.vl)map[funds[i].isin]=d})
    setNavData(map)
    setLastUpdate(new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))
    setLoading(false)
  }

  useEffect(()=>{
    loadAllNAV()
    const t=setInterval(loadAllNAV,4*60*60*1000)
    return()=>clearInterval(t)
  },[])

  useEffect(()=>{
    if(!selectedFund)return
    const el=document.getElementById('tv-detail-chart')
    if(!el)return
    el.innerHTML=''
    const s=document.createElement('script')
    s.type='text/javascript'
    s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async=true
    s.innerHTML=JSON.stringify({
      symbol:selectedFund.refSymbol,width:'100%',height:380,
      locale:'fr',interval:'D',timezone:'Europe/Paris',
      theme:'light',style:'1',hide_top_toolbar:false,
      allow_symbol_change:false,save_image:false,
    })
    el.appendChild(s)
  },[selectedFund])

  useEffect(()=>{
    const el=document.getElementById('tv-mkt-ticker')
    if(!el||el.querySelector('script'))return
    const s=document.createElement('script')
    s.type='text/javascript'
    s.src='https://s3.tradingview.com/external-embedding/embed-widget-tickers.js'
    s.async=true
    s.innerHTML=JSON.stringify({
      symbols:[
        {proName:'INDEX:NKY',       title:'Nikkei 225'},
        {proName:'TVC:GOLD',        title:'Or (XAU/USD)'},
        {proName:'FOREXCOM:SPXUSD', title:'S&P 500'},
        {proName:'NASDAQ:QQQ',      title:'Nasdaq QQQ'},
        {proName:'TVC:MSEI',        title:'Ém. Marchés'},
        {proName:'INDEX:CAC40',     title:'CAC 40'},
        {proName:'AMEX:ICLN',       title:'Clean Energy'},
        {proName:'FX_IDC:EURUSD',   title:'EUR/USD'},
      ],
      colorTheme:'light',isTransparent:false,showSymbolLogo:true,locale:'fr'
    })
    el.appendChild(s)
  },[])

  function PerfBadge({val}){
    if(val==null||val===0)return <span style={{color:'var(--t3)',fontSize:11}}>—</span>
    const up=val>0,down=val<0
    return(
      <span style={{
        fontSize:11.5,fontWeight:700,
        color:up?'#10B981':down?'#EF4444':'var(--t2)',
        background:up?'rgba(16,185,129,0.1)':down?'rgba(239,68,68,0.1)':'var(--bg)',
        padding:'2px 7px',borderRadius:4,whiteSpace:'nowrap'
      }}>
        {up?'+':''}{val.toFixed(2)}%
      </span>
    )
  }

  const totalLoaded=Object.keys(navData).length

  return(
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Swiss Life 2026 · VL quotidienne · performances 1S / 1M / 3M / 1Y</div>
          <div className="section-title">Suivi allocations clients</div>
          <div className="section-sub">
            {loading?'Chargement des VL…':`${totalLoaded}/${funds.length} fonds chargés · ${lastUpdate||'—'}`}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>{setNewFund({name:'',isin:'',cat:'',refLabel:'',refSymbol:''});setAddError('');setAddModal(true)}}
            style={{padding:'7px 14px',background:'var(--gold)',color:'white',border:'none',borderRadius:'var(--rad)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Ajouter
          </button>
          <button onClick={loadAllNAV} disabled={loading}
            style={{padding:'7px 14px',background:loading?'var(--bd)':'var(--bg)',color:'var(--t1)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:12,fontWeight:600,cursor:loading?'not-allowed':'pointer'}}>
            {loading?'Chargement…':'↻ Actualiser'}
          </button>
        </div>
      </div>

      {/* Ticker bande */}
      <div style={{marginBottom:20,borderRadius:'var(--rad-lg)',overflow:'hidden',border:'1px solid var(--bd)'}}>
        <div className="tradingview-widget-container" id="tv-mkt-ticker">
          <div className="tradingview-widget-container__widget"></div>
        </div>
      </div>

      {/* Table */}
      <div style={{border:'1px solid var(--bd)',borderRadius:'var(--rad-lg)',overflow:'hidden',marginBottom:selectedFund?20:0,background:'white'}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:'28px 1fr 100px 75px 80px 80px 80px 80px 130px 36px',background:'var(--bg)',borderBottom:'2px solid var(--bd)'}}>
          {['#','Fonds','ISIN','VL','1 sem','1 mois','3 mois','1 an','Indice réf.',''].map(h=>(
            <div key={h} style={{padding:'8px 10px',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'0.04em',borderRight:'1px solid var(--bd)'}}>{h}</div>
          ))}
        </div>

        {funds.map((f,i)=>{
          const d=navData[f.isin]
          const isSelected=selectedFund?.isin===f.isin
          return(
            <div key={f.isin}
              onClick={()=>setSelectedFund(isSelected?null:f)}
              style={{
                display:'grid',gridTemplateColumns:'28px 1fr 100px 75px 80px 80px 80px 80px 130px 36px',
                borderBottom:'1px solid var(--bd)',
                background:isSelected?'rgba(192,155,90,0.06)':i%2===0?'white':'rgba(248,246,242,0.4)',
                cursor:'pointer',transition:'background .15s',
                borderLeft:isSelected?'3px solid var(--gold)':'3px solid transparent',
              }}
              onMouseEnter={e=>!isSelected&&(e.currentTarget.style.background='rgba(192,155,90,0.04)')}
              onMouseLeave={e=>!isSelected&&(e.currentTarget.style.background=i%2===0?'white':'rgba(248,246,242,0.4)')}
            >
              {/* # */}
              <div style={{padding:'10px 8px',display:'flex',alignItems:'center',borderRight:'1px solid var(--bd)'}}>
                <span style={{fontSize:11,fontWeight:700,color:'var(--t3)'}}>{i+1}</span>
              </div>
              {/* Nom */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center'}}>
                <div style={{fontSize:12.5,fontWeight:600,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                <div style={{fontSize:10,color:'var(--t3)',marginTop:1}}>{f.cat}{d?.date?` · VL au ${d.date}`:''}</div>
              </div>
              {/* ISIN */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center'}}>
                <span style={{fontSize:10,color:'var(--t3)',fontFamily:'monospace'}}>{f.isin}</span>
              </div>
              {/* VL */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
                {loading&&!d
                  ?<div style={{width:42,height:14,background:'var(--bd)',borderRadius:3}}/>
                  :d?.vl
                    ?<div style={{textAlign:'right'}}>
                      <div style={{fontSize:12.5,fontWeight:700,color:'var(--t1)'}}>{d.vl.toFixed(2)}</div>
                      <div style={{fontSize:9.5,color:'var(--t3)'}}>{d.currency||'EUR'}</div>
                    </div>
                    :<span style={{fontSize:11,color:'var(--t3)'}}>—</span>
                }
              </div>
              {/* 1S */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <PerfBadge val={d?.perf1W}/>
              </div>
              {/* 1M */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <PerfBadge val={d?.perf1M}/>
              </div>
              {/* 3M */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <PerfBadge val={d?.perf3M}/>
              </div>
              {/* 1Y */}
              <div style={{padding:'10px',borderRight:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <PerfBadge val={d?.perf1Y}/>
              </div>
              {/* Indice réf */}
              <div style={{padding:'10px',display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:f.color,flexShrink:0}}/>
                <span style={{fontSize:11,color:'var(--t2)',fontWeight:500}}>{f.refLabel}</span>
              </div>
              {/* Supprimer */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}
                onClick={e=>{e.stopPropagation();if(funds.length>1){setFunds(prev=>prev.filter((_,j)=>j!==i));if(selectedFund?.isin===f.isin)setSelectedFund(null)}}}>
                <span style={{fontSize:13,color:'var(--t3)',cursor:funds.length>1?'pointer':'not-allowed',opacity:funds.length>1?1:0.3}}
                  title="Supprimer ce fonds">✕</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Chart détail */}
      {selectedFund&&(
        <div style={{border:'1px solid var(--gold-line)',borderRadius:'var(--rad-lg)',overflow:'hidden',background:'white',marginBottom:20}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:10,background:'rgba(192,155,90,0.04)'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:selectedFund.color}}/>
            <span style={{fontWeight:600,fontSize:13,color:'var(--t1)'}}>{selectedFund.name}</span>
            <span style={{fontSize:11,color:'var(--t3)'}}>· Indice de réf. : {selectedFund.refLabel}</span>
            {navData[selectedFund.isin]&&(
              <div style={{marginLeft:8,display:'flex',gap:10,alignItems:'center'}}>
                {[['1S','perf1W'],['1M','perf1M'],['3M','perf3M'],['1Y','perf1Y']].map(([lbl,key])=>{
                  const v=navData[selectedFund.isin][key]
                  return v!=null?(
                    <span key={key} style={{fontSize:11,fontWeight:700,color:v>0?'#10B981':v<0?'#EF4444':'var(--t2)'}}>
                      {lbl} : {v>0?'+':''}{v.toFixed(2)}%
                    </span>
                  ):null
                })}
              </div>
            )}
            <button onClick={()=>{
              const d=navData[selectedFund.isin]
              setEditPerfVals({
                perf1W: d?.perf1W!=null?String(d.perf1W):'',
                perf1M: d?.perf1M!=null?String(d.perf1M):'',
                perf3M: d?.perf3M!=null?String(d.perf3M):'',
                perf1Y: d?.perf1Y!=null?String(d.perf1Y):'',
              })
              setEditPerfIsin(selectedFund.isin)
            }} style={{marginLeft:8,padding:'3px 10px',fontSize:11,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',color:'var(--t2)',cursor:'pointer',fontWeight:500}}>
              ✎ Saisir perfs
            </button>
            <button onClick={()=>setSelectedFund(null)} style={{marginLeft:'auto',background:'transparent',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:18,lineHeight:1}}>✕</button>
          </div>
          <div className="tradingview-widget-container" id="tv-detail-chart" style={{height:380}}>
            <div className="tradingview-widget-container__widget" style={{height:'100%'}}></div>
          </div>
        </div>
      )}

      <div style={{padding:'10px 14px',background:'rgba(192,155,90,0.04)',border:'1px solid var(--gold-line)',borderRadius:'var(--rad)',fontSize:11,color:'var(--t3)',lineHeight:1.6}}>
        ℹ️ <strong style={{color:'var(--t2)'}}>VL quotidienne J+1</strong> — Performances calculées sur les VL historiques. Cliquez sur un fonds pour afficher le graphique de son indice de référence.
      </div>

      {/* Modal saisie manuelle perfs */}
      {editPerfIsin&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1001,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setEditPerfIsin(null)}>
          <div style={{background:'var(--surface)',borderRadius:'var(--rad-lg)',padding:28,width:360,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:15,color:'var(--t1)',marginBottom:4}}>Saisie manuelle des performances</div>
            <div style={{fontSize:11,color:'var(--t3)',marginBottom:18}}>{funds.find(f=>f.isin===editPerfIsin)?.name} · {editPerfIsin}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:18}}>
              {[['1 semaine','perf1W'],['1 mois','perf1M'],['3 mois','perf3M'],['1 an','perf1Y']].map(([lbl,key])=>(
                <div key={key}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--t2)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}}>{lbl} (%)</div>
                  <input type="number" step="0.01" value={editPerfVals[key]}
                    onChange={e=>setEditPerfVals(p=>({...p,[key]:e.target.value}))}
                    placeholder="ex: -3.12"
                    style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:13,background:'var(--bg)',color:'var(--t1)',boxSizing:'border-box'}}/>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:'var(--t3)',marginBottom:14,fontStyle:'italic'}}>Source : fiches Morningstar. Valeurs en %, ex: -3.12 pour -3,12%</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{
                const patch={}
                const keys=['perf1W','perf1M','perf3M','perf1Y']
                keys.forEach(k=>{
                  const v=parseFloat(editPerfVals[k])
                  patch[k]=isNaN(v)?null:v
                })
                setNavData(prev=>({...prev,[editPerfIsin]:{...(prev[editPerfIsin]||{}), ...patch}}))
                setEditPerfIsin(null)
              }} style={{flex:1,padding:'9px 0',background:'var(--gold)',color:'white',border:'none',borderRadius:'var(--rad)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
                Enregistrer
              </button>
              <button onClick={()=>setEditPerfIsin(null)}
                style={{padding:'9px 18px',background:'var(--bg)',color:'var(--t2)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout allocation */}
      {addModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setAddModal(false)}>
          <div style={{background:'var(--surface)',borderRadius:'var(--rad-lg)',padding:28,width:420,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,color:'var(--t1)',marginBottom:18}}>Ajouter une allocation</div>
            {[
              {label:'Nom du fonds *',key:'name',placeholder:'ex: Lazard Japon AC H EUR'},
              {label:'ISIN *',key:'isin',placeholder:'ex: FR0014008M81'},
              {label:'Catégorie',key:'cat',placeholder:'ex: Actions Japon'},
              {label:'Indice de référence',key:'refLabel',placeholder:'ex: Nikkei 225'},
              {label:'Symbole TradingView',key:'refSymbol',placeholder:'ex: INDEX:NKY'},
            ].map(({label,key,placeholder})=>(
              <div key={key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--t2)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}}>{label}</div>
                <input value={newFund[key]} onChange={e=>setNewFund(p=>({...p,[key]:e.target.value}))}
                  placeholder={placeholder}
                  style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontSize:12,background:'var(--bg)',color:'var(--t1)',boxSizing:'border-box'}}/>
              </div>
            ))}
            {addError&&<div style={{color:'#EF4444',fontSize:12,marginBottom:10}}>{addError}</div>}
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={async()=>{
                if(!newFund.name.trim()||!newFund.isin.trim()){setAddError('Nom et ISIN obligatoires');return}
                const isin=newFund.isin.trim().toUpperCase()
                if(funds.find(f=>f.isin===isin)){setAddError('Cet ISIN est déjà dans la liste');return}
                setAddLoading(true);setAddError('')
                const color=FUND_COLORS[funds.length%FUND_COLORS.length]
                const fund={name:newFund.name.trim(),isin,cat:newFund.cat.trim()||'—',refLabel:newFund.refLabel.trim()||'—',refSymbol:newFund.refSymbol.trim()||'',color}
                const d=await fetchNAV(isin)
                setFunds(prev=>[...prev,fund])
                if(d&&d.vl)setNavData(prev=>({...prev,[isin]:d}))
                setAddLoading(false);setAddModal(false)
              }} disabled={addLoading}
                style={{flex:1,padding:'9px 0',background:'var(--gold)',color:'white',border:'none',borderRadius:'var(--rad)',fontWeight:600,fontSize:13,cursor:addLoading?'not-allowed':'pointer'}}>
                {addLoading?'Vérification…':'Ajouter'}
              </button>
              <button onClick={()=>setAddModal(false)}
                style={{padding:'9px 18px',background:'var(--bg)',color:'var(--t2)',border:'1px solid var(--bd)',borderRadius:'var(--rad)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function AgendaView({deals,profile}){
  const token=profile?.gcal_token,isGoogleConnected=!!token
  const [events,setEvents]=useState([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [relanceOpen,setRelanceOpen]=useState(false)
  const [relanceDate,setRelanceDate]=useState('')
  const [viewDays,setViewDays]=useState(7)
  const GCAL='https://www.googleapis.com/calendar/v3'
  function isSameDayFn(a,b){return a.getDate()===b.getDate()&&a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear()}
  function parseEvtDate(s){return s?.dateTime?new Date(s.dateTime):s?.date?new Date(s.date+'T00:00:00'):null}
  const today=new Date();today.setHours(0,0,0,0)
  const endDate=new Date(today);endDate.setDate(today.getDate()+viewDays)

  async function fetchEvents(){
    if(!token)return
    setLoading(true);setError('')
    try{
      const params=new URLSearchParams({timeMin:today.toISOString(),timeMax:endDate.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100'})
      const r=await fetch(`${GCAL}/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${token}`}})
      const d=await r.json()
      if(!r.ok){
        if(d.error?.code===401){setError('Token expiré — reconnexion en cours…');await supabase.auth.signInWithOAuth({provider:'google',options:{scopes:'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',redirectTo:window.location.origin,queryParams:{access_type:'offline',prompt:'none'}}})}
        else{setError(d.error?.message||'Erreur Google Calendar')}
        setLoading(false);return
      }
      setEvents(d.items||[])
    }catch(e){setError('Erreur réseau : '+e.message)}
    setLoading(false)
  }

  async function deleteEvent(id){
    if(!token||!window.confirm('Supprimer cet événement de Google Agenda ?'))return
    await fetch(`${GCAL}/calendars/primary/events/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}})
    setEvents(prev=>prev.filter(e=>e.id!==id))
  }

  useEffect(()=>{if(isGoogleConnected)fetchEvents()},[token,viewDays])

  const days=[]
  for(let i=0;i<viewDays;i++){
    const d=new Date(today);d.setDate(today.getDate()+i)
    days.push({date:d,events:events.filter(e=>{const s=parseEvtDate(e.start);return s&&isSameDayFn(s,d)})})
  }
  const crmCount=events.filter(e=>e.extendedProperties?.private?.entasisCrm==='true').length

  if(!isGoogleConnected) return (
    <div>
      <div className="section-header"><div><div className="section-kicker">Google Agenda</div><div className="section-title">Agenda & Relances</div></div></div>
      <div className="card" style={{maxWidth:460,margin:'48px auto',textAlign:'center',padding:'40px 32px'}}>
        <div style={{fontSize:42,marginBottom:16}}>📅</div>
        <div style={{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:10}}>Google Agenda non connecté</div>
        <div style={{fontSize:13.5,color:'var(--t2)',lineHeight:1.7,marginBottom:24}}>Pour activer l'intégration, déconnecte-toi puis reconnecte-toi avec ton compte Google — le token Calendar sera capturé automatiquement.</div>
        <div style={{fontSize:12,color:'var(--t3)',padding:'10px 14px',background:'var(--bg)',borderRadius:'var(--rad)',border:'1px solid var(--bd)',lineHeight:1.7}}>① Clique <strong style={{color:'var(--t1)'}}>Se déconnecter</strong> en bas du menu<br/>② Clique <strong style={{color:'var(--t1)'}}>Se connecter avec Google</strong><br/>③ Autorise l'accès à Google Agenda<br/>④ L'Agenda s'affiche automatiquement ✓</div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="section-header">
        <div><div className="section-kicker">Google Agenda · synchronisé</div><div className="section-title">Agenda & Relances</div><div className="section-sub">{events.length} événement{events.length!==1?'s':''} · {crmCount} relance{crmCount!==1?'s':''} CRM</div></div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <select className="filter-select" value={viewDays} onChange={e=>setViewDays(Number(e.target.value))}><option value={3}>3 jours</option><option value={7}>7 jours</option><option value={14}>14 jours</option></select>
          <button className="btn btn-ghost btn-sm" onClick={fetchEvents} disabled={loading}><Icon.Refresh/>{loading?' Sync…':' Rafraîchir'}</button>
          <button className="btn btn-gold btn-sm" onClick={()=>{setRelanceDate(new Date().toISOString().slice(0,10));setRelanceOpen(true)}}><Icon.CalPlus/> Nouvelle relance</button>
        </div>
      </div>
      {error&&<div className="notice notice-error" style={{marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between'}}><span>{error}</span><span style={{fontSize:11.5,color:'var(--t3)'}}>Déconnecte-toi et reconnecte-toi avec Google pour rafraîchir le token.</span></div>}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'var(--signed)'}}/>
        <span style={{fontSize:12,color:'var(--t3)'}}>Connecté en tant que {profile?.email||profile?.full_name}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {days.map(({date,events:dayEvts})=>{
          const isT=isToday(date)
          return (
            <div key={date.toISOString()} style={{border:`1px solid ${isT?'var(--gold-line)':'var(--bd)'}`,borderRadius:'var(--rad-lg)',background:isT?'rgba(192,155,90,0.04)':'var(--card)',overflow:'hidden'}}>
              <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:dayEvts.length>0?`1px solid ${isT?'var(--gold-line)':'var(--bd)'}`:'none',background:isT?'rgba(192,155,90,0.06)':'transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {isT&&<span style={{background:'var(--gold)',color:'white',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,letterSpacing:'0.04em'}}>AUJOURD'HUI</span>}
                  <span style={{fontSize:13,fontWeight:isT?700:500,color:isT?'var(--t1)':'var(--t2)',textTransform:'capitalize'}}>{fmtDay(date)}</span>
                  {dayEvts.length>0&&<span style={{fontSize:11,color:'var(--t3)'}}>{dayEvts.length} événement{dayEvts.length>1?'s':''}</span>}
                </div>
                <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>{setRelanceDate(date.toISOString().slice(0,10));setRelanceOpen(true)}}><Icon.CalPlus/> Relance</button>
              </div>
              {dayEvts.length>0?(
                <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
                  {dayEvts.map(evt=>{
                    const start=parseEvtDate(evt.start),end=parseEvtDate(evt.end)
                    const isCrm=evt.extendedProperties?.private?.entasisCrm==='true'
                    const linked=evt.extendedProperties?.private?.entasisDealId?deals.find(d=>d.id===evt.extendedProperties.private.entasisDealId):null
                    const allDay=!!evt.start?.date&&!evt.start?.dateTime
                    return (
                      <div key={evt.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 12px',borderRadius:'var(--rad)',background:isCrm?'rgba(192,155,90,0.06)':'white',border:`1px solid ${isCrm?'var(--gold-line)':'var(--bd)'}`}}>
                        <div style={{minWidth:48,textAlign:'right',flexShrink:0,paddingTop:1}}>
                          {allDay?<span style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase'}}>Journée</span>
                            :<><div style={{fontSize:12,fontWeight:700,color:isCrm?'var(--gold)':'var(--t2)'}}>{fmtTime(start)}</div>{end&&<div style={{fontSize:10,color:'var(--t3)'}}>{fmtTime(end)}</div>}</>}
                        </div>
                        <div style={{width:3,alignSelf:'stretch',borderRadius:2,background:isCrm?'var(--gold)':'var(--progress)',flexShrink:0,minHeight:20}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,color:'var(--t1)',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            {evt.summary||'(sans titre)'}
                            {isCrm&&<span style={{fontSize:10,fontWeight:700,color:'var(--gold)',background:'rgba(192,155,90,0.12)',border:'1px solid var(--gold-line)',borderRadius:3,padding:'1px 5px',letterSpacing:'0.04em'}}>CRM</span>}
                          </div>
                          {linked&&<div style={{marginTop:4,display:'flex',gap:6,alignItems:'center',fontSize:12,color:'var(--t2)',flexWrap:'wrap'}}><Icon.Link/><span>{linked.client} · {linked.product}</span><span className={STATUS_CLASS[linked.status]||'badge'}>{linked.status}</span><strong>{euro(annualize(linked.pp_m))}</strong></div>}
                          {evt.location&&<div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>📍 {evt.location}</div>}
                        </div>
                        {isCrm&&<button onClick={()=>deleteEvent(evt.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--t3)',padding:4,flexShrink:0,opacity:.7}} title="Supprimer"><Icon.Trash/></button>}
                      </div>
                    )
                  })}
                </div>
              ):(
                <div style={{padding:'12px 16px',fontSize:12.5,color:'var(--t3)',fontStyle:'italic'}}>Aucun événement · <button onClick={()=>{setRelanceDate(date.toISOString().slice(0,10));setRelanceOpen(true)}} style={{background:'none',border:'none',color:'var(--gold)',cursor:'pointer',fontSize:12.5,padding:0,textDecoration:'underline'}}>planifier une relance ?</button></div>
              )}
            </div>
          )
        })}
      </div>
      <RelanceModal open={relanceOpen} onClose={()=>setRelanceOpen(false)} deals={deals} defaultDate={relanceDate}/>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TEAM VIEW
───────────────────────────────────────────────────────────────────────────── */
function TeamView({deals,objectifs,teamProfiles,month}){
  const activeAdvisors=teamProfiles.filter(p=>p.is_active&&p.advisor_code)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0)
  const rows=useMemo(()=>activeAdvisors.map(p=>{const m=advisorMetrics(deals,month,p.advisor_code);return {...p,...m}}).sort((a,b)=>b.ppSigned-a.ppSigned),[activeAdvisors,deals,month])

  return (
    <div>
      <div className="section-header"><div><div className="section-kicker">Vue direction</div><div className="section-title">Performance par conseiller</div><div className="section-sub">{activeAdvisors.length} conseiller{activeAdvisors.length!==1?'s':''} actifs · {month}</div></div></div>
      {rows.map((row,i)=>{
        const ppPct=pct(row.ppSigned,ppTarget),ppProjPct=pct(row.ppProjected,ppTarget)
        return (
          <div key={row.id} className="card mb-16">
            <div className="panel-head">
              <div className="flex items-center gap-12">
                <div className="user-avatar" style={{width:40,height:40,fontSize:14}}>{initials(row.full_name||row.advisor_code)}</div>
                <div><div style={{fontSize:15,fontWeight:600,color:'var(--t1)'}}>{i===0&&<span style={{color:'var(--gold)',marginRight:6}}>★</span>}{row.full_name||row.advisor_code}</div><div className="text-xs text-muted">{row.advisor_code} · {row.role==='manager'?'Direction':'Conseiller'}</div></div>
              </div>
              <div className="flex gap-20 flex-wrap">
                <div style={{textAlign:'right'}}><div className="text-xs text-muted mb-4">Taux signature</div><span className={`badge ${row.signRate>=60?'badge-signed':row.signRate>=30?'badge-progress':'badge-cancelled'}`}>{row.signRate}%</span></div>
                <div style={{textAlign:'right'}}><div className="text-xs text-muted mb-4">Ticket moyen PP</div><div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>{row.signedCount>0?euro(row.avgPp):'—'}</div></div>
                <div style={{textAlign:'right'}}><div className="text-xs text-muted mb-4">PP obj.</div><div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>{ppProjPct}%</div></div>
              </div>
            </div>
            <div className="panel-body">
              <div className="kpi-grid mb-16">
                <KpiCard label="PP signée" value={euro(row.ppSigned)} accent="gold" progressValue={ppPct}/>
                <KpiCard label="PP pipeline" value={euro(row.ppPipeline)} hint={`${row.pipelineCount} dossier${row.pipelineCount!==1?'s':''}`} accent="amber"/>
                <KpiCard label="PU signée" value={euro(row.puSigned)} accent="green"/>
                <KpiCard label="Dossiers" value={String(row.total)} hint={`${row.signedCount} signés`}/>
              </div>
              <AreaChart title={`Prévisionnel PP · ${row.advisor_code}`} actual={row.ppSigned} projected={row.ppProjected} target={ppTarget}/>
            </div>
          </div>
        )
      })}
      {!rows.length&&<div className="card"><div className="table-empty-state"><div className="empty-icon">👥</div><div className="empty-title">Aucun conseiller actif</div><div className="empty-sub">Configure les profils dans <span className="code">public.profiles</span></div></div></div>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEAL MODAL
───────────────────────────────────────────────────────────────────────────── */
function DealModal({open,initialDeal,profile,onClose,onSave}){
  const [deal,setDeal]=useState(initialDeal)
  useEffect(()=>setDeal(initialDeal),[initialDeal])
  useEffect(()=>{if(deal&&!deal.advisor_code&&profile?.advisor_code)setDeal(p=>({...p,advisor_code:profile.advisor_code}))},[profile?.advisor_code])
  if(!open||!deal)return null
  const set=(k,v)=>setDeal(p=>({...p,[k]:v}))
  const isManager=profile?.role==='manager'
  const isNew=!initialDeal?.created_at
  async function submit(e){e.preventDefault();await onSave(normalizeDeal(deal))}

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div><div className="modal-title">{isNew?'Nouveau dossier':'Éditer le dossier'}</div>{deal.client&&<div className="modal-subtitle">{deal.client}</div>}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon.Close/></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div>
              <div className="form-section-title mb-16">Informations client</div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Nom du client *</label><input className="form-input" value={deal.client||''} onChange={e=>set('client',e.target.value)} required placeholder="Prénom Nom"/></div>
                <div className="form-group"><label className="form-label">Mois</label><select className="form-select" value={deal.month} onChange={e=>set('month',e.target.value)}>{MONTHS.map(m=><option key={m}>{m}</option>)}</select></div>
              </div>
              <div className="form-row form-row-2 mt-16">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={deal.client_email||''} onChange={e=>set('client_email',e.target.value)} type="email" placeholder="client@exemple.fr"/></div>
                <div className="form-group"><label className="form-label">Téléphone</label><input className="form-input" value={deal.client_phone||''} onChange={e=>set('client_phone',e.target.value)} placeholder="06 00 00 00 00"/></div>
              </div>
            </div>
            <div>
              <div className="form-section-title mb-16">Dossier</div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Produit</label><select className="form-select" value={deal.product} onChange={e=>set('product',e.target.value)}>{PRODUCTS.map(p=><option key={p}>{p}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Compagnie</label><select className="form-select" value={deal.company||''} onChange={e=>set('company',e.target.value)}>{COMPANIES.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="form-row form-row-3 mt-16">
                <div className="form-group"><label className="form-label">PP mensuelle (€)</label><input className="form-input" type="number" min="0" value={deal.pp_m||0} onChange={e=>set('pp_m',e.target.value)}/><div className="form-hint">→ PP annualisée : <strong>{euro(annualize(deal.pp_m))}</strong></div></div>
                <div className="form-group"><label className="form-label">PU (€)</label><input className="form-input" type="number" min="0" value={deal.pu||0} onChange={e=>set('pu',e.target.value)}/></div>
                <div className="form-group"><label className="form-label">Statut</label><select className="form-select" value={deal.status} onChange={e=>set('status',e.target.value)}>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Date de signature prévue</label><input className="form-input" type="date" value={deal.date_expected||''} onChange={e=>set('date_expected',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Date de signature effective</label><input className="form-input" type="date" value={deal.date_signed||''} onChange={e=>set('date_signed',e.target.value)}/></div>
            </div>
            <div>
              <div className="form-section-title mb-16">Équipe & suivi</div>
              <div className="form-row form-row-3">
                <div className="form-group"><label className="form-label">Conseiller principal *</label><input className="form-input" value={deal.advisor_code||''} onChange={e=>set('advisor_code',e.target.value.toUpperCase())} placeholder={profile?.advisor_code||'CODE'} required={isManager} disabled={!isManager}/></div>
                <div className="form-group"><label className="form-label">Co-conseiller</label><input className="form-input" value={deal.co_advisor_code||''} onChange={e=>set('co_advisor_code',e.target.value.toUpperCase())} placeholder="CODE"/></div>
                <div className="form-group"><label className="form-label">Priorité</label><select className="form-select" value={deal.priority} onChange={e=>set('priority',e.target.value)}>{PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></div>
              </div>
              <div className="form-group mt-16"><label className="form-label">Source</label><select className="form-select" value={deal.source||''} onChange={e=>set('source',e.target.value)}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={4} value={deal.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Contexte client, objections, prochaine étape, pièces manquantes…"/></div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-gold">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   APP ROOT
───────────────────────────────────────────────────────────────────────────── */
// ProspectionView — Onglet Prospection LinkedIn / Clay
// À intégrer dans App.jsx

const PROSPECT_STATUS = ['a_contacter','invite','connecte','message_envoye','en_discussion','rdv_propose','rdv_pris','converti','non_interesse']
const PROSPECT_STATUS_LABEL = {
  a_contacter:    'À contacter',
  invite:         'Invitation envoyée',
  connecte:       'Connecté',
  message_envoye: 'Message envoyé',
  en_discussion:  'En discussion',
  rdv_propose:    'RDV proposé',
  rdv_pris:       'RDV pris ✓',
  converti:       'Converti 🎉',
  non_interesse:  'Non intéressé',
}
const PROSPECT_STATUS_COLOR = {
  a_contacter:    {bg:'var(--bg)',bd:'var(--bd)',color:'var(--t3)'},
  invite:         {bg:'rgba(14,165,233,0.07)',bd:'rgba(14,165,233,0.2)',color:'#0EA5E9'},
  connecte:       {bg:'rgba(124,58,237,0.07)',bd:'rgba(124,58,237,0.2)',color:'#7C3AED'},
  message_envoye: {bg:'rgba(192,155,90,0.08)',bd:'var(--gold-line)',color:'var(--gold)'},
  en_discussion:  {bg:'var(--progress-bg)',bd:'var(--progress-bd)',color:'var(--progress)'},
  rdv_propose:    {bg:'rgba(249,115,22,0.07)',bd:'rgba(249,115,22,0.2)',color:'#F97316'},
  rdv_pris:       {bg:'rgba(16,185,129,0.07)',bd:'rgba(16,185,129,0.2)',color:'#10B981'},
  converti:       {bg:'var(--signed-bg)',bd:'var(--signed-bd)',color:'var(--signed)'},
  non_interesse:  {bg:'var(--cancelled-bg)',bd:'var(--cancelled-bd)',color:'var(--cancelled)'},
}
const NICHES = ['Pharmaciens','Chirurgiens-dentistes','Vétérinaires','Architectes','Dirigeants PME']

function ProspectModal({open,prospect,profile,teamProfiles,onClose,onSave}){
  const [p,setP]=useState(prospect)
  useEffect(()=>setP(prospect),[prospect])
  if(!open||!p)return null
  const set=(k,v)=>setP(prev=>({...prev,[k]:v}))
  const isManager=profile?.role==='manager'
  const sc=PROSPECT_STATUS_COLOR[p.status]||PROSPECT_STATUS_COLOR.a_contacter

  async function handleSave(){
    await onSave(p)
    onClose()
  }

  async function handleCopyAndAdvance(){
    if(p.message_linkedin){
      try{await navigator.clipboard.writeText(p.message_linkedin)}catch(e){}
    }
    if(p.status==='a_contacter'||p.status==='invite'||p.status==='connecte'){
      const next='message_envoye'
      const updated={...p,status:next,last_action_at:new Date().toISOString()}
      setP(updated)
      await onSave(updated)
    }
    onClose()
  }

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal-panel" style={{maxWidth:600}}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{p.nom||'Prospect'}</div>
            <div className="modal-subtitle">{p.poste||''}{p.entreprise?` · ${p.entreprise}`:''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Statut */}
          <div className="form-group">
            <label className="form-label">Statut pipeline</label>
            <select className="form-select" value={p.status||'a_contacter'} onChange={e=>set('status',e.target.value)}>
              {PROSPECT_STATUS.map(s=><option key={s} value={s}>{PROSPECT_STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          {/* Message LinkedIn */}
          {p.message_linkedin&&(
            <div className="form-group">
              <label className="form-label">Message LinkedIn généré par IA</label>
              <div style={{
                background:'rgba(192,155,90,0.05)',border:'1px solid var(--gold-line)',
                borderRadius:'var(--rad)',padding:'12px 14px',fontSize:13,
                color:'var(--t2)',lineHeight:1.6,whiteSpace:'pre-wrap',
              }}>
                {p.message_linkedin}
              </div>
              <button
                onClick={handleCopyAndAdvance}
                style={{
                  marginTop:8,display:'flex',alignItems:'center',gap:6,
                  padding:'8px 14px',background:'var(--gold)',color:'white',
                  border:'none',borderRadius:'var(--rad)',fontSize:12,fontWeight:600,cursor:'pointer',
                }}
              >
                📋 Copier le message
                {(p.status==='a_contacter'||p.status==='invite'||p.status==='connecte')&&
                  <span style={{opacity:.8,fontWeight:400}}> · passe en "Message envoyé"</span>}
              </button>
            </div>
          )}

          {/* Contact */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={p.email||''} onChange={e=>set('email',e.target.value)} placeholder="—"/>
            </div>
            <div className="form-group">
              <label className="form-label">Téléphone</label>
              <input className="form-input" value={p.telephone||''} onChange={e=>set('telephone',e.target.value)} placeholder="—"/>
            </div>
          </div>

          {/* RDV */}
          {(p.status==='rdv_propose'||p.status==='rdv_pris')&&(
            <div className="form-group">
              <label className="form-label">Date RDV</label>
              <input className="form-input" type="datetime-local" value={p.rdv_at?p.rdv_at.slice(0,16):''} onChange={e=>set('rdv_at',e.target.value?new Date(e.target.value).toISOString():null)}/>
            </div>
          )}

          {/* Assignation manager */}
          {isManager&&(
            <div className="form-group">
              <label className="form-label">Conseiller assigné</label>
              <select className="form-select" value={p.advisor_code||''} onChange={e=>set('advisor_code',e.target.value)}>
                <option value="">— Non assigné —</option>
                {(teamProfiles||[]).filter(t=>t.is_active&&t.advisor_code).map(t=>(
                  <option key={t.advisor_code} value={t.advisor_code}>{t.full_name||t.advisor_code}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={3} value={p.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Contexte, objections, points à préparer…"/>
          </div>

          {/* LinkedIn */}
          {p.linkedin_url&&(
            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'#0EA5E9',textDecoration:'none'}}>
              🔗 Voir profil LinkedIn
            </a>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Fermer</button>
          <button className="btn btn-gold" onClick={handleSave}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

function ProspectionView({prospects,profile,teamProfiles,onRefresh,onProspectsChange}){
  const [search,setSearch]=useState('')
  const [nicheF,setNicheF]=useState('all')
  const [advisorF,setAdvisorF]=useState('all')
  const [modalOpen,setModalOpen]=useState(false)
  const [selected,setSelected]=useState(null)
  const isManager=profile?.role==='manager'

  // Filtrage
  const filtered=useMemo(()=>{
    let list=prospects
    if(!isManager&&profile?.advisor_code)list=list.filter(p=>p.advisor_code===profile.advisor_code)
    if(nicheF!=='all')list=list.filter(p=>p.niche===nicheF)
    if(advisorF!=='all')list=list.filter(p=>p.advisor_code===advisorF)
    if(search.trim()){
      const q=search.toLowerCase()
      list=list.filter(p=>`${p.nom||''} ${p.entreprise||''} ${p.poste||''} ${p.niche||''}`.toLowerCase().includes(q))
    }
    return list
  },[prospects,isManager,profile,nicheF,advisorF,search])

  // KPIs
  const kpis=useMemo(()=>({
    total:filtered.length,
    messagesSent:filtered.filter(p=>['message_envoye','en_discussion','rdv_propose','rdv_pris','converti'].includes(p.status)).length,
    inDiscussion:filtered.filter(p=>p.status==='en_discussion').length,
    rdvPris:filtered.filter(p=>p.status==='rdv_pris').length,
    convertis:filtered.filter(p=>p.status==='converti').length,
  }),[filtered])

  const tauxReponse=kpis.messagesSent>0?Math.round((kpis.inDiscussion+kpis.rdvPris+kpis.convertis)/kpis.messagesSent*100):0

  // Par colonne kanban
  const byStatus=useMemo(()=>{
    const map={}
    PROSPECT_STATUS.forEach(s=>map[s]=[])
    filtered.forEach(p=>{if(map[p.status])map[p.status].push(p)})
    return map
  },[filtered])

  // Colonnes kanban à afficher (on regroupe les premières)
  const kanbanCols=[
    {id:'a_contacter',   label:'À contacter'},
    {id:'message_envoye',label:'Message envoyé'},
    {id:'en_discussion', label:'En discussion'},
    {id:'rdv_pris',      label:'RDV pris ✓'},
    {id:'converti',      label:'Convertis 🎉'},
  ]

  async function handleSave(updatedProspect){
    const{error:e}=await supabase.from('prospects').update(updatedProspect).eq('id',updatedProspect.id)
    if(e){alert(e.message);return}
    onProspectsChange(prev=>prev.map(p=>p.id===updatedProspect.id?updatedProspect:p))
  }

  function openModal(prospect){
    setSelected(prospect)
    setModalOpen(true)
  }

  const niches=[...new Set(prospects.map(p=>p.niche).filter(Boolean))].sort()
  const advisors=isManager?[...new Set(prospects.map(p=>p.advisor_code).filter(Boolean))].sort():[]

  return(
    <div>
      {/* Header + KPIs */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Prospection LinkedIn · Clay</div>
          <div className="section-title">Pipeline de prospection</div>
          <div className="section-sub">{filtered.length} prospect{filtered.length!==1?'s':''} · Taux réponse {tauxReponse}%</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Actualiser</button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Total prospects',value:kpis.total,color:'var(--t1)',bg:'var(--bg)',bd:'var(--bd)'},
          {label:'Messages envoyés',value:kpis.messagesSent,color:'var(--gold)',bg:'rgba(192,155,90,0.06)',bd:'var(--gold-line)'},
          {label:'Taux réponse',value:`${tauxReponse}%`,color:'var(--progress)',bg:'var(--progress-bg)',bd:'var(--progress-bd)'},
          {label:'RDV pris',value:kpis.rdvPris,color:'#10B981',bg:'rgba(16,185,129,0.07)',bd:'rgba(16,185,129,0.2)'},
          {label:'Convertis',value:kpis.convertis,color:'var(--signed)',bg:'var(--signed-bg)',bd:'var(--signed-bd)'},
        ].map(s=>(
          <div key={s.label} style={{background:s.bg,border:`1px solid ${s.bd}`,borderRadius:'var(--rad-lg)',padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--t3)',marginBottom:6,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.label}</div>
            <div style={{fontSize:26,fontWeight:700,color:s.color,fontFamily:'var(--font-serif)'}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:160,maxWidth:280}}>
          <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Nom, entreprise, poste…"
            style={{width:'100%',paddingLeft:32,height:34,fontSize:12}}/>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--t3)',pointerEvents:'none'}}>🔍</span>
          {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--t3)',fontSize:13,padding:0}}>×</button>}
        </div>
        {niches.length>1&&(
          <select className="filter-select" value={nicheF} onChange={e=>setNicheF(e.target.value)} style={{height:34,fontSize:12}}>
            <option value="all">Toutes niches</option>
            {niches.map(n=><option key={n} value={n}>{n} · {prospects.filter(p=>p.niche===n).length}</option>)}
          </select>
        )}
        {isManager&&advisors.length>1&&(
          <select className="filter-select" value={advisorF} onChange={e=>setAdvisorF(e.target.value)} style={{height:34,fontSize:12}}>
            <option value="all">Tous conseillers</option>
            {advisors.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* Kanban */}
      <div style={{display:'grid',gridTemplateColumns:`repeat(${kanbanCols.length},1fr)`,gap:10,overflowX:'auto'}}>
          {kanbanCols.map(col=>{
            const items=byStatus[col.id]||[]
            const sc=PROSPECT_STATUS_COLOR[col.id]||PROSPECT_STATUS_COLOR.a_contacter
            return(
              <div key={col.id} style={{
                background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:'var(--rad-lg)',
                minHeight:200,display:'flex',flexDirection:'column',
              }}>
                {/* Tête colonne */}
                <div style={{
                  padding:'10px 12px',borderBottom:'2px solid var(--bd)',
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  background:sc.bg,borderRadius:'var(--rad-lg) var(--rad-lg) 0 0',
                }}>
                  <span style={{fontSize:11.5,fontWeight:700,color:sc.color}}>{col.label}</span>
                  <span style={{fontSize:11,fontWeight:600,background:sc.bd,color:sc.color,padding:'1px 7px',borderRadius:10,border:`1px solid ${sc.bd}`}}>{items.length}</span>
                </div>
                {/* Cards */}
                <div style={{padding:8,display:'flex',flexDirection:'column',gap:6,flex:1}}>
                  {items.map(p=>(
                    <div key={p.id}
                      onClick={()=>openModal(p)}
                      style={{
                        background:'white',border:'1px solid var(--bd)',borderRadius:'var(--rad)',
                        padding:'9px 11px',cursor:'pointer',transition:'box-shadow .15s',
                      }}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-xs)'}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
                    >
                      <div style={{fontWeight:600,fontSize:12.5,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>{p.nom}</div>
                      <div style={{fontSize:11,color:'var(--t3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.poste||p.entreprise||'—'}</div>
                      {p.niche&&<div style={{marginTop:5,display:'inline-block',fontSize:9.5,fontWeight:600,padding:'1px 5px',borderRadius:3,background:'rgba(192,155,90,0.1)',color:'var(--gold)',border:'1px solid var(--gold-line)'}}>{p.niche}</div>}
                      {p.advisor_code&&isManager&&<div style={{marginTop:3,fontSize:10,color:'var(--t3)'}}>{p.advisor_code}</div>}
                      {p.message_linkedin&&col.id==='a_contacter'&&(
                        <div style={{marginTop:5,fontSize:10,color:'var(--gold)',display:'flex',alignItems:'center',gap:3}}>
                          <span>📋</span> Message prêt
                        </div>
                      )}
                    </div>
                  ))}
                  {!items.length&&<div style={{fontSize:11.5,color:'var(--t3)',fontStyle:'italic',padding:'10px 4px',textAlign:'center'}}>Aucun prospect</div>}
                </div>
              </div>
            )
          })}
        </div>
      {filtered.length===0&&(
        <div className="table-empty-state" style={{marginTop:20}}>
          <div className="empty-icon">📧</div>
          <div className="empty-title">Aucun prospect</div>
          <div className="empty-sub">Les prospects Clay arriveront ici via Zapier.</div>
        </div>
      )}

      <ProspectModal
        open={modalOpen}
        prospect={selected}
        profile={profile}
        teamProfiles={teamProfiles}
        onClose={()=>{setModalOpen(false);setSelected(null)}}
        onSave={handleSave}
      />
    </div>
  )
}

export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [teamProfiles,setTeamProfiles]=useState([])
  const [deals,setDeals]=useState([])
  const [leads,setLeads]=useState([])
  const [objectifs,setObjectifs]=useState(EMPTY_OBJECTIFS)
  const [loading,setLoading]=useState(true)
  const [month,setMonth]=useState(currentMonth())
  const [modalOpen,setModalOpen]=useState(false)
  const [editingDeal,setEditingDeal]=useState(null)
  const [error,setError]=useState('')
  const [activeTab,setActiveTab]=useState('dashboard')
  const [prospects,setProspects]=useState([])
  const [prospectsNew,setProspectsNew]=useState(0)
  const [dossiersImmoCount,setDossiersImmoCount]=useState(0)

  const fetchProspects=()=>supabase.from('prospects').select('*').order('created_at',{ascending:false}).then(({data})=>{
    if(data){setProspects(data);setProspectsNew(data.filter(p=>p.status==='a_contacter').length)}
  })

  // ── Leads — fetch + Realtime + polling 15s ────────────────────────────────
  const fetchLeads=()=>supabase.from('leads').select('*').order('created_at',{ascending:false}).then(({data})=>{if(data)setLeads(data)})

  useEffect(()=>{
    if(!session?.user)return
    fetchLeads()
    const poll=setInterval(fetchLeads,5000)
    const channel=supabase.channel('leads-room')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'leads'},()=>{console.log('[Leads] INSERT Realtime');fetchLeads()})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'leads'},payload=>{
        setLeads(prev=>prev.map(l=>l.id===payload.new.id?payload.new:l))
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'leads'},payload=>{
        setLeads(prev=>prev.filter(l=>l.id!==payload.old.id))
      })
      .subscribe()
    return()=>{clearInterval(poll);supabase.removeChannel(channel)}
  },[session?.user?.id])

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!isSupabaseConfigured)return
    let active=true

    // onAuthStateChange gère TOUS les événements, y compris INITIAL_SESSION
    // Ne pas appeler getSession() séparément pour éviter le lock contention
    const fallback=setTimeout(()=>{if(active)setLoading(false)},8000)
    const{data:listener}=supabase.auth.onAuthStateChange(async(event,s)=>{
      if(!active)return
      clearTimeout(fallback)
      if(event==='SIGNED_OUT'){setSession(null);setLoading(false);return}
      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED → mettre à jour la session
      setSession(s||null)
      setLoading(false)
      if((event==='SIGNED_IN')&&s?.provider_token&&s?.user?.id){
        try{
          await supabase.from('profiles').update({gcal_token:s.provider_token}).eq('id',s.user.id)
          const{data:prof}=await supabase.from('profiles').select('*').eq('id',s.user.id).maybeSingle()
          if(prof&&active)setProfile(prof)
        }catch(e){console.warn('gcal_token update:',e)}
      }
    })

    return()=>{active=false;clearTimeout(fallback);listener.subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    if(!session?.user){setProfile(null);setDeals([]);setTeamProfiles([]);return}
    loadAll(session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.user?.id])

  async function loadAll(currentSession){
    const s=currentSession||session
    if(!s?.user)return
    const userId=s.user.id
    setError('')
    try {
      const[profRes,teamRes,dealsRes,objRes,prospRes]=await Promise.all([
        supabase.from('profiles').select('*').eq('id',userId).maybeSingle(),
        supabase.from('profiles').select('id,email,full_name,role,advisor_code,is_active').order('full_name',{ascending:true}),
        supabase.from('deals').select('*').order('created_at',{ascending:false}),
        supabase.from('objectifs').select('*'),
        supabase.from('prospects').select('*').order('created_at',{ascending:false}),
      ])
      const nonProfileErrs=[teamRes,dealsRes,objRes].filter(r=>r.error).map(r=>r.error.message)
      if(nonProfileErrs.length)setError(nonProfileErrs[0])
      let prof=profRes.data
      if(profRes.error)console.warn('Profile fetch error:',profRes.error.message)
      if(!prof&&s.user){
        // Retry 3x avec délai croissant avant de créer
        for(let i=0;i<3&&!prof;i++){
          await new Promise(r=>setTimeout(r,(i+1)*800))
          const{data:retry}=await supabase.from('profiles').select('*').eq('id',userId).maybeSingle()
          prof=retry
        }
        if(!prof){
          const email=s.user.email||''
          const fullName=s.user.user_metadata?.full_name||s.user.user_metadata?.name||email.split('@')[0]||''
          const{data:newProf}=await supabase.from('profiles').upsert({
            id:userId,email,full_name:fullName,role:'advisor',is_active:true,
            advisor_code:email.split('@')[0].toUpperCase().slice(0,6),
          },{onConflict:'id'}).select().maybeSingle()
          prof=newProf
        }
      }
      setProfile(prof||null)
      setTeamProfiles(teamRes.data||[])
      setDeals(dealsRes.data||[])
      const prospData=prospRes.data||[]
      setProspects(prospData)
      setProspectsNew(prospData.filter(p=>p.status==='a_contacter').length)
      // Count active immo dossiers (silently ignore if table doesn't exist yet)
      try{
        const{data:immoData}=await supabase.from('dossiers_immo').select('id',{count:'exact',head:false})
        setDossiersImmoCount((immoData||[]).filter(d=>true).length)
      }catch{}
      const map={...EMPTY_OBJECTIFS}
      ;(objRes.data||[]).forEach(row=>{map[row.month]=row})
      setObjectifs(map)
    } catch(e) {
      // Ignore lock contention errors — they resolve on next auth cycle
      if(e.message?.includes('released because another request stole it')){
        console.warn('Auth lock contention, will retry on next session event')
        return
      }
      setError('Erreur chargement : '+e.message)
    }
  }

  // ✅ Fix stale session : getUser() au lieu de session.user.id
  async function saveDeal(deal){
    const{data:{user}}=await supabase.auth.getUser()
    const payload={...deal,advisor_code:profile?.role==='manager'?deal.advisor_code:(profile?.advisor_code||deal.advisor_code),created_by:user.id}
    const existing=deals.some(d=>d.id===deal.id)
    const q=existing?supabase.from('deals').update(payload).eq('id',deal.id):supabase.from('deals').insert(payload)
    const{error:e}=await q
    if(e){alert(e.message);return}
    setModalOpen(false);setEditingDeal(null);await loadAll()
  }

  async function deleteDeal(deal){
    if(!window.confirm(`Supprimer définitivement le dossier de ${deal.client} ?`))return
    const{error:e}=await supabase.from('deals').delete().eq('id',deal.id)
    if(e){alert(e.message);return}
    await loadAll()
  }

  async function saveObjectif(row){
    const{error:e}=await supabase.from('objectifs').upsert(row)
    if(e){alert(e.message);return}
    await loadAll()
  }

  // Conversion lead → pré-remplissage modal dossier
  function convertLeadToDeal(lead){
    const deal=emptyDeal(profile?.advisor_code)
    deal.client=lead.nom||''
    deal.client_email=lead.email_confirmed||lead.email||''
    deal.client_phone=lead.telephone||''
    deal.source='Leads Facebook'
    deal.notes=[
      `Lead ${lead.campagne} reçu le ${lead.created_at?new Date(lead.created_at).toLocaleDateString('fr-FR'):''}`,
      lead.tmi?`TMI : ${lead.tmi}`:'',
      lead.patrimoine_net?`Patrimoine net : ${lead.patrimoine_net}`:'',
      lead.actifs?`Actifs : ${lead.actifs}`:'',
    ].filter(Boolean).join('\n')
    setEditingDeal(deal)
    setModalOpen(true)
    setActiveTab('dossiers')
  }

  function startCreate(){setEditingDeal(emptyDeal(profile?.advisor_code));setModalOpen(true)}
  function startEdit(deal){setEditingDeal({...deal});setModalOpen(true)}
  async function signOut(){await supabase.auth.signOut()}

  if(!isSupabaseConfigured)return<ConfigMissing/>
  if(!session)return<AuthScreen/>

  if(loading)return(
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'var(--bg)'}}>
      <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--t1)',letterSpacing:'0.05em'}}>ENTASIS</div>
      <div className="loading-spinner"/>
      <div className="text-sm text-muted">Chargement du CRM… (peut prendre 20-30s)</div>
    </div>
  )

  const isManager=profile?.role==='manager'
  const leadsAvailable=leads.filter(l=>l.status==='available'||l.status==='released').length

  return (
    <div className="app-shell">
      <Sidebar
        profile={profile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={signOut}
        deals={deals}
        month={month}
        leadsAvailable={leadsAvailable}
        prospectsNew={prospectsNew}
        dossiersImmoCount={dossiersImmoCount}
      />
      <div className="app-main">
        <TopBar activeTab={activeTab} month={month} setMonth={setMonth} onNewDeal={startCreate} onRefresh={loadAll}/>
        <div className="app-content">
          {error&&<div className="notice notice-error">{error}</div>}
          {!profile&&error&&<div className="notice notice-warn">Profil introuvable dans <span className="code">public.profiles</span>. Vérifie la table et les policies.</div>}

          {activeTab==='dashboard'&&(isManager?<ManagerDashboard deals={deals} objectifs={objectifs} month={month} teamProfiles={teamProfiles}/>:<AdvisorDashboard deals={deals} objectifs={objectifs} month={month} profile={profile}/>)}
          {activeTab==='leads'&&<LeadRoom leads={leads} profile={profile} onLeadsChange={setLeads} onConvertDeal={convertLeadToDeal} onRefresh={fetchLeads}/>}
          {activeTab==='pipeline'&&<PipelineBoard deals={deals} month={month} profile={profile} onEdit={startEdit}/>}
          {activeTab==='dossiers'&&<DealsTable deals={deals} month={month} profile={profile} onEdit={startEdit} onDelete={deleteDeal} onRefresh={loadAll}/>}
          {activeTab==='forecast'&&<ForecastView deals={deals} objectifs={objectifs} month={month} profile={profile} teamProfiles={teamProfiles} canEditObjectifs={isManager} onSaveObjectif={saveObjectif}/>}
          {activeTab==='agenda'&&<AgendaView deals={deals} profile={profile}/>}
          {activeTab==='market'&&<MarketView/>}
          {activeTab==='team'&&isManager&&<TeamView deals={deals} objectifs={objectifs} teamProfiles={teamProfiles} month={month}/>}
          {activeTab==='prospection'&&<ProspectionView prospects={prospects} profile={profile} teamProfiles={teamProfiles} onRefresh={fetchProspects} onProspectsChange={setProspects}/>}
          {activeTab==='immo-dashboard'&&<VueImmobilier profile={profile} setActiveTab={setActiveTab}/>}
          {activeTab==='immo-programmes'&&<CatalogueProgrammes setActiveTab={setActiveTab}/>}
          {activeTab==='immo-dossiers'&&<MesDossiersImmo profile={profile} teamProfiles={teamProfiles} setActiveTab={setActiveTab}/>}
          {activeTab==='immo-pipeline'&&<PipelineVEFA profile={profile} teamProfiles={teamProfiles}/>}
          {activeTab==='outils'&&<OutilsCGP/>}
        </div>
      </div>

      <DealModal
        open={modalOpen}
        initialDeal={editingDeal}
        profile={profile}
        onClose={()=>{setModalOpen(false);setEditingDeal(null)}}
        onSave={saveDeal}
      />
      <Toaster position="top-right" toastOptions={{style:{background:'#242424',color:'#f5f0e8',border:'1px solid rgba(201,168,76,0.2)',borderRadius:12,fontSize:13,fontFamily:'DM Sans, sans-serif'}}}/>
    </div>
  )
}
