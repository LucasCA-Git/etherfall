/** Thin WebGL2 helpers with explicit error reporting (shader logs are surfaced, never swallowed). */

export function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`createShader failed (${label})`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error in ${label}:\n${log}`);
  }
  return sh;
}

export interface Program {
  prog: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string, label: string): Program {
  const p = gl.createProgram();
  if (!p) throw new Error(`createProgram failed (${label})`);
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, `${label}.vs`));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, `${label}.fs`));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link error in ${label}:\n${gl.getProgramInfoLog(p)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    prog: p,
    u: (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name)!;
    },
  };
}

export function texture(gl: WebGL2RenderingContext, w: number, h: number, filter: number, internal: number = gl.RGBA8, format: number = gl.RGBA, data: ArrayBufferView | null = null): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture[];
  depth: WebGLRenderbuffer | null;
  w: number;
  h: number;
}

export function target(gl: WebGL2RenderingContext, w: number, h: number, count: number, withDepth: boolean, filter: number = gl.NEAREST): Target {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('createFramebuffer failed');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const tex: WebGLTexture[] = [];
  const bufs: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = texture(gl, w, h, filter);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    tex.push(t);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  }
  gl.drawBuffers(bufs);
  let depth: WebGLRenderbuffer | null = null;
  if (withDepth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    disposeTarget(gl, { fbo, tex, depth, w, h });
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  return { fbo, tex, depth, w, h };
}

export function disposeTarget(gl: WebGL2RenderingContext, t: Target | null): void {
  if (!t) return;
  for (const x of t.tex) gl.deleteTexture(x);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
  gl.deleteFramebuffer(t.fbo);
}
