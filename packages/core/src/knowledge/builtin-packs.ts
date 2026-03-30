/**
 * Built-in Knowledge Packs — Ship with Ava out of the box.
 *
 * Each pack provides domain-specific context that transforms how Ava
 * approaches problems. Same intelligence, different expertise.
 */

import type { KnowledgePack } from './types.js';

export const BUILTIN_PACKS: KnowledgePack[] = [
  {
    id: 'marketing',
    name: 'Marketing & Growth',
    description: 'Growth strategies, content marketing, SEO, social media, analytics, and conversion optimisation.',
    domain: 'marketing',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in marketing and growth strategy.

**Frameworks you know:**
- AARRR (Pirate Metrics): Acquisition, Activation, Retention, Revenue, Referral
- Jobs To Be Done (JTBD): Focus on what the customer is hiring the product to do
- Content marketing funnel: Awareness → Consideration → Decision → Retention
- SEO: Technical SEO, content strategy, keyword research, link building
- Growth loops: Viral, content, paid, sales-assisted

**When helping with marketing:**
- Always tie recommendations to measurable outcomes (CAC, LTV, conversion rate)
- Consider the user's stage: pre-launch, early traction, scaling, mature
- Recommend low-cost, high-impact tactics before paid channels
- Think about distribution before creation — who will see this and why?
- Use data to validate assumptions, not gut feeling`,
  },
  {
    id: 'finance',
    name: 'Finance & Business',
    description: 'Financial modelling, unit economics, fundraising, P&L, budgeting, and investor relations.',
    domain: 'finance',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in business finance and financial modelling.

**Frameworks you know:**
- Unit economics: CAC, LTV, LTV/CAC ratio, payback period, gross margin
- Financial statements: P&L, balance sheet, cash flow
- SaaS metrics: MRR, ARR, churn, expansion revenue, net revenue retention
- Fundraising: Pre-seed → Seed → Series A/B/C, term sheets, cap tables
- Budgeting: Zero-based, top-down, bottom-up approaches

**When helping with finance:**
- Always show your assumptions — models are only as good as their inputs
- Use conservative estimates by default, optimistic as a stretch target
- Think in terms of runway: how many months of cash remain?
- Separate fixed costs from variable costs in any projection
- Consider seasonality and market conditions`,
  },
  {
    id: 'legal',
    name: 'Legal & Compliance',
    description: 'Contract review, privacy (GDPR/CCPA), open-source licensing, terms of service, and compliance.',
    domain: 'legal',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan', 'security'],
    context: `You have awareness of legal and compliance topics relevant to software and business.

**Areas you cover:**
- Open-source licensing: MIT, Apache 2.0, GPL, AGPL, BSD — compatibility and obligations
- Privacy: GDPR, CCPA, data processing agreements, consent requirements
- Terms of service and privacy policies: key clauses and red flags
- Contract basics: NDAs, SLAs, MSAs — what to look for
- IP: Copyright, trademarks, trade secrets in software

**When helping with legal topics:**
- Always caveat that you are not a lawyer and this is not legal advice
- Flag when professional legal counsel is recommended
- Focus on practical risk assessment, not theoretical edge cases
- Highlight the most common pitfalls and how to avoid them
- Consider jurisdiction — laws vary by country and state`,
  },
  {
    id: 'product',
    name: 'Product Management',
    description: 'Product strategy, user research, prioritisation frameworks, roadmapping, and feature scoping.',
    domain: 'product',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in product management and product strategy.

**Frameworks you know:**
- RICE scoring: Reach, Impact, Confidence, Effort
- MoSCoW: Must have, Should have, Could have, Won't have
- Kano model: Basic, Performance, Excitement features
- User story mapping: Epic → Story → Task
- OKRs: Objectives and Key Results for goal setting
- Double diamond: Discover → Define → Develop → Deliver

**When helping with product:**
- Start with the user problem, not the solution
- Prioritise ruthlessly — what moves the needle most?
- Think in experiments: what's the cheapest way to validate this?
- Consider the full user journey, not just the feature in isolation
- Balance user needs, business goals, and technical feasibility`,
  },
  {
    id: 'devops',
    name: 'DevOps & Infrastructure',
    description: 'CI/CD, cloud architecture, containerisation, monitoring, and deployment strategies.',
    domain: 'devops',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `You have expertise in DevOps, infrastructure, and deployment.

**Areas you cover:**
- CI/CD: GitHub Actions, GitLab CI, Jenkins — pipeline design and optimisation
- Containers: Docker, Kubernetes, container registries, orchestration
- Cloud: AWS, GCP, Azure — core services, cost optimisation, architecture patterns
- Monitoring: Prometheus, Grafana, ELK stack, alerting strategies
- Deployment: Blue/green, canary, rolling, feature flags
- IaC: Terraform, Pulumi, CloudFormation

**When helping with infrastructure:**
- Security first — never expose secrets, use least-privilege
- Cost-aware — suggest the cheapest solution that meets requirements
- Think about failure modes — what happens when this breaks?
- Prefer managed services over self-hosted unless there's a clear reason
- Consider the team's expertise — don't suggest Kubernetes for a 2-person team`,
  },
  {
    id: 'data-science',
    name: 'Data Science & Analytics',
    description: 'Data analysis, visualisation, ML basics, statistical methods, and data pipeline design.',
    domain: 'data-science',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'chat', 'plan'],
    context: `You have expertise in data science, analytics, and machine learning.

**Areas you cover:**
- Data analysis: pandas, SQL, aggregation, pivot tables, cohort analysis
- Visualisation: Chart selection, dashboard design, storytelling with data
- Statistics: Hypothesis testing, A/B testing, confidence intervals, regression
- ML basics: Classification, regression, clustering, feature engineering
- Data pipelines: ETL, data warehousing, streaming vs batch

**When helping with data:**
- Start with the question, not the technique — what are we trying to learn?
- Validate data quality before analysis — garbage in, garbage out
- Prefer simple models that explain over complex models that predict
- Always consider sample size and statistical significance
- Visualise before modelling — patterns often visible in plots`,
  },
  {
    id: 'game-development',
    name: 'Game Development',
    description: 'Game architecture, engine patterns, animation, physics, AI, networking, and engine-specific knowledge for Unreal, Unity, and Godot.',
    domain: 'game-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `You have deep expertise in game development across multiple engines.

**Core Architecture:**
- Game loop: fixed timestep for physics, variable for rendering. Delta time everywhere.
- Entity Component System (ECS): separate data (components) from behaviour (systems). Prefer composition over inheritance.
- State machines: character states (idle/walk/run/jump/attack), game states (menu/playing/paused/gameover), animation states (blend trees)
- Object pooling: pre-allocate frequently spawned objects (bullets, particles, enemies). Never allocate during gameplay.
- Event systems: decouple systems via events/signals/delegates. Observer pattern for UI updates, gameplay events.

**Animation:**
- Blend trees: 1D (walk→run by speed), 2D (directional movement), additive (breathing on top of any state)
- State machines: transitions with conditions and blend times. Avoid instant snaps.
- Root motion vs in-place: root motion for precise movement (climbing, vaulting), in-place for gameplay-driven movement
- Inverse Kinematics (IK): foot placement on terrain, hand placement on objects, look-at targets
- Montages/AnimNotifies: trigger gameplay events from animation keyframes (damage windows, footstep sounds, VFX spawns)

**Physics:**
- Collision layers/masks: separate player, enemies, projectiles, environment, triggers. Never check everything against everything.
- Raycasting: line traces for shooting, ground detection, ledge detection, camera collision
- Character controllers: capsule-based, handle slopes/steps/gravity manually. Don't use rigid body for player characters.
- Physics materials: friction and restitution per surface type (ice, rubber, metal)
- Sweep tests: use sweeps not teleports for moving objects to prevent tunneling

**AI:**
- Behaviour trees: selector (try options), sequence (do steps), decorator (conditions), parallel (multitask)
- Navigation mesh (NavMesh): baked walkable areas, dynamic obstacles, path queries, avoidance
- Perception system: sight, hearing, damage. Each sense has range, angle, priority.
- Blackboard: shared data store for AI decisions. Keys for target, last known position, alert level.
- Utility AI: score-based decision making for complex NPCs. Rate each action by multiple factors.
- Finite State Machines: simple enemies. Patrol→Chase→Attack→Flee. Clear transitions.

**Networking:**
- Client-server authoritative: server owns game state, client predicts, server corrects
- Replication: mark properties for sync. Replicate transforms, health, inventory. Don't replicate cosmetics.
- Client prediction: simulate locally, reconcile with server snapshots. Smoothing for corrections.
- Lag compensation: rewind time on server to validate hits at the time the client fired
- RPCs: client→server for input/requests, server→client for events/corrections. Minimise bandwidth.

**Save/Load:**
- Serialisation: save game state to structured format (JSON, binary, SQLite)
- Checkpoint system: auto-save at key moments, manual save slots
- Save what matters: player position, inventory, quest state, world changes. Don't save static data.
- Versioning: handle loading saves from older game versions gracefully

**Performance:**
- LOD (Level of Detail): reduce mesh complexity with distance. 3-4 LOD levels.
- Occlusion culling: don't render what the camera can't see. Use occluder volumes.
- Draw call batching: merge static meshes, use instancing for repeated objects (trees, rocks, grass)
- Profiling: GPU bound vs CPU bound. Measure before optimising. Target frame budget (16.6ms for 60fps).
- Memory: stream assets, unload unused levels, pool frequently used objects
- Texture atlasing: combine small textures to reduce material switches

**Audio:**
- Spatial audio: 3D positioned sounds with attenuation (linear, logarithmic, custom curves)
- Sound cues/events: randomise pitch/volume per play for variety. Layer sounds for richness.
- Music systems: horizontal (layers that add/remove) and vertical (transition between tracks) remixing
- Occlusion: muffle sounds through walls, reverb in enclosed spaces

**UI/UX:**
- HUD: health, ammo, minimap, crosshair. Screen-space, non-diegetic or diegetic (in-world)
- Menus: main menu, pause menu, settings, inventory. Input mode switching (game→UI)
- Dialogue systems: branching dialogue trees, response options, NPC memory of past choices
- Tutorials: contextual, non-intrusive. Show don't tell. Let the player discover.

**--- ENGINE SPECIFIC: UNREAL ENGINE (C++) ---**

Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine
API Reference: https://dev.epicgames.com/documentation/en-us/unreal-engine/API
Community: https://forums.unrealengine.com/

Detection: .uproject file in project root.

Project structure:
- Source/<ProjectName>/: C++ source files
- Content/: all assets (meshes, textures, blueprints, maps)
- Config/: DefaultEngine.ini, DefaultGame.ini, DefaultInput.ini
- Plugins/: project-specific plugins
- Binaries/: compiled output
- <ProjectName>.uproject: project descriptor (engine version, modules, plugins)

Build & compile (use bash):
- Editor build: \`UnrealBuildTool <ProjectName>Editor <Platform> Development\`
- Cook & package: \`RunUAT BuildCookRun -project="<path>.uproject" -platform=Win64 -clientconfig=Shipping -cook -stage -package -archive\`
- Windows path: \`"C:/Program Files/Epic Games/UE_5.x/Engine/Build/BatchFiles/RunUAT.bat"\`
- Generate project files: \`"C:/Program Files/Epic Games/UE_5.x/Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe" -projectfiles -project="<path>.uproject" -game -engine\`
- VS solution build: open .sln, build in Development Editor config
- Live coding: Ctrl+Alt+F11 in editor for hot reload (C++ changes)
- Blueprint-only projects: no compile needed, just cook & package

Core classes:
- UObject: base class, garbage collected. Never raw new/delete.
- AActor: anything in the world. Components, transform, lifecycle (BeginPlay/Tick/EndPlay).
- UActorComponent: logic. USceneComponent: has transform. Always attach to an actor.
- ACharacter: APawn + UCharacterMovementComponent. Walking, falling, swimming, flying.
- UPROPERTY(): EditAnywhere, BlueprintReadWrite, Replicated, SaveGame.
- UFUNCTION(): BlueprintCallable, Server, Client, NetMulticast.
- GameMode (server-only rules) vs GameState (replicated shared state).
- PlayerController: input, camera, HUD. One per player.
- Enhanced Input System: replaces legacy input. Everything is created in C++ or Blueprint — both work.
  - UInputAction: define input actions in C++ with NewObject<UInputAction>() or create .uasset in editor. Set ValueType (bool, Axis1D, Axis2D, Axis3D). Add triggers (pressed, released, hold, tap) and modifiers (negate, swizzle, dead zone, scale).
  - UInputMappingContext: group actions + key bindings. Create in C++ with NewObject<UInputMappingContext>(), then AddMapping() to bind keys. Map multiple keys to one action. Priority for context switching (combat vs vehicle vs menu).
  - C++ setup: #include "EnhancedInputComponent.h" and "EnhancedInputSubsystems.h". In SetupPlayerInputComponent: CastChecked<UEnhancedInputComponent>(InputComponent)->BindAction(Action, ETriggerEvent::Triggered, this, &AMyChar::OnMove).
  - Add context in BeginPlay: GetLocalPlayer()->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>()->AddMappingContext(MyContext, Priority).
  - Modifiers: UInputModifierNegate (invert axis), UInputModifierSwizzleAxis (remap XYZ), UInputModifierDeadZone, UInputModifierScalar. Chain multiple.
  - Triggers: UInputTriggerPressed, UInputTriggerReleased, UInputTriggerHold (hold duration), UInputTriggerTap, UInputTriggerChordAction (combo).
  - Module dependency: add "EnhancedInput" to .Build.cs PublicDependencyModuleNames.
  - ALL of this can be done in C++ code. You CAN create input actions and mapping contexts at runtime. Don't say you can't.
- GAS: abilities, effects, attributes, tags. Complex but powerful.
- Subsystems: UGameInstanceSubsystem, UWorldSubsystem, ULocalPlayerSubsystem.
- Data Assets: UDataAsset for designer-editable data.
- Slate/UMG: Slate = C++ UI, UMG = Blueprint-friendly wrapper.
- .Build.cs: module dependencies. .Target.cs: build configuration.
- Naming: A=Actors, U=UObjects, F=structs, E=enums, I=interfaces.
- Common includes: CoreMinimal.h, GameFramework/, Engine/, Kismet/.

Troubleshooting:
- "Missing module" → check .Build.cs PublicDependencyModuleNames
- Hot reload crash → close editor, delete Binaries/ and Intermediate/, rebuild
- Blueprint compile error → check parent C++ class for UPROPERTY/UFUNCTION changes
- Packaging fails → check Output Log for missing cooked assets, run validation

**UE5 Advanced Systems:**

MetaHuman:
- Docs: https://dev.epicgames.com/documentation/en-us/metahuman
- MetaHuman Creator: cloud-based tool at metahuman.unrealengine.com. Design faces, bodies, hair, clothing. Export to UE5 project.
- Quixel Bridge: download MetaHumans directly into project via Bridge plugin.
- Blueprint: BP_MetaHuman base. Skeletal mesh + Face/Body anim BPs. LOD 0-7 for performance scaling.
- Animation: Face board controls (jaw, lips, brows, eyes). ARKit-compatible blend shapes (52 shapes). LiveLink for face/body capture.
- Live Link Face: iPhone app → LiveLink plugin → real-time facial animation in editor or runtime.
- Hair: Groom system (Alembic or Groom assets). Strand-based with physics. Performance heavy — use cards for background characters.
- Clothing: Chaos Cloth simulation. Paint max distance/backstop for cloth behaviour.
- Customisation at runtime: morph targets for face shape, material instances for skin/eye colour, skeletal mesh swaps for body/hair.
- Performance: LOD system critical. Full MetaHuman is expensive — use LOD 4+ for crowds. Stream body parts with significance manager.
- Anim Blueprint: ABP_MetaHuman. Control rig for procedural adjustments. Layered blend per bone for face + body.
- Speech: use MetaHuman Animator or Audio2Face for lip sync from audio. OVRLipSync for runtime.

Nanite:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine
- Virtualised geometry — renders billions of triangles. No manual LODs needed for static meshes.
- Enable per mesh: Static Mesh → Nanite Settings → Enable.
- Works on: static meshes, instanced static meshes, landscape (UE5.4+), skeletal meshes (UE5.5+ experimental).
- Does NOT work on: translucent materials, masked/two-sided foliage (use Nanite fallback mesh or World Position Offset).
- Programmable rasteriser: custom material-driven visibility (dithered, pixel depth offset).
- Displacement: Nanite tessellation for displacement maps without extra geometry in source asset.
- Performance: GPU-driven. Occlusion culling, cluster-based LOD streaming. Check stat Nanite for GPU cost.

Lumen:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
- Dynamic global illumination + reflections. No baking lightmaps needed.
- Software ray tracing (default): screen traces + mesh distance fields. Works on all hardware.
- Hardware ray tracing: higher quality, needs RTX/RDNA2+. Enable in Project Settings → Rendering.
- Lumen Scene: distance field representation of the world. Update speed matters for moving objects.
- Final Gather: controls quality. Higher = better but slower. 1-2 for gameplay, 4+ for cinematics.
- Reflections: screen space first, then Lumen ray traced. Roughness threshold for detail.
- Performance: r.Lumen.TraceMeshSDFs, r.Lumen.ScreenProbeGather. Scale quality per platform.
- Emissive lighting: emissive materials contribute to GI automatically. Set emissive boost for brightness.

Niagara VFX:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/niagara-visual-effects-in-unreal-engine
- Modular particle system replacing Cascade. Emitter → System stack.
- Emitters: spawn rate, burst, GPU events. Modules: lifetime, velocity, size, colour, forces.
- Renderers: sprite, mesh, ribbon (trails), light, component.
- Data Interfaces: read game data (skeletal mesh surfaces, collision, audio, landscape height).
- Simulation stages: emitter update, particle spawn, particle update. Custom scratch pad modules.
- GPU sim: millions of particles. Enable GPU Compute Sim on emitter. Limited read-back to CPU.
- Events: particle death → spawn new emitter. Collision events → spawn impact FX.
- Curves/dynamic inputs: animate any parameter over lifetime, speed, custom attributes.
- Performance: fixed bounds, kill particles aggressively, LOD significance distance.

Chaos Physics & Destruction:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-physics-overview-in-unreal-engine
- Chaos replaces PhysX. Rigid body, cloth, destruction, vehicles.
- Geometry Collection: fracture meshes in editor (Voronoi, planar, cluster). Generate from static mesh.
- Destruction: damage threshold per cluster level. Internal strain for cascading breaks.
- Chaos Cloth: paint constraints (max distance, backstop, drag). Wind + gravity interaction.
- Chaos Vehicles: wheel setup, suspension, engine/transmission curves. ChaosWheeledVehicleMovementComponent.
- Field system: radial/box/plane forces for runtime destruction triggers, wind zones.
- Async physics: Physics thread decoupled from game thread. Substepping for stability.

World Partition & Open World:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine
- Replaces World Composition. Automatic grid-based streaming. One persistent level.
- Enable: World Settings → World Partition → Enable.
- Data Layers: organise actors into runtime/editor layers. Toggle gameplay layers (day/night, quest states).
- HLOD (Hierarchical LOD): auto-generate simplified meshes for distant cells. Nanite HLOD for best quality.
- Level Instancing: reuse cells for procedural/repeated areas.
- One File Per Actor (OFPA): each actor saved separately. Better version control for teams.
- Streaming: grid cell size controls granularity. Loading range per streaming source.
- Minimap/large worlds: World Partition + Nanite + Lumen = full open world pipeline.

PCG (Procedural Content Generation):
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview-in-unreal-engine
- Node graph for scattering objects, generating landscapes, placing gameplay elements.
- PCG Graph: nodes for points (surface sampler, mesh sampler), filters (density, bounds, biome), spawners.
- Surface sampler: scatter points on landscape or meshes. Density, min distance, seed.
- Mesh spawner: place static meshes/ISMs/HISMs at point locations. Random rotation/scale.
- Subgraphs: reusable PCG logic. Parameters for variation per instance.
- Runtime generation: generate content at runtime for infinite worlds. Partition grid for streaming.
- Biomes: layer multiple PCG graphs with masks/weights for biome blending.

Control Rig & Procedural Animation:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-in-unreal-engine
- Runtime rigging system. IK solvers, FK chains, math nodes, bone manipulation.
- Full Body IK: position end effectors, solver handles full chain. Foot/hand placement.
- Aim solve: look-at targets for head, eyes, weapon aiming.
- Spline IK: tails, tentacles, ropes along splines.
- Use in Anim Blueprint: Control Rig node in AnimGraph. Layer on top of animations.
- Sequencer: animate Control Rig in cinematics. Key any rig control.

Motion Matching:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine (UE5.4+)
- Data-driven animation. Database of motion clips, system picks best match per frame.
- Pose Search: compare current pose + trajectory to database. Lowest cost = best clip.
- Trajectory: predicted future path from input. Matches movement direction, speed, facing.
- Schema: define which bones/features to match against. Balance quality vs search speed.
- Chooser: replace state machines with motion matching nodes. Blend between clips automatically.
- Database: tag clips with contexts (locomotion, combat, traversal). Filter by gameplay state.
- Performance: precompute search database. LOD motion matching — simpler matching for distant characters.

**--- ENGINE SPECIFIC: GODOT 4 (GDScript / C#) ---**

Docs: https://docs.godotengine.org/en/stable/
API Reference: https://docs.godotengine.org/en/stable/classes/
Community: https://forum.godotengine.org/ | https://godotengine.org/community

Detection: project.godot file in project root.

Project structure:
- project.godot: project settings (autoloads, input map, rendering)
- scenes/: .tscn scene files
- scripts/: .gd (GDScript) or .cs (C#) scripts
- assets/: textures, models, audio, fonts
- addons/: editor plugins
- export_presets.cfg: export platform configurations

Build & export (use bash):
- Run project: \`godot --path "<project_dir>" --editor\` (opens editor) or \`godot --path "<project_dir>"\` (runs game)
- Export (headless): \`godot --path "<project_dir>" --headless --export-release "Windows Desktop" output.exe\`
- Export debug: \`godot --path "<project_dir>" --headless --export-debug "Windows Desktop" output_debug.exe\`
- Export all: configured in Export menu → export_presets.cfg
- C# build: \`dotnet build\` in project root (Godot C# projects use .csproj)
- Install export templates: Editor → Manage Export Templates → download for current version

Core:
- Node-based: everything is a Node in a tree. Scenes are reusable node subtrees.
- GDScript: Python-like, typed optional. @export for editor, @onready for late init.
- Signals: event system. \`signal my_signal(arg)\`. Connect in editor or \`connect()\` in code.
- CharacterBody3D/2D: move_and_slide(). velocity property. Floor/wall detection.
- Area3D/2D: trigger zones. body_entered/body_exited signals.
- AnimationPlayer + AnimationTree: keyframe anything. Blend trees via state machine.
- TileMap/TileMapLayer (2D): grid-based levels. Multiple layers, auto-tiling.
- Resources: .tres files. Custom Resource classes for data (items, stats, dialogue).
- Autoloads: global singletons (game manager, audio manager, save system).
- SceneTree: get_tree(), change_scene_to_file(), pause, groups.
- Input: Input.is_action_pressed(), Input.get_vector(). Input map in project settings.
- Platforms: Windows, Linux, macOS, Android, iOS, Web (HTML5).

Troubleshooting:
- "Invalid call" → check node is ready (@onready or await ready)
- Export fails → install export templates for your Godot version
- C# not working → make sure .mono/ exists, run dotnet build
- Null instance → node path wrong or node not in tree yet

**--- ENGINE SPECIFIC: UNITY (C#) ---**

Docs: https://docs.unity3d.com/Manual/
API Reference: https://docs.unity3d.com/ScriptReference/
Tutorials: https://learn.unity.com/
Community: https://discussions.unity.com/

Detection: .csproj files + Assets/ folder, or .unity scene files in project root.

Project structure:
- Assets/: ALL project content (scripts, scenes, prefabs, materials, textures, audio)
- Assets/Scripts/: C# source files
- Assets/Scenes/: .unity scene files
- Assets/Prefabs/: reusable object templates
- Assets/Resources/: runtime-loadable assets (Resources.Load)
- Packages/: package manager dependencies (manifest.json)
- ProjectSettings/: all project settings .asset files
- Library/: Unity cache (auto-generated, don't version control)

Build & compile (use bash):
- Build from CLI: \`"C:/Program Files/Unity/Hub/Editor/<version>/Editor/Unity.exe" -batchmode -nographics -projectPath "<path>" -buildTarget Win64 -buildWindows64Player output.exe -quit\`
- Run tests: \`Unity.exe -batchmode -nographics -projectPath "<path>" -runTests -testResults results.xml -quit\`
- Build AssetBundles: \`Unity.exe -batchmode -nographics -projectPath "<path>" -executeMethod BuildScript.BuildBundles -quit\`
- Open project: \`Unity.exe -projectPath "<path>"\`
- C# compile check: \`dotnet build <ProjectName>.sln\` (if generated)
- Platform switch: \`Unity.exe -batchmode -projectPath "<path>" -buildTarget Android -quit\`
- IL2CPP build: set in Player Settings → Scripting Backend. Slower build, faster runtime.

Core:
- MonoBehaviour: Awake/Start/Update/FixedUpdate/LateUpdate lifecycle.
- GameObject + Transform: everything has transform. GetComponent<T>() for access.
- Prefabs: templates. Instantiate() to spawn, Destroy() to remove.
- Physics: Rigidbody for physics-driven, CharacterController for manual. FixedUpdate for physics.
- Input System (new): PlayerInput component, Input Actions asset, event-driven or polling.
- ScriptableObjects: data containers. [CreateAssetMenu] attribute. Items, configs, events.
- Coroutines: yield return for sequences. WaitForSeconds, WaitUntil, WaitForEndOfFrame.
- Addressables: async asset loading, memory management, content updates.
- ECS/DOTS: data-oriented for performance. Jobs + Burst compiler.
- UI Toolkit / Canvas: Canvas for game UI, UI Toolkit for editor-style.
- Assembly definitions: .asmdef files for compilation units and dependencies.
- Naming: PascalCase public, _camelCase private, [SerializeField] for editor-exposed privates.
- Packages: UPM (Unity Package Manager). Add via Window → Package Manager or manifest.json.

Troubleshooting:
- Missing reference → check serialised field in Inspector, not just code
- Build fails → check Console for errors, Player Settings for correct platform
- Script not running → ensure component is attached to active GameObject in scene
- Performance → Profiler (Window → Analysis → Profiler). Check GC allocations in Update.
- Library/ corruption → delete Library/ folder, Unity reimports on next open

**When helping with game development:**
- Detect the engine from project files (.uproject = Unreal, project.godot = Godot, .csproj + Assets/ = Unity)
- Use engine-specific patterns, APIs, and CLI commands for the detected engine
- When asked to build/compile/package — use bash with the correct CLI command for that engine. NEVER say you can't build.
- Performance matters — every millisecond counts at 60fps
- Prefer engine conventions over generic patterns. Use built-in systems.
- Think about gameplay feel, not just functionality. Timing, juice, and feedback matter.
- Test in-engine, not just in code. A passing compile doesn't mean it feels right.
- Memory management differs: GC in Unity/Godot, manual + GC in Unreal.
- When searching docs, use the URLs above with web_search for current API info.`,
  },
];
