import type {AIModel} from '../types';
import type {Workflow} from './workflows';

export type StudioSection = 'image'|'video'|'audio';
export type SavedModelSelection = {modelKey:string;workflow:Workflow};
type StorageLike = Pick<Storage,'getItem'|'setItem'>;

const PREFERENCES_KEY='kie_project_model_preferences';
export const FAVORITES_KEY='kie_favorite_models';
export const modelKey=(model:Pick<AIModel,'category'|'id'>)=>`${model.category}:${model.id}`;
export const sectionForModel=(model:Pick<AIModel,'category'>):StudioSection=>model.category==='text-to-audio'?'audio':model.category.includes('video')?'video':'image';

const readJson=<T>(storage:StorageLike,key:string,fallback:T):T=>{try{return JSON.parse(storage.getItem(key)||'') as T;}catch{return fallback;}};
export const savedSelection=(storage:StorageLike,projectId:string,section:StudioSection):SavedModelSelection|undefined=>readJson<Record<string,Partial<Record<StudioSection,SavedModelSelection>>>>(storage,PREFERENCES_KEY,{})[projectId]?.[section];
export const rememberSelection=(storage:StorageLike,projectId:string,section:StudioSection,value:SavedModelSelection)=>{const all=readJson<Record<string,Partial<Record<StudioSection,SavedModelSelection>>>>(storage,PREFERENCES_KEY,{});all[projectId]={...all[projectId],[section]:value};storage.setItem(PREFERENCES_KEY,JSON.stringify(all));};
export const favoriteModels=(storage:StorageLike)=>new Set(readJson<string[]>(storage,FAVORITES_KEY,[]));
export const toggleFavoriteModel=(storage:StorageLike,key:string)=>{const favorites=favoriteModels(storage);favorites.has(key)?favorites.delete(key):favorites.add(key);storage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));return favorites;};
