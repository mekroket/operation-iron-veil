/**
 * The single gateway to Babylon.js. Every other module imports Babylon classes from here.
 *
 * Babylon 9 ships tree-shakeable ".pure" modules and a package.json `sideEffects` allow-list,
 * so a bare `import '.../someComponent'` can work in dev and silently vanish from the production
 * bundle. Registration that the game depends on is therefore invoked explicitly by name below.
 */
export { Engine } from '@babylonjs/core/Engines/engine';
export { Scene } from '@babylonjs/core/scene';
export { Vector3, Quaternion, Matrix, Color3, Color4 } from '@babylonjs/core/Maths/math';
export { Observable } from '@babylonjs/core/Misc/observable';
export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
export { Camera } from '@babylonjs/core/Cameras/camera';

export { Light } from '@babylonjs/core/Lights/light';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { PointLight } from '@babylonjs/core/Lights/pointLight';
export { SpotLight } from '@babylonjs/core/Lights/spotLight';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
export { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';

export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

export { Material } from '@babylonjs/core/Materials/material';
export { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
export { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
export { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial';
export { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';

export { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';

export { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
export { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
export { ColorCurves } from '@babylonjs/core/Materials/colorCurves';

export { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
export { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
export {
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
} from '@babylonjs/core/Physics/v2/physicsShape';
export { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
export {
  PhysicsCharacterController,
  CharacterSupportedState,
} from '@babylonjs/core/Physics/v2/characterController';
export type { CharacterSurfaceInfo } from '@babylonjs/core/Physics/v2/characterController';
export { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';

import '@babylonjs/core/Culling/ray';
import { RegisterJoinedPhysicsEngineComponent } from '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { RegisterPhysicsV2PhysicsEngineComponent } from '@babylonjs/core/Physics/v2/physicsEngineComponent';
import { RegisterBaseTexturePolynomial } from '@babylonjs/core/Materials/Textures/baseTexture.polynomial';
import { RegisterThinInstanceMesh } from '@babylonjs/core/Meshes/thinInstanceMesh';
import { RegisterParticleSystemComponent } from '@babylonjs/core/Particles/particleSystemComponent';
import { RegisterPostProcessRenderPipelineManagerSceneComponent } from '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import { PostProcessRenderPipelineManager } from '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManager';
import { RegisterGeometryBufferRendererSceneComponent } from '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import { GeometryBufferRenderer } from '@babylonjs/core/Rendering/geometryBufferRenderer';
import { RegisterDepthRendererSceneComponent } from '@babylonjs/core/Rendering/depthRendererSceneComponent';
import { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';

RegisterJoinedPhysicsEngineComponent();
RegisterPhysicsV2PhysicsEngineComponent();
RegisterBaseTexturePolynomial();
RegisterThinInstanceMesh();
RegisterParticleSystemComponent();
RegisterPostProcessRenderPipelineManagerSceneComponent(PostProcessRenderPipelineManager);
RegisterGeometryBufferRendererSceneComponent(GeometryBufferRenderer);
RegisterDepthRendererSceneComponent(DepthRenderer);
