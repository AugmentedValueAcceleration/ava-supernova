/**
 * Built-in Knowledge Packs — Ship with Ava out of the box.
 *
 * Each pack provides domain-specific context that transforms how Ava
 * approaches problems. Same intelligence, different expertise.
 */

import type { KnowledgePack } from './types.js';

// Self-knowledge pack removed (v0.37.0). Was 179KB / ~60K tokens of source
// index compiled into the bundle but never loaded into the system prompt.
// self_inspect, docs_lookup, and project_index serve the purpose on-demand.

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
    description: 'CI/CD pipelines, Docker, Kubernetes, cloud platforms, IaC, monitoring, networking, security hardening, deployment strategies.',
    domain: 'devops',
    version: '2.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `When helping with DevOps and infrastructure:
- Infrastructure as Code: prefer Terraform for cloud, Pulumi for complex logic. Never manual console changes in production.
- CI/CD: fail fast (lint → test → build → deploy). Cache dependencies. Separate build and deploy stages.
- Containers: one process per container, multi-stage builds, never run as root, pin base image versions.
- Kubernetes: use Deployments not bare Pods. Liveness ≠ readiness probes. Resource limits on every container. HPA for auto-scaling.
- Monitoring: RED method for services (Rate, Errors, Duration), USE method for resources (Utilisation, Saturation, Errors).
- Security: least privilege IAM, rotate secrets, scan images, network policies, encrypt at rest and in transit.
- Incident response: detect → triage → mitigate → resolve → post-mortem. Blameless culture.
- Cost: right-size instances, use spot/preemptible for stateless work, reserved capacity for baselines, tag everything.
- When asked to set up infra — use bash to run terraform/docker/kubectl commands. Don't just describe.
- Docs: Terraform (terraform.io/docs), Kubernetes (kubernetes.io/docs), Docker (docs.docker.com), GitHub Actions (docs.github.com/actions).`,
  },
  {
    id: 'data-science',
    name: 'Data Science & ML',
    description: 'Python data stack, pandas, SQL, statistics, ML/DL, NLP, computer vision, MLOps, experiment tracking, deployment.',
    domain: 'data-science',
    version: '2.0.0',
    builtIn: true,
    modes: ['code', 'chat', 'plan'],
    context: `When helping with data science and ML:
- Start with EDA before modelling. Understand distributions, missing values, correlations, outliers. Visualise first.
- Feature engineering matters more than model choice. Domain features beat hyperparameter tuning.
- Train/val/test split: 70/15/15 or k-fold. Never leak test data into training. Time series: always split by time.
- Baseline first: simple model (logistic regression, random forest) before deep learning. Beat the baseline before adding complexity.
- Metrics: accuracy is misleading for imbalanced classes. Use precision/recall/F1, AUC-ROC, or domain-specific metrics.
- Deep learning: start small, verify overfitting on tiny subset, then scale up. Gradient clipping for stability.
- NLP: tokenisation matters (BPE, WordPiece). Embeddings before fine-tuning. Evaluate on held-out data.
- MLOps: version data AND code AND models. Reproducible training. Model registry. A/B test before full rollout.
- Ethics: check for bias in training data. Fairness across protected attributes. Document model limitations.
- Docs: scikit-learn (scikit-learn.org), PyTorch (pytorch.org/docs), HuggingFace (huggingface.co/docs), pandas (pandas.pydata.org/docs).`,
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

**Game Design Terminology:**
- Game feel / juice: screenshake, hitstop, particle bursts, squash & stretch. Makes actions feel impactful.
- Coyote time: grace period after leaving a ledge where jump still works (~100ms). Essential for platformers.
- Input buffering: queue the next input during an animation so it fires when the current action ends. Prevents "swallowed" inputs.
- I-frames: invincibility frames during dodge/roll. Player can't take damage during these frames.
- Hitstop / hitlag: freeze both attacker and target for 2-5 frames on hit. Sells the impact.
- TTK: time to kill. How long to eliminate a target. Defines game pace (low TTK = tactical, high TTK = arena).
- DPS: damage per second. Base metric for balancing weapons and abilities.
- Aggro / threat table: AI targeting priority. Tank generates threat to pull aggro from DPS/healers.
- Proc: programmed random occurrence. % chance to trigger a bonus effect on hit/action.
- Proc gen: procedurally generated content. Roguelikes, infinite runners, random dungeons.
- Vertical slice: polished demo of one complete section. Proves the game works before building everything.
- Grey boxing / blockout: build levels with simple shapes first. Test flow, pacing, sightlines before art.
- Gold master: final build submitted for release. No more changes.
- Souls-like: challenging combat, pattern-based enemies, stamina management, death penalty, bonfires/checkpoints.

**Movement Systems:**
- Character controller types: capsule-based (most common, handles slopes/steps), physics-based (Rigidbody, realistic but harder to control), custom (full manual control for precision).
- Locomotion: root motion (animation drives position — precise for melee, climbing) vs code-driven (gameplay code drives position — responsive, predictable). Blend both for best results.
- Acceleration curves: don't snap to max speed. Ease in/out for weight and feel. Separate accel/decel values. Air control should be reduced.
- Grounded movement: walk, run, sprint. Speed tiers with stamina cost. Crouch with reduced speed + smaller capsule.
- Jump systems: variable height (hold for higher), double/triple jump, wall jump, coyote time, jump buffering, apex hang (reduced gravity at peak).
- Wall running: detect wall via raycasts, apply gravity reduction, limit duration, exit with jump. Requires camera tilt for feel.
- Mantling / vaulting: trace forward + up from character. Classify: step-up (small), vault (medium, one-hand), mantle (tall, pull-up). Play matching animation. Warp character to target position.
- Sliding: trigger from sprint + crouch. Maintain momentum, reduce friction, lower capsule. Slope boost (downhill = faster, uphill = slower). Slide cancel into jump for speed tech.
- Grappling: line trace to valid grapple point, pull character along spline/curve, swing physics (pendulum), release momentum for launch.
- Swimming: separate movement mode. Buoyancy at water surface, 3D movement underwater, oxygen/breath meter, different camera behaviour.
- Climbing: detect climbable surfaces (tags or physical material), IK hand/foot placement, stamina drain, directional input for traverse.
- Flying / jetpack: 6DOF movement, hover mode (maintain altitude), fuel/energy system with recharge, transition between grounded and airborne states.
- Vehicle movement: wheeled (suspension, engine torque curves, gear ratios, drift mechanics), hover (repulsion forces, banking), boat (buoyancy, wave response, rudder steering).
- Movement state machine: grounded → jumping → falling → landing → wallrunning → mantling → hanging → climbing. Each state has enter/exit/tick. Transitions have conditions.
- Movement networking: client predicts movement locally, server validates and corrects. Smooth corrections with interpolation. Reconcile on mismatch. Send input not position.

Genre-specific movement modes — these are DIFFERENT and must not be confused:
- **FPS (First Person Shooter)**: camera IS the character's eyes. No visible body (or arms-only). Movement is ALWAYS in the direction the camera faces. Mouse controls look direction AND movement direction simultaneously. WASD moves relative to camera forward. Sprint, crouch, lean, ADS (aim down sights). No character rotation separate from camera — they are locked together.
- **TPS (Third Person Shooter)**: character faces the SAME direction as the camera (over-the-shoulder). Character rotates to match camera yaw. bUseControllerRotationYaw = true. Movement is strafing relative to camera — character always faces where you aim. Right stick/mouse controls camera, left stick moves character relative to camera. ADS tightens camera to shoulder. Character visibly turns when aiming.
- **ARPG / Hack-and-Slash (Diablo, Souls, action RPG)**: character does NOT face the camera direction. Character faces the MOVEMENT direction. bUseControllerRotationYaw = false. bOrientRotationToMovement = true. Camera orbits freely around the character. Player can look one way and run another. Character rotates smoothly to face the direction of input. Lock-on overrides this to face the locked target. Dodge/roll goes in movement direction, not camera direction.
- **Top-Down ARPG (Diablo-style)**: fixed or semi-fixed camera angle. Click-to-move or WASD relative to screen. Character faces movement direction or cursor position. No camera rotation by player.
- **Twin-Stick**: left stick = move direction, right stick = aim/face direction. Character can move and aim independently. Common in roguelites, arena shooters.

In Unreal specifically:
- TPS/FPS: UCharacterMovementComponent with bUseControllerRotationYaw = true, bOrientRotationToMovement = false. Camera boom (spring arm) attached to character.
- ARPG: bUseControllerRotationYaw = false, bOrientRotationToMovement = true, RotationRate for smooth turning. Camera boom with free rotation. Controller rotation only affects camera, not character.
- The difference is literally 2-3 boolean settings + how you handle input → rotation. Don't mix them up.

**Combat Design:**
- Hitboxes / hurtboxes: hitbox = attack area (attached to weapon/limb), hurtbox = vulnerable area (attached to body). Separate collision channels.
- Combo systems: input sequence detection (light→light→heavy), cancel windows, chain timing, reset on miss/timeout.
- Damage types: physical, fire, ice, electric, poison. Resistance/weakness per enemy type. Elemental reactions (wet + electric = bonus).
- Damage calculation: base damage × weapon modifier × crit multiplier × resistance factor − armour reduction. Crit: % chance, usually 2× damage.
- DoT (damage over time): poison, burn, bleed. Tick damage every N seconds for duration. Stack or refresh on reapply.
- Stamina system: attacks/dodges cost stamina. Regenerates when not acting. Empty = vulnerable (can't dodge/block). Souls-like staple.
- Lock-on targeting: cycle targets with input, camera tracks target, strafe movement replaces free look, break on distance/obstruction.
- Parry / block: timed block = parry (counter window ~200ms), hold block = guard (reduced damage, stamina drain). Parry rewards: riposte, stagger.

**Camera Systems:**
- Third person orbit: spring arm + camera. Collision trace to prevent clipping into walls. Lag speed for smooth follow.
- Lock-on camera: blend between free cam and target-focused. Offset to keep both player and target visible.
- Cinematic blend: smooth transition between gameplay camera and scripted camera (Sequencer/timeline). Ease curves matter.
- Camera shake: spring-based (recoil), perlin noise (ambient), directional (explosions). Layer multiple shakes.
- Dynamic FOV: increase on sprint, decrease on aim. Smooth lerp. Sells speed and focus.
- Obstruction handling: trace from target to camera, pull camera forward on hit, fade near objects.

**Inventory & Items:**
- Slot-based: fixed slots (helmet, chest, weapon, ring). Equip/unequip. Visual preview.
- Weight-based: carry limit (Skyrim-style). Items have weight. Over-encumbered = slow.
- Grid-based: Tetris inventory (Resident Evil 4). Items have shapes, spatial puzzle element.
- Item data: ScriptableObject (Unity), DataAsset (Unreal), Resource (Godot). Define stats, icon, mesh, rarity.
- Loot tables: weighted random drops. Rarity tiers. Guaranteed drops on bosses.
- Crafting: recipe system (input items → output item). Discovery or known recipes.

**Quest & Dialogue:**
- Quest structure: objectives (kill, collect, deliver, escort, interact), prerequisites, rewards, branching outcomes.
- Quest state: inactive → active → complete → turned-in. Track per-objective progress.
- Dialogue trees: nodes (NPC text) + edges (player responses). Conditions on edges (has item, quest state, reputation).
- Barks: short contextual lines (combat shouts, idle chatter, reactions). Triggered by gameplay events.
- Journal / quest log: categorised (main, side, completed), objective markers on map/HUD, tracking toggle.

**Spawning & AI Director:**
- Wave spawning: predefined groups, escalating difficulty, rest between waves. Arena/horde mode staple.
- Director system (L4D-style): monitor player stress (health, ammo, pace). High stress = ease off, low stress = ramp up. Pacing curves.
- Proximity spawning: trigger volumes that spawn enemies when player approaches. Despawn when far. Memory efficient.
- Spawn points: validated locations (not inside walls, not in player view, NavMesh-valid). Randomise from pool.

**Shader & Material Techniques:**
- Dissolve: noise texture threshold. Animate threshold 0→1 for dissolve/appear. Edge emission for glow.
- Outline: inverted hull (scale mesh along normals, render backfaces with solid colour), post-process (depth/normal edge detection), fresnel.
- Fresnel: rim lighting based on view angle. Use for shields, selection highlights, magical effects.
- Scrolling UV: pan texture coordinates over time. Lava, water, energy beams, conveyor belts.
- Vertex displacement: offset vertices in shader. Ocean waves, breathing, wind-blown foliage.
- Cel shading / toon: step function on lighting (2-3 bands). Outline pass. Stylised look.
- Triplanar mapping: project texture from 3 axes. No UV unwrap needed. Good for terrain, procedural meshes.

**Level Design Principles:**
- Weenies: tall, visible landmarks that guide the player naturally (Disney term). Tower, mountain, glowing tree.
- Flow: guide player movement with lighting, colour, geometry, enemy placement. Leading lines.
- Pacing: tension → release cycles. Combat → exploration → puzzle → reward. Vary intensity.
- Lock and key: gate progress behind items/abilities. Metroidvania: ability-gated, backtrack to unlock.
- Arena design: clear boundaries, cover placement, elevation changes, spawn closets, ammo/health placement. Test with grey boxes.
- Spatial storytelling: environmental narrative. Ruins tell a story. Prop placement implies history.

**Optimisation Patterns:**
- Spatial partitioning: octree (3D), quadtree (2D), BSP (binary space). Speeds up collision, visibility, and queries.
- Object pooling per engine: Unreal (spawn pool manager, deactivate instead of destroy), Unity (Queue<GameObject>, SetActive), Godot (Array pool, hide + process_mode).
- Async loading: load assets in background. Show loading screen or stream seamlessly. Unreal: StreamableManager, Unity: Addressables, Godot: ResourceLoader.load_threaded.
- Draw call reduction: instancing (same mesh many times), atlasing (combine textures), merge static meshes, LOD.
- Frame budget: 16.6ms for 60fps. Split: gameplay 2-3ms, physics 2-3ms, rendering 8-10ms, UI 1ms. Profile before optimising.

**Multiplayer Patterns:**
- Lobby system: host creates session, players join via invite/matchmaking/server browser. Ready state, countdown to start.
- Matchmaking: skill-based (ELO/MMR), connection-based (ping), mixed. Queue system with timeout.
- Dedicated vs listen server: dedicated = separate process, authoritative, no host advantage. Listen = player is host, cheaper but host has advantage.
- Session management: join in progress, host migration, disconnect/reconnect, spectator mode.
- Anti-cheat: server authority (validate all actions server-side), input validation, speed checks, position verification. Never trust the client.
- Replication priority: replicate what matters. Player transforms = high priority. Cosmetics = low. Cull by distance.

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
  - Context switching: add/remove mapping contexts at runtime for different states. Combat context (priority 1) overrides exploration context (priority 0). RemoveMappingContext() when entering vehicle, AddMappingContext(VehicleContext) with higher priority.
  - Gamepad: map Gamepad_LeftX/Y to move, Gamepad_RightX/Y to look. Add dead zone modifier on stick axes. Gamepad_FaceButton_Bottom for jump, Gamepad_RightTrigger for shoot. Same actions, different context for gamepad vs keyboard.
  - Input action values: Boolean (pressed/not), Axis1D (trigger pull 0-1), Axis2D (stick/WASD), Axis3D (motion controller). Match ValueType to the action's purpose.
  - Player Mappable Input Config: UPlayerMappableInputConfig for user-rebindable keys. Store/load from SaveGame.
  - If you're unsure about the API, use web_search: "UE5 Enhanced Input C++ site:dev.epicgames.com"

  C++ code example — creating actions + context + binding in code:
  \`\`\`cpp
  // In header (.h):
  #include "InputAction.h"
  #include "InputMappingContext.h"
  UPROPERTY() UInputAction* MoveAction;
  UPROPERTY() UInputAction* JumpAction;
  UPROPERTY() UInputAction* LookAction;
  UPROPERTY() UInputMappingContext* DefaultMappingContext;
  void OnMove(const FInputActionValue& Value);
  void OnJump(const FInputActionValue& Value);
  void OnLook(const FInputActionValue& Value);

  // In constructor or BeginPlay:
  // Create actions
  MoveAction = NewObject<UInputAction>(this, TEXT("IA_Move"));
  MoveAction->ValueType = EInputActionValueType::Axis2D;

  JumpAction = NewObject<UInputAction>(this, TEXT("IA_Jump"));
  JumpAction->ValueType = EInputActionValueType::Boolean;

  LookAction = NewObject<UInputAction>(this, TEXT("IA_Look"));
  LookAction->ValueType = EInputActionValueType::Axis2D;

  // Create mapping context
  DefaultMappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Default"));

  // Map keys to actions
  FEnhancedActionKeyMapping& MoveMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::W);
  // Add modifiers for WASD (swizzle for S/A/D, negate for S/A):
  FEnhancedActionKeyMapping& MoveSMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::S);
  UInputModifierNegate* Negate = NewObject<UInputModifierNegate>();
  MoveSMapping.Modifiers.Add(Negate);
  FEnhancedActionKeyMapping& MoveAMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::A);
  UInputModifierSwizzleAxis* SwizzleA = NewObject<UInputModifierSwizzleAxis>();
  SwizzleA->Order = EInputAxisSwizzle::YXZ;
  MoveAMapping.Modifiers.Add(SwizzleA);
  UInputModifierNegate* NegateA = NewObject<UInputModifierNegate>();
  MoveAMapping.Modifiers.Add(NegateA);
  FEnhancedActionKeyMapping& MoveDMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::D);
  UInputModifierSwizzleAxis* SwizzleD = NewObject<UInputModifierSwizzleAxis>();
  SwizzleD->Order = EInputAxisSwizzle::YXZ;
  MoveDMapping.Modifiers.Add(SwizzleD);

  DefaultMappingContext->MapKey(JumpAction, EKeys::SpaceBar);
  DefaultMappingContext->MapKey(LookAction, EKeys::Mouse2D);

  // In BeginPlay — add context to player:
  if (APlayerController* PC = Cast<APlayerController>(GetController())) {
    if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())) {
      Subsystem->AddMappingContext(DefaultMappingContext, 0);
    }
  }

  // In SetupPlayerInputComponent — bind actions:
  if (UEnhancedInputComponent* EIC = CastChecked<UEnhancedInputComponent>(PlayerInputComponent)) {
    EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMyCharacter::OnMove);
    EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &AMyCharacter::OnJump);
    EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AMyCharacter::OnLook);
  }

  // Handler implementations:
  void AMyCharacter::OnMove(const FInputActionValue& Value) {
    FVector2D Axis = Value.Get<FVector2D>();
    AddMovementInput(GetActorForwardVector(), Axis.Y);
    AddMovementInput(GetActorRightVector(), Axis.X);
  }
  void AMyCharacter::OnJump(const FInputActionValue& Value) { Jump(); }
  void AMyCharacter::OnLook(const FInputActionValue& Value) {
    FVector2D Axis = Value.Get<FVector2D>();
    AddControllerYawInput(Axis.X);
    AddControllerPitchInput(Axis.Y);
  }
  \`\`\`
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
  {
    id: 'web-development',
    name: 'Web Development',
    description: 'Full-stack web development — React, Next.js, Vue, Svelte, Node, databases, auth, deployment, performance, accessibility.',
    domain: 'web-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `When helping with web development:
- Semantic HTML first. Styled components second. Accessibility is not optional — every interactive element needs a label.
- CSS: prefer Grid for 2D layouts, Flexbox for 1D. Mobile-first responsive (min-width breakpoints, not max-width).
- Performance: measure Core Web Vitals before optimising. Lazy-load below-fold images. Code-split by route. Cache aggressively.
- React: prefer server components (RSC) where possible. Co-locate state near where it's used. Avoid prop drilling with context sparingly.
- Next.js App Router: server actions for mutations, RSC for reads, client components only for interactivity. Metadata API for SEO.
- State: URL state > server state > local state > global state. Don't put server-fetched data in client state.
- Auth: never roll your own crypto. Use established libraries (NextAuth, Supabase Auth, Clerk). HttpOnly cookies for sessions.
- Database: index your WHERE clauses. Connection pooling. N+1 queries are the most common performance killer.
- Testing: test behaviour not implementation. Integration tests > unit tests for web apps. Playwright for E2E.
- Docs: React (react.dev), Next.js (nextjs.org/docs), MDN (developer.mozilla.org), Tailwind (tailwindcss.com/docs).`,
  },
  {
    id: 'mobile-development',
    name: 'Mobile Development',
    description: 'Cross-platform and native mobile — React Native, Flutter, Swift/SwiftUI, Kotlin, Capacitor, app store deployment.',
    domain: 'mobile-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `When helping with mobile development:
- Platform-first thinking: respect platform conventions (iOS HIG, Material Design). Don't force web patterns on mobile.
- React Native: use Expo for new projects unless you need bare native modules. Hermes engine default. Reanimated for smooth animations.
- Flutter: everything is a widget. StatelessWidget for static, StatefulWidget for dynamic. Riverpod or Bloc for state.
- Swift/SwiftUI: prefer SwiftUI for new views, UIKit for complex custom. Combine for reactive data flow.
- Kotlin/Compose: Compose is the future. Remember functions, state hoisting, LaunchedEffect for side effects.
- Navigation: deep linking from day one. Stack, tab, drawer navigators. Pass minimal data — fetch on arrival.
- Performance: avoid re-renders (React.memo, useMemo). Profile with Flipper (RN) or DevTools (Flutter). Target 60fps.
- Offline-first: cache API responses, queue writes, sync on reconnect. SQLite or Realm for structured local data.
- App store: follow guidelines strictly. Plan 2-5 day review times for iOS.
- Docs: React Native (reactnative.dev), Expo (docs.expo.dev), Flutter (docs.flutter.dev), Apple Dev (developer.apple.com/documentation).`,
  },
  {
    id: 'api-development',
    name: 'API Development',
    description: 'REST, GraphQL, gRPC, WebSocket APIs — design, auth, versioning, rate limiting, documentation, testing, OpenAPI.',
    domain: 'api-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `When helping with API development:
- REST: resource-based URLs, proper HTTP verbs (GET=read, POST=create, PUT=replace, PATCH=update, DELETE=remove). Status codes matter.
- GraphQL: one endpoint, client specifies shape. Use DataLoader for N+1 prevention. Persisted queries for production.
- Authentication: JWT for stateless, sessions for stateful. Never store tokens in localStorage — HttpOnly cookies or secure storage.
- Rate limiting: per-user or per-IP. Return 429 with Retry-After header. Sliding window is fairer than fixed window.
- Versioning: URL path (/v1/users) or header. Never break existing clients silently.
- Error handling: consistent error shape ({ error, code, details }). Machine-readable codes, human-readable messages.
- Validation: validate at the boundary (request handler), not deep in business logic. Zod/Joi for schema validation.
- Database: parameterised queries always (never string interpolation). Connection pooling. Transactions for multi-step writes.
- Documentation: OpenAPI/Swagger for REST, GraphQL Playground for GraphQL. Auto-generate from schema where possible.
- Docs: Express (expressjs.com), Fastify (fastify.dev), tRPC (trpc.io), GraphQL (graphql.org/learn), Prisma (prisma.io/docs).`,
  },
  {
    id: 'systems-programming',
    name: 'Systems Programming',
    description: 'Rust, C/C++, Go, Zig — memory management, concurrency, OS internals, networking, performance, embedded, compilers.',
    domain: 'systems-programming',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `When helping with systems programming:
- Memory: understand ownership (Rust), RAII (C++), manual alloc (C). Stack vs heap. Avoid leaks — use smart pointers or ownership models.
- Concurrency: prefer message passing over shared state. Mutex only when necessary. Watch for deadlocks (consistent lock ordering).
- Rust: ownership + borrowing is the core model. Result<T, E> for errors, Option<T> for nullable. Clippy for linting. Cargo for everything.
- C/C++: RAII for resource management. Prefer std::unique_ptr over raw pointers. Sanitizers (ASan, MSan, UBSan) in CI.
- Go: goroutines + channels for concurrency. Error values not exceptions. Interfaces are implicit. Go rewards boring code.
- Performance: measure before optimising (perf, flamegraph, cachegrind). Algorithmic improvements beat micro-optimisation. Cache locality matters.
- Networking: non-blocking I/O (epoll/kqueue/io_uring). Tokio (Rust), libuv (C), goroutines (Go). Connection pooling.
- Security: bounds checking, input validation, constant-time comparison for secrets, sandboxing.
- Build systems: Cargo (Rust), CMake (C/C++), go build (Go). Reproducible builds with lockfiles.
- Docs: Rust Book (doc.rust-lang.org/book), C++ Reference (cppreference.com), Go (go.dev/doc).`,
  },
];
