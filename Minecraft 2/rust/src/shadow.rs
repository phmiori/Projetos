//! Sombras do sol (GLRenderer.shadowPass do Java): um mapa de profundidade visto do sol, numa região em volta da
//! câmera. Ele só é redesenhado quando o sol andou um pouco, a câmera saiu da região coberta ou algum pedaço perto
//! mudou (cache, como no Java).

use crate::{compile, shaders, GpuMesh};
use glow::HasContext;
use std::collections::HashMap;

pub const SIZE: i32 = 2048;

pub struct Shadow {
    prog: glow::Program,
    fbo: glow::Framebuffer,
    pub tex: glow::Texture,
    /// precisa redesenhar (um pedaço perto mudou)
    pub dirty: bool,
    valid: bool,
    light: [f32; 3],
    center: [f32; 3],
    radius: f32,
    /// matriz que leva do mundo para o mapa (0..1)
    pub mat: [f32; 16],
}

impl Shadow {
    pub unsafe fn new(gl: &glow::Context) -> Shadow {
        let prog = compile(gl, shaders::SHADOW_VS, shaders::SHADOW_FS);
        let tex = gl.create_texture().unwrap();
        gl.bind_texture(glow::TEXTURE_2D, Some(tex));
        gl.tex_image_2d(glow::TEXTURE_2D, 0, glow::DEPTH_COMPONENT24 as i32, SIZE, SIZE, 0, glow::DEPTH_COMPONENT, glow::FLOAT, None);
        for (k, v) in [
            (glow::TEXTURE_MIN_FILTER, glow::LINEAR),
            (glow::TEXTURE_MAG_FILTER, glow::LINEAR),
            (glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE),
            (glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE),
            (glow::TEXTURE_COMPARE_MODE, glow::COMPARE_REF_TO_TEXTURE),
            (glow::TEXTURE_COMPARE_FUNC, glow::LEQUAL),
        ] {
            gl.tex_parameter_i32(glow::TEXTURE_2D, k, v as i32);
        }
        let fbo = gl.create_framebuffer().unwrap();
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(fbo));
        gl.framebuffer_texture_2d(glow::FRAMEBUFFER, glow::DEPTH_ATTACHMENT, glow::TEXTURE_2D, Some(tex), 0);
        gl.draw_buffer(glow::NONE);
        gl.read_buffer(glow::NONE);
        gl.bind_framebuffer(glow::FRAMEBUFFER, None);
        Shadow { prog, fbo, tex, dirty: true, valid: false, light: [0.0; 3], center: [0.0; 3], radius: 0.0, mat: [0.0; 16] }
    }

    /// Um pedaço foi (re)montado: se está dentro da área do mapa, ele precisa ser refeito.
    pub fn chunk_changed(&mut self, cx: i32, cz: i32) {
        let (dx, dz) = (cx as f32 * 16.0 + 8.0 - self.center[0], cz as f32 * 16.0 + 8.0 - self.center[2]);
        let r = self.radius * 1.5 + 23.0;
        if !self.valid || dx * dx + dz * dz <= r * r {
            self.dirty = true;
        }
    }

    /// Desenha a profundidade vista do sol (se precisar). `light` aponta para o sol.
    pub unsafe fn pass(&mut self, gl: &glow::Context, meshes: &HashMap<(i32, i32), GpuMesh>, tex: glow::Texture, light: [f32; 3], cam: [f32; 3], view_dist: f32) {
        let r = view_dist.clamp(48.0, 112.0);
        // enquanto o sol quase não andou, continua usando a direção do último desenho
        let force = self.dirty || !self.valid || r != self.radius || crate::dot(light, self.light) < 0.999997;
        let l = if force { light } else { self.light };
        let f = [-l[0], -l[1], -l[2]];
        let (mut rx, mut rz) = (-f[2], f[0]); // frente x (0,1,0)
        let rl = (rx * rx + rz * rz).sqrt();
        rx /= rl;
        rz /= rl;
        let u = [-rz * f[1], rz * f[0] - rx * f[2], rx * f[1]]; // direita x frente
        // centro "grudado" numa grade de ~4 blocos (múltipla do texel) para a sombra não tremer ao andar
        let texel = 2.0 * r / SIZE as f32;
        let step = texel * (4.0 / texel).round().max(1.0);
        let cr = cam[0] * rx + cam[2] * rz;
        let cu = cam[0] * u[0] + cam[1] * u[1] + cam[2] * u[2];
        let sr = (cr / step).floor() * step - cr;
        let su = (cu / step).floor() * step - cu;
        let c = [cam[0] + sr * rx + su * u[0], cam[1] + su * u[1], cam[2] + sr * rz + su * u[2]];
        if !force && (c[0] - self.center[0]).abs() + (c[1] - self.center[1]).abs() + (c[2] - self.center[2]).abs() < 0.01 {
            return; // o mapa atual ainda serve
        }
        self.dirty = false;
        self.valid = true;
        self.light = l;
        self.center = c;
        self.radius = r;
        let dist = 160.0;
        let e = [c[0] - f[0] * dist, c[1] - f[1] * dist, c[2] - f[2] * dist];
        let right = [rx, 0.0, rz];
        let view = [
            rx, u[0], -f[0], 0.0,
            0.0, u[1], -f[1], 0.0,
            rz, u[2], -f[2], 0.0,
            -crate::dot(right, e), -crate::dot(u, e), crate::dot(f, e), 1.0,
        ];
        let (n, fa) = (1.0, dist * 2.0);
        let mut proj = [0f32; 16];
        proj[0] = 1.0 / r;
        proj[5] = 1.0 / r;
        proj[10] = -2.0 / (fa - n);
        proj[14] = -(fa + n) / (fa - n);
        proj[15] = 1.0;
        let light_vp = crate::mul(&proj, &view);
        let bias = [0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0];
        self.mat = crate::mul(&bias, &light_vp);

        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(self.fbo));
        gl.viewport(0, 0, SIZE, SIZE);
        gl.clear(glow::DEPTH_BUFFER_BIT);
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LEQUAL);
        gl.depth_mask(true);
        gl.disable(glow::CULL_FACE);
        gl.disable(glow::BLEND);
        gl.enable(glow::POLYGON_OFFSET_FILL);
        gl.polygon_offset(1.5, 3.0);
        gl.use_program(Some(self.prog));
        gl.uniform_matrix_4_f32_slice(gl.get_uniform_location(self.prog, "uLightVP").as_ref(), false, &light_vp);
        gl.uniform_1_i32(gl.get_uniform_location(self.prog, "uTex").as_ref(), 0);
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_2D_ARRAY, Some(tex));
        let uchunk = gl.get_uniform_location(self.prog, "uChunk");
        let reach = r * 1.5 + 23.0;
        for (k, m) in meshes {
            let (dx, dz) = (k.0 as f32 * 16.0 + 8.0 - c[0], k.1 as f32 * 16.0 + 8.0 - c[2]);
            if m.quads == 0 || dx * dx + dz * dz > reach * reach {
                continue;
            }
            gl.uniform_3_f32(uchunk.as_ref(), (k.0 * 16) as f32, 0.0, (k.1 * 16) as f32);
            gl.bind_vertex_array(Some(m.vao));
            gl.draw_elements(glow::TRIANGLES, m.quads * 6, glow::UNSIGNED_INT, 0);
        }
        gl.disable(glow::POLYGON_OFFSET_FILL);
        gl.bind_framebuffer(glow::FRAMEBUFFER, None);
    }
}
