import { test, expect } from '@playwright/test';

const study = { id:'synthetic-mri', name:'Synthetic geometry fixture', patientId:'synthetic', studyDate:'2026-01-01', shape:[24,30,20], spacingMm:[1,2,3], source:'Synthetic fixture', suggestedPoint:{x:12,y:15,z:10,label:1}, segmentation:{ volumeMl:2.4, voxelCount:400, model:'Fixture only', points:Array.from({length:9},(_,i)=>({x:12,y:15,z:10,label:i%2})) } };
const vitals = { heart_rate:72, spo2:98, systolic_bp:120, diastolic_bp:80, respiratory_rate:16, temperature:37 };
const session = { id:'synthetic-session', patientId:'synthetic', source:'demo', scenario:'stable', cursor:12, totalReadings:12, readings:Array.from({length:12},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,1,0,i*5)).toISOString(),...vitals})), score:{value:0,tier:'Low',drivers:Object.entries(vitals).map(([name,value])=>({name,value,points:0,reason:'Synthetic reference range'})),assumptions:['Reference rule fixture only.']} };
async function setup(page) {
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('medicluster.token','synthetic-preview'));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), path=url.pathname; let json=[];
  if(path==='/api/auth/me')json={user:{id:'synthetic',name:'Synthetic clinician',onboarded:true}};
  if(path==='/api/health/ml')json={online:true};
  if(path==='/api/intelligence/health')json={ready:true,models:{segmentation:'fixture',forecast:'fixture'},provenance:'Synthetic browser test; no inference.'};
  if(path==='/api/intelligence/brain/studies')json={studies:[study]};
  if(path==='/api/intelligence/brain/demo')json={cases:[{id:'fixture',title:'Synthetic fixture'}]};
  if(path.endsWith('/mesh'))json={positions:[0,0,0,24,0,0,0,60,0],indices:[0,1,2]};
  if(path.endsWith('/slice'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30"><rect width="24" height="30" fill="#84958a"/></svg>'});
  if(path==='/api/intelligence/radar/sessions')json={sessions:[session]};
  if(path==='/api/intelligence/radar/demo')json={scenarios:[{id:'stable',title:'Synthetic stable'}]};
  if(path==='/api/intelligence/radar/sessions/synthetic-session')json={...session,cursor:Number(url.searchParams.get('cursor')||12)};
  await route.fulfill({json});
 });
}
async function fits(page) {
 await expect(page.locator('.iw-toolbar')).toBeInViewport({ratio:1});
 const layout=await page.locator('.intel-workspace').evaluate(root=>{
  const bad=[];
  for(const element of [root,...root.querySelectorAll('*')]) {
   const css=getComputedStyle(element),r=element.getBoundingClientRect();
   if(!r.width||!r.height||css.display==='none'||css.visibility==='hidden')continue;
   if(['auto','scroll'].includes(css.overflowY)&&element.scrollHeight>element.clientHeight+2)bad.push(`${element.className}:scroll`);
   if(element.matches('button,input,select,textarea')&&(r.bottom>innerHeight+1||r.right>innerWidth+1))bad.push(`${element.outerHTML.slice(0,100)}:outside`);
  }
  return {bad,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth};
 });
 expect(layout.bad).toEqual([]);
 expect(layout.documentHeight).toBeLessThanOrEqual((await page.viewportSize()).height+1);
 expect(layout.documentWidth).toBeLessThanOrEqual((await page.viewportSize()).width+1);
}
for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:390,height:844}]) {
 test(`Brain task views fit ${viewport.width}×${viewport.height} and preserve slice geometry`,async({page})=>{
  await setup(page);await page.setViewportSize(viewport);await page.goto('/brain-explorer');
  await expect(page.getByRole('dialog',{name:'Starting MediCluster'})).toBeHidden();
  await page.getByLabel('Open study',{exact:true}).selectOption(study.id);
  for(const view of ['library','spatial','slices','prompts','measurement','classify','compare','info']) {
   await page.getByRole('combobox',{name:'Brain workspace'}).selectOption(view);
   await fits(page);
   if(view==='spatial')await expect(page.locator('.intel-mesh')).toBeInViewport({ratio:1});
   if(view==='slices') {
    await expect(page.getByAltText(/axial MRI/)).toBeVisible();
    const frames=await page.locator('.intel-slice-frame').evaluateAll(nodes=>nodes.map(n=>({ratio:n.getBoundingClientRect().width/n.getBoundingClientRect().height,expected:Number(n.style.aspectRatio)})));
    for(const frame of frames)expect(Math.abs(frame.ratio-frame.expected)).toBeLessThan(.02);
    await page.getByRole('button',{name:/Add prompt point/}).click();
   }
   if(view==='prompts') {await expect(page.getByRole('button',{name:'Segment candidate lesion'})).toBeEnabled();await page.getByRole('button',{name:'Next points'}).click();await fits(page);}
  }
 });
 test(`Radar task views fit ${viewport.width}×${viewport.height}`,async({page})=>{
  await setup(page);await page.setViewportSize(viewport);await page.goto('/deterioration-radar');
  await expect(page.getByRole('dialog',{name:'Starting MediCluster'})).toBeHidden();
  await page.getByLabel('Open a saved session').selectOption(session.id);
  for(const view of ['session','observations','replay','score','forecast','signals','info']) {
   await page.getByRole('combobox',{name:'Radar workspace'}).selectOption(view);
   await fits(page);
   if(view==='forecast')await expect(page.getByRole('button',{name:'Forecast this prefix'})).toBeEnabled();
   if(view==='score'){await page.getByRole('button',{name:'Next contributors'}).click();await fits(page);}
   if(view==='signals')for(const key of Object.keys(vitals)){await page.getByLabel('Vital signal',{exact:true}).selectOption(key);await expect(page.locator('.intel-chart')).toBeInViewport({ratio:1});}
  }
 });
}

test('manual observations and CSV import remain reachable without scrolling on mobile',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});
 const manualSession={...session,source:'manual',scenario:null};
 await page.route('**/api/intelligence/radar/sessions/synthetic-session',route=>route.fulfill({json:manualSession}));
 await page.goto('/deterioration-radar');
 await page.getByLabel('Open a saved session').selectOption(session.id);
 await page.getByRole('combobox',{name:'Radar workspace'}).selectOption('observations');
 await expect(page.getByRole('button',{name:'Add observation',exact:true})).toBeInViewport({ratio:1});
 await fits(page);
 await page.getByRole('button',{name:'CSV import',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'CSV observations'})).toBeInViewport({ratio:1});
 await expect(page.getByRole('button',{name:'Import batch'})).toBeInViewport({ratio:1});
 await fits(page);
});
