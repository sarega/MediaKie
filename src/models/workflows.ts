import type {AIModel} from '../types';
export type Workflow = 'all'|'text-to-image'|'image-to-image'|'image-edit'|'text-to-video'|'image-to-video'|'reference'|'frames'|'video-to-video'|'extend'|'tools';
export const WORKFLOWS: {id:Workflow;label:string;hint:string;modality:'image'|'video'|'all'}[] = [
 {id:'all',label:'All workflows',hint:'Browse every workflow',modality:'all'},
 {id:'text-to-image',label:'Text → Image',hint:'Describe the image you want to create.',modality:'image'},
 {id:'image-to-image',label:'Image → Image',hint:'Add an image to transform or use as a visual reference.',modality:'image'},
 {id:'image-edit',label:'Edit image',hint:'Add an image, then describe your changes.',modality:'image'},
 {id:'text-to-video',label:'Text → Video (T2V)',hint:'Create a video from a prompt. Choose Image → Video to animate a still.',modality:'video'},
 {id:'image-to-video',label:'Image → Video (I2V)',hint:'Add a starting image, then describe how it should move.',modality:'video'},
 {id:'reference',label:'Reference → Video',hint:'Use reference images to guide subjects or style; they need not be the opening frame.',modality:'video'},
 {id:'frames',label:'First + Last Frame',hint:'Add a starting frame and an ending frame to guide the transition.',modality:'video'},
 {id:'video-to-video',label:'Video → Video',hint:'Add a source clip to transform.',modality:'video'},
 {id:'extend',label:'Extend video',hint:'Continue an existing clip or provider task.',modality:'video'},
 {id:'tools',label:'Upscale / Tools',hint:'Utilities such as upscaling and background removal.',modality:'all'},
];
export function primaryWorkflow(model:AIModel): Workflow {
 if (/upscale|get-4k|get-1080p|remove-background|remove-bg/i.test(model.id+' '+model.name))return 'tools';
 if (/extend/.test(model.id))return 'extend';
 if (/reference-to-video/.test(model.id))return 'reference';
 if (/transition/.test(model.id))return 'frames';
 if(model.category==='text-to-text')return 'tools';
 return model.category;
}
export function supportsWorkflow(model:AIModel, workflow:Workflow) {
 if(workflow==='all')return true;
 const primary=primaryWorkflow(model);
 if(workflow==='reference')return primary==='reference' || model.category.includes('video') && (model.params||[]).some(p=>p.type==='file' && /reference.*image|image.*reference/.test(p.key));
 if(workflow==='frames')return primary==='frames' || model.category.includes('video') && (model.params||[]).some(p=>/last_frame|end_frame|tail_image/.test(p.key));
 return primary===workflow;
}
export function firstImageParameter(model:AIModel, workflow:Workflow) {
 const imageParams=(model.params||[]).filter(p=>p.type==='file' && p.accept?.includes('image'));
 if(workflow==='reference')return imageParams.find(p=>/reference/.test(p.key));
 return imageParams.find(p=>/first_frame|start_frame/.test(p.key)) || (!model.supportsImageUpload ? imageParams.find(p=>!/last_frame|end_frame|mask/.test(p.key)) : undefined);
}
