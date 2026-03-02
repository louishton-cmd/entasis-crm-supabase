import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const FIRM = {
  name: "Entasis Conseil", orias: "23003153",
  city: "Paris 75008", address: "47 bd de Courcelles, 75008 Paris",
  phone: "01 87 66 71 24", email: "contact@entasis-conseil.fr"
};
const ADVISORS = ["ALEXIS","CLEMENT","DANNY","DANY","ERWANN","GIANNI","JEAN","LOUIS","NANS","QUENTIN","THOMAS"];
const MANAGER = "MANAGER";
const MONTHS = ["JANVIER","FÉVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOÛT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DÉCEMBRE"];
const STATUTS = [
  { id:"Signé",     col:"#4ADE80", bg:"rgba(74,222,128,0.10)", bd:"rgba(74,222,128,0.30)", dot:"#4ADE80" },
  { id:"En cours",  col:"#FB923C", bg:"rgba(251,146,60,0.10)",  bd:"rgba(251,146,60,0.30)",  dot:"#FB923C" },
  { id:"Prévu",     col:"#60A5FA", bg:"rgba(96,165,250,0.10)",  bd:"rgba(96,165,250,0.30)",  dot:"#60A5FA" },
  { id:"Annulé",    col:"#F87171", bg:"rgba(248,113,113,0.10)", bd:"rgba(248,113,113,0.30)", dot:"#F87171" },
];
const PRODUCTS = [
  { cat:"Épargne Retraite",        items:["PER Individuel","PER Collectif (PERCO)"] },
  { cat:"Assurance Vie",           items:["Assurance Vie Française","Assurance Vie Luxembourgeoise","Contrat de Capitalisation"] },
  { cat:"Immobilier",              items:["SCPI","SCI","Nue-Propriété","LMNP","Loi Malraux","Monuments Historiques"] },
  { cat:"Marchés Financiers",      items:["Produits Structurés","Private Equity","ETF / Trackers","Fonds d'Investissement","FCPI / FIP"] },
  { cat:"Prévoyance",              items:["Prévoyance TNS","Assurance Emprunteur","Mutuelle Santé","Contrat Homme Clé"] },
  { cat:"Financement",             items:["Prêt Immobilier","Financement SCPI","Prêt Professionnel","OBO / Rachat à Soi-Même"] },
  { cat:"Transmission",            items:["Donation","Pacte Dutreil","SCI Familiale","Épargne Salariale","Girardin Industriel","Autre"] },
];
const COMPANIES = ["SwissLife","Abeille Assurances","Generali","Cardif (BNP Paribas)","Suravenir","Spirica","Primonial","Apicil","Predica","Nortia","La France Mutualiste","Société Générale","Autre"];
const SOURCES = ["Leads Facebook","Téléprospection","Parrainage Client","Réseau Personnel","Événement / Salon","Site Web Entasis","Recommandation Partenaire","LinkedIn"];
const PRIORITIES = ["Normale","Haute","Urgente"];
const OBJ_BASE = {
  "JANVIER":{pp:140000,pu:400000},"FÉVRIER":{pp:140000,pu:400000},"MARS":{pp:160000,pu:400000},
  "AVRIL":{pp:140000,pu:400000},"MAI":{pp:140000,pu:400000},"JUIN":{pp:150000,pu:400000},
  "JUILLET":{pp:100000,pu:300000},"AOÛT":{pp:80000,pu:250000},"SEPTEMBRE":{pp:140000,pu:400000},
  "OCTOBRE":{pp:150000,pu:400000},"NOVEMBRE":{pp:150000,pu:400000},"DÉCEMBRE":{pp:120000,pu:350000},
};

// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM — Entasis Dark Luxury
// Inspired by entasis-conseil.fr: deep black, warm white, gold
// ═══════════════════════════════════════════════════════════
const C = {
  // Warm ivory palette inspired by the public site: premium, calm, highly readable
  void:     "#F4EEE5",
  deep:     "#F8F3EB",
  surface:  "#FFFDF9",
  raise:    "#F6F0E7",
  lift:     "#EEE4D6",
  rim:      "#E5D7C6",

  // Typography
  snow:     "#171411",
  cloud:    "#665C51",
  ash:      "#8B8073",
  ghost:    "#EEE3D5",

  // Brand accent — muted bronze / gold
  gold:     "#9D7A33",
  goldBr:   "#B48C3E",
  goldDim:  "#7C6128",
  goldBg:   "rgba(157,122,51,0.08)",
  goldBd:   "rgba(157,122,51,0.22)",

  // Status colors — softer, premium
  green:    "#4E8E66", greenBg:"rgba(78,142,102,0.10)", greenBd:"rgba(78,142,102,0.22)",
  amber:    "#B67A2F", amberBg:"rgba(182,122,47,0.10)", amberBd:"rgba(182,122,47,0.22)",
  blue:     "#6D86AE", blueBg:"rgba(109,134,174,0.10)", blueBd:"rgba(109,134,174,0.22)",
  red:      "#B25F5B", redBg:"rgba(178,95,91,0.10)", redBd:"rgba(178,95,91,0.22)",
  violet:   "#8C73B6",

  // Chart palette
  cPP:      "#6D86AE",
  cPU:      "#9D7A33",
  cSign:    "#4E8E66",
  cFore:    "#8C73B6",

  // Shadows
  shadowSm: "0 10px 28px rgba(47,35,20,0.06)",
  shadowMd: "0 16px 42px rgba(47,35,20,0.10)",
  shadowLg: "0 28px 72px rgba(47,35,20,0.14)",
  shadowModal:"0 40px 120px rgba(17,14,10,0.24), 0 0 0 1px rgba(157,122,51,0.12)",
};

const F = {
  display: "'Cormorant Garamond', 'Garamond', Georgia, serif",
  body:    "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const uid   = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const ppAnn = m  => (Number(m)||0)*12;
const pct   = (v,max) => max>0 ? Math.min(999,Math.round(v/max*100)) : 0;
const eur   = (n, compact=false) => {
  const v=Number(n)||0; if(!v) return "—";
  if(compact && v>=1000000) return (v/1000000).toFixed(1).replace(".0","")+"M €";
  if(compact && v>=1000)    return Math.round(v/1000)+"k €";
  return v.toLocaleString("fr-FR")+" €";
};
const stC   = s  => STATUTS.find(x=>x.id===s)||STATUTS[1];
const ini   = s  => (s||"?").slice(0,2).toUpperCase();
const age   = ts => Math.max(0,Math.floor((Date.now()-ts)/86400000));
const now   = ()  => new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});

// Storage
const sg = async k => { try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch{return null;}};
const ss = async (k,v) => { try{await window.storage.set(k,JSON.stringify(v));}catch{}};

// ═══════════════════════════════════════════════════════════
// STATS ENGINE
// ═══════════════════════════════════════════════════════════
const calcStats = ds => {
  const sg=ds.filter(d=>d.st==="Signé"), ec=ds.filter(d=>d.st==="En cours"),
        pr=ds.filter(d=>d.st==="Prévu"),  an=ds.filter(d=>d.st==="Annulé"),
        sP=a=>a.reduce((t,d)=>t+ppAnn(d.ppM),0),
        sU=a=>a.reduce((t,d)=>t+(Number(d.pu)||0),0),
        act=ds.filter(d=>d.st!=="Annulé");
  return {
    total:ds.length, signed:sg.length, active:ec.length, forecast:pr.length, cancelled:an.length,
    ppSigned:sP(sg), puSigned:sU(sg),
    ppActive:sP(ec), puActive:sU(ec),
    ppFore:sP(pr),   puFore:sU(pr),
    ppPot:sP([...sg,...ec,...pr]), puPot:sU([...sg,...ec,...pr]),
    conv: act.length>0?Math.round(sg.length/act.length*100):0,
  };
};

const rankAll = ds => {
  const m={};
  ADVISORS.forEach(a=>{m[a]={name:a,ppS:0,puS:0,sig:0,tot:0,ppA:0,puA:0};});
  ds.forEach(d=>{
    if(!m[d.advisor]) return;
    m[d.advisor].tot++;
    const pp=ppAnn(d.ppM);
    if(d.st==="Signé"){m[d.advisor].ppS+=pp;m[d.advisor].puS+=Number(d.pu)||0;m[d.advisor].sig++;}
    if(d.st==="En cours"){m[d.advisor].ppA+=pp;m[d.advisor].puA+=Number(d.pu)||0;}
  });
  return Object.values(m).map(c=>({...c,score:c.ppS+c.puS})).sort((a,b)=>b.score-a.score);
};

// ═══════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════
const mk=(mo,cl,pr,ppM,pu,adv,coAdv,src,st,co,notes,prio)=>({
  id:uid(),month:mo,client:cl,product:pr,ppM:Number(ppM)||0,pu:Number(pu)||0,
  advisor:adv,coAdvisor:coAdv||"",source:src||"Téléprospection",st,
  company:co||"SwissLife",notes:notes||"",priority:prio||"Normale",
  tags:[],dateExpected:"",dateSigned:"",clientPhone:"",clientEmail:"",clientAge:"",
  createdAt:Date.now()-Math.random()*50*86400000,
});
const SEED=[
  mk("JANVIER","Pauline Voisin","PER Individuel",0,0,"CLEMENT","","Téléprospection","Annulé","SwissLife"),
  mk("JANVIER","Célia Rouis","PER Individuel",0,0,"CLEMENT","LOUIS","Téléprospection","Annulé","SwissLife"),
  mk("JANVIER","Sarah Lesne","Assurance Vie Française",0,0,"CLEMENT","","Parrainage Client","En cours","Generali","Intérêt AV Luxembourg à explorer","Haute"),
  mk("JANVIER","Elisabeth Toffaloni","PER Individuel",0,0,"CLEMENT","JEAN","Parrainage Client","Prévu","Abeille Assurances","Signature fin janvier"),
  mk("JANVIER","Sébastien Morineau","PER Individuel",100,0,"CLEMENT","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Nordine Hadjaj","PER Individuel",100,0,"CLEMENT","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Yasmina Hadjaj","PER Individuel",50,0,"CLEMENT","","Téléprospection","Signé","SwissLife","Conjoint de Nordine"),
  mk("JANVIER","Laurent Gruel","PER Individuel",100,0,"CLEMENT","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Guillaume Cros","PER Individuel",670,10000,"CLEMENT","JEAN","Réseau Personnel","Signé","Cardif (BNP Paribas)","Dossier complexe — double conseiller","Haute"),
  mk("JANVIER","Fabien Boidin","PER Individuel",0,0,"THOMAS","","Téléprospection","Annulé","SwissLife"),
  mk("JANVIER","Romain Thot","PER Individuel",0,0,"THOMAS","","Téléprospection","En cours","SwissLife"),
  mk("JANVIER","Carole Lebreton","PER Individuel",0,0,"THOMAS","","Téléprospection","En cours","SwissLife"),
  mk("JANVIER","Jonathan Jourdain","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Anis Challouf","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Serge Chauveau","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Anthony Thiery","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Tommy Galea","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Jonathan Delcourt","Assurance Vie Française",500,15400,"NANS","JEAN","Réseau Personnel","Signé","Generali","Client référent","Haute"),
  mk("JANVIER","Pierrick Leboucher","PER Individuel",0,0,"NANS","","Téléprospection","En cours","SwissLife"),
  mk("JANVIER","Marion Sorel","PER Individuel",100,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Kevin Gilly","PER Individuel",50,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Nadia Bencheikh","Assurance Vie Française",50,30000,"JEAN","","Leads Facebook","Signé","Generali","Première AV — à fidéliser"),
  mk("JANVIER","Thibaut Chauveau","Assurance Vie Française",150,0,"JEAN","","Téléprospection","Signé","Cardif (BNP Paribas)"),
  mk("JANVIER","Pierre Boissy","Assurance Vie Française",50,50000,"JEAN","","Parrainage Client","Signé","Generali","Client ancien — réinvestissement"),
  mk("JANVIER","Aude Cormier","PER Individuel",50,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Patrick Decadt","PER Individuel",405,3000,"JEAN","NANS","Leads Facebook","Signé","Abeille Assurances","","Haute"),
  mk("JANVIER","Raphaël Rouby","Assurance Vie Française",0,0,"JEAN","","Parrainage Client","Annulé","Generali","Changement situation professionnelle"),
  mk("JANVIER","Pauline Baldet","PER Individuel",100,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Alexandre Jardin","PER Individuel",300,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Bastien Morin","PER Individuel",50,0,"LOUIS","","Téléprospection","Signé","SwissLife"),
  mk("JANVIER","Matthieu Gilles","PER Individuel",300,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Anthony Delorme","PER Individuel",100,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Stéphanie Mallet","Assurance Vie Française",100,20000,"LOUIS","","Parrainage Client","Signé","Generali"),
  mk("JANVIER","Damien Brun","PER Individuel",300,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Vincent Simon","Assurance Vie Française",100,0,"LOUIS","","Leads Facebook","Signé","Cardif (BNP Paribas)"),
  mk("JANVIER","Arnaud Rivière","PER Individuel",200,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Thomas Vasseur","PER Individuel",50,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Joëlle Marchand","Assurance Vie Française",170,40000,"LOUIS","","Réseau Personnel","Signé","Generali","","Haute"),
  mk("JANVIER","Elisa Laurent","PER Individuel",0,0,"LOUIS","","Leads Facebook","En cours","SwissLife","À relancer","Haute"),
  mk("JANVIER","Alexis Perrot","PER Individuel",100,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Kévin Vidal","PER Individuel",100,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Maeva Fontaine","PER Individuel",200,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("JANVIER","Anthony Boutin","PER Individuel",100,0,"QUENTIN","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Morgane Meyer","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Ulrich Lechat","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Ulrich Lechat (PU)","PER Individuel",0,16700,"NANS","","Téléprospection","Signé","SwissLife","Transfert PER complémentaire"),
  mk("FÉVRIER","Christophe Leroy","PER Individuel",100,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Myriam Bonneau","Assurance Vie Française",200,120000,"NANS","","Réseau Personnel","Signé","Generali","Gros dossier — suivi prioritaire","Haute"),
  mk("FÉVRIER","Dany Fosse","PER Individuel",100,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Emilie Marin","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Patrick Decadt 2","PER Individuel",120,0,"NANS","","Leads Facebook","Signé","Abeille Assurances"),
  mk("FÉVRIER","Bruno Schneider","PER Individuel",100,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Florence Gautier","Assurance Vie Française",0,90000,"NANS","","Réseau Personnel","Signé","Generali","","Haute"),
  mk("FÉVRIER","Stéphane Gallet","PER Individuel",50,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Jacqueline Martel","Assurance Vie Française",100,0,"NANS","","Parrainage Client","Signé","Cardif (BNP Paribas)"),
  mk("FÉVRIER","Emeric Fouché","PER Individuel",25,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Virginie Leclercq","PER Individuel",0,0,"NANS","","Parrainage Client","En cours","SwissLife","À relancer en priorité","Haute"),
  mk("FÉVRIER","Aurore Renaud","PER Individuel",100,0,"JEAN","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Sylvie Collet","Assurance Vie Française",50,70000,"JEAN","","Parrainage Client","Signé","Generali"),
  mk("FÉVRIER","Nicolas Bernard","PER Individuel",100,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Olivier Poirier","Assurance Vie Française",100,90000,"JEAN","","Parrainage Client","Signé","Generali","","Haute"),
  mk("FÉVRIER","Gaël Brochard","PER Individuel",400,50000,"JEAN","","Réseau Personnel","Signé","Cardif (BNP Paribas)","Investisseur actif","Haute"),
  mk("FÉVRIER","Christine Barbier","PER Individuel",50,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Isabelle Guillon","Assurance Vie Française",50,5700,"JEAN","","Parrainage Client","Signé","Generali"),
  mk("FÉVRIER","Sébastien Lemaire","PER Individuel",50,0,"JEAN","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Laure Meunier","PER Individuel",50,0,"JEAN","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","Antoine Perrin","PER Individuel",0,0,"JEAN","","Téléprospection","En cours","SwissLife","RDV à planifier"),
  mk("FÉVRIER","Maxime Clerc","PER Individuel",100,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Vanessa Roy","PER Individuel",100,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Jérémy Forget","PER Individuel",200,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Aurélie Schmitt","Assurance Vie Française",200,80000,"LOUIS","","Réseau Personnel","Signé","Generali","","Haute"),
  mk("FÉVRIER","Thomas Renard","Assurance Vie Française",150,140000,"LOUIS","","Réseau Personnel","Signé","Generali","","Haute"),
  mk("FÉVRIER","Camille Blanchard","PER Individuel",200,0,"LOUIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Thomas Marchal","Assurance Vie Française",0,210000,"THOMAS","","Réseau Personnel","Signé","Generali","Dossier patrimonial majeur","Urgente"),
  mk("FÉVRIER","Grégoire Fabre","PER Individuel",100,0,"CLEMENT","","Téléprospection","Signé","SwissLife"),
  mk("FÉVRIER","François Lebeau","Assurance Vie Française",300,100000,"CLEMENT","","Réseau Personnel","Signé","Generali"),
  mk("FÉVRIER","Richard Gros","Assurance Vie Française",200,89000,"CLEMENT","","Parrainage Client","Signé","Generali"),
  mk("FÉVRIER","Anne Bourgeois","PER Individuel",200,0,"CLEMENT","","Parrainage Client","Signé","SwissLife"),
  mk("FÉVRIER","Pierre-Antoine Muller","PER Individuel",0,0,"CLEMENT","","Téléprospection","En cours","SwissLife"),
  mk("FÉVRIER","Kévin Roux","PER Individuel",100,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Sofia Lefort","PER Individuel",150,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Hugo Pelletier","PER Individuel",100,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Lucas Dupuis","PER Individuel",100,0,"ALEXIS","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Amandine Dumont","PER Individuel",200,0,"GIANNI","","Leads Facebook","Signé","SwissLife"),
  mk("FÉVRIER","Vincent Morel","PER Individuel",200,0,"GIANNI","","Leads Facebook","Signé","SwissLife"),
  mk("MARS","Hugo Renard","PER Individuel",100,0,"CLEMENT","","Leads Facebook","Signé","SwissLife"),
  mk("MARS","Sophie Aubert","Assurance Vie Française",200,50000,"CLEMENT","","Parrainage Client","Signé","Generali"),
  mk("MARS","Marc Gautier","PER Individuel",100,0,"CLEMENT","","Téléprospection","Signé","SwissLife"),
  mk("MARS","Emeline Legrand","PER Individuel",100,0,"CLEMENT","QUENTIN","Téléprospection","Prévu","SwissLife","Signature 15 mars"),
  mk("MARS","Thomas Petit","PER Individuel",0,39000,"CLEMENT","","Parrainage Client","En cours","Abeille Assurances","Transfert PER — docs manquants","Haute"),
  mk("MARS","Nicolas Leblanc","PER Individuel",550,0,"CLEMENT","","Réseau Personnel","Prévu","SwissLife","Chef d'entreprise — très gros PP","Urgente"),
  mk("MARS","Laura Dubois","Assurance Vie Française",0,0,"CLEMENT","","Leads Facebook","En cours","Generali"),
  mk("MARS","Antoine Leroy","PER Individuel",0,0,"CLEMENT","","Téléprospection","En cours","SwissLife"),
  mk("MARS","Romain Leroux","PER Individuel",200,0,"QUENTIN","","Leads Facebook","En cours","SwissLife"),
  mk("MARS","Marie Fontaine","PER Individuel",100,0,"QUENTIN","","Leads Facebook","En cours","SwissLife"),
  mk("MARS","Kevin Lambert","PER Individuel",300,0,"QUENTIN","","Leads Facebook","En cours","SwissLife","RDV prévu 20 mars","Haute"),
  mk("MARS","Sabrina Morin","Assurance Vie Française",0,10000,"LOUIS","","Parrainage Client","Signé","Generali"),
  mk("MARS","Julien Perrot","PER Individuel",0,0,"NANS","","Téléprospection","Signé","SwissLife"),
  mk("MARS","Claire Vasseur","Assurance Vie Française",0,10000,"NANS","","Parrainage Client","Signé","Generali"),
  mk("MARS","Emma Chabrier","Produits Structurés",0,25000,"JEAN","","Réseau Personnel","En cours","Primonial","Profil risque modéré","Haute"),
  mk("MARS","Bertrand Fontaine","Private Equity",0,50000,"JEAN","","Événement / Salon","Prévu","Nortia","Rencontré salon Patrimonia","Haute"),
  mk("MARS","Isabelle Roux","SCPI",0,30000,"LOUIS","","Leads Facebook","En cours","SwissLife","Nue-propriété en discussion"),
  mk("MARS","Mohammed Kadir","PER Individuel",250,0,"NANS","","Téléprospection","En cours","SwissLife"),
  mk("MARS","Lucie Perrot","Assurance Vie Luxembourgeoise",0,150000,"THOMAS","","Réseau Personnel","Prévu","Generali","Profil HNWI — stratégique","Urgente"),
  mk("MARS","David Renaud","PER Individuel",400,0,"ERWANN","","Leads Facebook","Signé","SwissLife"),
  mk("MARS","Charlotte Morin","Assurance Vie Française",150,20000,"DANY","","Parrainage Client","Signé","Cardif (BNP Paribas)"),
];

// ═══════════════════════════════════════════════════════════
// CSS INJECTION
// ═══════════════════════════════════════════════════════════
function useGlobalStyles() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; }
      body {
        background:
          radial-gradient(circle at top left, rgba(157,122,51,0.10), transparent 30%),
          radial-gradient(circle at top right, rgba(109,134,174,0.08), transparent 26%),
          linear-gradient(180deg, ${C.void} 0%, #F7F2EA 100%);
        color: ${C.snow};
        font-family: ${F.body};
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      ::selection { background: ${C.goldBg}; color: ${C.snow}; }
      ::-webkit-scrollbar { width: 7px; height: 7px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #D7C8B4; border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: #C7B394; }
      input::placeholder, textarea::placeholder { color: ${C.ash}; }
      input::-webkit-inner-spin-button { opacity: 0.3; }
      select option { background: ${C.surface}; color: ${C.snow}; }
      optgroup { color: ${C.gold}; font-weight: 700; font-size: 11px; letter-spacing: 0.08em; }
      button, input, select, textarea { font-family: ${F.body}; }
      input, select, textarea, button { transition: all 0.18s ease; }
      table { border-spacing: 0; }
      @keyframes fadeUp {
        from { opacity:0; transform:translateY(16px); }
        to { opacity:1; transform:translateY(0); }
      }
      @keyframes pulseGlow {
        0%,100% { box-shadow: 0 0 0 0 rgba(157,122,51,0.08); }
        50% { box-shadow: 0 0 0 8px rgba(157,122,51,0.00); }
      }
      .fade-up { animation: fadeUp 0.45s ease forwards; }
      .entasis-card {
        background: linear-gradient(180deg, rgba(255,253,249,0.92) 0%, rgba(255,252,247,0.96) 100%);
        border: 1px solid ${C.rim};
        border-radius: 20px;
        box-shadow: ${C.shadowSm};
        backdrop-filter: blur(16px);
      }
    `;
    document.head.appendChild(style);
  }, []);
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS
// ═══════════════════════════════════════════════════════════

function StatusPill({ s, size="sm" }) {
  const c = stC(s);
  const lg = size==="lg";
  return (
    <span style={{
      display:"inline-flex",
      alignItems:"center",
      gap:7,
      background:c.bg,
      color:c.col,
      border:`1px solid ${c.bd}`,
      borderRadius:999,
      padding:lg?"7px 14px":"5px 11px",
      fontSize:lg?12:11,
      fontWeight:600,
      letterSpacing:"0.01em",
      whiteSpace:"nowrap",
      fontFamily:F.body,
      boxShadow:`inset 0 1px 0 rgba(255,255,255,0.55)`,
    }}>
      <span style={{width:7,height:7,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:`0 0 0 3px ${c.bg}`}}/>
      {s}
    </span>
  );
}

function PrioBadge({ p }) {
  if(p==="Normale") return null;
  const urgent = p==="Urgente";
  const col = urgent ? C.red : C.amber;
  const bg  = urgent ? C.redBg : C.amberBg;
  const bd  = urgent ? C.redBd : C.amberBd;
  return (
    <span style={{
      display:"inline-flex",
      alignItems:"center",
      gap:5,
      fontSize:10,
      fontWeight:700,
      color:col,
      background:bg,
      border:`1px solid ${bd}`,
      borderRadius:999,
      padding:"4px 9px",
      letterSpacing:"0.03em",
      boxShadow:`inset 0 1px 0 rgba(255,255,255,0.55)`,
    }}>
      {urgent ? "⚡ Urgente" : "↗ Haute"}
    </span>
  );
}

function Btn({ children, onClick, variant="primary", sm, full, disabled, style:sx }) {
  const [hov,setHov]=useState(false);
  const vs = {
    primary:   { bg:`linear-gradient(135deg, ${C.gold} 0%, ${C.goldBr} 100%)`, bgH:`linear-gradient(135deg, ${C.goldBr} 0%, #C49A48 100%)`, color:"#FFFDF9", border:`1px solid ${C.goldBd}` },
    secondary: { bg:"rgba(255,255,255,0.72)", bgH:"#FFFDF9", color:C.cloud, border:`1px solid ${C.rim}` },
    success:   { bg:C.greenBg, bgH:"rgba(78,142,102,0.16)", color:C.green, border:`1px solid ${C.greenBd}` },
    danger:    { bg:C.redBg, bgH:"rgba(178,95,91,0.16)", color:C.red, border:`1px solid ${C.redBd}` },
    ghost:     { bg:"transparent", bgH:C.goldBg, color:C.cloud, border:"none" },
  };
  const v = vs[variant]||vs.primary;
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:hov?v.bgH:v.bg,
        color:v.color,
        border:v.border,
        borderRadius:14,
        padding:sm?"8px 12px":"11px 18px",
        fontSize:sm?11:12,
        fontWeight:700,
        letterSpacing:"0.01em",
        cursor:disabled?"not-allowed":"pointer",
        opacity:disabled?0.45:1,
        display:"inline-flex",
        alignItems:"center",
        gap:7,
        width:full?"100%":undefined,
        justifyContent:full?"center":undefined,
        transition:"all 0.18s ease",
        whiteSpace:"nowrap",
        boxShadow:variant==="primary" ? (hov?C.shadowMd:C.shadowSm) : undefined,
        transform:hov&&!disabled?"translateY(-1px)":"translateY(0)",
        ...sx,
      }}>{children}</button>
  );
}

function TextInput({ label, value, onChange, placeholder, type="text", note, icon, mono, ppLive }) {
  const [foc,setFoc]=useState(false);
  const ppM=Number(value)||0;
  return (
    <div>
      {label&&<label style={{display:"block",fontSize:10,fontWeight:700,color:C.gold,letterSpacing:"0.10em",textTransform:"uppercase",marginBottom:8,fontFamily:F.body}}>{label}</label>}
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        {icon&&<span style={{position:"absolute",left:14,color:C.ash,pointerEvents:"none",fontSize:14}}>{icon}</span>}
        <input type={type} value={value} placeholder={placeholder}
          onChange={e=>onChange(e.target.value)}
          onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{
            width:"100%",
            background:"#FFFDF9",
            border:`1px solid ${foc?C.gold:C.rim}`,
            boxShadow:foc?`0 0 0 4px ${C.goldBg}`:"inset 0 1px 0 rgba(255,255,255,0.8)",
            borderRadius:16,
            padding:icon?"13px 14px 13px 40px":"13px 14px",
            fontSize:13,
            fontFamily:mono?F.mono:F.body,
            color:C.snow,
            outline:"none",
          }}/>
      </div>
      {ppLive&&ppM>0&&(
        <div style={{marginTop:8,padding:"10px 12px",background:C.goldBg,border:`1px solid ${C.goldBd}`,borderRadius:16,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,color:C.gold,letterSpacing:"0.08em",fontWeight:700}}>PP ANNUALISÉE</span>
          <span style={{fontSize:15,fontWeight:700,color:C.goldBr,fontFamily:F.mono}}>{eur(ppM*12)}<span style={{fontSize:11,fontWeight:500}}>/an</span></span>
        </div>
      )}
      {note&&<p style={{margin:"6px 0 0",fontSize:11,color:C.ash,lineHeight:1.6}}>{note}</p>}
    </div>
  );
}

function SelInput({ label, value, onChange, options, placeholder, grouped }) {
  const [foc,setFoc]=useState(false);
  return (
    <div>
      {label&&<label style={{display:"block",fontSize:10,fontWeight:700,color:C.gold,letterSpacing:"0.10em",textTransform:"uppercase",marginBottom:8,fontFamily:F.body}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
        style={{
          width:"100%",
          background:"#FFFDF9",
          border:`1px solid ${foc?C.gold:C.rim}`,
          borderRadius:16,
          boxShadow:foc?`0 0 0 4px ${C.goldBg}`:"inset 0 1px 0 rgba(255,255,255,0.8)",
          padding:"13px 14px",
          fontSize:13,
          fontFamily:F.body,
          color:value?C.snow:C.ash,
          outline:"none",
          cursor:"pointer"
        }}>
        {placeholder&&<option value="">{placeholder}</option>}
        {grouped
          ? grouped.map(g=><optgroup key={g.cat} label={g.cat}>{g.items.map(i=><option key={i}>{i}</option>)}</optgroup>)
          : options?.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
      </select>
    </div>
  );
}

function Field({ label, children, note }) {
  return (
    <div>
      {label&&<label style={{display:"block",fontSize:10,fontWeight:700,color:C.gold,letterSpacing:"0.10em",textTransform:"uppercase",marginBottom:8}}>{label}</label>}
      {children}
      {note&&<p style={{margin:"6px 0 0",fontSize:11,color:C.ash,lineHeight:1.6}}>{note}</p>}
    </div>
  );
}

function GoldBar({ label, value, max, color=C.cPP }) {
  const p=pct(value,max);
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(p),90);return()=>clearTimeout(t);},[p]);
  const done = p>=100;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
        <span style={{fontSize:12,color:C.cloud,fontFamily:F.body,fontWeight:600}}>{label}</span>
        <span style={{fontSize:13,fontWeight:700,color:done?C.green:color,fontFamily:F.mono}}>{p}%</span>
      </div>
      <div style={{background:C.ghost,borderRadius:999,height:8,overflow:"hidden"}}>
        <div style={{
          width:`${w}%`,
          height:"100%",
          borderRadius:999,
          background:done?`linear-gradient(90deg,${C.green},#78B28D)`:`linear-gradient(90deg, ${color}, ${done?C.green:color})`,
          transition:"width 1.4s cubic-bezier(0.16,1,0.3,1)",
          boxShadow:`0 6px 20px ${done?C.green:color}24`,
        }}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <span style={{fontSize:10,color:C.cloud,fontFamily:F.mono}}>{eur(value)}</span>
        <span style={{fontSize:10,color:C.ash,fontFamily:F.mono}}>/ {eur(max)}</span>
      </div>
    </div>
  );
}

function Panel({ children, style:sx }) {
  return (
    <div className="entasis-card" style={{
      background:`linear-gradient(180deg, rgba(255,253,249,0.96) 0%, rgba(255,251,245,0.94) 100%)`,
      borderRadius:20,
      border:`1px solid ${C.rim}`,
      boxShadow:C.shadowSm,
      ...sx
    }}>
      {children}
    </div>
  );
}

function PanelHover({ children, onClick, style:sx }) {
  const [h,setH]=useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{
        background:h?`linear-gradient(180deg, #FFFDF9 0%, #FCF8F1 100%)`:`linear-gradient(180deg, rgba(255,253,249,0.96) 0%, rgba(255,251,245,0.94) 100%)`,
        borderRadius:20,
        border:`1px solid ${h?C.goldBd:C.rim}`,
        boxShadow:h?C.shadowMd:C.shadowSm,
        cursor:onClick?"pointer":"default",
        transition:"all 0.18s ease",
        transform:h&&onClick?"translateY(-2px)":"translateY(0)",
        ...sx
      }}>
      {children}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,marginTop:4,marginBottom:4}}>
      {label&&<span style={{fontSize:10,fontWeight:700,color:C.ash,textTransform:"uppercase",letterSpacing:"0.10em",whiteSpace:"nowrap"}}>{label}</span>}
      <div style={{flex:1,height:1,background:`linear-gradient(90deg, ${C.ghost}, transparent)`}}/>
    </div>
  );
}

function ChartTip({ active, payload, label }) {
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:"#FFFDF9",border:`1px solid ${C.rim}`,borderRadius:16,padding:"12px 14px",boxShadow:C.shadowMd}}>
      <div style={{fontSize:11,color:C.cloud,marginBottom:8,letterSpacing:"0.02em",fontWeight:600}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{fontSize:12,color:p.color,fontWeight:700,fontFamily:F.mono,marginTop:i?4:0}}>{p.name}: {eur(p.value,true)}</div>)}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent, mono }) {
  return (
    <Panel style={{padding:"1.35rem 1.45rem",position:"relative",overflow:"hidden"}}>
      <div style={{
        position:"absolute",
        inset:"auto -28px -28px auto",
        width:110,
        height:110,
        borderRadius:"50%",
        background:`radial-gradient(circle, ${accent}16 0%, transparent 68%)`,
        pointerEvents:"none"
      }}/>
      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:14}}>
        <span style={{fontSize:16,lineHeight:1}}>{icon}</span>
        <span style={{fontSize:10,fontWeight:700,color:C.ash,letterSpacing:"0.10em",textTransform:"uppercase"}}>{label}</span>
      </div>
      <div style={{fontSize:"1.85rem",fontWeight:700,color:C.snow,fontFamily:mono?F.mono:F.display,lineHeight:1.02,letterSpacing:"-0.02em"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.cloud,marginTop:9,lineHeight:1.5}}>{sub}</div>}
    </Panel>
  );
}

function SectionHeader({ title, sub, right }) {
  return (
    <div style={{
      padding:"1.6rem 1.9rem 1.25rem",
      borderBottom:`1px solid ${C.ghost}`,
      display:"flex",
      justifyContent:"space-between",
      alignItems:"flex-start",
      gap:16,
      flexShrink:0,
      background:`linear-gradient(180deg, rgba(248,243,235,0.96) 0%, rgba(248,243,235,0.78) 100%)`,
      backdropFilter:"blur(12px)"
    }}>
      <div>
        <h1 style={{fontSize:28,fontWeight:600,color:C.snow,fontFamily:F.display,margin:0,letterSpacing:"0.01em"}}>{title}</h1>
        {sub&&<p style={{fontSize:12,color:C.cloud,marginTop:6,fontFamily:F.body,lineHeight:1.6}}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL: DEAL FORM
// ═══════════════════════════════════════════════════════════
function DealModal({ deal, user, month, onSave, onClose }) {
  const isMgr = user===MANAGER;
  const [f,setF]=useState({
    client:"",product:"PER Individuel",company:"SwissLife",
    ppM:"",pu:"",advisor:isMgr?"":user,coAdvisor:"",
    source:"Téléprospection",st:"En cours",month,priority:"Normale",
    dateExpected:"",dateSigned:"",notes:"",tags:"",
    clientPhone:"",clientEmail:"",clientAge:"",
    ...(deal||{}),
    ppM:deal?String(deal.ppM||""):"",
    pu:deal?String(deal.pu||""):"",
    tags:deal?.tags?.join(", ")||"",
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const ppM=Number(f.ppM)||0, puV=Number(f.pu)||0;

  const doSave=()=>{
    if(!f.client.trim()){alert("Nom du client requis");return;}
    if(!f.advisor){alert("Conseiller requis");return;}
    onSave({...(deal||{}), ...f, id:f.id||uid(), ppM, pu:puV,
      tags:(f.tags||"").split(",").map(t=>t.trim()).filter(Boolean)});
  };

  const SectionLabel=({t})=>(
    <div style={{fontSize:9,fontWeight:600,color:C.gold,letterSpacing:"0.15em",textTransform:"uppercase",padding:"14px 0 8px",borderBottom:`1px solid ${C.ghost}`,marginBottom:14}}>{t}</div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(12px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.deep,borderRadius:14,border:`1px solid ${C.goldBd}`,width:"100%",maxWidth:660,maxHeight:"92vh",overflowY:"auto",boxShadow:C.shadowModal}}>

        {/* Header */}
        <div style={{padding:"1.2rem 1.5rem",borderBottom:`1px solid ${C.ghost}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:C.deep,zIndex:1}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:C.snow,fontFamily:F.display}}>{deal?.id?"Modifier le dossier":"Nouveau dossier"}</div>
            <div style={{fontSize:10,color:C.ash,marginTop:2}}>{f.month} 2026 · {FIRM.name}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.ash,cursor:"pointer",fontSize:18,lineHeight:1,padding:4}}>✕</button>
        </div>

        <div style={{padding:"1.25rem 1.5rem"}}>
          <SectionLabel t="Client"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:18}}>
            <div style={{gridColumn:"1/-1"}}>
              <TextInput label="Nom complet *" value={f.client} onChange={v=>set("client",v)} placeholder="Prénom Nom"/>
            </div>
            <TextInput label="Téléphone" value={f.clientPhone} onChange={v=>set("clientPhone",v)} placeholder="06 00 00 00 00"/>
            <TextInput label="Email" value={f.clientEmail} onChange={v=>set("clientEmail",v)} placeholder="email@exemple.fr"/>
            <TextInput label="Âge" type="number" value={f.clientAge} onChange={v=>set("clientAge",v)} placeholder="45"/>
          </div>

          <SectionLabel t="Produit"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
            <SelInput label="Produit" value={f.product} onChange={v=>set("product",v)} grouped={PRODUCTS}/>
            <SelInput label="Compagnie" value={f.company} onChange={v=>set("company",v)} options={COMPANIES}/>
          </div>

          <SectionLabel t="Primes"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:18}}>
            <div>
              <TextInput
                label="Prime Périodique — versement mensuel (€/mois)"
                value={f.ppM} onChange={v=>set("ppM",v)}
                placeholder="0" type="number" mono ppLive
                note="Le client verse ce montant chaque mois. L'annualisé (×12) est utilisé pour les objectifs."
              />
            </div>
            <div>
              <TextInput
                label="Prime Unique — versement ponctuel (€)"
                value={f.pu} onChange={v=>set("pu",v)}
                placeholder="0" type="number" mono
                note="Capital versé en une seule fois : transfert, investissement initial, SCPI, etc."
              />
              {puV>0&&(
                <div style={{marginTop:6,padding:"7px 10px",background:"rgba(201,168,76,0.08)",border:`1px solid ${C.goldBd}`,borderRadius:6}}>
                  <span style={{fontSize:14,fontWeight:600,color:C.goldBr,fontFamily:F.mono}}>{eur(puV)}</span>
                </div>
              )}
            </div>
          </div>

          <SectionLabel t="Affectation & suivi"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            {isMgr
              ? <SelInput label="Conseiller *" value={f.advisor} onChange={v=>set("advisor",v)} options={ADVISORS} placeholder="Sélectionner…"/>
              : <Field label="Conseiller"><div style={{background:C.ghost,borderRadius:6,padding:"9px 12px",fontSize:12,fontWeight:500,color:C.snow}}>{user}</div></Field>
            }
            <SelInput label="Co-conseiller" value={f.coAdvisor} onChange={v=>set("coAdvisor",v)} options={["", ...ADVISORS.filter(a=>a!==f.advisor)].map(a=>({v:a,l:a||"Aucun"}))}/>
            <SelInput label="Source" value={f.source} onChange={v=>set("source",v)} options={SOURCES}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:18}}>
            <SelInput label="Statut" value={f.st} onChange={v=>set("st",v)} options={STATUTS.map(s=>({v:s.id,l:s.id}))}/>
            <SelInput label="Mois" value={f.month} onChange={v=>set("month",v)} options={MONTHS}/>
            <SelInput label="Priorité" value={f.priority} onChange={v=>set("priority",v)} options={PRIORITIES}/>
            <TextInput label={f.st==="Signé"?"Date signature":"Signature prévue"} value={f.st==="Signé"?f.dateSigned:f.dateExpected} onChange={v=>set(f.st==="Signé"?"dateSigned":"dateExpected",v)} placeholder="MM/AA"/>
          </div>

          <SectionLabel t="Notes & contexte"/>
          <div style={{marginBottom:12}}>
            <Field label="Notes patrimoniales">
              <textarea value={f.notes} onChange={e=>set("notes",e.target.value)} rows={3}
                placeholder="Situation familiale, objectifs fiscaux, prochaines étapes, documents attendus…"
                style={{width:"100%",background:C.raise,border:`1px solid ${C.rim}`,borderRadius:6,padding:"9px 12px",fontSize:12,fontFamily:F.body,color:C.snow,outline:"none",resize:"vertical"}}/>
            </Field>
          </div>
          <TextInput label="Tags (virgules)" value={f.tags} onChange={v=>set("tags",v)} placeholder="retraite, fiscal, TNS, famille…"/>

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,borderTop:`1px solid ${C.ghost}`,paddingTop:"1.25rem",marginTop:"1.5rem"}}>
            <Btn variant="secondary" onClick={onClose}>Annuler</Btn>
            <Btn onClick={doSave}>{deal?.id?"Enregistrer":"Créer le dossier"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL: CLIENT 360
// ═══════════════════════════════════════════════════════════
function Client360({ client, deals, onClose, onEdit }) {
  const cd=deals.filter(d=>d.client.toLowerCase()===client.toLowerCase());
  const latest=cd.sort((a,b)=>b.createdAt-a.createdAt)[0];
  const totPP=cd.reduce((t,d)=>t+ppAnn(d.ppM),0);
  const totPU=cd.reduce((t,d)=>t+(Number(d.pu)||0),0);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(12px)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.deep,borderRadius:14,border:`1px solid ${C.goldBd}`,width:"100%",maxWidth:540,maxHeight:"85vh",overflowY:"auto",boxShadow:C.shadowModal}}>
        {/* Header */}
        <div style={{padding:"1.2rem 1.5rem",borderBottom:`1px solid ${C.ghost}`,display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.void,flexShrink:0}}>{ini(client)}</div>
          <div>
            <div style={{fontSize:17,fontWeight:600,color:C.snow,fontFamily:F.display}}>{client}</div>
            <div style={{fontSize:10,color:C.ash,marginTop:2}}>{cd.length} dossier{cd.length>1?"s":""} · Client {FIRM.name}</div>
          </div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:C.ash,cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {/* Contact */}
        {(latest?.clientPhone||latest?.clientEmail)&&(
          <div style={{padding:"0.6rem 1.5rem",borderBottom:`1px solid ${C.ghost}`,display:"flex",gap:14}}>
            {latest?.clientPhone&&<span style={{fontSize:11,color:C.cloud}}>📞 {latest.clientPhone}</span>}
            {latest?.clientEmail&&<span style={{fontSize:11,color:C.cloud}}>✉ {latest.clientEmail}</span>}
            {latest?.clientAge&&<span style={{fontSize:11,color:C.cloud}}>🎂 {latest.clientAge} ans</span>}
          </div>
        )}
        {/* KPIs */}
        <div style={{padding:"1rem 1.5rem",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,borderBottom:`1px solid ${C.ghost}`}}>
          {[{l:"PP Annualisée",v:eur(totPP),c:C.cPP},{l:"PU Total",v:eur(totPU),c:C.cPU},{l:"Signés",v:`${cd.filter(d=>d.st==="Signé").length}/${cd.length}`,c:C.green}].map(k=>(
            <div key={k.l} style={{textAlign:"center",padding:"0.75rem",background:C.raise,borderRadius:8,border:`1px solid ${C.rim}`}}>
              <div style={{fontSize:"1.2rem",fontWeight:600,color:k.c,fontFamily:F.mono}}>{k.v}</div>
              <div style={{fontSize:9,color:C.ash,marginTop:2,letterSpacing:"0.04em"}}>{k.l}</div>
            </div>
          ))}
        </div>
        {/* Deals */}
        <div style={{padding:"1rem 1.5rem"}}>
          <div style={{fontSize:9,fontWeight:600,color:C.ash,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Historique</div>
          {cd.map(d=>(
            <div key={d.id} style={{padding:"10px 13px",background:C.raise,borderRadius:8,border:`1px solid ${C.rim}`,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div>
                <div style={{fontSize:12,fontWeight:500,color:C.snow}}>{d.product}</div>
                <div style={{fontSize:10,color:C.ash,marginTop:2}}>{d.month} · {d.company} · {d.advisor}</div>
                {d.notes&&<div style={{fontSize:10,color:C.cloud,marginTop:3,fontStyle:"italic"}}>{d.notes.slice(0,80)}{d.notes.length>80?"…":""}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                <StatusPill s={d.st}/>
                <div style={{fontSize:9,fontFamily:F.mono,color:C.cPP}}>{d.ppM>0?`PP ${eur(ppAnn(d.ppM),true)}/an`:""}{d.pu>0?` PU ${eur(d.pu,true)}`:""}</div>
                <Btn sm variant="secondary" onClick={()=>onEdit(d)} style={{fontSize:10}}>Modifier</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [hov,setHov]=useState(null);

  return (
    <div style={{minHeight:"100vh",display:"flex",background:`linear-gradient(135deg, ${C.void} 0%, #FBF7F0 100%)`}}>
      <div style={{
        width:470,
        background:`linear-gradient(180deg, #F7F1E8 0%, #F3EBDF 100%)`,
        borderRight:`1px solid ${C.rim}`,
        display:"flex",
        flexDirection:"column",
        padding:"3.2rem 2.7rem",
        flexShrink:0,
        position:"relative",
        overflow:"hidden"
      }}>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at top left, ${C.goldBg} 0%, transparent 35%), linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 55%)`,pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.ash,letterSpacing:"0.28em",textTransform:"uppercase",marginBottom:"4rem"}}>ORIAS {FIRM.orias}</div>

          <div style={{marginBottom:"1.75rem"}}>
            <div style={{fontSize:48,fontWeight:500,color:C.snow,fontFamily:F.display,lineHeight:0.95,letterSpacing:"0.06em"}}>ENTASIS</div>
            <div style={{height:2,width:56,background:`linear-gradient(90deg,${C.gold},transparent)`,margin:"14px 0 10px"}}/>
            <div style={{fontSize:12,fontWeight:700,color:C.gold,letterSpacing:"0.34em",textTransform:"uppercase"}}>Conseil</div>
          </div>

          <p style={{fontSize:15,color:C.cloud,lineHeight:1.8,maxWidth:310,marginBottom:"3rem"}}>
            Un CRM interne pensé comme un espace de pilotage patrimonial :
            clair, sélectif et agréable à utiliser sur toute une journée.
          </p>

          <div style={{display:"grid",gap:12,marginBottom:"2.4rem"}}>
            {[
              ["Vision consolidée", "Production, pipeline, classement, objectifs"],
              ["Lecture apaisée", "Palette plus douce et structure aérée"],
              ["Usage quotidien", "Actions rapides, hiérarchie nette, confort visuel"]
            ].map(([t,d])=>(
              <div key={t} style={{padding:"14px 16px",background:"rgba(255,253,249,0.58)",border:`1px solid ${C.rim}`,borderRadius:18,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.7)"}}>
                <div style={{fontSize:12,fontWeight:700,color:C.snow,marginBottom:4}}>{t}</div>
                <div style={{fontSize:12,color:C.cloud,lineHeight:1.6}}>{d}</div>
              </div>
            ))}
          </div>

          <div style={{borderTop:`1px solid ${C.rim}`,paddingTop:"1.4rem"}}>
            <p style={{fontSize:12,color:C.ash,lineHeight:1.9}}>
              {FIRM.address}<br/>
              {FIRM.phone}<br/>
              {FIRM.email}
            </p>
          </div>
        </div>

        <div style={{marginTop:"auto",position:"relative",fontSize:10,color:C.ash,letterSpacing:"0.04em"}}>
          © 2026 {FIRM.name} · Interface interne
        </div>
      </div>

      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"2.5rem"}}>
        <div style={{width:"100%",maxWidth:560,animation:"fadeUp 0.5s ease"}}>
          <div style={{marginBottom:"2.5rem"}}>
            <h2 style={{fontSize:34,fontWeight:500,color:C.snow,fontFamily:F.display,margin:"0 0 10px",letterSpacing:"0.01em"}}>Bienvenue</h2>
            <p style={{fontSize:14,color:C.cloud,lineHeight:1.7}}>Accédez à votre espace de travail Entasis Conseil.</p>
          </div>

          <div onClick={()=>onLogin(MANAGER)}
            onMouseEnter={()=>setHov(MANAGER)} onMouseLeave={()=>setHov(null)}
            style={{
              background:hov===MANAGER?`linear-gradient(180deg, #FFFDF9 0%, #FCF7F0 100%)`:`linear-gradient(180deg, rgba(255,253,249,0.95) 0%, rgba(255,249,243,0.92) 100%)`,
              border:`1px solid ${hov===MANAGER?C.goldBd:C.rim}`,
              borderRadius:24,
              padding:"1.25rem 1.35rem",
              cursor:"pointer",
              marginBottom:"1.9rem",
              transition:"all 0.18s ease",
              boxShadow:hov===MANAGER?C.shadowMd:C.shadowSm,
              transform:hov===MANAGER?"translateY(-2px)":"translateY(0)",
            }}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{width:50,height:50,borderRadius:16,background:`linear-gradient(135deg,${C.gold},${C.goldBr})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#FFFDF9",flexShrink:0,boxShadow:C.shadowSm}}>✦</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.snow}}>Espace Direction</div>
                <div style={{fontSize:12,color:C.cloud,marginTop:4,lineHeight:1.6}}>Vue consolidée du cabinet, analytics complets et pilotage des objectifs.</div>
              </div>
              <span style={{marginLeft:"auto",color:C.ash,fontSize:18}}>›</span>
            </div>
          </div>

          <Divider label="Conseillers"/>
          <div style={{marginTop:"1.4rem",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {ADVISORS.map(name=>(
              <div key={name} onClick={()=>onLogin(name)}
                onMouseEnter={()=>setHov(name)} onMouseLeave={()=>setHov(null)}
                style={{
                  background:hov===name?`linear-gradient(180deg, #FFFDF9 0%, #FCF7F0 100%)`:`linear-gradient(180deg, rgba(255,253,249,0.95) 0%, rgba(255,249,243,0.92) 100%)`,
                  border:`1px solid ${hov===name?C.goldBd:C.rim}`,
                  borderRadius:20,
                  padding:"1rem 0.7rem",
                  cursor:"pointer",
                  textAlign:"center",
                  transition:"all 0.16s ease",
                  boxShadow:hov===name?C.shadowMd:C.shadowSm,
                  transform:hov===name?"translateY(-2px)":"translateY(0)",
                }}>
                <div style={{width:40,height:40,borderRadius:14,background:hov===name?`linear-gradient(135deg,${C.gold},${C.goldBr})`:"#F2EBDD",margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:hov===name?"#FFFDF9":C.cloud,border:`1px solid ${hov===name?"transparent":C.rim}`}}>
                  {ini(name)}
                </div>
                <div style={{fontSize:12,fontWeight:700,color:hov===name?C.gold:C.snow}}>{name}</div>
              </div>
            ))}
          </div>

          <p style={{textAlign:"center",fontSize:11,color:C.ash,marginTop:"1.6rem",lineHeight:1.7}}>
            Chaque conseiller n’accède qu’à ses dossiers. La Direction dispose d’une vue consolidée.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════
function Sidebar({ user, view, setView, onLogout, month, setMonth }) {
  const isMgr=user===MANAGER;
  const [hov,setHov]=useState(null);

  const nav=[
    {items:[
      {id:"dashboard", label:"Dashboard",  icon:"◈"},
      {id:"dossiers",  label:"Dossiers",   icon:"◉"},
      {id:"pipeline",  label:"Pipeline",   icon:"◫"},
    ]},
    {section:"Analyse", items:[
      {id:"analytics", label:"Analytics",  icon:"◐"},
      {id:"agenda",    label:"Agenda",     icon:"◷"},
      {id:"classement",label:"Classement", icon:"◆"},
    ]},
    ...(isMgr?[{section:"Direction", items:[
      {id:"global",    label:"Vue globale",icon:"◉"},
      {id:"settings",  label:"Paramètres", icon:"◎"},
    ]}]:[]),
  ];

  return (
    <div style={{
      width:248,
      flexShrink:0,
      background:`linear-gradient(180deg, #F7F1E8 0%, #F3EBDF 100%)`,
      borderRight:`1px solid ${C.rim}`,
      display:"flex",
      flexDirection:"column",
      height:"100vh",
      position:"sticky",
      top:0
    }}>
      <div style={{padding:"1.7rem 1.35rem 1.15rem",borderBottom:`1px solid ${C.rim}`}}>
        <div style={{fontSize:24,fontWeight:500,color:C.snow,fontFamily:F.display,letterSpacing:"0.08em",lineHeight:1}}>ENTASIS</div>
        <div style={{height:2,width:34,background:C.gold,margin:"9px 0 7px"}}/>
        <div style={{fontSize:10,fontWeight:700,color:C.goldDim,letterSpacing:"0.24em"}}>CONSEIL</div>
      </div>

      <div style={{padding:"1rem 1rem 0.4rem"}}>
        <div style={{padding:"0.95rem",background:"rgba(255,253,249,0.58)",border:`1px solid ${C.rim}`,borderRadius:18,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.7)"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.ash,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Période</div>
          <select value={month} onChange={e=>setMonth(e.target.value)} style={{width:"100%",background:"#FFFDF9",border:`1px solid ${C.rim}`,color:C.snow,borderRadius:14,padding:"11px 12px",fontSize:12,fontWeight:700,outline:"none",cursor:"pointer"}}>
            {MONTHS.map(m=><option key={m} value={m}>{m} 2026</option>)}
          </select>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"0.6rem 0.9rem 1rem"}}>
        {nav.map((sec,si)=>(
          <div key={si} style={{marginBottom:10}}>
            {sec.section&&<div style={{fontSize:10,fontWeight:700,color:C.ash,textTransform:"uppercase",letterSpacing:"0.12em",padding:"10px 10px 7px"}}>{sec.section}</div>}
            {sec.items.map(item=>{
              const active=view===item.id, hv=hov===item.id;
              return (
                <button key={item.id} onClick={()=>setView(item.id)}
                  onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                  style={{
                    width:"100%",
                    background:active?`linear-gradient(135deg, ${C.goldBg} 0%, rgba(255,255,255,0.55) 100%)`:hv?"rgba(255,253,249,0.70)":"transparent",
                    border:`1px solid ${active?C.goldBd:"transparent"}`,
                    borderRadius:16,
                    color:active?C.gold:hv?C.snow:C.cloud,
                    padding:"11px 12px",
                    cursor:"pointer",
                    display:"flex",
                    alignItems:"center",
                    gap:10,
                    fontSize:13,
                    fontWeight:active?700:600,
                    textAlign:"left",
                    transition:"all 0.14s ease",
                    marginBottom:4,
                  }}>
                  <span style={{
                    width:26,height:26,borderRadius:9,
                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                    background:active?`linear-gradient(135deg, ${C.gold}, ${C.goldBr})`:"rgba(255,255,255,0.65)",
                    color:active?"#FFFDF9":C.ash,
                    border:`1px solid ${active?"transparent":C.rim}`,
                    fontSize:11,
                    flexShrink:0
                  }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{padding:"0.95rem",borderTop:`1px solid ${C.rim}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"rgba(255,253,249,0.58)",borderRadius:18,marginBottom:10,border:`1px solid ${C.rim}`}}>
          <div style={{width:34,height:34,borderRadius:12,background:isMgr?`linear-gradient(135deg,${C.gold},${C.goldBr})`:"#F2EBDD",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:isMgr?"#FFFDF9":C.cloud,flexShrink:0}}>{isMgr?"DG":ini(user)}</div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.snow}}>{user}</div>
            <div style={{fontSize:10,color:C.ash}}>{isMgr?"Direction":"Conseiller"}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{width:"100%",background:"#FFFDF9",border:`1px solid ${C.rim}`,color:C.cloud,borderRadius:14,padding:"10px 12px",cursor:"pointer",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          ← Déconnexion
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function DashboardView({ deals, user, month, objectifs, onAdd, onViewClient }) {
  const isMgr=user===MANAGER;
  const allM=deals.filter(d=>d.month===month);
  const mine=isMgr?allM:allM.filter(d=>d.advisor===user||d.coAdvisor===user);
  const obj=objectifs[month]||OBJ_BASE[month];
  const S=calcStats(mine), G=calcStats(allM), D=isMgr?G:S;
  const rank=rankAll(allM);
  const myRank=isMgr?null:rank.findIndex(r=>r.name===user)+1;

  const chartData=MONTHS.slice(0,6).map(m=>{
    const md=(isMgr?deals:deals.filter(d=>d.advisor===user||d.coAdvisor===user)).filter(d=>d.month===m&&d.st==="Signé");
    return {m:m.slice(0,3),pp:md.reduce((t,d)=>t+ppAnn(d.ppM),0),pu:md.reduce((t,d)=>t+(Number(d.pu)||0),0)};
  });

  const recent=mine.filter(d=>d.st==="Signé").sort((a,b)=>b.createdAt-a.createdAt).slice(0,6);
  const alerts=mine.filter(d=>d.st==="En cours"&&age(d.createdAt)>14).sort((a,b)=>age(b.createdAt)-age(a.createdAt)).slice(0,5);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader
        title={isMgr?"Vue Directeur":`Espace de ${user}`}
        sub={`${month} 2026  ·  ${mine.length} dossier${mine.length>1?"s":""}`}
        right={<Btn onClick={onAdd}>+ Nouveau dossier</Btn>}
      />
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          <KpiCard icon="💶" label="PP Annualisée" value={eur(D.ppSigned,true)} sub={`Obj. ${eur(obj.pp,true)}  ·  ${pct(D.ppSigned,obj.pp)}%`} accent={C.cPP} mono/>
          <KpiCard icon="🏦" label="Primes Uniques" value={eur(D.puSigned,true)} sub={`Obj. ${eur(obj.pu,true)}  ·  ${pct(D.puSigned,obj.pu)}%`} accent={C.cPU} mono/>
          <KpiCard icon="✓" label="Dossiers signés" value={D.signed} sub={`${D.conv}% de conversion`} accent={C.green}/>
          {myRank!=null
            ? <KpiCard icon="🏆" label="Classement" value={["🥇 1er","🥈 2e","🥉 3e"][myRank-1]||`#${myRank}`} sub="PP + PU signées" accent={C.gold}/>
            : <KpiCard icon="👥" label="Conseillers actifs" value={rank.filter(r=>r.tot>0).length} sub={`${allM.length} dossiers`} accent={C.violet}/>
          }
        </div>

        {/* Objectifs + Chart */}
        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:14,marginBottom:14}}>
          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:14,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:4}}>Objectifs {month}</div>
            <div style={{fontSize:9,color:C.ash,marginBottom:18,letterSpacing:"0.04em"}}>PP mensuelle ×12 · PU capital ponctuel</div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <GoldBar label="PP Annualisée" value={D.ppSigned} max={obj.pp} color={C.cPP}/>
              <GoldBar label="Prime Unique" value={D.puSigned} max={obj.pu} color={C.cPU}/>
            </div>
            <div style={{marginTop:16,padding:"10px 12px",background:C.ghost,borderRadius:8,border:`1px solid ${C.rim}`}}>
              <div style={{fontSize:9,color:C.ash,marginBottom:5,letterSpacing:"0.06em"}}>POTENTIEL SI TOUT SE SIGNE</div>
              <div style={{display:"flex",gap:12}}>
                <span style={{fontSize:12,fontWeight:500,color:C.cPP,fontFamily:F.mono}}>{eur(D.ppPot,true)} PP</span>
                <span style={{fontSize:12,fontWeight:500,color:C.cPU,fontFamily:F.mono}}>{eur(D.puPot,true)} PU</span>
              </div>
            </div>
          </Panel>

          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:14,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:16}}>Performance mensuelle 2026</div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="gPP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cPP} stopOpacity={0.22}/><stop offset="100%" stopColor={C.cPP} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gPU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cPU} stopOpacity={0.22}/><stop offset="100%" stopColor={C.cPU} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.ghost} vertical={false}/>
                <XAxis dataKey="m" tick={{fontSize:10,fill:C.ash,fontFamily:F.body}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>eur(v,true)} tick={{fontSize:9,fill:C.ash,fontFamily:F.mono}} axisLine={false} tickLine={false} width={50}/>
                <Tooltip content={<ChartTip/>}/>
                <Area type="monotone" dataKey="pp" name="PP Ann." stroke={C.cPP} strokeWidth={2} fill="url(#gPP)"/>
                <Area type="monotone" dataKey="pu" name="PU" stroke={C.cPU} strokeWidth={2} fill="url(#gPU)"/>
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* Bottom row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          {/* Derniers signés */}
          <Panel style={{padding:"1.1rem 1.3rem"}}>
            <div style={{fontSize:12,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:12}}>Derniers signés</div>
            {recent.length===0&&<p style={{color:C.ash,fontSize:11,textAlign:"center",padding:"1rem 0"}}>Aucun signé ce mois</p>}
            {recent.map((d,i)=>(
              <div key={d.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<recent.length-1?`1px solid ${C.ghost}`:undefined}}>
                <div>
                  <button onClick={()=>onViewClient(d.client)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:500,color:C.snow,padding:0,textAlign:"left",fontFamily:F.body}}>{d.client}</button>
                  <div style={{fontSize:9,color:C.ash}}>{d.product}{isMgr?` · ${d.advisor}`:""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  {d.ppM>0&&<div style={{fontSize:10,color:C.cPP,fontFamily:F.mono,fontWeight:500}}>{eur(ppAnn(d.ppM),true)}/an</div>}
                  {d.pu>0&&<div style={{fontSize:10,color:C.cPU,fontFamily:F.mono,fontWeight:500}}>{eur(d.pu,true)}</div>}
                </div>
              </div>
            ))}
          </Panel>

          {/* Relances */}
          <Panel style={{padding:"1.1rem 1.3rem"}}>
            <div style={{fontSize:12,fontWeight:500,color:C.amber,fontFamily:F.display,marginBottom:12}}>⚠ Relances urgentes</div>
            {alerts.length===0&&<p style={{color:C.ash,fontSize:11,textAlign:"center",padding:"1rem 0"}}>Aucune relance · tout est à jour 🎉</p>}
            {alerts.map((d,i)=>(
              <div key={d.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<alerts.length-1?`1px solid ${C.ghost}`:undefined}}>
                <div>
                  <div style={{fontSize:11,fontWeight:500,color:C.snow}}>{d.client}</div>
                  <div style={{fontSize:9,color:C.ash}}>{d.product}</div>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:age(d.createdAt)>21?C.red:C.amber,fontFamily:F.mono}}>{age(d.createdAt)}j</span>
              </div>
            ))}
          </Panel>

          {/* Top 5 */}
          <Panel style={{padding:"1.1rem 1.3rem"}}>
            <div style={{fontSize:12,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:12}}>Top 5 — {month}</div>
            {rank.filter(r=>r.sig>0).length===0&&<p style={{color:C.ash,fontSize:11,textAlign:"center",padding:"1rem 0"}}>Aucun signé</p>}
            {rank.filter(r=>r.sig>0).slice(0,5).map((r,i)=>(
              <div key={r.name} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:i<4?`1px solid ${C.ghost}`:undefined}}>
                <span style={{fontSize:12,minWidth:22}}>{["🥇","🥈","🥉"][i]||<span style={{fontSize:9,color:C.ash,fontFamily:F.mono}}>#{i+1}</span>}</span>
                <span style={{fontSize:11,fontWeight:500,color:r.name===user?C.gold:C.snow,flex:1}}>{r.name}</span>
                <span style={{fontSize:9,fontFamily:F.mono,color:C.cPP}}>{eur(r.ppS,true)}</span>
                <span style={{fontSize:9,color:C.green,fontWeight:500}}>{r.sig}✓</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DOSSIERS
// ═══════════════════════════════════════════════════════════
function DossiersView({ deals, user, month, onAdd, onEdit, onDelete, onViewClient }) {
  const isMgr=user===MANAGER;
  const [search,setSearch]=useState("");
  const [fSt,setFSt]=useState("");
  const [fAdv,setFAdv]=useState("");
  const [fMo,setFMo]=useState(month);
  const [sort,setSort]=useState("recent");
  const [filtersOpen,setFiltersOpen]=useState(false);

  let rows=deals;
  if(!isMgr) rows=rows.filter(d=>d.advisor===user||d.coAdvisor===user);
  if(fMo) rows=rows.filter(d=>d.month===fMo);
  if(fSt) rows=rows.filter(d=>d.st===fSt);
  if(fAdv&&isMgr) rows=rows.filter(d=>d.advisor===fAdv);
  if(search){const q=search.toLowerCase();rows=rows.filter(d=>[d.client,d.product,d.company,d.advisor,d.notes].some(f=>(f||"").toLowerCase().includes(q)));}
  rows=[...rows].sort((a,b)=>sort==="ppDesc"?ppAnn(b.ppM)-ppAnn(a.ppM):sort==="puDesc"?(b.pu||0)-(a.pu||0):b.createdAt-a.createdAt);
  const S=calcStats(rows);

  const quickStatus=(d,st)=>onEdit({...d,st});

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader
        title="Dossiers"
        sub={`${rows.length} dossier${rows.length>1?"s":""} · PP ${eur(S.ppSigned,true)} · PU ${eur(S.puSigned,true)}`}
        right={<Btn onClick={onAdd}>+ Nouveau dossier</Btn>}
      />

      {/* Filters */}
      <div style={{padding:"0.7rem 1.75rem",borderBottom:`1px solid ${C.ghost}`,background:`linear-gradient(180deg, rgba(248,243,235,0.92) 0%, rgba(248,243,235,0.74) 100%)`,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
        <div style={{position:"relative",flex:1,minWidth:200}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.ash,fontSize:12,pointerEvents:"none"}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher client, produit, conseiller…"
            style={{width:"100%",background:C.raise,border:`1px solid ${C.rim}`,borderRadius:16,padding:"11px 14px 11px 34px",fontSize:12,fontFamily:F.body,color:C.snow,outline:"none"}}/>
        </div>
        {["","Signé","En cours","Prévu","Annulé"].map(s=>{
          const c=s?stC(s):null;
          return <button key={s} onClick={()=>setFSt(s)} style={{
            padding:"8px 13px",borderRadius:999,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:F.body,
            background:fSt===s?(c?.bg||C.goldBg):"transparent",
            border:`1px solid ${fSt===s?(c?.bd||C.goldBd):C.ghost}`,
            color:fSt===s?(c?.col||C.gold):C.ash,transition:"all 0.12s",
          }}>{s||"Tous"}</button>;
        })}
        <button onClick={()=>setFiltersOpen(o=>!o)} style={{padding:"8px 12px",borderRadius:14,border:`1px solid ${filtersOpen?C.goldBd:C.ghost}`,background:filtersOpen?C.goldBg:"transparent",cursor:"pointer",fontSize:10,fontFamily:F.body,color:filtersOpen?C.gold:C.ash}}>⚙ Filtres</button>
      </div>

      {filtersOpen&&(
        <div style={{padding:"0.6rem 1.75rem",borderBottom:`1px solid ${C.ghost}`,background:C.void,display:"flex",gap:12,flexWrap:"wrap",flexShrink:0}}>
          {[["Mois",fMo,setFMo,["", ...MONTHS].map(m=>({v:m,l:m||"Tous"}))],
            ...(isMgr?[["Conseiller",fAdv,setFAdv,["", ...ADVISORS].map(a=>({v:a,l:a||"Tous"}))]]:[]),
            ["Tri",sort,setSort,[{v:"recent",l:"Plus récent"},{v:"ppDesc",l:"PP ↓"},{v:"puDesc",l:"PU ↓"}]]
          ].map(([lbl,val,setVal,opts])=>(
            <div key={lbl} style={{minWidth:140}}>
              <div style={{fontSize:10,color:C.ash,marginBottom:6,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>{lbl}</div>
              <select value={val} onChange={e=>setVal(e.target.value)} style={{background:C.raise,border:`1px solid ${C.rim}`,borderRadius:14,padding:"10px 12px",fontSize:12,fontFamily:F.body,color:C.snow,outline:"none",width:"100%"}}>
                {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{flex:1,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead style={{position:"sticky",top:0,zIndex:1}}>
            <tr>
              {["Client","Produit",isMgr&&"Conseiller","PP/mois","PP Ann.","Prime Unique","Source","Statut","Priorité",""].filter(Boolean).map(h=>(
                <th key={h} style={{padding:"12px 16px",textAlign:["PP/mois","PP Ann.","Prime Unique"].includes(h)?"right":"left",fontSize:10,fontWeight:700,color:C.ash,background:`linear-gradient(180deg, rgba(248,243,235,0.96) 0%, rgba(248,243,235,0.82) 100%)`,borderBottom:`1px solid ${C.ghost}`,letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&(
              <tr><td colSpan={10} style={{padding:"3rem",textAlign:"center",color:C.ash,fontFamily:F.body}}>
                <div style={{fontSize:24,marginBottom:8}}>◈</div>Aucun dossier correspondant
              </td></tr>
            )}
            {rows.map(d=>(
              <tr key={d.id} style={{borderBottom:`1px solid ${C.ghost}`,transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.raise}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"14px 16px"}}>
                  <button onClick={()=>onViewClient(d.client)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:500,color:C.snow,padding:0,textAlign:"left",fontFamily:F.body,textDecoration:"underline",textDecorationColor:C.ghost}}>
                    {d.client}
                  </button>
                  {d.tags?.length>0&&<div style={{display:"flex",gap:3,marginTop:2}}>{d.tags.slice(0,2).map(t=><span key={t} style={{fontSize:8,background:C.goldBg,color:C.goldDim,borderRadius:3,padding:"1px 5px",border:`1px solid ${C.goldBd}`}}>{t}</span>)}</div>}
                </td>
                <td style={{padding:"14px 16px",color:C.cloud,fontSize:11,lineHeight:1.5}}>{d.product}</td>
                {isMgr&&<td style={{padding:"14px 16px"}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.gold}}>{d.advisor}</span>
                  {d.coAdvisor&&<span style={{fontSize:9,color:C.ash}}> +{d.coAdvisor}</span>}
                </td>}
                <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:10,color:d.ppM>0?C.cPP:C.ghost}}>{d.ppM>0?`${d.ppM.toLocaleString("fr-FR")} €/m`:"—"}</td>
                <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:11,fontWeight:700,color:d.ppM>0?C.snow:C.ghost}}>{d.ppM>0?eur(ppAnn(d.ppM)):"—"}</td>
                <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:11,fontWeight:700,color:d.pu>0?C.cPU:C.ghost}}>{d.pu>0?eur(d.pu):"—"}</td>
                <td style={{padding:"14px 16px",fontSize:9,color:C.ash}}>{d.source}</td>
                <td style={{padding:"14px 16px"}}>
                  <select value={d.st} onChange={e=>quickStatus(d,e.target.value)}
                    style={{background:stC(d.st).bg,border:`1px solid ${stC(d.st).bd}`,color:stC(d.st).col,borderRadius:999,padding:"7px 11px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>
                    {STATUTS.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}
                  </select>
                </td>
                <td style={{padding:"14px 16px"}}><PrioBadge p={d.priority}/></td>
                <td style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",gap:4}}>
                    <Btn sm variant="secondary" onClick={()=>onEdit(d)} style={{padding:"6px 10px",borderRadius:12}}>✏</Btn>
                    <Btn sm variant="danger" onClick={()=>onDelete(d.id)} style={{padding:"6px 10px",borderRadius:12}}>✕</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PIPELINE KANBAN
// ═══════════════════════════════════════════════════════════
function PipelineView({ deals, user, month, onAdd, onEdit }) {
  const isMgr=user===MANAGER;
  const md=deals.filter(d=>d.month===month);
  const mine=isMgr?md:md.filter(d=>d.advisor===user||d.coAdvisor===user);
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Pipeline" sub={`${mine.length} dossiers — ${month} 2026`} right={<Btn onClick={onAdd}>+ Nouveau dossier</Btn>}/>
      <div style={{flex:1,overflowX:"auto",padding:"1.25rem 1.75rem",display:"flex",gap:12,alignItems:"flex-start"}}>
        {STATUTS.map(st=>{
          const col=mine.filter(d=>d.st===st.id);
          const sp=col.reduce((t,d)=>t+ppAnn(d.ppM),0);
          const su=col.reduce((t,d)=>t+(Number(d.pu)||0),0);
          return (
            <div key={st.id} style={{minWidth:225,maxWidth:250,flex:1}}>
              <div style={{padding:"8px 12px",background:st.bg,border:`1px solid ${st.bd}`,borderRadius:8,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:500,color:st.col}}>{st.id}</span>
                  <span style={{fontSize:10,fontWeight:600,color:st.col,background:"rgba(0,0,0,0.2)",borderRadius:20,padding:"1px 7px"}}>{col.length}</span>
                </div>
                <div style={{fontSize:9,color:st.col,opacity:0.7,marginTop:2,fontFamily:F.mono}}>
                  {sp>0?`PP ${eur(sp,true)} `:""}{su>0?`PU ${eur(su,true)}`:""}{sp===0&&su===0?"—":""}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:"calc(100vh-260px)",overflowY:"auto"}}>
                {col.map(d=>(
                  <PanelHover key={d.id} onClick={()=>onEdit(d)} style={{padding:"11px 13px"}}>
                    <div style={{fontSize:11,fontWeight:500,color:C.snow,marginBottom:4,lineHeight:1.3}}>{d.client}</div>
                    <div style={{fontSize:9,color:C.ash,marginBottom:7}}>{d.product} · {d.company}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:4}}>
                      {d.ppM>0&&<span style={{fontSize:8,fontFamily:F.mono,color:C.cPP,background:C.blueBg||"rgba(96,165,250,0.1)",borderRadius:4,padding:"2px 6px",border:`1px solid ${C.blueBd||"rgba(96,165,250,0.3)"}`}}>PP {eur(ppAnn(d.ppM),true)}/an</span>}
                      {d.pu>0&&<span style={{fontSize:8,fontFamily:F.mono,color:C.cPU,background:C.goldBg,borderRadius:4,padding:"2px 6px",border:`1px solid ${C.goldBd}`}}>PU {eur(d.pu,true)}</span>}
                    </div>
                    {isMgr&&<div style={{fontSize:9,color:C.gold,fontWeight:500}}>{d.advisor}</div>}
                    {d.priority!=="Normale"&&<div style={{marginTop:4}}><PrioBadge p={d.priority}/></div>}
                    {d.notes&&<div style={{fontSize:9,color:C.ash,marginTop:5,fontStyle:"italic",lineHeight:1.4}}>{d.notes.slice(0,65)}{d.notes.length>65?"…":""}</div>}
                  </PanelHover>
                ))}
                {col.length===0&&<div style={{textAlign:"center",padding:"1.5rem",color:C.ghost,fontSize:10}}>Aucun dossier</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════
function AnalyticsView({ deals, user, month }) {
  const isMgr=user===MANAGER;
  const mine=isMgr?deals:deals.filter(d=>d.advisor===user||d.coAdvisor===user);
  const mDeals=mine.filter(d=>d.month===month);

  const trend=MONTHS.slice(0,6).map(m=>{
    const md=mine.filter(d=>d.month===m&&d.st==="Signé");
    return {m:m.slice(0,3),pp:md.reduce((t,d)=>t+ppAnn(d.ppM),0),pu:md.reduce((t,d)=>t+(Number(d.pu)||0),0)};
  });

  const byProd={};
  mDeals.filter(d=>d.st==="Signé").forEach(d=>{
    const cat=PRODUCTS.find(g=>g.items.includes(d.product))?.cat||d.product;
    if(!byProd[cat]) byProd[cat]={cat,pp:0,pu:0};
    byProd[cat].pp+=ppAnn(d.ppM); byProd[cat].pu+=Number(d.pu)||0;
  });
  const prodChart=Object.values(byProd).sort((a,b)=>(b.pp+b.pu)-(a.pp+a.pu));

  const bySrc={};
  mine.filter(d=>d.st!=="Annulé").forEach(d=>{
    if(!bySrc[d.source]) bySrc[d.source]={src:d.source,tot:0,sig:0};
    bySrc[d.source].tot++;
    if(d.st==="Signé") bySrc[d.source].sig++;
  });
  const srcData=Object.values(bySrc).map(p=>({...p,conv:Math.round(p.sig/p.tot*100)})).sort((a,b)=>b.conv-a.conv);

  const rank=rankAll(mDeals);
  const pieCols=[C.cPP,C.cPU,C.green,C.violet,"#34D399","#F472B6"];
  const pieData=prodChart.map((p,i)=>({name:p.cat,value:p.pp+p.pu,color:pieCols[i%pieCols.length]}));
  const ytd=calcStats(mine.filter(d=>d.st==="Signé"));

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Analytics" sub={`${month} 2026 · Performance globale`}/>
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          {[
            {icon:"💶",l:"PP Totale YTD",v:eur(ytd.ppSigned,true),c:C.cPP,sub:`${mine.filter(d=>d.st==="Signé").length} signés`},
            {icon:"🏦",l:"PU Totale YTD",v:eur(ytd.puSigned,true),c:C.cPU,sub:"Tous mois"},
            {icon:"📊",l:"Taux conversion",v:`${mine.filter(d=>d.st!=="Annulé").length>0?Math.round(mine.filter(d=>d.st==="Signé").length/mine.filter(d=>d.st!=="Annulé").length*100):0}%`,c:C.green,sub:"hors annulés"},
            {icon:"⏳",l:"Dossiers actifs",v:mine.filter(d=>d.st==="En cours"||d.st==="Prévu").length,c:C.violet,sub:"en cours ou prévus"},
          ].map(k=>(
            <Panel key={k.l} style={{padding:"1.1rem 1.3rem"}}>
              <div style={{fontSize:9,color:C.ash,marginBottom:8,letterSpacing:"0.06em"}}>{k.icon} {k.l}</div>
              <div style={{fontSize:"1.5rem",fontWeight:500,color:k.c,fontFamily:F.display,letterSpacing:"-0.01em"}}>{k.v}</div>
              <div style={{fontSize:9,color:C.ash,marginTop:4}}>{k.sub}</div>
            </Panel>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:14,marginBottom:14}}>
          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:14}}>Évolution mensuelle PP & PU</div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="aPP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cPP} stopOpacity={0.2}/><stop offset="100%" stopColor={C.cPP} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="aPU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cPU} stopOpacity={0.2}/><stop offset="100%" stopColor={C.cPU} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.ghost} vertical={false}/>
                <XAxis dataKey="m" tick={{fontSize:10,fill:C.ash,fontFamily:F.body}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>eur(v,true)} tick={{fontSize:9,fill:C.ash,fontFamily:F.mono}} axisLine={false} tickLine={false} width={50}/>
                <Tooltip content={<ChartTip/>}/>
                <Area type="monotone" dataKey="pp" name="PP Ann." stroke={C.cPP} strokeWidth={2.5} fill="url(#aPP)"/>
                <Area type="monotone" dataKey="pu" name="PU" stroke={C.cPU} strokeWidth={2.5} fill="url(#aPU)"/>
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:14}}>Mix produits — {month}</div>
            {pieData.length>0?(
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <PieChart width={130} height={130}>
                  <Pie data={pieData} cx={65} cy={65} innerRadius={38} outerRadius={60} dataKey="value" paddingAngle={2}>
                    {pieData.map((p,i)=><Cell key={i} fill={p.color} opacity={0.85}/>)}
                  </Pie>
                  <Tooltip formatter={v=>eur(v,true)} contentStyle={{background:C.raise,border:`1px solid ${C.rim}`,borderRadius:8}}/>
                </PieChart>
                <div style={{flex:1}}>
                  {pieData.map((p,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                      <span style={{width:7,height:7,borderRadius:2,background:p.color,flexShrink:0}}/>
                      <span style={{fontSize:9,color:C.cloud,flex:1,lineHeight:1.3}}>{p.name}</span>
                      <span style={{fontSize:9,fontFamily:F.mono,fontWeight:500,color:C.snow}}>{eur(p.value,true)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ):<p style={{color:C.ash,textAlign:"center",padding:"2rem 0",fontSize:12}}>Aucune donnée</p>}
          </Panel>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:14}}>Canaux de prospection</div>
            {srcData.map(p=>(
              <div key={p.src} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:10,color:C.cloud}}>{p.src}</span>
                  <span style={{fontSize:10,fontWeight:600,color:p.conv>=70?C.green:p.conv>=40?C.amber:C.red,fontFamily:F.mono}}>{p.conv}%</span>
                </div>
                <div style={{background:C.ghost,borderRadius:99,height:4,overflow:"hidden"}}>
                  <div style={{width:`${p.conv}%`,height:"100%",borderRadius:99,background:p.conv>=70?C.green:p.conv>=40?C.amber:C.red,transition:"width 1s ease"}}/>
                </div>
                <div style={{fontSize:8,color:C.ash,marginTop:2}}>{p.sig}/{p.tot} signés</div>
              </div>
            ))}
          </Panel>

          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:14}}>
              {isMgr?"Performance conseillers":"Répartition par produit"}
            </div>
            {isMgr&&rank.filter(r=>r.tot>0).length>0?(
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={rank.filter(r=>r.tot>0).slice(0,8)} layout="vertical" margin={{left:10,right:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.ghost} horizontal={false}/>
                  <XAxis type="number" tickFormatter={v=>eur(v,true)} tick={{fontSize:9,fill:C.ash,fontFamily:F.mono}} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:9,fill:C.cloud,fontFamily:F.body}} axisLine={false} tickLine={false} width={55}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="ppS" name="PP Ann." fill={C.cPP} radius={[0,3,3,0]} opacity={0.85}/>
                  <Bar dataKey="puS" name="PU" fill={C.cPU} radius={[0,3,3,0]} opacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>
            ):prodChart.length>0?(
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={prodChart.slice(0,5)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.ghost} vertical={false}/>
                  <XAxis dataKey="cat" tick={{fontSize:8,fill:C.ash,fontFamily:F.body}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>eur(v,true)} tick={{fontSize:9,fill:C.ash,fontFamily:F.mono}} axisLine={false} tickLine={false} width={48}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="pp" name="PP Ann." fill={C.cPP} radius={[4,4,0,0]} opacity={0.85}/>
                  <Bar dataKey="pu" name="PU" fill={C.cPU} radius={[4,4,0,0]} opacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>
            ):<p style={{color:C.ash,textAlign:"center",padding:"2rem",fontSize:12}}>Aucune donnée</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AGENDA
// ═══════════════════════════════════════════════════════════
function AgendaView({ deals, user, month, onEdit }) {
  const isMgr=user===MANAGER;
  const mine=isMgr?deals:deals.filter(d=>d.advisor===user||d.coAdvisor===user);
  const prevusMois=mine.filter(d=>d.month===month&&d.st==="Prévu");
  const relances=mine.filter(d=>d.st==="En cours").sort((a,b)=>age(b.createdAt)-age(a.createdAt));
  const urgent=relances.filter(d=>age(d.createdAt)>14);
  const pipe={pp:mine.filter(d=>d.st==="Prévu").reduce((t,d)=>t+ppAnn(d.ppM),0),pu:mine.filter(d=>d.st==="Prévu").reduce((t,d)=>t+(Number(d.pu)||0),0)};

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Agenda & Relances" sub={`${urgent.length} relance${urgent.length>1?"s":""} urgentes · ${prevusMois.length} signature${prevusMois.length>1?"s":""} prévues ce mois`}/>
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          {[
            {l:"PP pipeline (prévu)",v:eur(pipe.pp,true),c:C.cPP},
            {l:"PU pipeline (prévu)",v:eur(pipe.pu,true),c:C.cPU},
            {l:"Relances urgentes >14j",v:urgent.length,c:urgent.length>0?C.red:C.green,sub:urgent.length>0?"À traiter rapidement":"Tout est à jour 🎉"},
          ].map(k=>(
            <Panel key={k.l} style={{padding:"1rem 1.25rem",borderTop:`2px solid ${k.c}`}}>
              <div style={{fontSize:9,color:C.ash,marginBottom:6,letterSpacing:"0.06em"}}>{k.l}</div>
              <div style={{fontSize:"1.4rem",fontWeight:500,color:k.c,fontFamily:F.display}}>{k.v}</div>
              {k.sub&&<div style={{fontSize:9,color:C.ash,marginTop:3}}>{k.sub}</div>}
            </Panel>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:14,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:4}}>📅 Signatures prévues — {month}</div>
            <div style={{fontSize:9,color:C.ash,marginBottom:14}}>{prevusMois.length} dossier{prevusMois.length>1?"s":""} à finaliser</div>
            {prevusMois.length===0&&<p style={{color:C.ash,fontSize:11,textAlign:"center",padding:"1.5rem"}}>Aucun dossier prévu ce mois</p>}
            {prevusMois.map(d=>(
              <div key={d.id} style={{padding:"10px 12px",background:C.raise,border:`1px solid ${C.blueBd||"rgba(96,165,250,0.3)"}`,borderRadius:8,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div>
                  <div style={{fontSize:11,fontWeight:500,color:C.snow}}>{d.client}</div>
                  <div style={{fontSize:9,color:C.ash}}>{d.product} · {d.company}</div>
                  {d.dateExpected&&<div style={{fontSize:9,color:C.blue,marginTop:2}}>📅 {d.dateExpected}</div>}
                  {isMgr&&<div style={{fontSize:9,fontWeight:500,color:C.gold,marginTop:2}}>{d.advisor}</div>}
                  {d.notes&&<div style={{fontSize:9,color:C.ash,marginTop:3,fontStyle:"italic"}}>{d.notes.slice(0,60)}</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  {d.ppM>0&&<div style={{fontSize:9,fontFamily:F.mono,color:C.cPP}}>{eur(ppAnn(d.ppM),true)}/an</div>}
                  {d.pu>0&&<div style={{fontSize:9,fontFamily:F.mono,color:C.cPU}}>{eur(d.pu,true)}</div>}
                  <Btn sm variant="success" onClick={()=>onEdit({...d,st:"Signé"})} style={{marginTop:7,fontSize:9}}>✓ Signé</Btn>
                </div>
              </div>
            ))}
          </Panel>

          <Panel style={{padding:"1.2rem 1.4rem"}}>
            <div style={{fontSize:14,fontWeight:500,color:C.amber,fontFamily:F.display,marginBottom:4}}>⚠ Relances en attente</div>
            <div style={{fontSize:9,color:C.ash,marginBottom:14}}>{relances.length} dossiers "En cours" — par ancienneté</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:420,overflowY:"auto"}}>
              {relances.map(d=>{
                const a=age(d.createdAt), isU=a>21, isW=a>10;
                return (
                  <div key={d.id} style={{padding:"9px 12px",background:isU?"rgba(248,113,113,0.08)":isW?"rgba(251,146,60,0.08)":C.raise,border:`1px solid ${isU?C.redBd:isW?C.amberBd:C.rim}`,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:500,color:C.snow,display:"flex",alignItems:"center",gap:5}}>
                        {d.client}
                        {isU&&<span style={{fontSize:8,color:C.red,fontWeight:700}}>URGENT</span>}
                      </div>
                      <div style={{fontSize:9,color:C.ash}}>{d.product} · {d.month}{isMgr?` · ${d.advisor}`:""}</div>
                      {d.notes&&<div style={{fontSize:9,color:C.ash,fontStyle:"italic",marginTop:2}}>{d.notes.slice(0,55)}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:isU?C.red:isW?C.amber:C.ash,fontFamily:F.mono}}>{a}j</div>
                      <Btn sm variant="secondary" onClick={()=>onEdit(d)} style={{marginTop:4,fontSize:9,padding:"2px 8px"}}>Modifier</Btn>
                    </div>
                  </div>
                );
              })}
              {relances.length===0&&<div style={{textAlign:"center",padding:"2rem",color:C.ash,fontSize:12}}>Aucune relance · 🎉</div>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CLASSEMENT
// ═══════════════════════════════════════════════════════════
function ClassementView({ deals, month, user }) {
  const md=deals.filter(d=>d.month===month);
  const rank=rankAll(md);
  const [anim,setAnim]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setAnim(true),200);return()=>clearTimeout(t);},[month]);
  const top3=rank.filter(r=>r.score>0).slice(0,3);
  const ords=[1,0,2], hts=[155,215,120];
  const podCols=["#94A3B8",C.gold,"#9B6B2F"], podLabels=["🥈 2e","🥇 1er","🥉 3e"];

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Classement" sub={`${month} 2026 · PP Annualisée + PU signées`}/>
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>
        {top3.length>0&&(
          <Panel style={{padding:"2rem 1.5rem",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:9,fontWeight:600,color:C.ash,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"2rem"}}>Top 3 — {month}</div>
            <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20}}>
              {ords.map((pos,i)=>{
                const r=top3[pos]; if(!r) return <div key={i} style={{width:160}}/>;
                return (
                  <div key={pos} style={{display:"flex",flexDirection:"column",alignItems:"center",opacity:anim?1:0,transform:anim?"translateY(0)":"translateY(16px)",transition:`all 0.6s ease ${i*0.1}s`}}>
                    <div style={{width:48,height:48,borderRadius:12,background:pos===0?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(255,255,255,0.06)",border:`1px solid ${podCols[i]}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:pos===0?C.void:podCols[i],marginBottom:8}}>{ini(r.name)}</div>
                    <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:2}}>{r.name}</div>
                    <div style={{fontSize:11,fontFamily:F.mono,color:podCols[i]}}>{eur(r.score,true)}</div>
                    <div style={{fontSize:9,color:C.ash,marginBottom:12}}>{r.sig} signé{r.sig>1?"s":""}</div>
                    <div style={{width:155,height:anim?hts[i]:0,transition:`height 0.9s cubic-bezier(0.16,1,0.3,1) ${i*0.1}s`,background:`linear-gradient(180deg,${podCols[i]}18,${podCols[i]}08)`,border:`1px solid ${podCols[i]}30`,borderBottom:"none",borderRadius:"10px 10px 0 0",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                      <div style={{fontSize:20}}>{podLabels[i].split(" ")[0]}</div>
                      <div style={{fontSize:10,fontWeight:500,color:podCols[i]}}>{podLabels[i].split(" ")[1]}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        <Panel style={{overflow:"hidden"}}>
          <div style={{padding:"0.9rem 1.4rem",borderBottom:`1px solid ${C.ghost}`}}>
            <div style={{fontSize:12,fontWeight:500,color:C.snow,fontFamily:F.display}}>Classement complet</div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["#","Conseiller","PP Annualisée","PU","Total","Dossiers","Signés","Conv.","Part"].map(h=>(
                  <th key={h} style={{padding:"12px 16px",textAlign:h==="Conseiller"?"left":"right",fontSize:10,fontWeight:700,color:C.ash,background:`linear-gradient(180deg, rgba(248,243,235,0.96) 0%, rgba(248,243,235,0.82) 100%)`,borderBottom:`1px solid ${C.ghost}`,textTransform:"uppercase",letterSpacing:"0.08em"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rank.map((r,i)=>{
                const isMe=r.name===user, maxS=rank[0]?.score||1, part=maxS>0?Math.round(r.score/maxS*100):0;
                return (
                  <tr key={r.name} style={{borderBottom:`1px solid ${C.ghost}`,background:isMe?"rgba(201,168,76,0.06)":"transparent",transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=isMe?"rgba(201,168,76,0.1)":C.raise}
                    onMouseLeave={e=>e.currentTarget.style.background=isMe?"rgba(201,168,76,0.06)":"transparent"}>
                    <td style={{padding:"14px 16px",textAlign:"right",fontSize:13}}>{["🥇","🥈","🥉"][i]||<span style={{fontSize:9,color:C.ash,fontFamily:F.mono}}>#{i+1}</span>}</td>
                    <td style={{padding:"14px 16px"}}>
                      <span style={{fontSize:11,fontWeight:500,color:isMe?C.gold:C.snow}}>{r.name}{isMe?" ←":""}</span>
                    </td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:10,color:C.cPP}}>{eur(r.ppS,true)}</td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:10,color:C.cPU}}>{eur(r.puS,true)}</td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontFamily:F.mono,fontSize:11,fontWeight:600,color:C.snow}}>{eur(r.score,true)}</td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontSize:10,color:C.ash}}>{r.tot}</td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontSize:10,color:C.green,fontWeight:500}}>{r.sig}</td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontSize:10,color:r.tot>0?Math.round(r.sig/r.tot*100)>=70?C.green:Math.round(r.sig/r.tot*100)>=40?C.amber:C.red:C.ash,fontFamily:F.mono}}>
                      {r.tot>0?Math.round(r.sig/r.tot*100):0}%
                    </td>
                    <td style={{padding:"14px 16px",minWidth:100}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{flex:1,background:C.ghost,borderRadius:99,height:4,overflow:"hidden"}}>
                          <div style={{width:`${part}%`,height:"100%",borderRadius:99,background:i===0?C.gold:C.cPP,transition:"width 1.1s ease"}}/>
                        </div>
                        <span style={{fontSize:8,color:C.ash,fontFamily:F.mono,minWidth:26}}>{part}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GLOBAL VIEW (Manager)
// ═══════════════════════════════════════════════════════════
function GlobalView({ deals, month, objectifs }) {
  const md=deals.filter(d=>d.month===month);
  const obj=objectifs[month]||OBJ_BASE[month];
  const G=calcStats(md);
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Vue Globale" sub={`${month} 2026 · ${md.length} dossiers · ${ADVISORS.length} conseillers`}/>
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          <KpiCard icon="💶" label="PP Cabinet" value={eur(G.ppSigned,true)} sub={`${pct(G.ppSigned,obj.pp)}% de l'objectif`} accent={C.cPP} mono/>
          <KpiCard icon="🏦" label="PU Cabinet" value={eur(G.puSigned,true)} sub={`${pct(G.puSigned,obj.pu)}% de l'objectif`} accent={C.cPU} mono/>
          <KpiCard icon="✓" label="Signés / Total" value={`${G.signed}/${G.total}`} sub={`${G.conv}% de conversion`} accent={C.green}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {ADVISORS.map(name=>{
            const cd=md.filter(d=>d.advisor===name||d.coAdvisor===name);
            const S=calcStats(cd);
            if(cd.length===0) return (
              <Panel key={name} style={{padding:"1rem 1.2rem",opacity:0.4}}>
                <div style={{fontSize:11,fontWeight:500,color:C.ash}}>{name}</div>
                <div style={{fontSize:9,color:C.ghost,marginTop:4}}>Aucun dossier ce mois</div>
              </Panel>
            );
            const ppP=pct(S.ppSigned,obj.pp);
            return (
              <Panel key={name} style={{padding:"1rem 1.2rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:7,background:C.raise,border:`1px solid ${C.rim}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,color:C.cloud}}>{ini(name)}</div>
                    <span style={{fontSize:11,fontWeight:500,color:C.snow}}>{name}</span>
                  </div>
                  <StatusPill s={S.signed>0?"Signé":"En cours"}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:10}}>
                  {[[S.signed,"Signés",C.green],[S.active,"En cours",C.amber],[S.forecast,"Prévus",C.blue]].map(([v,l,c])=>(
                    <div key={l} style={{textAlign:"center",padding:"5px",background:C.raise,borderRadius:7,border:`1px solid ${C.rim}`}}>
                      <div style={{fontSize:"1rem",fontWeight:600,color:c}}>{v}</div>
                      <div style={{fontSize:8,color:C.ash}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:9,fontFamily:F.mono,color:C.cPP,marginBottom:2}}>PP: {eur(S.ppSigned,true)}/an</div>
                <div style={{fontSize:9,fontFamily:F.mono,color:C.cPU,marginBottom:8}}>PU: {eur(S.puSigned,true)}</div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{flex:1,background:C.ghost,borderRadius:99,height:4,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(100,ppP)}%`,height:"100%",borderRadius:99,background:ppP>=100?C.green:C.cPP,transition:"width 1s"}}/>
                  </div>
                  <span style={{fontSize:8,color:C.ash,fontFamily:F.mono}}>{ppP}%</span>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
function SettingsView({ objectifs, setObjectifs }) {
  const [loc,setLoc]=useState({...objectifs});
  const save=async()=>{setObjectifs(loc);await ss("entasis:obj:v4",loc);alert("✓ Objectifs sauvegardés");};
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <SectionHeader title="Paramètres" sub="Objectifs et configuration du cabinet" right={<Btn onClick={save}>Sauvegarder</Btn>}/>
      <div style={{flex:1,overflowY:"auto",padding:"1.5rem 1.75rem"}}>
        <Panel style={{padding:"1.2rem 1.4rem",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display,marginBottom:14}}>Informations cabinet</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[["Raison sociale",FIRM.name],["N° ORIAS",FIRM.orias],["Adresse",FIRM.address],["Téléphone",FIRM.phone],["Email",FIRM.email]].map(([k,v])=>(
              <div key={k}>
                <div style={{fontSize:9,fontWeight:600,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>{k}</div>
                <div style={{fontSize:11,color:C.cloud}}>{v}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel style={{overflow:"hidden"}}>
          <div style={{padding:"0.9rem 1.4rem",background:C.raise,borderBottom:`1px solid ${C.ghost}`}}>
            <div style={{fontSize:13,fontWeight:500,color:C.snow,fontFamily:F.display}}>Objectifs mensuels</div>
            <div style={{fontSize:9,color:C.ash,marginTop:3}}>PP = objectif annualisé (versements ×12) · PU = capital ponctuel cumulé</div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                <th style={{padding:"12px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:C.ash,background:`linear-gradient(180deg, rgba(248,243,235,0.96) 0%, rgba(248,243,235,0.82) 100%)`,borderBottom:`1px solid ${C.ghost}`,textTransform:"uppercase",letterSpacing:"0.1em"}}>Mois</th>
                <th style={{padding:"12px 16px",textAlign:"right",fontSize:9,fontWeight:600,color:C.cPP,background:C.deep,borderBottom:`1px solid ${C.ghost}`,textTransform:"uppercase",letterSpacing:"0.1em"}}>Obj. PP Ann. (€)</th>
                <th style={{padding:"12px 16px",textAlign:"right",fontSize:9,fontWeight:600,color:C.cPU,background:C.deep,borderBottom:`1px solid ${C.ghost}`,textTransform:"uppercase",letterSpacing:"0.1em"}}>Obj. PU (€)</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m,i)=>(
                <tr key={m} style={{borderBottom:`1px solid ${C.ghost}`,background:i%2===0?"transparent":C.raise}}>
                  <td style={{padding:"7px 14px",fontSize:11,fontWeight:500,color:C.cloud}}>{m}</td>
                  <td style={{padding:"5px 14px"}}>
                    <input type="number" value={loc[m]?.pp||""} onChange={e=>setLoc(p=>({...p,[m]:{...p[m],pp:Number(e.target.value)||0}}))}
                      style={{textAlign:"right",width:"100%",background:C.raise,border:`1px solid ${C.rim}`,borderRadius:14,padding:"10px 12px",fontSize:12,fontFamily:F.mono,color:C.cPP,fontWeight:500,outline:"none"}}/>
                  </td>
                  <td style={{padding:"5px 14px"}}>
                    <input type="number" value={loc[m]?.pu||""} onChange={e=>setLoc(p=>({...p,[m]:{...p[m],pu:Number(e.target.value)||0}}))}
                      style={{textAlign:"right",width:"100%",background:C.raise,border:`1px solid ${C.rim}`,borderRadius:14,padding:"10px 12px",fontSize:12,fontFamily:F.mono,color:C.cPU,fontWeight:500,outline:"none"}}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════
export default function App() {
  useGlobalStyles();
  const [user,setUser]=useState(null);
  const [view,setView]=useState("dashboard");
  const [month,setMonth]=useState("MARS");
  const [deals,setDeals]=useState([]);
  const [objectifs,setObjectifs]=useState(OBJ_BASE);
  const [modal,setModal]=useState(null);      // null | {} | {deal}
  const [c360,setC360]=useState(null);        // client name | null
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    async function load(){
      setLoading(true);
      try{
        const stored=await sg("entasis:v6");
        setDeals(stored&&stored.length?stored:SEED);
        if(!stored||!stored.length) await ss("entasis:v6",SEED);
        const obj=await sg("entasis:obj:v4");
        if(obj) setObjectifs({...OBJ_BASE,...obj});
      }catch{setDeals(SEED);}
      setLoading(false);
    }
    load();
  },[]);

  const saveDeals=useCallback(async nd=>{setDeals(nd);await ss("entasis:v6",nd);},[]);
  const handleSave=async d=>{
    const upd=deals.some(x=>x.id===d.id)?deals.map(x=>x.id===d.id?d:x):[...deals,d];
    await saveDeals(upd); setModal(null);
  };
  const handleDelete=async id=>{
    if(!confirm("Supprimer ce dossier définitivement ?")) return;
    await saveDeals(deals.filter(d=>d.id!==id));
  };
  const quickEdit=async d=>{await handleSave(d);};

  if(!user) return <LoginScreen onLogin={u=>{setUser(u);setView("dashboard");}}/>;

  if(loading) return (
    <div style={{minHeight:"100vh",background:`linear-gradient(180deg, ${C.void} 0%, #FBF7F0 100%)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:34,fontWeight:500,color:C.snow,fontFamily:F.display,letterSpacing:"0.08em",marginBottom:10}}>ENTASIS</div>
        <div style={{fontSize:12,color:C.cloud,fontFamily:F.body}}>Chargement de l’espace CRM…</div>
      </div>
    </div>
  );

  const isMgr=user===MANAGER;
  const common={deals,user,month,objectifs};

  return (
    <div style={{display:"flex",height:"100vh",background:`linear-gradient(180deg, ${C.void} 0%, #FBF7F0 100%)`,overflow:"hidden"}}>
      <Sidebar user={user} view={view} setView={setView} onLogout={()=>setUser(null)} month={month} setMonth={setMonth}/>

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        {/* Top bar */}
        <div style={{background:`linear-gradient(180deg, rgba(248,243,235,0.92) 0%, rgba(248,243,235,0.74) 100%)`,borderBottom:`1px solid ${C.ghost}`,padding:"0 1.9rem",height:46,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,backdropFilter:"blur(10px)"}}>
          <div style={{display:"flex",gap:14,fontSize:10,color:C.ash,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700}}>
            <span>{FIRM.name}</span><span style={{color:C.ghost}}>·</span>
            <span>ORIAS {FIRM.orias}</span><span style={{color:C.ghost}}>·</span>
            <span>{FIRM.city}</span>
          </div>
          <div style={{fontSize:11,color:C.cloud,fontFamily:F.mono}}>{now()}</div>
        </div>

        {/* Views */}
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {view==="dashboard" &&<DashboardView {...common} onAdd={()=>setModal({})} onViewClient={setC360}/>}
          {view==="dossiers"  &&<DossiersView  {...common} onAdd={()=>setModal({})} onEdit={quickEdit} onDelete={handleDelete} onViewClient={setC360}/>}
          {view==="pipeline"  &&<PipelineView  {...common} onAdd={()=>setModal({})} onEdit={d=>setModal({deal:d})}/>}
          {view==="analytics" &&<AnalyticsView {...common}/>}
          {view==="agenda"    &&<AgendaView    {...common} onEdit={quickEdit}/>}
          {view==="classement"&&<ClassementView deals={deals} month={month} user={user}/>}
          {view==="global"  &&isMgr&&<GlobalView deals={deals} month={month} objectifs={objectifs}/>}
          {view==="settings"&&isMgr&&<SettingsView objectifs={objectifs} setObjectifs={setObjectifs}/>}
        </div>
      </div>

      {/* Modals */}
      {modal!==null&&(
        <DealModal deal={modal.deal||null} user={user} month={month} onSave={handleSave} onClose={()=>setModal(null)}/>
      )}
      {c360&&(
        <Client360 client={c360} deals={deals} onClose={()=>setC360(null)} onEdit={d=>{setC360(null);setModal({deal:d});}}/>
      )}
    </div>
  );
}
