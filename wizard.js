/** Funções puras: nenhuma credencial sai do computador ou é salva pelo instalador. */
export const STAGES=[
 {id:'identity',label:'Identidade'},
 {id:'github',label:'GitHub'},
 {id:'supabase',label:'Supabase'},
 {id:'database',label:'Banco de dados'},
 {id:'vercel',label:'Vercel'},
 {id:'finish',label:'Finalizar'}
];
export const TEMPLATE='https://github.com/PullmaWollf/KAIROS-CORE';
export const SUPABASE_CREATE='https://supabase.com/dashboard/projects';
export const VERCEL_IMPORT='https://vercel.com/new';
export function normalizeSlug(name){
 return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
}
export function validateName(name){return typeof name==='string'&&name.trim().length>=3&&name.trim().length<=70;}
export function validateProjectRef(value){return /^[a-z0-9]{10,30}$/.test(String(value||''));}
export function validateRepo(value){
 const str=String(value||'').trim();
 const match=str.match(/^https:\/\/github\.com\/([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/([a-z\d._-]{1,100})(?:\.git)?\/?$/i);
 if(!match)return null;
 return {owner:match[1],repo:match[2].replace(/\.git$/,''),url:'https://github.com/'+match[1]+'/'+match[2].replace(/\.git$/,'')};
}
export function supabaseCommands(ref){
 if(!validateProjectRef(ref))throw new Error('Referência do projeto Supabase inválida');
 return ['npx supabase login','npx supabase link --project-ref '+ref,'npx supabase db push'];
}
export function vercelLink(){return 'https://vercel.com/new/clone?repository-url='+encodeURIComponent(TEMPLATE)+'&env=SUPABASE_URL%2CSUPABASE_SERVICE_ROLE_KEY%2CSESSION_SECRET';}
export function progress(completed){return Math.round(100*STAGES.filter(x=>completed[x.id]).length/STAGES.length);}
