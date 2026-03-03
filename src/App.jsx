import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

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
  Plus:      ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  Close:     ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  Edit:      ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 1.5l2.5 2.5-7 7L2 12l.5-2.5 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Trash:     ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 3.5h10M5 3.5V2h3v1.5M3 3.5l.8 7.5h5.4l.8-7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Refresh:   ()=><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 012 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 3.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Clock:     ()=><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
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
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [msg,setMsg]=useState('')
  const [loading,setLoading]=useState(false)

  async function signIn(e){
    e.preventDefault();setLoading(true);setMsg('')
    const{error}=await supabase.auth.signInWithPassword({email,password})
    setLoading(false);if(error)setMsg(error.message)
  }
  async function signUp(){
    setLoading(true);setMsg('')
    const{error}=await supabase.auth.signUp({email,password})
    setLoading(false)
    if(error)setMsg(error.message)
    else setMsg('Compte créé. Vérifie ton email si la confirmation est activée.')
  }
  async function magicLink(){
    if(!email)return
    setLoading(true);setMsg('')
    const redirectTo=typeof window!=='undefined'?window.location.origin:undefined
    const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}})
    setLoading(false)
    if(error)setMsg(error.message)
    else setMsg('Lien de connexion envoyé à '+email)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">ENTASIS</div>
        <div className="auth-brand-sub">CRM Patrimonial · Équipe interne</div>
        <form onSubmit={signIn} className="flex-col gap-12">
          <div className="form-group">
            <label className="form-label">Email professionnel</label>
            <input className="form-input" value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="prenom.nom@entasis-conseil.fr" required/>
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input className="form-input" value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" required/>
          </div>
          <button className="btn btn-primary w-full" style={{marginTop:4}} disabled={loading} type="submit">
            {loading?'Connexion en cours…':'Se connecter'}
          </button>
        </form>
        <div className="auth-divider">ou</div>
        <div className="flex-col gap-8">
          <button className="btn btn-outline w-full" disabled={loading} onClick={signUp}>Créer un compte</button>
          <button className="btn btn-ghost w-full" disabled={loading||!email} onClick={magicLink}>Recevoir un lien magique</button>
        </div>
        {msg&&<div className="auth-notice">{msg}</div>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────────────────────── */
function Sidebar({profile,activeTab,setActiveTab,onSignOut,deals,month}){
  const isManager=profile?.role==='manager'

  const hotCount=useMemo(()=>{
    const code=profile?.advisor_code
    if(!code)return 0
    return deals.filter(d=>d.month===month&&dealMatchesAdvisor(d,code)&&(d.priority==='Urgente'||d.priority==='Haute')&&isPipeline(d.status)).length
  },[deals,month,profile])

  const pipelineCount=useMemo(()=>deals.filter(d=>d.month===month&&isPipeline(d.status)).length,[deals,month])

  const navItems = [
    {key:'dashboard', label: isManager?'Vue cabinet':'Mon mois', Icon:Icon.Dashboard},
    {key:'pipeline',  label:'Pipeline',  Icon:Icon.Pipeline,  badge:isManager?pipelineCount:hotCount},
    {key:'dossiers',  label:'Dossiers',  Icon:Icon.Dossiers},
    {key:'forecast',  label:'Prévisionnel', Icon:Icon.Forecast},
    ...(isManager?[{key:'team', label:'Équipe', Icon:Icon.Team}]:[]),
  ]

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-wordmark">ENTASIS</div>
        <div className="brand-sub">CRM Patrimonial</div>
      </div>
      <div className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(({key,label,Icon:NavIcon,badge})=>(
          <button key={key} className={`nav-item${activeTab===key?' active':''}`} onClick={()=>setActiveTab(key)}>
            <NavIcon/>
            {label}
            {badge>0&&<span className="nav-item-badge">{badge}</span>}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{initials(profile?.full_name||profile?.email||'U')}</div>
          <div>
            <div className="user-name">{profile?.full_name||profile?.email||'Utilisateur'}</div>
            <div className="user-role">{profile?.role==='manager'?'Direction':'Conseiller'}{profile?.advisor_code?` · ${profile.advisor_code}`:''}</div>
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
const PAGE_TITLES={dashboard:'Vue d\'ensemble',pipeline:'Pipeline commercial',dossiers:'Dossiers clients',forecast:'Prévisionnel',team:'Équipe'}

function TopBar({activeTab,month,setMonth,onNewDeal,onRefresh}){
  return (
    <div className="topbar">
      <div className="topbar-title">{PAGE_TITLES[activeTab]||'CRM'}</div>
      <div className="topbar-actions">
        <select className="month-select" value={month} onChange={e=>setMonth(e.target.value)}>
          {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><Icon.Refresh/></button>
        <button className="btn btn-gold" onClick={onNewDeal}><Icon.Plus/> Nouveau dossier</button>
      </div>
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
          <div className="chart-legend-item">
            <div className="legend-dot" style={{background:'var(--signed)'}}/>
            Réalisé : {euro(actual)} ({pctS}%)
          </div>
          <div className="chart-legend-item">
            <div className="legend-dot" style={{background:'var(--gold)'}}/>
            Projeté : {euro(safeProjected)} ({pctP}%)
          </div>
          {target>0&&<div className="chart-legend-item">
            <div className="legend-dot" style={{background:'var(--gold)',opacity:0.4}}/>
            Objectif : {euro(target)}
          </div>}
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
    const scope=advisorCode
      ?deals.filter(d=>d.month===m&&dealMatchesAdvisor(d,advisorCode))
      :deals.filter(d=>d.month===m)
    const signed=scope.filter(d=>d.status==='Signé')
    const pipeline=scope.filter(d=>isPipeline(d.status))
    const ppS=sumAnnualPp(signed)
    const ppP=sumAnnualPp(pipeline)
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

  // Target line points
  const targetPts=data.map((d,i)=>({
    x:PL+i*barGroupW+barGroupW/2,
    y:d.target>0?toY(d.target):null
  }))
  const targetPath=targetPts.reduce((path,pt,i)=>{
    if(pt.y===null)return path
    return path+(path===''?`M${pt.x},${pt.y}`:`L${pt.x},${pt.y}`)
  },'')

  const gridVals=[0.25,0.5,0.75,1].map(t=>({
    y:PT+(H-PT-PB)*(1-t),
    label:euro(maxVal*t),
  }))

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
            <linearGradient id="bar-signed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C09B5A"/>
              <stop offset="100%" stopColor="#9A7B3A"/>
            </linearGradient>
            <linearGradient id="bar-pipeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(192,155,90,0.35)"/>
              <stop offset="100%" stopColor="rgba(192,155,90,0.15)"/>
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {gridVals.map((g,i)=>(
            <line key={i} x1={PL} y1={g.y} x2={W-PR} y2={g.y} stroke="var(--bd)" strokeWidth="0.5"/>
          ))}
          <line x1={PL} y1={H-PB} x2={W-PR} y2={H-PB} stroke="var(--bd)" strokeWidth="1"/>

          {/* Target line */}
          {targetPath&&<path d={targetPath} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"/>}

          {/* Bars */}
          {data.map((d,i)=>{
            const cx=PL+i*barGroupW+barGroupW/2
            const bx=cx-barW/2
            const isCurrent=i===curIdx
            const hy=toY(d.ppTotal)
            const hh=toH(d.ppTotal)
            const sh=toH(d.ppSigned)
            const sy=H-PB-sh
            const ph=hh-sh
            const py=sy-ph
            return (
              <g key={d.month}>
                {/* Pipeline bar (lighter, on top) */}
                {ph>0.5&&<rect x={bx} y={py} width={barW} height={ph} fill="url(#bar-pipeline)" rx="2" ry="2"/>}
                {/* Signed bar */}
                {sh>0.5&&<rect x={bx} y={sy} width={barW} height={sh} fill={isCurrent?"url(#bar-signed)":"rgba(192,155,90,0.75)"} rx="2" ry="2"/>}
                {/* Current month glow */}
                {isCurrent&&hh>0.5&&<rect x={bx-1} y={Math.min(py,sy)-1} width={barW+2} height={hh+2} fill="none" stroke="var(--gold)" strokeWidth="1.5" rx="3" opacity="0.5"/>}
                {/* Month label */}
                <text
                  x={cx} y={H-8} textAnchor="middle"
                  fontSize="9.5" fill={isCurrent?'var(--gold)':'var(--t3)'}
                  fontWeight={isCurrent?'600':'400'}
                  fontFamily="var(--font-sans)"
                >
                  {d.month.slice(0,3)}
                </text>
              </g>
            )
          })}
        </svg>
        <div className="chart-legend">
          <div className="chart-legend-item">
            <div className="legend-dot" style={{background:'var(--gold)'}}/>
            PP signée : {euro(data.reduce((s,d)=>s+d.ppSigned,0))}
          </div>
          <div className="chart-legend-item">
            <div className="legend-dot" style={{background:'rgba(192,155,90,0.35)',border:'1px solid var(--gold)'}}/>
            PP pipeline : {euro(data.reduce((s,d)=>s+d.ppPipeline,0))}
          </div>
          <div className="chart-legend-item">
            <div className="legend-dot" style={{background:'var(--gold)',opacity:0.4}}/>
            Ligne objectif cabinet
          </div>
          <div className="chart-legend-item" style={{marginLeft:'auto'}}>
            <div className="legend-dot" style={{background:'var(--gold)',outline:'1.5px solid var(--gold)',outlineOffset:1}}/>
            Mois en cours : <strong style={{color:'var(--t1)'}}>{currentMonth}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}


function KpiCard({label,value,hint,accent,progress,progressValue,delta}){
  const accentClass=accent?`kpi-card-${accent}`:''
  const fill=progressValue!=null?Math.min(100,progressValue):null
  const hasDelta=delta!=null&&delta.raw!==0
  const deltaUp=delta?.raw>0
  return (
    <div className={`kpi-card ${accentClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hasDelta&&(
        <div style={{
          display:'inline-flex',alignItems:'center',gap:3,
          fontSize:11.5,fontWeight:500,marginTop:4,
          color:deltaUp?'var(--signed)':'var(--cancelled)',
        }}>
          <span style={{fontSize:10}}>{deltaUp?'▲':'▼'}</span>
          {deltaUp?'+':''}{delta.label} vs mois préc.
        </div>
      )}
      {!hasDelta&&hint&&<div className="kpi-hint">{hint}</div>}
      {fill!=null&&<>
        <div className="kpi-progress-bar">
          <div className={`kpi-progress-fill${fill>=100?' over':''}`} style={{width:`${Math.min(100,fill)}%`}}/>
        </div>
        <div className="kpi-hint" style={{marginTop:4}}>{fill}% de l'objectif</div>
      </>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ADVISOR DASHBOARD — MON MOIS
───────────────────────────────────────────────────────────────────────────── */
function AdvisorDashboard({deals,objectifs,month,profile}){
  const code=profile?.advisor_code||''
  const m=advisorMetrics(deals,month,code)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0)
  const puTarget=Number(targets.pu_target||0)
  const ppPct=pct(m.ppSigned,ppTarget)
  const ppProjPct=pct(m.ppProjected,ppTarget)
  const landing=ppTarget>0?m.ppProjected-ppTarget:null

  const priorities=[...m.hotDeals].sort((a,b)=>{
    const p={'Urgente':0,'Haute':1,'Normale':2}
    return (p[a.priority]||2)-(p[b.priority]||2)
  })

  return (
    <div>
      {/* Hero */}
      <div className="advisor-hero">
        <div className="advisor-hero-eyebrow">Tableau de bord · {month}</div>
        <div className="advisor-hero-name">{profile?.full_name||code||'Mon mois'}</div>
        <div className="advisor-hero-month">{m.signedCount} dossier{m.signedCount!==1?'s':''} signés · {m.pipelineCount} en pipeline · taux de signature {m.signRate}%</div>
        <div className="advisor-hero-kpis">
          <div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">PP signée</div>
            <div className="advisor-hero-kpi-value gold">{euro(m.ppSigned)}</div>
          </div>
          <div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">PP projetée</div>
            <div className="advisor-hero-kpi-value">{euro(m.ppProjected)}</div>
          </div>
          <div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">PU signée</div>
            <div className="advisor-hero-kpi-value">{euro(m.puSigned)}</div>
          </div>
          <div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">PU projetée</div>
            <div className="advisor-hero-kpi-value">{euro(m.puProjected)}</div>
          </div>
          {ppTarget>0&&<div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">Objectif PP</div>
            <div className="advisor-hero-kpi-value">{ppProjPct}%</div>
          </div>}
          {landing!=null&&<div className="advisor-hero-kpi">
            <div className="advisor-hero-kpi-label">Atterrissage</div>
            <div className="advisor-hero-kpi-value" style={{color:landing>=0?'#86EFAC':'#FCA5A5'}}>
              {landing>=0?'+':''}{euro(landing)}
            </div>
          </div>}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid mb-24">
        <KpiCard label="PP signée annualisée" value={euro(m.ppSigned)} hint="Réalisé du mois" accent="gold" progressValue={ppPct} delta={prevMonth?dPpSigned:null}/>
        <KpiCard label="PP en pipeline" value={euro(m.ppPipeline)} hint={`${m.pipelineCount} dossier${m.pipelineCount!==1?'s':''} en cours / prévus`} accent="amber" delta={prevMonth?dPpPipeline:null}/>
        <KpiCard label="PU signée" value={euro(m.puSigned)} hint="Versements uniques signés" accent="green" delta={prevMonth?dPuSigned:null}/>
        <KpiCard label="PU en pipeline" value={euro(m.puPipeline)} hint="À signer ce mois" accent="blue"/>
      </div>

      <div className="grid-2 gap-24" style={{alignItems:'start'}}>
        {/* Charts */}
        <div className="flex-col gap-16">
          <AreaChart
            title="PP annualisée"
            subtitle="Réalisé vs objectif cabinet"
            actual={m.ppSigned}
            projected={m.ppProjected}
            target={ppTarget}
          />
          <AreaChart
            title="PU"
            subtitle="Versements uniques"
            actual={m.puSigned}
            projected={m.puProjected}
            target={puTarget}
          />
        </div>

        {/* Priorities */}
        <div>
          <div className="section-header">
            <div>
              <div className="section-kicker">Actions immédiates</div>
              <div className="section-title">Mes priorités</div>
            </div>
          </div>
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
            <div className="table-empty-state">
              <div className="empty-icon">✓</div>
              <div className="empty-title">Aucune priorité urgente</div>
              <div className="empty-sub">Tous tes dossiers chauds sont traités.</div>
            </div>
          )}

          {/* Ecart objectif */}
          {ppTarget>0&&<div style={{marginTop:20,background:'var(--gold-subtle)',border:'1px solid var(--gold-line)',borderRadius:'var(--rad-lg)',padding:'16px 20px'}}>
            <div className="section-kicker" style={{marginBottom:10}}>Pilotage objectif</div>
            <div className="flex gap-16 flex-wrap">
              <div>
                <div className="text-xs text-muted mb-4">Réalisé</div>
                <div className="font-serif" style={{fontSize:18,fontWeight:500}}>{ppPct}%</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-4">Projeté</div>
                <div className="font-serif" style={{fontSize:18,fontWeight:500}}>{ppProjPct}%</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-4">Reste à faire</div>
                <div className="font-serif" style={{fontSize:18,fontWeight:500,color:landing!=null&&landing<0?'var(--cancelled)':'var(--signed)'}}>
                  {ppTarget>0?euro(Math.max(0,ppTarget-m.ppProjected)):'—'}
                </div>
              </div>
            </div>
          </div>}
        </div>
      </div>

      {/* Annual chart */}
      <div style={{marginTop:28}}>
        <div className="section-header">
          <div>
            <div className="section-kicker">Vue annuelle</div>
            <div className="section-title">Saisonnalité — 12 mois</div>
            <div className="section-sub">PP annualisée signée + pipeline par mois · mois courant mis en valeur</div>
          </div>
        </div>
        <AnnualChart deals={deals} objectifs={objectifs} currentMonth={month} advisorCode={code} title="PP annualisée — mon année" subtitle={`Conseiller ${code} · barres : signée (plein) + pipeline (transparent)`}/>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MANAGER DASHBOARD — VUE CABINET
───────────────────────────────────────────────────────────────────────────── */
function ManagerDashboard({deals,objectifs,month,teamProfiles}){
  const monthDeals=deals.filter(d=>d.month===month)
  const signed=monthDeals.filter(d=>d.status==='Signé')
  const pipeline=monthDeals.filter(d=>isPipeline(d.status))
  const ppS=sumAnnualPp(signed), puS=sumPu(signed)
  const ppP=sumAnnualPp(pipeline), puP=sumPu(pipeline)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0)
  const puTarget=Number(targets.pu_target||0)
  const activeAdvisors=teamProfiles.filter(p=>p.is_active&&p.advisor_code)

  // M vs M-1
  const prevIdx=MONTHS.indexOf(month)-1
  const prevMonth=prevIdx>=0?MONTHS[prevIdx]:null
  const prevDeals=prevMonth?deals.filter(d=>d.month===prevMonth):[]
  const prevSigned=prevDeals.filter(d=>d.status==='Signé')
  const prevPipeline=prevDeals.filter(d=>isPipeline(d.status))
  const prevPpS=sumAnnualPp(prevSigned),prevPuS=sumPu(prevSigned)
  const prevPpP=sumAnnualPp(prevPipeline)
  const dPpS={raw:ppS-prevPpS,label:euro(Math.abs(ppS-prevPpS))}
  const dPuS={raw:puS-prevPuS,label:euro(Math.abs(puS-prevPuS))}
  const dPpProj={raw:(ppS+ppP)-(prevPpS+prevPpP),label:euro(Math.abs((ppS+ppP)-(prevPpS+prevPpP)))}

  const advisorRows=useMemo(()=>activeAdvisors.map(p=>{
    const m=advisorMetrics(deals,month,p.advisor_code)
    return {...p,...m}
  }).sort((a,b)=>b.ppSigned-a.ppSigned),[activeAdvisors,deals,month])

  const topPp=advisorRows[0]?.ppSigned||1
  const hotDeals=monthDeals.filter(d=>(d.priority==='Urgente'||d.priority==='Haute')&&isPipeline(d.status))
    .sort((a,b)=>annualize(b.pp_m)-annualize(a.pp_m)).slice(0,8)

  return (
    <div>
      {/* Cabinet KPIs */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Vue direction · {month}</div>
          <div className="section-title">Tableau de bord cabinet</div>
          <div className="section-sub">{monthDeals.length} dossiers · {signed.length} signés · {pipeline.length} en pipeline{prevMonth&&<span style={{color:'var(--t3)'}}> · vs {prevMonth}</span>}</div>
        </div>
      </div>

      <div className="kpi-grid mb-24">
        <KpiCard label="PP signée cabinet" value={euro(ppS)} hint="Réalisé consolidé" accent="gold" progressValue={pct(ppS,ppTarget)} delta={prevMonth?dPpS:null}/>
        <KpiCard label="PP prévisionnelle" value={euro(ppS+ppP)} hint="Atterrissage projeté" accent="amber" delta={prevMonth?dPpProj:null}/>
        <KpiCard label="PU signée" value={euro(puS)} hint="Versements uniques" accent="green" progressValue={pct(puS,puTarget)} delta={prevMonth?dPuS:null}/>
        <KpiCard label="PU prévisionnelle" value={euro(puS+puP)} hint="Atterrissage projeté" accent="blue"/>
      </div>

      {/* Charts cabinet */}
      <div className="grid-2 gap-16 mb-24">
        <AreaChart title="PP cabinet annualisée" subtitle="Réalisé + pipeline → objectif" actual={ppS} projected={ppS+ppP} target={ppTarget}/>
        <AreaChart title="PU cabinet" subtitle="Versements uniques consolidés" actual={puS} projected={puS+puP} target={puTarget}/>
      </div>

      {/* Annual chart */}
      <div className="mb-24">
        <div className="section-header">
          <div>
            <div className="section-kicker">Vue annuelle</div>
            <div className="section-title">Saisonnalité cabinet — 12 mois</div>
            <div className="section-sub">PP annualisée signée + pipeline · ligne objectif cabinet · mois courant mis en valeur</div>
          </div>
        </div>
        <AnnualChart deals={deals} objectifs={objectifs} currentMonth={month} advisorCode={null} title="PP cabinet — vue annuelle" subtitle="Tous conseillers confondus · barres : signée (plein) + pipeline (transparent)"/>
      </div>

      {/* Équipe ranking */}
      <div className="mb-24">
        <div className="section-header">
          <div>
            <div className="section-kicker">Performance équipe</div>
            <div className="section-title">Classement conseillers</div>
          </div>
        </div>
        <div className="table-wrap">
          <div className="team-row header">
            <span>Conseiller</span>
            <span>PP signée</span>
            <span>PP projetée</span>
            <span>Dossiers</span>
            <span>Taux sign.</span>
          </div>
          {advisorRows.map((row,i)=>(
            <div key={row.id} className="team-row">
              <div>
                <div className="team-advisor-name">
                  {i===0&&<span style={{color:'var(--gold)',marginRight:6}}>★</span>}
                  {row.full_name||row.advisor_code}
                </div>
                <div className="team-advisor-code">{row.advisor_code}</div>
              </div>
              <div className="team-bar-wrap">
                <div className="team-bar-track">
                  <div className="team-bar-fill signed" style={{width:`${pct(row.ppSigned,topPp)}%`}}/>
                </div>
                <span className="team-amount">{euro(row.ppSigned)}</span>
              </div>
              <div className="team-bar-wrap">
                <div className="team-bar-track">
                  <div className="team-bar-fill" style={{width:`${pct(row.ppProjected,topPp)}%`}}/>
                </div>
                <span className="team-amount">{euro(row.ppProjected)}</span>
              </div>
              <div className="team-amount" style={{textAlign:'center'}}>{row.total}</div>
              <div>
                <span className={`badge ${row.signRate>=60?'badge-signed':row.signRate>=30?'badge-progress':'badge-cancelled'}`}>
                  {row.signRate}%
                </span>
              </div>
            </div>
          ))}
          {!advisorRows.length&&(
            <div className="table-empty-state">
              <div className="empty-icon">👥</div>
              <div className="empty-title">Aucun conseiller configuré</div>
              <div className="empty-sub">Renseigne les profils dans <span className="code">public.profiles</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Dossiers chauds */}
      {hotDeals.length>0&&<div>
        <div className="section-header">
          <div>
            <div className="section-kicker">Priorité haute ou urgente</div>
            <div className="section-title">Dossiers chauds</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Client</th><th>Produit</th><th>PP annualisée</th><th>PU</th>
              <th>Conseiller</th><th>Statut</th><th>Priorité</th>
            </tr></thead>
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
  {id:'En cours', label:'En cours',     cls:'col-progress'},
  {id:'Prévu',    label:'Prévu',        cls:'col-forecast'},
  {id:'Signé',    label:'Signé ✓',      cls:'col-signed'},
  {id:'Annulé',   label:'Annulé',       cls:'col-cancelled'},
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
    visible.forEach(d=>{
      if(m[d.status])m[d.status].push(d)
      else m['En cours']=[...(m['En cours']||[]),d]
    })
    return m
  },[visible])

  const ppByStatus=useMemo(()=>{
    const m={}
    PIPELINE_COLS.forEach(c=>m[c.id]=sumAnnualPp(byStatus[c.id]||[]))
    return m
  },[byStatus])

  return (
    <div>
      <div className="section-header mb-16">
        <div>
          <div className="section-kicker">Vue kanban</div>
          <div className="section-title">Pipeline commercial</div>
          <div className="section-sub">{visible.length} dossiers · {MONTHS[MONTHS.indexOf(month)]}</div>
        </div>
        <input className="search-input" style={{maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un dossier…"/>
      </div>

      {/* Stale pipeline alert */}
      <StalePipelineAlert deals={visible} onEdit={onEdit}/>

      <div className="pipeline-board">
        {PIPELINE_COLS.map(col=>{
          const items=byStatus[col.id]||[]
          return (
            <div key={col.id} className={`pipeline-col ${col.cls}`}>
              <div className="pipeline-col-head">
                <div>
                  <div className="pipeline-col-title">{col.label}</div>
                  {ppByStatus[col.id]>0&&<div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{euro(ppByStatus[col.id])} PP</div>}
                </div>
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
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <AgeBadge deal={deal} compact/>
                        <span style={{fontSize:11,color:'var(--t3)'}}>{deal.advisor_code}</span>
                      </div>
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

  const filtered=useMemo(()=>{
    return deals
      .filter(d=>allMonths||d.month===month)
      .filter(d=>statusF==='Tous'||d.status===statusF)
      .filter(d=>productF==='Tous'||d.product===productF)
      .filter(d=>priorityF==='Tous'||d.priority===priorityF)
      .filter(d=>{
        const hay=`${d.client} ${d.product} ${d.company} ${d.advisor_code} ${d.co_advisor_code||''}`.toLowerCase()
        return hay.includes(search.toLowerCase())
      })
  },[deals,month,allMonths,search,statusF,productF,priorityF])

  const ppTotal=sumAnnualPp(filtered.filter(d=>d.status==='Signé'))
  const puTotal=sumPu(filtered.filter(d=>d.status==='Signé'))

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Référentiel</div>
          <div className="section-title">Dossiers clients</div>
          <div className="section-sub">{filtered.length} dossier{filtered.length!==1?'s':''} · PP signée {euro(ppTotal)} · PU signée {euro(puTotal)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card card-p mb-16">
        <div className="table-toolbar">
          <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Recherche client, produit, conseiller…"/>
          <select className="filter-select" value={statusF} onChange={e=>setStatusF(e.target.value)}>
            <option value="Tous">Tous statuts</option>
            {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={productF} onChange={e=>setProductF(e.target.value)}>
            <option value="Tous">Tous produits</option>
            {PRODUCTS.map(p=><option key={p}>{p}</option>)}
          </select>
          <select className="filter-select" value={priorityF} onChange={e=>setPriorityF(e.target.value)}>
            <option value="Tous">Toutes priorités</option>
            {PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}
          </select>
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
            <thead><tr>
              <th>Client</th>
              <th>Produit</th>
              <th>PP annualisée</th>
              <th>PU</th>
              <th>Conseiller</th>
              <th>Mois</th>
              <th>Statut</th>
              <th>Priorité</th>
              <th>Ancienneté</th>
              <th>Compagnie</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.map(deal=>(
                <tr key={deal.id}>
                  <td>
                    <div className="cell-primary">{deal.client}</div>
                    <div className="cell-sub">{deal.source||'—'}</div>
                  </td>
                  <td>{deal.product}</td>
                  <td className="cell-mono">
                    <strong>{euro(annualize(deal.pp_m))}</strong>
                    <div className="cell-sub">{euro(deal.pp_m)}/mois</div>
                  </td>
                  <td className="cell-mono">{deal.pu>0?euro(deal.pu):'—'}</td>
                  <td>
                    {deal.advisor_code}
                    {deal.co_advisor_code&&<span className="cell-sub"> co: {deal.co_advisor_code}</span>}
                  </td>
                  <td><span style={{fontSize:12,color:'var(--t3)'}}>{deal.month}</span></td>
                  <td><span className={STATUS_CLASS[deal.status]||'badge'}>{deal.status}</span></td>
                  <td><span className={PRIORITY_CLASS[deal.priority]||'badge'}>{deal.priority}</span></td>
                  <td><AgeBadge deal={deal}/></td>
                  <td><span style={{fontSize:12,color:'var(--t3)'}}>{deal.company||'—'}</span></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-outline btn-sm" onClick={()=>onEdit(deal)}><Icon.Edit/></button>
                      <button className="btn btn-danger btn-sm" onClick={()=>onDelete(deal)}><Icon.Trash/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ):(
          <div className="table-empty-state">
            <div className="empty-icon">📂</div>
            <div className="empty-title">Aucun dossier trouvé</div>
            <div className="empty-sub">Modifie les filtres ou crée un nouveau dossier.</div>
          </div>
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

  useEffect(()=>{
    setFormObj({
      pp_target:objectifs?.[month]?.pp_target??'',
      pu_target:objectifs?.[month]?.pu_target??'',
    })
  },[objectifs,month])

  async function submitObj(e){
    e.preventDefault()
    if(!canEditObjectifs)return
    await onSaveObjectif({month,pp_target:Number(formObj.pp_target||0),pu_target:Number(formObj.pu_target||0)})
  }

  const visibleProfiles=useMemo(()=>{
    const base=(teamProfiles||[]).filter(p=>p?.is_active&&p?.advisor_code)
    if(isManager)return base
    return base.filter(p=>p.advisor_code===profile?.advisor_code)
  },[teamProfiles,profile,isManager])

  const targets=objectifs[month]||{pp_target:0,pu_target:0}

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Atterrissage commercial</div>
          <div className="section-title">{isManager?'Prévisionnels équipe':'Mon prévisionnel'}</div>
          <div className="section-sub">Dossiers signés, en cours et prévus uniquement · {month}</div>
        </div>
      </div>

      {/* Objectifs cabinet block */}
      <div className="card mb-24">
        <div className="panel-head" style={{flexWrap:'wrap',gap:12}}>
          <div>
            <div className="section-kicker" style={{marginBottom:2}}>Objectif global · {month}</div>
            <div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>Objectifs du cabinet — consolidé équipe</div>
          </div>
          <div className="notice notice-gold" style={{margin:0,fontSize:12,padding:'6px 12px'}}>
            Ces objectifs s'appliquent au <strong>cabinet entier</strong>, pas à chaque conseiller individuellement.
          </div>
        </div>
        <div className="panel-body">
          {canEditObjectifs?(
            <form onSubmit={submitObj}>
              <div className="form-row form-row-2 mb-16">
                <div className="form-group">
                  <label className="form-label">PP annualisée cible cabinet (€)</label>
                  <input className="form-input" type="number" value={formObj.pp_target} onChange={e=>setFormObj(p=>({...p,pp_target:e.target.value}))}/>
                  <div className="form-hint">Objectif total du cabinet pour {month}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">PU cible cabinet (€)</label>
                  <input className="form-input" type="number" value={formObj.pu_target} onChange={e=>setFormObj(p=>({...p,pu_target:e.target.value}))}/>
                  <div className="form-hint">Versements uniques attendus pour {month}</div>
                </div>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Enregistrer les objectifs cabinet</button>
            </form>
          ):(
            <div className="objectif-display">
              <div className="objectif-value-card">
                <div className="objectif-value-label">PP annualisée cible cabinet</div>
                <div className="objectif-value-num">{euro(targets.pp_target||0)}</div>
              </div>
              <div className="objectif-value-card">
                <div className="objectif-value-label">PU cible cabinet</div>
                <div className="objectif-value-num">{euro(targets.pu_target||0)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-advisor charts */}
      {visibleProfiles.map(p=>{
        const code=p.advisor_code
        const m=advisorMetrics(deals,month,code)
        return (
          <div key={code} className="forecast-advisor-block">
            <div className="forecast-advisor-head">
              <div>
                <div className="forecast-name">{p.full_name||code}</div>
                <div className="forecast-code">{code} · {p.role==='manager'?'Direction':'Conseiller'}</div>
              </div>
              <div className="forecast-metrics">
                <div className="forecast-metric">
                  <div className="forecast-metric-label">PP signée</div>
                  <div className="forecast-metric-value">{euro(m.ppSigned)}</div>
                </div>
                <div className="forecast-metric">
                  <div className="forecast-metric-label">PP projetée</div>
                  <div className="forecast-metric-value">{euro(m.ppProjected)}</div>
                </div>
                <div className="forecast-metric">
                  <div className="forecast-metric-label">PU projetée</div>
                  <div className="forecast-metric-value">{euro(m.puProjected)}</div>
                </div>
                <div className="forecast-metric">
                  <div className="forecast-metric-label">Dossiers</div>
                  <div className="forecast-metric-value">{m.total}</div>
                </div>
              </div>
            </div>
            <div className="forecast-charts-grid">
              <AreaChart
                title={`PP annualisée · ${code}`}
                actual={m.ppSigned}
                projected={m.ppProjected}
                target={0}
              />
              <AreaChart
                title={`PU · ${code}`}
                actual={m.puSigned}
                projected={m.puProjected}
                target={0}
              />
            </div>
            {(Number(targets.pp_target)||Number(targets.pu_target))>0&&(
              <div style={{padding:'10px 20px 16px',display:'flex',gap:24,flexWrap:'wrap'}}>
                {Number(targets.pp_target)>0&&<div style={{fontSize:12,color:'var(--t3)'}}>
                  Contribution PP cabinet : <strong style={{color:'var(--t2)'}}>{pct(m.ppProjected,targets.pp_target)}%</strong>
                  <span style={{marginLeft:6,fontSize:11,color:'var(--t3)'}}>({euro(m.ppProjected)} / {euro(targets.pp_target)} obj. cabinet)</span>
                </div>}
                {Number(targets.pu_target)>0&&<div style={{fontSize:12,color:'var(--t3)'}}>
                  Contribution PU cabinet : <strong style={{color:'var(--t2)'}}>{pct(m.puProjected,targets.pu_target)}%</strong>
                  <span style={{marginLeft:6,fontSize:11,color:'var(--t3)'}}>({euro(m.puProjected)} / {euro(targets.pu_target)} obj. cabinet)</span>
                </div>}
              </div>
            )}
          </div>
        )
      })}
      {!visibleProfiles.length&&(
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-icon">📊</div>
            <div className="empty-title">Aucun conseiller actif</div>
            <div className="empty-sub">Renseigne les profils avec <span className="code">advisor_code</span> dans <span className="code">public.profiles</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TEAM VIEW (manager only)
───────────────────────────────────────────────────────────────────────────── */
function TeamView({deals,objectifs,teamProfiles,month}){
  const activeAdvisors=teamProfiles.filter(p=>p.is_active&&p.advisor_code)
  const targets=objectifs[month]||{pp_target:0,pu_target:0}
  const ppTarget=Number(targets.pp_target||0)

  const rows=useMemo(()=>activeAdvisors.map(p=>{
    const m=advisorMetrics(deals,month,p.advisor_code)
    const m12=MONTHS.map(mo=>advisorMetrics(deals,mo,p.advisor_code))
    return {...p,...m,monthly:m12}
  }).sort((a,b)=>b.ppSigned-a.ppSigned),[activeAdvisors,deals,month])

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Vue direction</div>
          <div className="section-title">Performance par conseiller</div>
          <div className="section-sub">{activeAdvisors.length} conseiller{activeAdvisors.length!==1?'s':''} actifs · {month}</div>
        </div>
      </div>

      {rows.map((row,i)=>{
        const ppPct=pct(row.ppSigned,ppTarget)
        const ppProjPct=pct(row.ppProjected,ppTarget)
        return (
          <div key={row.id} className="card mb-16">
            <div className="panel-head">
              <div className="flex items-center gap-12">
                <div className="user-avatar" style={{width:40,height:40,fontSize:14}}>
                  {initials(row.full_name||row.advisor_code)}
                </div>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--t1)'}}>
                    {i===0&&<span style={{color:'var(--gold)',marginRight:6}}>★</span>}
                    {row.full_name||row.advisor_code}
                  </div>
                  <div className="text-xs text-muted">{row.advisor_code} · {row.role==='manager'?'Direction':'Conseiller'}</div>
                </div>
              </div>
              <div className="flex gap-20 flex-wrap">
                <div style={{textAlign:'right'}}>
                  <div className="text-xs text-muted mb-4">Taux signature</div>
                  <span className={`badge ${row.signRate>=60?'badge-signed':row.signRate>=30?'badge-progress':'badge-cancelled'}`}>{row.signRate}%</span>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="text-xs text-muted mb-4">Ticket moyen PP</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>{row.signedCount>0?euro(row.avgPp):'—'}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="text-xs text-muted mb-4">PP obj.</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>{ppProjPct}%</div>
                </div>
              </div>
            </div>
            <div className="panel-body">
              <div className="kpi-grid mb-16">
                <KpiCard label="PP signée" value={euro(row.ppSigned)} accent="gold" progressValue={ppPct}/>
                <KpiCard label="PP pipeline" value={euro(row.ppPipeline)} hint={`${row.pipelineCount} dossier${row.pipelineCount!==1?'s':''}`} accent="amber"/>
                <KpiCard label="PU signée" value={euro(row.puSigned)} accent="green"/>
                <KpiCard label="Dossiers" value={String(row.total)} hint={`${row.signedCount} signés`}/>
              </div>
              <AreaChart
                title={`Prévisionnel PP · ${row.advisor_code}`}
                actual={row.ppSigned}
                projected={row.ppProjected}
                target={ppTarget}
              />
            </div>
          </div>
        )
      })}
      {!rows.length&&(
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">Aucun conseiller actif</div>
            <div className="empty-sub">Configure les profils dans <span className="code">public.profiles</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEAL MODAL
───────────────────────────────────────────────────────────────────────────── */
function DealModal({open,initialDeal,profile,onClose,onSave}){
  const [deal,setDeal]=useState(initialDeal)
  useEffect(()=>setDeal(initialDeal),[initialDeal])
  if(!open||!deal)return null

  const set=(k,v)=>setDeal(p=>({...p,[k]:v}))
  const isManager=profile?.role==='manager'
  const isNew=!initialDeal?.created_at

  async function submit(e){
    e.preventDefault()
    await onSave(normalizeDeal(deal))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{isNew?'Nouveau dossier':'Éditer le dossier'}</div>
            {deal.client&&<div className="modal-subtitle">{deal.client}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon.Close/></button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-body">
            {/* Client & mois */}
            <div>
              <div className="form-section-title mb-16">Informations client</div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Nom du client *</label>
                  <input className="form-input" value={deal.client||''} onChange={e=>set('client',e.target.value)} required placeholder="Prénom Nom"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Mois</label>
                  <select className="form-select" value={deal.month} onChange={e=>set('month',e.target.value)}>
                    {MONTHS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2 mt-16">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={deal.client_email||''} onChange={e=>set('client_email',e.target.value)} type="email" placeholder="client@exemple.fr"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Téléphone</label>
                  <input className="form-input" value={deal.client_phone||''} onChange={e=>set('client_phone',e.target.value)} placeholder="06 00 00 00 00"/>
                </div>
              </div>
            </div>

            {/* Produit */}
            <div>
              <div className="form-section-title mb-16">Dossier</div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Produit</label>
                  <select className="form-select" value={deal.product} onChange={e=>set('product',e.target.value)}>
                    {PRODUCTS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Compagnie</label>
                  <select className="form-select" value={deal.company||''} onChange={e=>set('company',e.target.value)}>
                    {COMPANIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-3 mt-16">
                <div className="form-group">
                  <label className="form-label">PP mensuelle (€)</label>
                  <input className="form-input" type="number" min="0" value={deal.pp_m||0} onChange={e=>set('pp_m',e.target.value)}/>
                  <div className="form-hint">→ PP annualisée : <strong>{euro(annualize(deal.pp_m))}</strong></div>
                </div>
                <div className="form-group">
                  <label className="form-label">PU (€)</label>
                  <input className="form-input" type="number" min="0" value={deal.pu||0} onChange={e=>set('pu',e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={deal.status} onChange={e=>set('status',e.target.value)}>
                    {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Date de signature prévue</label>
                <input className="form-input" type="date" value={deal.date_expected||''} onChange={e=>set('date_expected',e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Date de signature effective</label>
                <input className="form-input" type="date" value={deal.date_signed||''} onChange={e=>set('date_signed',e.target.value)}/>
              </div>
            </div>

            {/* Équipe & priorité */}
            <div>
              <div className="form-section-title mb-16">Équipe & suivi</div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">Conseiller principal *</label>
                  <input className="form-input" value={deal.advisor_code||''} onChange={e=>set('advisor_code',e.target.value.toUpperCase())} placeholder={profile?.advisor_code||'CODE'} required disabled={!isManager}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Co-conseiller</label>
                  <input className="form-input" value={deal.co_advisor_code||''} onChange={e=>set('co_advisor_code',e.target.value.toUpperCase())} placeholder="CODE"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Priorité</label>
                  <select className="form-select" value={deal.priority} onChange={e=>set('priority',e.target.value)}>
                    {PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group mt-16">
                <label className="form-label">Source</label>
                <select className="form-select" value={deal.source||''} onChange={e=>set('source',e.target.value)}>
                  {SOURCES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={4} value={deal.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Contexte client, objections, prochaine étape, pièces manquantes…"/>
            </div>
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
export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [teamProfiles,setTeamProfiles]=useState([])
  const [deals,setDeals]=useState([])
  const [objectifs,setObjectifs]=useState(EMPTY_OBJECTIFS)
  const [loading,setLoading]=useState(true)
  const [month,setMonth]=useState(currentMonth())
  const [modalOpen,setModalOpen]=useState(false)
  const [editingDeal,setEditingDeal]=useState(null)
  const [error,setError]=useState('')
  const [activeTab,setActiveTab]=useState('dashboard')

  useEffect(()=>{
    if(!isSupabaseConfigured)return
    let active=true
    async function boot(){
      const{data}=await supabase.auth.getSession()
      if(!active)return
      setSession(data.session||null)
      setLoading(false)
    }
    boot()
    const{data:listener}=supabase.auth.onAuthStateChange((_,s)=>setSession(s||null))
    return()=>{active=false;listener.subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    if(!session?.user){setProfile(null);setDeals([]);setTeamProfiles([]);return}
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.user?.id])

  async function loadAll(){
    setLoading(true);setError('')
    const[profRes,teamRes,dealsRes,objRes]=await Promise.all([
      supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle(),
      supabase.from('profiles').select('id,email,full_name,role,advisor_code,is_active').order('full_name',{ascending:true}),
      supabase.from('deals').select('*').order('created_at',{ascending:false}),
      supabase.from('objectifs').select('*'),
    ])
    const errs=[profRes,teamRes,dealsRes,objRes].filter(r=>r.error).map(r=>r.error.message)
    if(errs.length)setError(errs[0])
    setProfile(profRes.data||null)
    setTeamProfiles(teamRes.data||[])
    setDeals(dealsRes.data||[])
    const map={...EMPTY_OBJECTIFS}
    ;(objRes.data||[]).forEach(row=>{map[row.month]=row})
    setObjectifs(map)
    setLoading(false)
  }

  async function saveDeal(deal){
    const payload={...deal,advisor_code:profile?.role==='manager'?deal.advisor_code:(profile?.advisor_code||deal.advisor_code),created_by:session.user.id}
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

  function startCreate(){setEditingDeal(emptyDeal(profile?.advisor_code));setModalOpen(true)}
  function startEdit(deal){setEditingDeal({...deal});setModalOpen(true)}
  async function signOut(){await supabase.auth.signOut()}

  if(!isSupabaseConfigured)return<ConfigMissing/>
  if(!session)return<AuthScreen/>

  if(loading)return(
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'var(--bg)'}}>
      <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--t1)',letterSpacing:'0.05em'}}>ENTASIS</div>
      <div className="loading-spinner"/>
      <div className="text-sm text-muted">Chargement du CRM…</div>
    </div>
  )

  const isManager=profile?.role==='manager'

  return (
    <div className="app-shell">
      <Sidebar
        profile={profile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={signOut}
        deals={deals}
        month={month}
      />
      <div className="app-main">
        <TopBar
          activeTab={activeTab}
          month={month}
          setMonth={setMonth}
          onNewDeal={startCreate}
          onRefresh={loadAll}
        />
        <div className="app-content">
          {error&&<div className="notice notice-error">{error}</div>}
          {!profile&&<div className="notice notice-warn">Profil introuvable dans <span className="code">public.profiles</span>. Vérifie la table et les policies.</div>}

          {activeTab==='dashboard'&&(
            isManager
              ?<ManagerDashboard deals={deals} objectifs={objectifs} month={month} teamProfiles={teamProfiles}/>
              :<AdvisorDashboard deals={deals} objectifs={objectifs} month={month} profile={profile}/>
          )}
          {activeTab==='pipeline'&&(
            <PipelineBoard deals={deals} month={month} profile={profile} onEdit={startEdit}/>
          )}
          {activeTab==='dossiers'&&(
            <DealsTable deals={deals} month={month} profile={profile} onEdit={startEdit} onDelete={deleteDeal} onRefresh={loadAll}/>
          )}
          {activeTab==='forecast'&&(
            <ForecastView deals={deals} objectifs={objectifs} month={month} profile={profile} teamProfiles={teamProfiles} canEditObjectifs={isManager} onSaveObjectif={saveObjectif}/>
          )}
          {activeTab==='team'&&isManager&&(
            <TeamView deals={deals} objectifs={objectifs} teamProfiles={teamProfiles} month={month}/>
          )}
        </div>
      </div>

      <DealModal
        open={modalOpen}
        initialDeal={editingDeal}
        profile={profile}
        onClose={()=>{setModalOpen(false);setEditingDeal(null)}}
        onSave={saveDeal}
      />
    </div>
  )
}
