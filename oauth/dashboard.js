const phases=['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke'];
const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderDashboard(state){
 const completed=Number.isInteger(state?.completed)?Math.min(8,Math.max(0,state.completed)):0;
 const current=String(state?.phase||'github');
 const items=phases.map((p,i)=>'<li><strong>'+safe(p)+'</strong> — '+(i<completed?'Concluído':p===current?'Próxima etapa':'Pendente')+'</li>').join('');
 const checks=(state?.readiness?.findings||[]).map(x=>'<li>'+safe(x.detail)+' : '+(x.status==='ready'?'OK':'Pendente')+'</li>').join('');
 return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KAIRÓS — Progresso</title><style>body{font:16px system-ui;max-width:660px;margin:32px auto;padding:16px;color:#24364f;background:#f6f7fa}li{margin:8px 0;padding:12px;border-radius:10px;background:white}a{color:#3555a0}</style><h1>Instalação KAIRÓS</h1><p>'+completed+' de 8 etapas registradas</p><ol>'+items+'</ol><h2>Diagnóstico</h2><ul>'+checks+'</ul><p>Pré-diagnóstico local: não é homologação de produção.</p><a href="/">Voltar</a></html>';
}
