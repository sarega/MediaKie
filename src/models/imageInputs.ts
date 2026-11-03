import type {AIModel, ModelParamConfig} from '../types';
import {primaryWorkflow, type Workflow} from './workflows';

export type ImageInputRole = 'first' | 'last' | 'reference';
export const IMAGE_INPUT_LABELS: Record<ImageInputRole, string> = {first: 'First frame', last: 'End frame', reference: 'Reference image'};
export function imageInputRole(key: string): ImageInputRole {
  return /last_frame|end_frame|tail_image/.test(key) ? 'last' : /first_frame|start_frame/.test(key) ? 'first' : 'reference';
}
export function imageDestination(model: AIModel, role: ImageInputRole): {param?: ModelParamConfig; workflow: Workflow} | null {
  const images = (model.params || []).filter(p => p.type === 'file' && p.accept?.includes('image') && !/mask/.test(p.key));
  if (role === 'last') {
    const param = images.find(p => imageInputRole(p.key) === 'last');
    return param ? {param, workflow: 'frames'} : null;
  }
  if (role === 'reference') {
    const param = images.find(p => /reference/.test(p.key));
    if (param) return {param, workflow: model.category === 'image-to-video' || model.category === 'text-to-video' ? 'reference' : primaryWorkflow(model)};
    if (primaryWorkflow(model) === 'reference' && model.supportsImageUpload) return {workflow: 'reference'};
    return model.category === 'image-to-image' && model.supportsImageUpload ? {workflow: 'image-to-image'} : null;
  }
  if (primaryWorkflow(model) === 'reference') return null;
  const param = images.find(p => imageInputRole(p.key) === 'first');
  if (param) return {param, workflow: primaryWorkflow(model) === 'frames' ? 'frames' : 'image-to-video'};
  return model.category === 'image-to-video' && model.supportsImageUpload ? {workflow: 'image-to-video'} : null;
}
export function appendImageValues(param: ModelParamConfig, current: unknown, urls: string[]) {
  if (!param.multiple) return urls[0] ?? current;
  const previous = Array.isArray(current) ? current : current ? [current] : [];
  return [...new Set([...previous, ...urls])].slice(0, param.maxFiles ?? Infinity);
}
export function lastFrameTime(duration: number) {
  return Number.isFinite(duration) ? Math.max(0, duration - 0.001) : 0;
}
