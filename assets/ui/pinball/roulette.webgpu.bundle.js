window.__appWebGpuSupported = typeof navigator !== 'undefined' && !!navigator.gpu;
window.__appPinballRenderer = window.__appWebGpuSupported ? 'webgpu-boot' : 'canvas2d';

await import('./roulette.99856b00.js');

if (!window.__appWebGpuSupported) {
  window.__appPinballRenderer = 'canvas2d';
} else {
  try {
    await bridgeToWebGpu();
    window.__appPinballRenderer = 'webgpu';
  } catch (_) {
    window.__appPinballRenderer = 'canvas2d-fallback';
  }
}

async function bridgeToWebGpu() {
  const renderer = await waitForRenderer(6000);
  if (!renderer || !renderer.canvas) {
    throw new Error('renderer unavailable');
  }

  const sourceCanvas = renderer.canvas;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('gpu adapter unavailable');
  }
  const device = await adapter.requestDevice();
  const contextCanvas = document.createElement('canvas');
  contextCanvas.id = '__appWebGpuCanvas';
  contextCanvas.style.position = 'fixed';
  contextCanvas.style.inset = '0';
  contextCanvas.style.width = '100vw';
  contextCanvas.style.height = '100vh';
  contextCanvas.style.pointerEvents = 'none';
  contextCanvas.style.zIndex = '2147483646';
  document.body.appendChild(contextCanvas);

  sourceCanvas.style.opacity = '0';
  sourceCanvas.style.background = 'transparent';

  const context = contextCanvas.getContext('webgpu');
  if (!context) {
    throw new Error('webgpu context unavailable');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();

  const shader = device.createShaderModule({
    code: `
      struct VSOut {
        @builtin(position) position : vec4<f32>,
        @location(0) uv : vec2<f32>,
      };

      @vertex
      fn vs_main(@builtin(vertex_index) vid : u32) -> VSOut {
        var pos = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>( 1.0,  1.0),
        );
        var uv = array<vec2<f32>, 6>(
          vec2<f32>(0.0, 1.0),
          vec2<f32>(1.0, 1.0),
          vec2<f32>(0.0, 0.0),
          vec2<f32>(0.0, 0.0),
          vec2<f32>(1.0, 1.0),
          vec2<f32>(1.0, 0.0),
        );
        var out : VSOut;
        out.position = vec4<f32>(pos[vid], 0.0, 1.0);
        out.uv = uv[vid];
        return out;
      }

      @group(0) @binding(0) var srcTex : texture_2d<f32>;
      @group(0) @binding(1) var srcSampler : sampler;

      @fragment
      fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
        return textureSample(srcTex, srcSampler, in.uv);
      }
    `,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shader,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shader,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  let srcTexture = null;
  let bindGroup = null;
  let lastW = 0;
  let lastH = 0;

  const resizeIfNeeded = () => {
    const w = Math.max(1, sourceCanvas.width | 0);
    const h = Math.max(1, sourceCanvas.height | 0);
    if (w === lastW && h === lastH && srcTexture && bindGroup) {
      return;
    }
    lastW = w;
    lastH = h;
    contextCanvas.width = w;
    contextCanvas.height = h;
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });
    srcTexture = device.createTexture({
      size: [w, h, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: srcTexture.createView() },
        { binding: 1, resource: sampler },
      ],
    });
  };

  const originalRender = renderer.render.bind(renderer);
  renderer.render = function patchedRender(...args) {
    originalRender(...args);
    if (!document.body.contains(contextCanvas)) {
      return;
    }
    if (!srcTexture || !bindGroup) {
      resizeIfNeeded();
    } else if (sourceCanvas.width !== lastW || sourceCanvas.height !== lastH) {
      resizeIfNeeded();
    }
    if (!srcTexture || !bindGroup) {
      return;
    }
    device.queue.copyExternalImageToTexture(
      { source: sourceCanvas },
      { texture: srcTexture },
      [lastW, lastH],
    );

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1, 0, 0);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };
}

async function waitForRenderer(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const roulette = window.roulette;
    const renderer = roulette && roulette._renderer;
    if (renderer && renderer.canvas && typeof renderer.render === 'function') {
      return renderer;
    }
    await sleep(50);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
