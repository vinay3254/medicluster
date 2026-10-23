// Adapted from /home/vinay/lusion-clone. Retains Earth shader and orbit-to-logo motion.
import { WebGLRenderer, Scene, PerspectiveCamera, Texture, ShaderMaterial, Mesh, SphereGeometry } from 'three';

export class EarthSplashRenderer {
  constructor(canvas, reduced = false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.animationTime = 0;
    if (!reduced) this.initEarth();
  }
  initEarth(){
    this.earthImage=new Image();this.earthImage.src='/images/splash-earth.jpg';
    this.earthImage.decoding='async';
    try {
      this.earthRenderer=new WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
      this.earthRenderer.setPixelRatio(1);this.earthRenderer.setSize(384,384,false);this.earthRenderer.setClearColor(0x000000,0);
      this.earthScene=new Scene();this.earthCamera=new PerspectiveCamera(30,1,.1,20);this.earthCamera.position.z=4;
      const texture=new Texture(this.earthImage);this.earthTexture=texture;
      this.earthImage.onload=()=>{texture.needsUpdate=true;this.earthReady=true;};
      if(this.earthImage.complete&&this.earthImage.naturalWidth){texture.needsUpdate=true;this.earthReady=true;}
      const material=new ShaderMaterial({uniforms:{earthMap:{value:texture}},
        vertexShader:'varying vec2 earthUv;varying vec3 earthNormal;varying vec3 earthPosition;void main(){earthUv=uv;earthNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);earthPosition=p.xyz;gl_Position=projectionMatrix*p;}',
        fragmentShader:'uniform sampler2D earthMap;varying vec2 earthUv;varying vec3 earthNormal;varying vec3 earthPosition;void main(){vec3 surface=texture2D(earthMap,earthUv).rgb;vec3 n=normalize(earthNormal);vec3 view=normalize(-earthPosition);vec3 light=normalize(vec3(-.65,.75,1.4));float daylight=max(dot(n,light),0.);vec3 color=surface*(.22+.85*daylight);float ocean=smoothstep(.02,.18,surface.b-max(surface.r,surface.g)*.85);float shine=pow(max(dot(n,normalize(light+view)),0.),42.)*ocean*.22;float atmosphere=pow(1.-max(dot(n,view),0.),3.5);color+=vec3(.10,.30,.55)*atmosphere*.55+shine;color=pow(color,vec3(.82));gl_FragColor=vec4(color,1.);}'
      });
      this.earthMesh=new Mesh(new SphereGeometry(1,64,48),material);this.earthMesh.rotation.z=.12;this.earthScene.add(this.earthMesh);
    } catch(error){this.earthRenderer=null;}
  }
  resize(w,h) {
    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
  }
  dispose() {
    if (this.earthImage) this.earthImage.onload = null;
    this.earthMesh?.geometry.dispose();
    this.earthMesh?.material.dispose();
    this.earthTexture?.dispose();
    this.earthRenderer?.dispose();
    this.earthRenderer?.forceContextLoss();
  }
  update(dt) {
    const ctx=this.ctx,w=this.width,h=this.height;
    const clamp=v=>Math.max(0,Math.min(1,v)),mix=(a,b,t)=>a+(b-a)*t;
    const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
    const reduced=this.reduced;
    this.animationTime=(this.animationTime||0)+dt;
    const time=this.animationTime;
    const morph=reduced?1:clamp((time-1.35)/1.65);
    const gather=smooth(morph/.66),lockup=smooth((morph-.4)/.6);
    const intro=reduced?1:smooth(time/.5);
    const ink='#17221d',paper='#fbfaf7';
    ctx.save();ctx.scale(this.dpr,this.dpr);ctx.clearRect(0,0,w,h);
    ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);
    const unit=Math.min(1.8,w/400,h/320),radius=72*unit,orbit=116*unit,iconR=19*unit;
    const fontSize=Math.min(112,w*.105,h*.18),tile=fontSize*.31,gap=tile*.3,markWidth=tile*2+gap;
    const text='MediCluster';ctx.font='400 '+fontSize+'px WorkspaceSans,Arial,sans-serif';ctx.textBaseline='middle';
    const textWidth=ctx.measureText(text).width,space=fontSize*.4,total=markWidth+space+textWidth;
    const markX=(-total/2+markWidth/2)*lockup;
    const globeScale=intro*(1-gather);
    if(globeScale>.001){
      ctx.save();ctx.scale(globeScale,globeScale);ctx.globalAlpha=1-gather;
      const glow=ctx.createRadialGradient(0,0,radius*.88,0,0,radius*1.16);
      glow.addColorStop(0,'rgba(81,147,185,.16)');glow.addColorStop(.55,'rgba(108,177,208,.13)');glow.addColorStop(1,'rgba(108,177,208,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,radius*1.16,0,Math.PI*2);ctx.fill();
      if(this.earthRenderer&&this.earthReady){
        this.earthMesh.rotation.y=reduced?-1.5:-1.7+time*.3;
        this.earthRenderer.render(this.earthScene,this.earthCamera);
        ctx.drawImage(this.earthRenderer.domElement,-radius*1.04,-radius*1.04,radius*2.08,radius*2.08);
      } else {
        ctx.save();ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.clip();
        if(this.earthImage.complete&&this.earthImage.naturalWidth)ctx.drawImage(this.earthImage,-radius,-radius,radius*2,radius*2);
        else {const ocean=ctx.createRadialGradient(-radius*.4,-radius*.4,0,0,0,radius);ocean.addColorStop(0,'#4e99ba');ocean.addColorStop(1,'#102d49');ctx.fillStyle=ocean;ctx.fillRect(-radius,-radius,radius*2,radius*2);}
        ctx.restore();
      }
      ctx.restore();
    }

    const drawIcon=(i,x,y,opacity)=>{
      ctx.save();ctx.translate(x,y);ctx.scale(unit,unit);ctx.globalAlpha=opacity;ctx.strokeStyle=ink;ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';
      if(i===0){ctx.beginPath();ctx.moveTo(-8,-6);ctx.lineTo(-8,0);ctx.bezierCurveTo(-8,10,5,10,5,0);ctx.lineTo(5,-6);ctx.stroke();ctx.beginPath();ctx.arc(8,8,3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-1,8);ctx.bezierCurveTo(-1,16,8,17,8,11);ctx.stroke();}
      if(i===1){ctx.beginPath();ctx.moveTo(0,8);ctx.bezierCurveTo(-19,-3,-6,-15,0,-6);ctx.bezierCurveTo(6,-15,19,-3,0,8);ctx.stroke();}
      if(i===2){ctx.beginPath();ctx.arc(0,-1,2,0,Math.PI*2);ctx.stroke();for(const r of [6,10]){ctx.beginPath();ctx.arc(0,-1,r,-.9,.9);ctx.stroke();ctx.beginPath();ctx.arc(0,-1,r,Math.PI-.9,Math.PI+.9);ctx.stroke();}ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(-3,11);ctx.moveTo(0,2);ctx.lineTo(3,11);ctx.stroke();}
      if(i===3){ctx.strokeRect(-11,-7,14,13);ctx.beginPath();ctx.moveTo(3,-3);ctx.lineTo(8,-3);ctx.lineTo(12,2);ctx.lineTo(12,6);ctx.lineTo(3,6);ctx.stroke();for(const x of [-6,8]){ctx.fillStyle=paper;ctx.beginPath();ctx.arc(x,7,2.5,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.beginPath();ctx.moveTo(-4,-4);ctx.lineTo(-4,2);ctx.moveTo(-7,-1);ctx.lineTo(-1,-1);ctx.stroke();}
      ctx.restore();
    };
    // Four care roles orbit the globe, then spiral into the actual brand mark.
    for(let i=0;i<4;i++){
      const angle=(reduced?0:time*.8)+i*Math.PI/2-Math.PI*.75+gather*Math.PI*.65;
      const ox=Math.cos(angle)*orbit*intro,oy=Math.sin(angle)*orbit*intro;
      const tx=markX+(i%2?1:-1)*(tile+gap)/2,ty=(i<2?-1:1)*(tile+gap)/2;
      const x=mix(ox,tx,gather),y=mix(oy,ty,gather),size=mix(iconR*2,tile,gather),corner=mix(iconR,0,gather);
      ctx.globalAlpha=intro;
      const tint=smooth((gather-.18)/.72),rgb=i===3?[235,113,65]:[23,34,29];ctx.fillStyle='rgb('+rgb.map(v=>Math.round(mix(255,v,tint))).join(',')+')';
      ctx.beginPath();ctx.roundRect(x-size/2,y-size/2,size,size,Math.min(corner,size/2));ctx.fill();
      if(gather<.5){ctx.strokeStyle='#d7dfcd';ctx.lineWidth=1;ctx.stroke();}
      drawIcon(i,x,y,intro*(1-smooth(gather*2)));
    }
    if(lockup>0){
      let x=-total/2+markWidth+space;
      for(let i=0;i<text.length;i++){
        const enter=smooth((morph-.53-i*.018)/.23);
        ctx.globalAlpha=enter;ctx.fillStyle=ink;
        ctx.fillText(text[i],x,reduced?0:(1-enter)*fontSize*.3);
        x+=ctx.measureText(text[i]).width;
      }
    }
    ctx.restore();
  }
}
