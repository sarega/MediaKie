import React,{useEffect,useRef,useState} from 'react';
import {Film,ImageOff,Loader2} from 'lucide-react';
export const thumbnailUrl = (url:string,type:string) => type==='video' && (url.startsWith('/library/') || url.startsWith('/projects/')) ? `/api/media/thumbnail?url=${encodeURIComponent(url)}` : null;
export function MediaThumbnail({url,type,alt,className='w-full aspect-video',status}:{url?:string;type:string;alt:string;className?:string;status?:string}) {
 const root=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false);const [posterFailed,setPosterFailed]=useState(false);const [failed,setFailed]=useState(false);const [ready,setReady]=useState(false);
 useEffect(()=>{setPosterFailed(false);setFailed(false);setReady(false);},[url]);
 useEffect(()=>{if(!root.current)return;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);observer.disconnect();}},{rootMargin:'250px'});observer.observe(root.current);return()=>observer.disconnect();},[]);
 const poster=url?thumbnailUrl(url,type):null;
 return <div ref={root} className={`relative overflow-hidden bg-neutral-900 ${className}`}>
  {!ready && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-neutral-500 text-center text-xs">{failed?<ImageOff className="w-6 h-6"/>:url?<Loader2 className="w-5 h-5 animate-spin"/>:status==='generating'?<Loader2 className="w-5 h-5 animate-spin"/>:<Film className="w-6 h-6"/>}<span>{failed?'Preview unavailable — open to retry':url?'Loading preview…':status==='generating'?'Generating…':status==='failed'?'Generation failed':'No media yet'}</span></div>}
  {visible && url && !failed && (type!=='video' || poster&&!posterFailed ? <img src={poster&&!posterFailed?poster:url} alt={alt} className={`absolute inset-0 w-full h-full object-cover ${ready?'opacity-100':'opacity-0'}`} onLoad={()=>setReady(true)} onError={()=>{if(type==='video'&&poster)setPosterFailed(true);else setFailed(true);}}/> : <video src={url} muted playsInline preload="auto" className={`absolute inset-0 w-full h-full object-cover ${ready?'opacity-100':'opacity-0'}`} onLoadedMetadata={e=>{const video=e.currentTarget;video.currentTime=Number.isFinite(video.duration)?Math.min(0.2,video.duration/2):0.2;}} onLoadedData={()=>setReady(true)} onSeeked={()=>setReady(true)} onError={()=>setFailed(true)}/>)}
  {type==='video'&&ready&&<span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">▶ VIDEO</span>}
 </div>;
}
