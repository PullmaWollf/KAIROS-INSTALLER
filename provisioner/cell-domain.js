import {ControlError} from '../control/crypto.js';

/** Vercel generates its default .vercel.app hostname from the project name.
 * User-friendly names must be normalized before any provisioning POST.
 * The hostname is an expectation until Vercel reports the production alias.
 */
export function projectSlugForCell(cellName){
 if(typeof cellName!=='string'||cellName.trim().length<3||cellName.length>70)
  throw new ControlError('BAD_CELL_NAME');
 const label=cellName.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
  .slice(0,55).replace(/-+$/g,'');
 if(!/^[a-z0-9][a-z0-9-]{1,54}$/.test(label))
  throw new ControlError('BAD_CELL_NAME','Escolha um nome com letras e números para o endereço Vercel');
 return label;
}
export function proposedCellDomain(cellName){
 return projectSlugForCell(cellName)+'.vercel.app';
}
