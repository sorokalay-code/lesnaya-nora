import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelAssets, type ModelName } from '../src/game/ModelAssets';

export async function loadModels(...names:ModelName[]):Promise<void>{
  for(const name of names){
    const data=readFileSync(join(process.cwd(),'public','models',`${name}.glb`));
    await ModelAssets.shared.register(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
  }
}
