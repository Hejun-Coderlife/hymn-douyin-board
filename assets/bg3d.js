/* 顶部横幅的 3D 背景：一块全屏片元着色器（透视网格 + 漂浮光球）。
   性能约束：机器性能有限，所以
   - 只渲染横幅那一小条，不是整页
   - 0.55 倍分辨率
   - 限到 30fps
   - 页面切走 / 横幅滚出视口 就停
   - WebGL 拿不到就退回静态渐变，不报错
   开关状态存 localStorage: hymn_bg3d = 'off' */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision mediump float;',
    'uniform vec2 u_res;uniform float u_t;',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  vec2 p=uv*2.0-1.0;',
    '  p.x*=u_res.x/max(u_res.y,1.0);',
    // 底色：深灰偏暖，上浅下深
    '  vec3 col=mix(vec3(0.105,0.095,0.105),vec3(0.055,0.050,0.062),uv.y);',
    // 透视地面网格：越远越密越暗
    '  float hz=0.55;',
    '  if(p.y<hz){',
    '    float d=1.0/(hz-p.y+0.06);',
    '    vec2 g=vec2(p.x*d*0.75, u_t*0.55+d*1.15);',
    '    float gx=abs(fract(g.x)-0.5);',
    '    float gy=abs(fract(g.y)-0.5);',
    '    float lw=0.015+0.075/d;',
    '    float line=smoothstep(lw,0.0,gx)+smoothstep(lw,0.0,gy)*0.85;',
    '    float fade=exp(-d*0.30);',
    '    col+=vec3(0.92,0.66,0.70)*line*fade*0.55;',
    '  }',
    // 三颗漂浮光球，带视差，制造纵深
    '  vec2 o1=vec2(sin(u_t*0.23)*1.15, 0.62+cos(u_t*0.17)*0.18);',
    '  vec2 o2=vec2(cos(u_t*0.19+2.0)*1.55, 0.90+sin(u_t*0.13)*0.22);',
    '  vec2 o3=vec2(sin(u_t*0.11+4.0)*0.75, 0.40+cos(u_t*0.29)*0.12);',
    '  col+=vec3(0.95,0.68,0.73)*0.055/(dot(p-o1,p-o1)+0.045);',
    '  col+=vec3(0.80,0.62,0.78)*0.040/(dot(p-o2,p-o2)+0.070);',
    '  col+=vec3(1.00,0.82,0.84)*0.028/(dot(p-o3,p-o3)+0.030);',
    // 暗角，保证右侧文字区不过亮
    '  col*=1.0-0.45*length(vec2(p.x*0.42,(uv.y-0.5)*1.1));',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  window.HYBg = function (canvas) {
    var gl = null, prog, uRes, uT, raf = 0, last = 0, t0 = Date.now(), running = false, dead = false;
    var SCALE = 0.55, FRAME = 1000 / 30;

    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false,
                                        powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }

    if (!gl) { canvas.parentNode.classList.add('nogl'); return { stop: function () {}, start: function () {} }; }

    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
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
    } catch (e) {
      canvas.parentNode.classList.add('nogl');
      return { stop: function () {}, start: function () {} };
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

    function start() {
      if (running || dead) return;
      running = true; last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else if (canvas.dataset.on !== '0') start();
    });

    // 横幅滚出视口就停
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) stop();
        else if (canvas.dataset.on !== '0' && !document.hidden) start();
      }, { threshold: 0 }).observe(canvas);
    }

    window.addEventListener('resize', function () { if (running) { last = 0; } });

    return {
      start: start,
      stop: stop,
      destroy: function () { dead = true; stop(); }
    };
  };
})();
