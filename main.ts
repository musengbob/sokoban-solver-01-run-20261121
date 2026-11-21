import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
const D=[[-1,0,'l','L'],[1,0,'r','R'],[0,-1,'u','U'],[0,1,'d','D']];
const P=t=>{let R=t.split('\n').filter(Boolean),h=R.length,w=0;R.forEach(r=>w=Math.max(w,r.length));
let W=new Uint8Array(w*h).fill(1),G=[],B=[],p=0,S=new Uint8Array(w*h);
R.forEach((r,y)=>{for(let x=0;x<r.length;x++){let i=y*w+x,c=r[x];if(c=='#')continue;W[i]=0;
if('.*+'.includes(c)){G.push(i);S[i]=1}if('$*'.includes(c))B.push(i);if('@+'.includes(c))p=i}});
return{w,W,G,S,B:B.sort((a,b)=>a-b),p}};
const lv=L=>{let l=new Uint8Array(L.W.length),q=[...L.G];for(let g of L.G)l[g]=1;
for(let i=0;i<q.length;i++)for(let d of D){let e=d[1]*L.w+d[0],y=q[i]-e;if(!L.W[y]&&!L.W[y-e]&&!l[y]){l[y]=1;q.push(y)}}return l};
const pd=L=>{let o=[];for(let g of L.G){let d=new Int32Array(L.W.length).fill(-1),q=[g];d[g]=0;
for(let i=0;i<q.length;i++)for(let a of D){let e=a[1]*L.w+a[0],p=q[i]-e;if(L.W[p]||L.W[p-e]||d[p]>=0)continue;d[p]=d[q[i]]+1;q.push(p)}o.push(d)}return o};
const hu=(B,ds)=>{let n=B.length;if(!n)return 0;let be=1e9;
(function r(i,u,s){if(s>=be)return;if(i==n){be=s;return}for(let g=0;g<ds.length;g++){if(u>>g&1)continue;let d=ds[g][B[i]];if(d<0)continue;r(i+1,u|1<<g,s+d)}})(0,0,0);
return be==1e9?-1:be};
const dd=(L,o,t)=>{let{w,W,S}=L;if(S[t])return 0;let U=W[t-w],N=W[t+w],E=W[t-1],R=W[t+1];
if((U||N)&&(E||R))return 1;
let f=(s,e)=>{let a=t,b=t;while(!W[a+e]&&W[a+e+s])a+=e;while(!W[b-e]&&W[b-e+s])b-=e;
if(W[a+e]&&W[b-e]){for(let q=Math.min(a,b);q<=Math.max(a,b);q+=Math.abs(e))if(S[q])return 0;return 1}return 0};
if(U&&f(-w,-1))return 1;if(N&&f(w,-1))return 1;if(E&&f(-1,-w))return 1;if(R&&f(1,-w))return 1;
for(let a of[t,t-1,t-w,t-w-1]){let b=a+1,c=a+w,e=c+1;
if((W[a]||o[a])&&(W[b]||o[b])&&(W[c]||o[c])&&(W[e]||o[e])&&((o[a]&&!S[a])||(o[b]&&!S[b])||(o[c]&&!S[c])||(o[e]&&!S[e])))return 1}
return 0};
const wk=(L,o,f,t)=>{let{w,W}=L;if(f==t)return'';let pv=new Int32Array(W.length).fill(-1),hw=new Array(W.length),q=[f];pv[f]=f;
for(let i=0;i<q.length;i++){let p=q[i];if(p==t)break;for(let d of D){let v=p+d[1]*w+d[0];if(W[v]||o[v]||pv[v]>=0)continue;pv[v]=p;hw[v]=d[2];q.push(v)}}
if(pv[t]<0)return'';let s='';for(let p=t;p!=f;p=pv[p])s=hw[p]+s;return s};
function as(L,M){let{w,W,S,B,p}=L,n=W.length,l=lv(L),ds=pd(L);
let ok=b=>b.every(x=>S[x]);if(ok(B))return'';
let h0=hu(B,ds);if(h0<0)return null;
let oc=new Uint8Array(n),sn=new Int32Array(n),mk=new Int32Array(n),st=new Int32Array(n),sp=0;
let lo=(o,f,se,sm)=>{let m=f,x=0;st[x++]=f;se[f]=sm;while(x){let q=st[--x];if(q<m)m=q;for(let d of D){let v=q+d[1]*w+d[0];if(!W[v]&&!o[v]&&se[v]!=sm){se[v]=sm;st[x++]=v}}}return m};
let BX=[B.slice()],PL=[p],Gg=[0],Hh=[h0],Kk=[0],PA=[-1],PB=[-1],PD=[-1],SQ=[0],be=new Map(),hp=[],sq=0;
let ky=(b,z)=>{let k=z;for(let x of b)k=k*n+x;return k};
let ls=(a,b)=>{let fa=Gg[a]+Hh[a],fb=Gg[b]+Hh[b];return fa!=fb?fa<fb:Hh[a]!=Hh[b]?Hh[a]<Hh[b]:SQ[a]<SQ[b]};
let ph=s=>{let i=hp.length;hp.push(s);while(i){let q=i-1>>1;if(!ls(hp[i],hp[q]))break;let t=hp[i];hp[i]=hp[q];hp[q]=t;i=q}};
let pp=()=>{let t=hp[0],z=hp.pop();if(hp.length){hp[0]=z;for(let i=0;;){let c=2*i+1;if(c>=hp.length)break;if(c+1<hp.length&&ls(hp[c+1],hp[c]))c++;if(!ls(hp[c],hp[i]))break;let x=hp[i];hp[i]=hp[c];hp[c]=x;i=c}}return t};
for(let x of B)oc[x]=1;Kk[0]=ky(B,lo(oc,p,sn,++sp));for(let x of B)oc[x]=0;be.set(Kk[0],0);ph(0);
let fd=-1;
while(hp.length){let s=pp();if(be.get(Kk[s])!==s)continue;if(ok(BX[s])){fd=s;break}
if(BX.length>=M)return null;
let b=BX[s],g=Gg[s];
for(let x of b)oc[x]=1;
let he=++sp;lo(oc,PL[s],sn,he);
for(let i=0;i<b.length&&fd<0;i++){let q=b[i];
for(let di=0;di<4;di++){let d=D[di],e=d[1]*w+d[0],t=q+e;
if(sn[q-e]!=he||W[t]||oc[t]||!l[t])continue;
oc[q]=0;oc[t]=1;
if(dd(L,oc,t)){oc[t]=0;oc[q]=1;continue}
let nx=b.slice();nx[i]=t;nx.sort((a,c)=>a-c);
let h=hu(nx,ds),lw=lo(oc,q,mk,++sp);oc[t]=0;oc[q]=1;
if(h<0)continue;
let k=ky(nx,lw),pr=be.get(k);
if(pr!==undefined&&Gg[pr]<=g+1)continue;
let y=BX.length;BX.push(nx);PL.push(q);Gg.push(g+1);Hh.push(h);Kk.push(k);PA.push(s);PB.push(q);PD.push(di);SQ.push(++sq);be.set(k,y);ph(y);
if(ok(nx)){fd=y;break}}}
for(let x of b)oc[x]=0;
if(fd>=0)break}
if(fd<0)return null;
let pa=[];for(let s=fd;s>0;s=PA[s])pa.push(s);pa.reverse();
let m='',pl=p,bx=B.slice();
for(let s of pa){let nb=BX[s],f=PB[s],d=D[PD[s]],e=d[1]*w+d[0];
for(let x of bx)oc[x]=1;m+=wk(L,oc,pl,f-e);for(let x of bx)oc[x]=0;m+=d[3];pl=f;bx=nb}
return m}
const rm=L=>{let{w,W,G,B,p}=L,l=lv(L),r=p/w|0,cut=new Uint8Array(W.length);
for(let i=r*w;i<(r+1)*w;i++)if(!W[i]&&!l[i])cut[i]=1;
if(B.some(b=>cut[b]))return null;
let pa=new Int32Array(W.length).fill(-1),R=[];
for(let s=0;s<W.length;s++){if(W[s]||cut[s]||pa[s]>=0)continue;let q=[s];pa[s]=R.length;
for(let i=0;i<q.length;i++)for(let d of D){let v=q[i]+d[1]*w+d[0];if(!W[v]&&!cut[v]&&pa[v]<0){pa[v]=R.length;q.push(v)}}
R.push({b:[],g:[]})}
for(let b of B)R[pa[b]].b.push(b);
for(let g of G)if(pa[g]>=0)R[pa[g]].g.push(g);
if(G.some(g=>pa[g]<0)||R.some(x=>x.b.length!=x.g.length))return null;
return R.filter(x=>x.b.length)};
const eo=(w,f,m)=>{let p=f;for(let c of m.toLowerCase())p+=c=='u'?-w:c=='d'?w:c=='l'?-1:1;return p};
const sr=L=>{let R=rm(L);if(!R)return null;let p=L.p,m='';
for(let r of R){let W=L.W.slice();
for(let o of R)if(o!=r)for(let b of o.d?o.g:o.b)W[b]=1;
let s=as({w:L.w,W,G:r.g,S:L.S,B:r.b,p},4e5);
if(!s&&s!=='')return null;m+=s;p=eo(L.w,p,s);r.d=1}
return m};
const sv=t=>{let L=P(t),r=sr(L);if(r)return r;let w=as(L,6e5);return w??''};
for(let id of readdirSync(I).sort()){let m=sv(readFileSync(join(I,id,'level.txt'),'utf8'));mkdirSync(join(O,id),{recursive:true});writeFileSync(join(O,id,'solution.txt'),m+'\n')}
