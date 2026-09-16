/* 顶部横幅背景动效。原生 WebGL 片元着色器，5 种可选风格，全部「慢」。
   性能约束（机器性能有限）：只渲染横幅那一条 / 0.55 倍分辨率 / 限 24fps /
   页面切走或滚出视口就停 / 拿不到 WebGL 退回静态渐变。
   用法：HYBg(canvas, 'aurora')；风格键见 HYBg.VARIANTS。
   开关状态存 localStorage.hymn_bg3d，风格存 localStorage.hymn_bg3d_style */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var HEAD = [
    'precision mediump float;',
    'uniform vec2 u_res;uniform float u_t;uniform float u_light;',
    'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){',
    '  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
    '  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);',
    '}',
    'float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.02;a*=0.5;}return s;}',
    ''
  ].join('\n');

  /* 所有风格共用的收尾：
     u_light=0 深色版（横幅用）；u_light=1 浅色版（整页背景用，把颜色映射到近白底上，
     只留极淡的色晕，保证卡片和文字的可读性不受影响）。 */
  var TAIL = [
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;vec2 p=uv*2.0-1.0;p.x*=u_res.x/max(u_res.y,1.0);',
    '  vec3 col=scene(uv,p);',
    '  if(u_light>0.5){',
    '    float e=clamp(dot(col,vec3(0.85,0.75,0.75)),0.0,1.0);',
    '    float mx=max(col.r,max(col.g,col.b));',
    '    vec3 hue=col/max(mx,0.001);',
    '    vec3 bg=vec3(0.945,0.922,0.871);',   // #f1ebde 米色
    '    vec3 tint=mix(bg,hue*vec3(0.96,0.80,0.68),0.50);',   // 偏暖砂金，不要洗成粉
    '    col=mix(bg,tint,pow(e,0.95)*0.38);',
    '  } else {',
    '    col*=1.0-0.30*length(vec2(p.x*0.33,(uv.y-0.5)*0.9));',
    '  }',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');


  /* 参考 app.hemei.asia/dashboard 的画风：奶油米白底 + 缓慢漂浮的柔光 3D 球。
     这一版自带最终颜色，不走 TAIL 的明暗映射。 */
  var TAIL_RAW = [
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;vec2 p=uv*2.0-1.0;p.x*=u_res.x/max(u_res.y,1.0);',
    '  gl_FragColor=vec4(scene(uv,p),1.0);',
    '}'
  ].join('\n');

  var PEARL = [
    'vec3 sphere(vec2 p,vec2 c,float r,vec3 tint,inout vec3 col){',
    '  vec2 d=(p-c)/r;float q=dot(d,d);',
    '  if(q<1.35){',
    '    float z=sqrt(max(1.0-q,0.0));',
    '    vec3 n=normalize(vec3(d,z+0.001));',
    '    vec3 L=normalize(vec3(-0.35,0.62,0.70));',
    '    float diff=clamp(dot(n,L),0.0,1.0);',
    '    float rim=pow(1.0-clamp(z,0.0,1.0),2.2);',
    '    float spec=pow(clamp(dot(n,normalize(L+vec3(0.0,0.0,1.0))),0.0,1.0),26.0);',
    '    vec3 s=tint*(0.86+0.14*diff)+vec3(1.0,0.99,0.97)*spec*0.24+tint*rim*0.10;',
    '    float a=smoothstep(1.34,0.80,q);',
    '    col=mix(col,s,a*0.78);',
    '  }',
    '  return col;',
    '}',
    'vec3 scene(vec2 uv,vec2 p){',
    '  float t=u_t*0.025;',                       // 幅度大但走得很慢（用户要求再慢 3 倍）
    '  vec3 col=mix(vec3(0.988,0.972,0.945),vec3(0.960,0.936,0.894),uv.y);',
    '  col+=vec3(0.06,0.030,0.004)*pow(max(0.0,1.0-length(p-vec2(-1.1,0.85))*0.75),3.0);',
    '  col+=vec3(0.05,0.035,0.012)*pow(max(0.0,1.0-length(p-vec2(1.25,-0.75))*0.70),3.0);',
    '  vec3 cream=vec3(0.992,0.966,0.930);',
    '  vec3 peach=vec3(0.992,0.912,0.850);',
    '  vec3 sand =vec3(0.978,0.936,0.866);',
    // 幅度是原来的 6~8 倍：球在整屏范围里游走，不是原地微抖
    '  col=sphere(p,vec2(-1.00+sin(t*0.90)*0.85, 0.42+cos(t*0.70)*0.42),0.32,peach,col);',
    '  col=sphere(p,vec2( 1.20+cos(t*0.62)*0.95,-0.28+sin(t*0.83)*0.46),0.44,cream,col);',
    '  col=sphere(p,vec2( 0.40+sin(t*0.51+2.0)*1.15,-0.78+cos(t*0.47)*0.40),0.21,sand,col);',
    '  col=sphere(p,vec2(-0.50+cos(t*0.77+1.0)*0.90,-0.60+sin(t*0.57)*0.38),0.16,peach,col);',
    '  col=sphere(p,vec2( 0.00+sin(t*0.43+4.0)*1.30, 0.86+cos(t*0.65)*0.34),0.26,cream,col);',
    '  return col;',
    '}'
  ].join('\n') + TAIL_RAW;

  // 五种风格的主体。t 已经放慢过，越小越慢。
  var BODY = {
    // 0 奶油珍珠（默认）：对标 app.hemei.asia/dashboard
    pearl: PEARL,

    // 1 柔光流云：几团模糊色斑极慢漂移，最接近「背景图动起来」
    aurora: [
      'vec3 scene(vec2 uv,vec2 p){',
      '  float t=u_t*0.045;',
      '  vec3 col=mix(vec3(0.085,0.072,0.078),vec3(0.045,0.038,0.046),uv.y);',
      '  vec2 a=vec2(sin(t*1.3)*1.4, 0.35+cos(t*0.9)*0.35);',
      '  vec2 b=vec2(cos(t*0.8+1.7)*1.9, -0.25+sin(t*1.1)*0.40);',
      '  vec2 c=vec2(sin(t*0.6+3.4)*1.1, 0.75+cos(t*0.7)*0.25);',
      '  col+=vec3(0.96,0.66,0.72)*0.085/(dot(p-a,p-a)*1.3+0.075);',
      '  col+=vec3(0.86,0.60,0.80)*0.070/(dot(p-b,p-b)*1.5+0.110);',
      '  col+=vec3(1.00,0.84,0.70)*0.048/(dot(p-c,p-c)*1.8+0.090);',
      '  col*=0.93+0.10*fbm(p*1.6+t*2.0);',
            '  return col;',
      '}'+TAIL
    ].join('\n'),

    // 2 丝绸流光：绸缎一样的缓慢波纹
    silk: [
      'vec3 scene(vec2 uv,vec2 p){',
      '  float t=u_t*0.035;',
      '  vec2 q=p*1.1;',
      '  float w=fbm(q+vec2(t,t*0.6));',
      '  float w2=fbm(q*1.4+vec2(w*1.6-t*0.8, w*1.2));',
      '  float band=sin((q.y*2.2+w2*3.0)*1.6)*0.5+0.5;',
      '  vec3 base=mix(vec3(0.052,0.044,0.052),vec3(0.105,0.078,0.086),band);',
      '  vec3 sheen=mix(vec3(0.92,0.62,0.70),vec3(0.72,0.58,0.86),w2);',
      '  vec3 col=base+sheen*pow(band,3.5)*0.42;',
      '  col+=vec3(1.0,0.86,0.80)*pow(band,10.0)*0.14;',
            '  return col;',
      '}'+TAIL
    ].join('\n'),

    // 3 星云微尘：细小光点缓慢流动，最安静
    dust: [
      'vec3 scene(vec2 uv,vec2 p){',
      '  float t=u_t*0.030;',
      '  vec3 col=mix(vec3(0.062,0.055,0.066),vec3(0.035,0.030,0.040),uv.y);',
      '  col+=vec3(0.55,0.36,0.46)*fbm(p*0.9+vec2(t*1.2,t*0.5))*0.30;',
      '  float d=0.0;',
      '  for(int i=0;i<3;i++){',
      '    float fi=float(i);',
      '    vec2 g=p*(2.6+fi*2.2)+vec2(t*(1.0+fi*0.7),-t*(0.4+fi*0.3));',
      '    vec2 id=floor(g);vec2 f=fract(g)-0.5;',
      '    float r=h21(id+fi*17.0);',
      '    if(r>0.955){',
      '      float m=exp(-dot(f,f)*(22.0+fi*16.0));',
      '      d+=m*(0.7+0.3*sin(u_t*0.5+r*30.0));',
      '    }',
      '  }',
      '  col+=vec3(1.0,0.90,0.92)*d*0.85;',
            '  return col;',
      '}'+TAIL
    ].join('\n'),

    // 4 液态色块：大色块像液体缓缓起伏，颜色最饱满
    liquid: [
      'vec3 scene(vec2 uv,vec2 p){',
      '  float t=u_t*0.040;',
      '  vec2 q=p*0.85;',
      '  q+=0.35*vec2(fbm(q*1.3+vec2(t,0.0)),fbm(q*1.3+vec2(0.0,t*0.8)));',
      '  float n=fbm(q*1.7+t*0.5);',
      '  vec3 c1=vec3(0.075,0.055,0.070);',
      '  vec3 c2=vec3(0.58,0.26,0.36);',
      '  vec3 c3=vec3(0.92,0.62,0.66);',
      '  vec3 col=mix(c1,c2,smoothstep(0.30,0.62,n));',
      '  col=mix(col,c3,smoothstep(0.60,0.88,n)*0.75);',
      '  col+=vec3(1.0,0.88,0.84)*pow(smoothstep(0.78,0.98,n),2.0)*0.30;',
      '  col*=0.82;',
            '  return col;',
      '}'+TAIL
    ].join('\n'),

    // 5 光晕呼吸：两三团光晕缓慢明暗+位移，最克制、最不抢戏
    breath: [
      'vec3 scene(vec2 uv,vec2 p){',
      '  float t=u_t*0.025;',
      '  vec3 col=mix(vec3(0.072,0.066,0.074),vec3(0.040,0.036,0.044),uv.y);',
      '  vec2 a=vec2(1.05+sin(t*1.1)*0.22, 0.10+cos(t*0.8)*0.12);',
      '  vec2 b=vec2(-0.75+cos(t*0.7)*0.18, 0.45+sin(t*0.9)*0.10);',
      '  float pa=0.80+0.20*sin(u_t*0.10);',
      '  float pb=0.80+0.20*sin(u_t*0.08+2.0);',
      '  col+=vec3(0.95,0.68,0.73)*0.075*pa/(dot(p-a,p-a)*1.1+0.10);',
      '  col+=vec3(0.78,0.66,0.88)*0.052*pb/(dot(p-b,p-b)*1.3+0.14);',
      '  float lines=smoothstep(0.985,1.0,sin((p.x*0.9-p.y*1.6)*6.0+u_t*0.10));',
      '  col+=vec3(1.0,0.92,0.94)*lines*0.05;',
            '  return col;',
      '}'+TAIL
    ].join('\n')
  };

  var VARIANTS = [
    { key: 'pearl',  name: '奶油珍珠', desc: '奶油米白底 + 柔光 3D 球缓慢漂浮（对标经营管理助手）' },
    { key: 'aurora', name: '柔光流云', desc: '几团模糊色斑极慢漂移，最接近「背景图动起来」' },
    { key: 'silk',   name: '丝绸流光', desc: '绸缎般的缓慢波纹，层次感强' },
    { key: 'dust',   name: '星云微尘', desc: '细小光点缓慢流动，最安静' },
    { key: 'liquid', name: '液态色块', desc: '大色块像液体起伏，颜色最饱满' },
    { key: 'breath', name: '光晕呼吸', desc: '两团光晕缓慢明暗，最克制、最不抢戏' }
  ];

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function HYBg(canvas, variant, opts) {
    opts = opts || {};
    var key = BODY[variant] ? variant : 'pearl';
    var LIGHT = opts.light ? 1.0 : 0.0;
    var gl = null, prog, uRes, uT, uL, raf = 0, last = 0, t0 = Date.now(), running = false, dead = false;
    // 整页背景像素多，所以分辨率和帧率都再降一档
    var SCALE = opts.scale || (opts.light ? 0.34 : 0.55);
    var FRAME = 1000 / (opts.fps || (opts.light ? 20 : 24));
    var noop = { start: function () {}, stop: function () {}, destroy: function () {} };

    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false,
                                        powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { canvas.parentNode.classList.add('nogl'); return noop; }

    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, HEAD + BODY[key]));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'u_res');
      uT = gl.getUniformLocation(prog, 'u_t');
      uL = gl.getUniformLocation(prog, 'u_light');
      gl.uniform1f(uL, LIGHT);
    } catch (e) {
      canvas.parentNode.classList.add('nogl');
      return noop;
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(2, Math.round(r.width * SCALE));
      var h = Math.max(2, Math.round(r.height * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }

    function frame(now) {
      if (!running || dead) return;
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME) return;
      last = now;
      resize();
      gl.uniform1f(uT, (Date.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function start() { if (!running && !dead) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else if (canvas.dataset.on !== '0') start();
    });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) stop();
        else if (canvas.dataset.on !== '0' && !document.hidden) start();
      }, { threshold: 0 }).observe(canvas);
    }

    return { start: start, stop: stop, destroy: function () { dead = true; stop(); } };
  }

  HYBg.VARIANTS = VARIANTS;
  window.HYBg = HYBg;
})();
