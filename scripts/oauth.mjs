#!/usr/bin/env node
import {createOAuthServer} from '../oauth/server.js';
const port=Number(process.env.KAIROS_OAUTH_PORT||43117);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Porta inválida');
const server=createOAuthServer({port});
try{
 const url=await server.start();
 console.log('KAIRÓS OAuth local disponível em '+url);
 console.log('Abra essa URL no mesmo computador. GitHub/Supabase exigem client IDs e secrets locais configurados.');
 console.log('Vercel depende de integração registrada. Ctrl+C encerra e descarta todos os tokens em memória.');
 process.once('SIGINT',async()=>{await server.close();process.exit(0);});
 process.once('SIGTERM',async()=>{await server.close();process.exit(0);});
}catch{console.error('Não foi possível iniciar o servidor OAuth local. Verifique a porta e as configurações.');process.exitCode=1;}
