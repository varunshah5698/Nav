const enc = new TextEncoder();
export async function hashPassword(password:string, saltB64?:string){
  const salt = saltB64 ? Uint8Array.from(atob(saltB64),c=>c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt: salt as BufferSource, iterations:100000, hash:"SHA-256"}, key, 256);
  const bytes = new Uint8Array(bits);
  const b64 = (b:Uint8Array)=> btoa(String.fromCharCode(...b));
  return { hash:b64(bytes), salt:b64(salt) };
}
export async function verifyPassword(password:string, salt:string, hash:string){
  const r = await hashPassword(password, salt);
  return r.hash === hash;
}
export function validEmail(e:string){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
// simple rate limit: 5 attempts / 10 min per email
const attempts = new Map<string,number[]>();
export function rateLimited(key:string){
  const now = Date.now(); const arr = (attempts.get(key)||[]).filter(t=>now-t<10*60*1000);
  if(arr.length>=5) return true;
  arr.push(now); attempts.set(key,arr); return false;
}
