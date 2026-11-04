/** Public help text only. Never store tokens or account data in this module. */
export const VERCEL_TOKEN_URL='https://vercel.com/account/tokens';
export const VERCEL_TOKEN_NAME='KAIROS-INSTALLER';
export const VERCEL_TOKEN_STEPS=Object.freeze([
 Object.freeze({field:'TOKEN NAME',value:VERCEL_TOKEN_NAME,
  explanation:'É só o nome desta conexão. Não altera seu projeto.'}),
 Object.freeze({field:'SCOPE',value:'Personal Account ou a hospedagem desejada',
  explanation:'Selecione sua conta pessoal ou a equipe na qual pretende publicar a célula.'}),
 Object.freeze({field:'EXPIRATION',value:'30 Days para teste',
  explanation:'Para usar continuamente, planeje renovar a chave antes de vencer.'})
]);
export const VERCEL_TOKEN_SAFETY='A hospedagem e eventuais cobranças continuam na conta Vercel do titular. Copie a chave só para o KAIRÓS; nunca envie por mensagens ou prints.';
