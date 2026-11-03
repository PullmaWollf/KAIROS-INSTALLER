import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export class ControlError extends Error {
 constructor(code,message='Operação não autorizada'){super(message);this.code=code;}
}
export function controlKey(env=process.env){
 const raw=env.KAIROS_CONTROL_ENCRYPTION_KEY;
 if(typeof raw!=='string')throw new ControlError('NOT_CONFIGURED','Chave de proteção do controle não configurada');
 const b=Buffer.from(raw,'base64url');
 if(b.length!==32||b.toString('base64url')!==raw.replace(/=+$/,''))
  throw new ControlError('NOT_CONFIGURED','A chave do controle deve conter exatamente 32 bytes codificados em base64url');
 return b;
}
export function randomToken(){return randomBytes(32).toString('base64url');}
export function tokenHash(token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,64}$/.test(token))
  throw new ControlError('BAD_TOKEN','Identificador de sessão inválido');
 return createHash('sha256').update(token).digest('hex');
}
export function equal(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export function encryptControl(value,purpose,{env=process.env}={}){
 if(!/^[a-z0-9:_-]{3,128}$/i.test(String(purpose||'')))throw new ControlError('BAD_PURPOSE');
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',controlKey(env),iv);
 cipher.setAAD(Buffer.from('kairos-control-v1|'+purpose));
 const ct=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ct.toString('base64url')].join('.');
}
export function decryptControl(envelope,purpose,{env=process.env}={}){
 try{
  const [version,iv,tag,ct,...rest]=String(envelope||'').split('.');
  if(version!=='v1'||rest.length||!iv||!tag||!ct)throw Error('bad envelope');
  const decipher=createDecipheriv('aes-256-gcm',controlKey(env),Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from('kairos-control-v1|'+purpose));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ct,'base64url')),decipher.final()]).toString('utf8'));
 }catch{throw new ControlError('CANNOT_DECRYPT','Não foi possível abrir registro protegido');}
}
