# Viewport source map

Code is grouped by feature, then by responsibility. Tests live in `__tests__`
beside the code they cover.

| Folder       | Owns                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `camera/`    | Camera controls, orientation gizmo, presets, and framing                |
| `scene/`     | Canvas composition, stage, lighting, ground textures, and scene colors  |
| `character/` | Skinned meshes, armature display, materials, textures, and skin context |
| `animation/` | Pose evaluation, joint anchors, and the scene clock                     |
| `assets/`    | Asset queries, binary decoders, and buffer reading                      |
| `shared/`    | Numeric coordinate-system constants shared with evaluation code         |

`animation/evaluation/` keeps pose sampling and joint transforms together.
`assets/parsing/` owns mesh, skeleton, and animation decoding.
`shared/utils/space.ts` stays independent of React and ThreeJS so simulation code
can read coordinate constants without loading the renderer.

The root `index.ts` preserves the public viewport exports.
