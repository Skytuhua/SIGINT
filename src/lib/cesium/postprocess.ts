// postprocess.ts 閳?Cesium post-processing presets
// Must only be called after the Cesium Viewer is initialized (browser-only).

export type StylePreset = 'normal' | 'crt' | 'nvg' | 'flir';

interface PresetParams {
  crtDistortion?: number;
  crtInstability?: number;
  nvgBrightness?: number;
  flirContrast?: number;
  sharpen?: boolean;
  showBloom?: boolean;
}

// Store active stage handles so we can remove them on preset change
let activeStages: import('cesium').PostProcessStage[] = [];

export async function applyStylePreset(
  viewer: import('cesium').Viewer,
  preset: StylePreset,
  params: PresetParams = {}
): Promise<void> {
  const Cesium = await import('cesium');

  // Remove all previously added custom stages
  for (const stage of activeStages) {
    try {
      viewer.scene.postProcessStages.remove(stage);
    } catch {
      // Stage may already be removed
    }
  }
  activeStages = [];

  const {
    crtDistortion = 0.2,
    crtInstability = 0.05,
    nvgBrightness = 1.2,
    flirContrast = 1.0,
    sharpen = false,
    showBloom = false,
  } = params;

  switch (preset) {
    case 'normal': {
      // Subtle vignette only
      const vignette = new Cesium.PostProcessStage({
        fragmentShader: VIGNETTE_GLSL,
        uniforms: { vignetteStrength: 0.4, vignetteRadius: 0.75 },
      });
      viewer.scene.postProcessStages.add(vignette);
      activeStages.push(vignette);
      break;
    }

    case 'crt': {
      // Scanlines
      const scanlines = new Cesium.PostProcessStage({
        fragmentShader: SCANLINES_GLSL,
        uniforms: { scanlineIntensity: 0.25 },
      });
      // Chromatic aberration
      const chromAb = new Cesium.PostProcessStage({
        fragmentShader: CHROM_AB_GLSL,
        uniforms: { aberrationAmount: 0.002 },
      });
      // CRT noise / grain
      const noise = new Cesium.PostProcessStage({
        fragmentShader: NOISE_GLSL,
        uniforms: {
          noiseIntensity: crtInstability * 0.3,
          time: () => performance.now() / 1000,
        },
      });
      // Vignette
      const vig = new Cesium.PostProcessStage({
        fragmentShader: VIGNETTE_GLSL,
        uniforms: { vignetteStrength: 0.7, vignetteRadius: 0.6 },
      });

      viewer.scene.postProcessStages.add(scanlines);
      viewer.scene.postProcessStages.add(chromAb);
      viewer.scene.postProcessStages.add(noise);
      viewer.scene.postProcessStages.add(vig);
      activeStages.push(scanlines, chromAb, noise, vig);
      break;
    }

    case 'nvg': {
      // Night vision: desaturate + green tint + brightness
      const nvg = new Cesium.PostProcessStage({
        fragmentShader: NVG_GLSL,
        uniforms: { brightness: nvgBrightness, grain: 0.04, time: () => performance.now() / 1000 },
      });
      const vig = new Cesium.PostProcessStage({
        fragmentShader: VIGNETTE_GLSL,
        uniforms: { vignetteStrength: 0.6, vignetteRadius: 0.65 },
      });

      viewer.scene.postProcessStages.add(nvg);
      viewer.scene.postProcessStages.add(vig);
      activeStages.push(nvg, vig);
      break;
    }

    case 'flir': {
      // FLIR thermal: luminance 閳?thermal LUT (blue 閳?black 閳?orange 閳?white)
      const flir = new Cesium.PostProcessStage({
        fragmentShader: FLIR_GLSL,
        uniforms: { contrastBoost: flirContrast },
      });
      const vig = new Cesium.PostProcessStage({
        fragmentShader: VIGNETTE_GLSL,
        uniforms: { vignetteStrength: 0.5, vignetteRadius: 0.7 },
      });

      viewer.scene.postProcessStages.add(flir);
      viewer.scene.postProcessStages.add(vig);
      activeStages.push(flir, vig);
      break;
    }
  }

  // Optional sharpening pass (any preset)
  if (sharpen) {
    const sharp = new Cesium.PostProcessStage({
      fragmentShader: SHARPEN_GLSL,
      uniforms: { sharpAmount: 0.6 },
    });
    viewer.scene.postProcessStages.add(sharp);
    activeStages.push(sharp);
  }

  // Bloom (Cesium built-in)
  viewer.scene.postProcessStages.bloom.enabled = showBloom;
  if (showBloom) {
    viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false;
    viewer.scene.postProcessStages.bloom.uniforms.contrast = 128;
    viewer.scene.postProcessStages.bloom.uniforms.brightness = -0.3;
  }
}

// 閳光偓閳光偓閳光偓 GLSL shaders 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

const VIGNETTE_GLSL = `
uniform sampler2D colorTexture;
uniform float vignetteStrength;
uniform float vignetteRadius;
in vec2 v_textureCoordinates;

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates - 0.5;
  float vignette = 1.0 - smoothstep(vignetteRadius, 1.0, length(uv) * 1.41421);
  vignette = mix(1.0, vignette, vignetteStrength);
  out_FragColor = vec4(color.rgb * vignette, color.a);
}
`;

const SCANLINES_GLSL = `
uniform sampler2D colorTexture;
uniform float scanlineIntensity;
in vec2 v_textureCoordinates;

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // Scanline pattern: every other row is slightly darker
  float line = mod(floor(v_textureCoordinates.y * czm_viewport.w), 2.0);
  color.rgb *= 1.0 - scanlineIntensity * line;
  out_FragColor = color;
}
`;

const CHROM_AB_GLSL = `
uniform sampler2D colorTexture;
uniform float aberrationAmount;
in vec2 v_textureCoordinates;

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 offset = vec2(aberrationAmount, 0.0);
  float r = texture(colorTexture, uv + offset).r;
  float g = texture(colorTexture, uv).g;
  float b = texture(colorTexture, uv - offset).b;
  out_FragColor = vec4(r, g, b, texture(colorTexture, uv).a);
}
`;

const NOISE_GLSL = `
uniform sampler2D colorTexture;
uniform float noiseIntensity;
uniform float time;
in vec2 v_textureCoordinates;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  float noise = rand(v_textureCoordinates + fract(time)) * 2.0 - 1.0;
  color.rgb += noise * noiseIntensity;
  out_FragColor = color;
}
`;

const NVG_GLSL = `
uniform sampler2D colorTexture;
uniform float brightness;
uniform float grain;
uniform float time;
in vec2 v_textureCoordinates;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // Luminance
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  lum = pow(lum, 0.8) * brightness;
  // Film grain
  float noise = rand(v_textureCoordinates + fract(time)) * 2.0 - 1.0;
  lum += noise * grain;
  // Output as green phosphor
  out_FragColor = vec4(0.0, clamp(lum, 0.0, 1.0), 0.0, color.a);
}
`;

const FLIR_GLSL = `
uniform sampler2D colorTexture;
uniform float contrastBoost;
in vec2 v_textureCoordinates;

// Thermal LUT: cold (blue) 閳?black 閳?warm (orange) 閳?hot (white)
vec3 thermalColor(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) {
    return mix(vec3(0.0, 0.0, 0.5), vec3(0.0, 0.0, 0.0), t * 4.0);
  } else if (t < 0.5) {
    return mix(vec3(0.0, 0.0, 0.0), vec3(0.5, 0.2, 0.0), (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(vec3(0.5, 0.2, 0.0), vec3(1.0, 0.5, 0.0), (t - 0.5) * 4.0);
  } else {
    return mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 1.0), (t - 0.75) * 4.0);
  }
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Contrast boost
  lum = ((lum - 0.5) * contrastBoost) + 0.5;
  out_FragColor = vec4(thermalColor(lum), color.a);
}
`;

const SHARPEN_GLSL = `
uniform sampler2D colorTexture;
uniform float sharpAmount;
in vec2 v_textureCoordinates;

void main() {
  vec2 texel = 1.0 / czm_viewport.zw;
  vec4 center = texture(colorTexture, v_textureCoordinates);
  vec4 top    = texture(colorTexture, v_textureCoordinates + vec2(0.0, texel.y));
  vec4 bottom = texture(colorTexture, v_textureCoordinates - vec2(0.0, texel.y));
  vec4 left   = texture(colorTexture, v_textureCoordinates - vec2(texel.x, 0.0));
  vec4 right  = texture(colorTexture, v_textureCoordinates + vec2(texel.x, 0.0));
  vec4 sharpened = center * (1.0 + 4.0 * sharpAmount) - (top + bottom + left + right) * sharpAmount;
  out_FragColor = clamp(sharpened, 0.0, 1.0);
}
`;
