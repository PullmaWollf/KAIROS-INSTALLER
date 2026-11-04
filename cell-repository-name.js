/** Derive an editable, collision-resistant-by-namespace repository suggestion.
 * No external request, personal identifiers or secrets in this helper.
 */
export function suggestRepositoryName(cellName){
 if(typeof cellName!=='string')return '';
 let slug=cellName.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 if(slug.startsWith('hml-'))slug=slug.slice(4);
 if(!slug)return '';
 return 'kairos-'+slug.slice(0,49).replace(/-+$/g,'');
}
