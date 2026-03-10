import { useState } from "react"

const LEADS = [
  {id:1,campagne:'SUCCESSION',nom:'Dupont Jean',telephone:'+33612345678',email:'jean.dupont@gmail.com',patrimoine_net:'450 000€',tmi:'41%',status:'available'},
  {id:2,campagne:'LEADS',nom:'Martin Sophie',telephone:'+33698765432',email:'sophie.martin@gmail.com',patrimoine_net:'',tmi:'30%',status:'available'},
  {id:3,campagne:'REUNION',nom:'Nivault Steve',telephone:'+262693000000',email:'steevenivault@gmail.com',patrimoine_net:'',tmi:'30%',status:'contacted'},
  {id:4,campagne:'LEADS',nom:'Autret Fred',telephone:'+33663309357',email:'Fred.autret02@gmail.com',patrimoine_net:'',tmi:'11%',status:'available'},
  {id:5,campagne:'SUCCESSION',nom:'Elisa Landrieux',telephone:'+33615260569',email:'elisabeth.landrieux@sfr.fr',patrimoine_net:'résidence principale',tmi:'',status:'booked'},
  {id:6,campagne:'LEADS',nom:'Bernard Claire',telephone:'+33645123456',email:'claire.bernard@orange.fr',patrimoine_net:'220 000€',tmi:'14%',status:'available'},
  {id:7,campagne:'SUCCESSION',nom:'Leblanc Marc',telephone:'+33678901234',email:'marc.leblanc@free.fr',patrimoine_net:'800 000€',tmi:'45%',status:'available'},
  {id:8,campagne:'REUNION',nom:'Payet Jessy',telephone:'+262692111222',email:'jessy.payet@gmail.com',patrimoine_net:'',tmi:'',status:'available'},
  {id:9,campagne:'SUCCESSION',nom:'Moreau Isabelle',telephone:'+33621334455',email:'i.moreau@hotmail.fr',patrimoine_net:'1 200 000€',tmi:'45%',status:'available'},
  {id:10,campagne:'LEADS',nom:'Petit Thomas',telephone:'+33654667788',email:'t.petit@gmail.com',patrimoine_net:'95 000€',tmi:'30%',status:'available'},
]

const CC = {'SUCCESSION':'#7C3AED','LEADS':'#0EA5E9','REUNION':'#10B981'}

export default function App() {
  const [search, setSearch] = useState('')
  const [campagneF, setCampagneF] = useState('all')
  const [filter, setFilter] = useState('all')

  const available = LEADS.filter(l=>l.status==='available'||l.status==='released')
  const contacted = LEADS.filter(l=>l.status==='contacted')
  const booked = LEADS.filter(l=>l.status==='booked')

  const filtered = LEADS
    .filter(l => filter==='available' ? (l.status==='available'||l.status==='released') : true)
    .filter(l => campagneF==='all' || l.campagne===campagneF)
    .filter(l => !search || `${l.nom} ${l.telephone} ${l.email} ${l.patrimoine_net} ${l.tmi}`.toLowerCase().includes(search.toLowerCase()))

  const COLS = '72px 145px 130px 185px 115px 65px 145px'
  const HEADERS = ['Campagne','Nom','Téléphone','Email','Patrimoine','TMI','Action']

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif',background:'#F5F3EE',minHeight:'100vh',padding:20}}>

      {/* Stats mini */}
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        {[
          {label:'Total',value:LEADS.length,color:'#6B7280'},
          {label:'⚡ Disponibles',value:available.length,color:'#C09B5A'},
          {label:'📞 En appel',value:contacted.length,color:'#F59E0B'},
          {label:'✓ RDV',value:booked.length,color:'#10B981'},
        ].map(s=>(
          <div key={s.label} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 13px',borderRadius:6,border:'1px solid #E5E0D8',background:'white'}}>
            <span style={{fontSize:18,fontWeight:700,color:s.color,lineHeight:1,fontFamily:'Georgia,serif'}}>{s.value}</span>
            <span style={{fontSize:11,color:'#9CA3AF'}}>{s.label}</span>
          </div>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#9CA3AF'}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'#10B981',display:'inline-block'}}/>
          Temps réel
        </div>
      </div>

      {/* Barre filtres */}
      <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',border:'1px solid #E5E0D8',borderRadius:6,overflow:'hidden'}}>
          {[{k:'all',l:'Tous'},{k:'available',l:`Dispo (${available.length})`}].map(f=>(
            <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:'5px 12px',fontSize:11.5,fontWeight:filter===f.k?600:400,background:filter===f.k?'#C09B5A':'white',color:filter===f.k?'white':'#6B7280',border:'none',cursor:'pointer'}}>
              {f.l}
            </button>
          ))}
        </div>
        <select value={campagneF} onChange={e=>setCampagneF(e.target.value)} style={{height:30,fontSize:11.5,border:'1px solid #E5E0D8',borderRadius:6,padding:'0 8px',background:'white',color:'#6B7280'}}>
          <option value="all">Toutes campagnes</option>
          {['SUCCESSION','LEADS','REUNION'].map(c=><option key={c} value={c}>{c} ({LEADS.filter(l=>l.campagne===c).length})</option>)}
        </select>
        <div style={{position:'relative',flex:1,maxWidth:260}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Nom, tél, email…"
            style={{width:'100%',height:30,fontSize:11.5,border:'1px solid #E5E0D8',borderRadius:6,padding:'0 28px 0 10px',outline:'none',boxSizing:'border-box',background:'white'}}/>
          {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:15,padding:0,lineHeight:1}}>×</button>}
        </div>
        <span style={{fontSize:11,color:'#9CA3AF'}}>{filtered.length} ligne{filtered.length!==1?'s':''}</span>
      </div>

      {/* TABLE */}
      <div style={{border:'1px solid #E5E0D8',borderRadius:8,overflow:'hidden',background:'white',fontSize:12}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:COLS,background:'#F9F8F6',borderBottom:'2px solid #E5E0D8'}}>
          {HEADERS.map(h=>(
            <div key={h} style={{padding:'7px 10px',fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',borderRight:'1px solid #E5E0D8'}}>{h}</div>
          ))}
        </div>

        {filtered.map((lead,i)=>{
          const isBooked=lead.status==='booked'
          const isTaken=lead.status==='contacted'
          const isAvail=lead.status==='available'||lead.status==='released'
          const c=CC[lead.campagne]||'#6B7280'
          const rowBg=isBooked?'rgba(16,185,129,0.03)':i%2===0?'white':'#FAFAF9'
          return (
            <div key={lead.id}
              style={{display:'grid',gridTemplateColumns:COLS,minHeight:34,alignItems:'center',background:rowBg,borderBottom:'1px solid #F0EDE8',opacity:isTaken?0.45:1,transition:'background .1s',cursor:'default'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(192,155,90,0.07)'}
              onMouseLeave={e=>e.currentTarget.style.background=rowBg}
            >
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center'}}>
                <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:2,background:c+'15',color:c,border:`1px solid ${c}25`,whiteSpace:'nowrap'}}>{lead.campagne}</span>
              </div>
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center',overflow:'hidden'}}>
                <span style={{fontWeight:600,color:'#111',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.nom}</span>
              </div>
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center'}}>
                <span style={{fontWeight:500,color:'#111',whiteSpace:'nowrap'}}>{lead.telephone}</span>
              </div>
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center',overflow:'hidden'}}>
                <span style={{fontSize:11,color:'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.email||'—'}</span>
              </div>
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center',overflow:'hidden'}}>
                <span style={{fontSize:11,color:'#7C3AED',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.patrimoine_net||'—'}</span>
              </div>
              <div style={{padding:'0 10px',borderRight:'1px solid #F0EDE8',height:'100%',display:'flex',alignItems:'center'}}>
                <span style={{fontSize:11,color:'#0EA5E9',fontWeight:500}}>{lead.tmi||'—'}</span>
              </div>
              <div style={{padding:'0 8px',height:'100%',display:'flex',alignItems:'center',gap:5}}>
                {isAvail&&<button style={{padding:'3px 9px',background:'#C09B5A',color:'white',border:'none',borderRadius:4,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>⚡ Je prends</button>}
                {isTaken&&<span style={{fontSize:10,color:'#9CA3AF',fontStyle:'italic'}}>En appel…</span>}
                {isBooked&&<>
                  <span style={{fontSize:10,fontWeight:700,color:'#10B981',whiteSpace:'nowrap'}}>✓ RDV</span>
                  <button style={{padding:'3px 7px',background:'#C09B5A',color:'white',border:'none',borderRadius:4,fontSize:10,cursor:'pointer'}}>+ Dossier</button>
                </>}
              </div>
            </div>
          )
        })}

        {filtered.length===0&&(
          <div style={{padding:32,textAlign:'center',color:'#9CA3AF',fontSize:13}}>Aucun résultat</div>
        )}
      </div>

      <div style={{marginTop:6,fontSize:10.5,color:'#C4BEB4',textAlign:'right'}}>Prévisualisation — données fictives</div>
    </div>
  )
}
